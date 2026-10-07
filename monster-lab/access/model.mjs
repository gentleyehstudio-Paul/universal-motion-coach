import { readFile } from 'node:fs/promises';
import { REVIEW_PROMPT } from '../ai-policy.mjs';

const safeDetail = (v) => String(v ?? '').replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [已隱藏]').replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[已隱藏 API 金鑰]').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);

// knowledge/ is git-ignored (private training material); a deploy without it still works,
// the review just runs without the basketball reference notes.
export async function loadKnowledge(dir = new URL('../knowledge/', import.meta.url)) {
  try {
    const [core, caseReference] = await Promise.all(['basketball-shooting-v1.md', 'basketball-shooting-release-transition-v1.md'].map((n) => readFile(new URL(n, dir), 'utf8')));
    return `## General basketball observation reference\n${core}\n\n## Conditional release-direction and movement-transition reference\n${caseReference}`;
  } catch { return ''; }
}

export const reviewModel = (env) => env.OPENAI_VISION_MODEL || 'gpt-6-astra';

export async function openaiJson(env, path, options) {
  const r = await fetch('https://api.openai.com/v1/' + path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(240000) });
  let data; try { data = await r.json(); } catch { data = {}; }
  if (!r.ok) {
    const e = data?.error ?? {}, details = [e.code && `代碼 ${safeDetail(e.code)}`, e.param && `欄位 ${safeDetail(e.param)}`, e.message && safeDetail(e.message)].filter(Boolean).join(' · ');
    const requestId = r.headers.get('x-request-id');
    const err = new Error(`OpenAI API ${r.status}${details ? `：${details}` : '：未提供錯誤細節'}${requestId ? `（request ID ${safeDetail(requestId)}）` : ''}。不會自動重試。`);
    err.status = r.status; throw err;
  }
  return data;
}

// Returns the model's raw JSON text. validateFrames has already run in the handler path
// before this is reached from the public API; the local server validates too.
export function makeCallModel(env, knowledge = '') {
  return async (b) => {
    const metadata = { sport: b.sport, hand: b.hand, view: b.view, duration: b.duration, sampleRate: 15, orderedImages: b.frames.map((f, i) => ({ index: i, time: f.time })), bodyMotion15fps: b.motion, phaseAnchors: b.phaseAnchors ?? null };
    const instructions = b.sport === 'basketball' && knowledge ? `${REVIEW_PROMPT}\n\nBasketball knowledge references (the core checklist is general; the IMG_4216 module is conditional and must not be treated as a universal priority. The current video is the only basis for case-specific conclusions. In user-facing wording, say 細節 rather than using 證據 as a label):\n${knowledge}` : REVIEW_PROMPT;
    const result = await openaiJson(env, 'responses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: reviewModel(env), store: false, instructions, input: [{ role: 'user', content: [{ type: 'input_text', text: `Review the full clip as a chronological video sample. Image order and timestamps are in orderedImages. Use all bodyMotion15fps rows to reason about movement between sampled images. Return your findings as JSON. ${JSON.stringify(metadata)}` }, ...b.frames.map((f) => ({ type: 'input_image', image_url: f.image, detail: 'auto' }))] }], text: { format: { type: 'json_object' } } }) });
    return (result.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text').map((c) => c.text).join('');
  };
}
