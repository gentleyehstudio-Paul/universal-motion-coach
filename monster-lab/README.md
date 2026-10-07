# Motion Lab

## First-release review (2026-10-05)

The current interface presents four steps: upload a clip; play it slowly with an optional skeleton overlay; capture one original frame with its available skeleton; then, with separate consent and a configured server key, request a short conversational AI review. If that review contains an evidence-backed correction and an approximate timestamp, the user may capture that timestamp. The illustration circles only the named joint if the same-frame local pose estimate sees it reliably. An unknown joint, missing pose, or mismatched frame yields no circle. The older generated-image controls remain in the code but are hidden from this first-release interface. The details panel retains Markdown report export. This is still a loopback prototype: no payment, user account, or shared server-side API-key management has been added. The local preview without a key can exercise upload and single-frame capture, but cannot produce an AI review.

The single-frame view also permits manual selection of a visible body part for observation. This is clearly labeled as user-selected, not an AI correction. Basketball reviews additionally receive the maintained reference `knowledge/basketball-shooting-v1.md`; it contains the user-provided screenshot cues and observation/drill guidelines, not imported past conversation history. The current video remains the source of every case-specific judgment.

Moster Lab has an editorial-style landing page at `/` and the Form Shooting workspace at `/app/`. The landing page rotates through three supplied basketball and golf banners embedded as optimized JPEG data in `dist/index.html`, preventing missing standalone image paths from breaking the hero. It adds a slow crossfade, drifting grid, scan line and restrained pointer response; reduced-motion preferences disable those effects. Banner graphics contain illustrative measurements, so the page labels them as concept art. Both routes use the same circular M favicon. The workspace is a browser-local basketball shooting and golf swing analyzer with a Traditional Chinese interface. Videos are not uploaded for local pose tracking; AI review is an optional, consented request through the local server. It is not yet a public account, payment or entitlement system.

## Use

1. Select basketball or golf, handedness and camera view.
2. Select a browser-decodable MP4/MOV/WebM under 200 MB and 120 seconds. Prefer one complete action in 3–15 seconds with a stationary camera.
3. Analyze. First use downloads MediaPipe Tasks Vision 0.10.21 and Google's full pose model; video stays local.
4. Scrub, slow playback, inspect the skeleton and 2D elbow/knee/torso angles. Click the chart to seek.
5. Manually label action events. Golf tempo uses marked start/top/impact, not inferred club contact.
6. Export the readable Markdown report with measurements, settings, timestamps and limitations before refreshing.

## Implementation

`dist/` is a dependency-free static site using a pinned MediaPipe CDN module. Video is sampled at 15 Hz, resized to at most 960 px wide for CPU pose detection. Pixel aspect ratio is preserved for 2D geometry. Landmarks below 0.65 visibility are omitted. Basketball uses shooting-side joints; golf uses lead-side joints. Horizontal span is normalized to median observed torso length, never reported in cm. It is a whole-clip range, not forward drift per repetition. Model runs in IMAGE mode so seeking/reanalysis cannot violate monotonic video timestamps.

No ball/club tracking, force, launch angle, wrist load, ball-body synchronization, weight transfer or 3D rotation is claimed. User notes supply only the basketball practice cue, not assessment scores. Processing one frame at a time yields between frames; synchronous inference can still briefly stall slower devices. No permanent media storage, accounts, or cross-session comparison.

## Local preview / checks

`node --env-file-if-exists=.env server.mjs` (Node 22+) serves both `/` and `/app/`, including the AI review endpoints. For local, non-AI static checks only, use `python3 -m http.server 8765 --bind 127.0.0.1 --directory dist`.

`node check.mjs`

Tests cover geometry, confidence gating, handedness, missing poses, normalized displacement, timestamp ordering and UI element bindings. JavaScript syntax and external model/library asset availability are checked. Browser security verification was unavailable in the authoring environment, so real-video end-to-end testing and supported-context WebMCP validation were not performed. The optional read-only WebMCP tool is feature-detected and does not affect the normal UI.

Model documentation: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js

## Graphic results (2026-10-01)

Results now include a 1600 × 1370 PNG comparison poster with two source frames, visible-joint skeletons, a selected joint highlight, torso vertical reference, measured angles, B−A angle differences, editable headings and personal annotations. On successful analysis, the minimum valid knee-angle frame and maximum valid elbow-angle frame are selected automatically; these are explicitly labeled sample extrema, not shot/swing phases or good/bad technique. Users can replace either frame by pausing and capturing. When analysis exists, capture seeks to the precise sampled timestamp so image and skeleton match. Missing measurements stay blank. The UNLOADED/LOADED preset is explicitly a user-authored label, not a wrist-load classifier. Images and videos remain on-device.

Browser checks: loaded a generated, non-person test video; captured both frames; applied the label preset and notes; observed successful PNG creation in the interface. Browser download-event automation timed out; a persistent image preview and save link were added as a manual-save fallback. A 15-frame non-person clip completed CPU inference and correctly returned zero poses and no numeric angles. Unit checks cover extrema selection, absent values, aspect-ratio containment, angle deltas and element bindings. Real sports-video biomechanics accuracy is still unvalidated.

## AI posture comparison — local release

