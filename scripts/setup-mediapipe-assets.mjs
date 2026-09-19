// Self-hosts MediaPipe's runtime assets under public/mediapipe instead of
// pulling them from cdn.jsdelivr.net / storage.googleapis.com at runtime.
// Rationale: removes a third-party CDN dependency for pose extraction (an
// environment that blocks jsdelivr, e.g. some corporate/sandboxed
// networks, would otherwise break the app entirely), and keeps with this
// project's privacy stance of on-device processing (docs/architecture.md
// §6) — no request to a third party is needed just to load the model.
// Re-run via `npm run setup:mediapipe` if node_modules is reinstalled.
import { existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDest = join(root, "public/mediapipe/wasm");
const modelDest = join(root, "public/mediapipe/pose_landmarker_lite.task");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

mkdirSync(wasmDest, { recursive: true });
for (const file of readdirSync(wasmSrc)) {
  copyFileSync(join(wasmSrc, file), join(wasmDest, file));
}
console.log(`Copied MediaPipe WASM assets to ${wasmDest}`);

if (!existsSync(modelDest)) {
  console.log(`Downloading pose landmarker model to ${modelDest} ...`);
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    throw new Error(`Failed to download model asset: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const { writeFileSync } = await import("node:fs");
  writeFileSync(modelDest, buf);
  console.log(`Downloaded ${buf.length} bytes.`);
} else {
  console.log("Model asset already present, skipping download.");
}