Use `node --env-file-if-exists=.env server.mjs` (Node 22+), or double-click `啟動工具.command`. The local server runs at http://127.0.0.1:8765/ (landing page) and http://127.0.0.1:8765/app/ (analysis workspace), and serves only public application files. The old Python static server cannot run AI endpoints. The Git repository currently has no remote configured, and these local changes have not been published. A static deployment can serve the landing page and browser-local pose analysis, but it cannot serve the AI endpoints in `server.mjs` by itself. Do not publish this as a paid AI service until the API routes are ported to a serverless backend, the API key is configured only as a server-side environment variable, and sign-in, payments and one-use entitlements are implemented and tested.

### Activate AI without saving a key

Double-click `啟用AI.command`, enter your own OpenAI API key into the hidden terminal prompt, then visit http://127.0.0.1:8766/app/. The separate port preserves an existing analysis on port 8765. The key stays in the process environment, never in browser code or a file. Close that terminal to stop the service and discard the key. A configured key does not establish model access or sufficient API credit. The UI requires a separate explicit opt-in before any image is sent. API billing is separate from a ChatGPT subscription.

Alternatively, copy `.env.example` to `.env`, set the key privately, and start the regular server. `.env` is ignored by Git and excluded from the HTTP allowlist. Never paste keys in chat.

### Workflow

1. Select your video, sport, handedness and camera view. Run local pose analysis.
2. Capture preparation → rise → release (golf: address → top → impact) from one action, in chronological order. Existing manual timestamps can be reused. These are user-defined events, not auto-verified events.
3. After local pose analysis, review the entire clip without first capturing phase frames. With consent, the browser seeks across the clip and sends up to 36 chronological, resized JPEG samples plus the full local 15 Hz body-pose measurement series, timestamps and camera settings to OpenAI. The original MOV/MP4 and audio stay on-device. This is time-ordered sampled-image review, not native video-stream ingestion; motion between sampled images and automatic ball/club tracking remain unavailable. Sampling and the review request may incur API costs.
4. Review AI observations, timestamps, visible details and uncertainties. The backend accepts at most two actionable corrections supported by same-phase observations of medium/high model-reported confidence, and always provides one practical sport-specific practice direction.
5. For a suggested-pose image, capture the relevant phase from the original video after reviewing the findings, then separately consent to image generation. If the review supports a correction, generate those supported phases. Otherwise, enter a user-selected practice goal (or use the basketball “rise with the ball” preset), choose one phase, and generate a clearly labeled concept illustration. This does not claim that the source movement is faulty. Each user-directed phase is generated separately so the user can control API cost. Edits request preserved identity, clothes, body proportions, camera and floor framing, but these are not guaranteed. Images with strongly mismatched aspect ratios are rejected. Manual alignment controls permit position/scale comparison without altering source pixels. Image notes and arrows are approximate explanatory anchors, not measurements of generated joints.
6. Enter full-screen comparison, select side-by-side or wipe, and toggle annotations. Mobile landscape uses the same two-column canvas. Export one comparison at 2560×1440 or all three at 2560×4320. A preview/save link is available when browser download handling is limited. Generated-result disclaimers always remain visible, including clean view and PNGs.

### Verification and limits

`node check.mjs` checks geometry and UI references. `node check-ai.mjs` tests ordering, uncertainty rejection, edit limits, consent, origin protection, file isolation, review/edit flow and duplicate-generation prevention with a mocked upstream (no paid calls). Browser validation used IMG_2022.mov: all 58 sampled frames detected a person; uncertain joints remained blank. Phase capture, native full-screen, side-by-side/wipe, annotation toggle and PNG blob creation were exercised. Automated download file retrieval timed out in the in-app browser; the manual image-preview/save fallback remains available. Actual paid image generation, identity preservation and recommendation accuracy have NOT been validated because no API key is configured. No images were sent to OpenAI during these checks.

Official image-editing reference: https://developers.openai.com/api/docs/guides/image-generation#edit-images


### Readable analysis export

The results button downloads a Traditional Chinese Markdown (`.md`) brief, not a JSON file. It summarizes pose-detection coverage, available angle ranges, manually marked phase times, AI observations and uncertainties when available, evidence-backed practice suggestions when available, and the tool limits. It does not create technique scores or turn missing measurements into corrections. A visible save link remains available if the browser blocks the automatic download.

### Basketball knowledge base

`knowledge/basketball-shooting-v1.md` is the general, traceable observation checklist. `knowledge/basketball-shooting-release-transition-v1.md` is an additional conditional case reference imported from the user-provided IMG_4216 analysis-priority document; it explicitly notes the original video was not re-reviewed for that document. The basketball AI review endpoint reads both files; golf reviews do not receive them. The case-specific release-direction and movement-transition order must only be used when supported by the current footage, and never becomes a universal finding. User-facing labels use 「細節」. Update the Markdown source and its maintenance notes when adding reviewed, attributed principles or cases.

## Access, plans and deployment (2026-10)

Promo-code / monthly / project access now exists as a ticket layer (`access/`, `api/`, `/pricing`). Login and real payments are still **not** implemented. See `MONETIZATION.md` for the plan table and gaps, and `DEPLOYMENT.md` for Vercel setup and known risks. The sentence above saying there is "no payment, account or entitlement" still holds for login and payment; ticket-based entitlements are new.
