# Universal Motion Coach

Sport-agnostic AI motion coaching: record a movement, analyze it,
identify what to fix, show the correction, record again, and visually
overlay before/after motion to make invisible movement differences
visible.

## Status: Phase 2 (MVP implementation) — M0–M6 of 7 done

See [`docs/mvp-plan.md`](docs/mvp-plan.md) for the full milestone plan
against three deliberately different movements (squat, basketball jump
shot, golf swing). Progress so far:

- **M0** — Next.js/FastAPI scaffolding, `PoseProvider`/`StorageProvider`/
  `AlignmentEngine` interfaces.
- **M1** — Browser-side MediaPipe pose extraction + skeleton overlay,
  camera guidance per sport, record-or-upload UI.
- **M2** — `MotionSequence` construction: joint/segment angles, a
  zero-phase Butterworth filter, centers, velocity/acceleration.
- **M3** — Generic `PhaseDetector`, driven entirely by each sport's
  `template.json` (no per-sport code).
- **M4** — Rule engine (`EvaluationRule` → `Finding`) and correction
  engine (`Finding` → primary `Correction`), with a small authored
  cue/drill library per sport.
- **M5** — Second ("after") recording, and DTW-based temporal alignment
  (windowed, phase-seeded, via `dtaidistance`) running server-side, plus
  spatial normalization (`SpatialAligner`) for the M6 overlay to consume.
- **M6** — `GhostOverlayView` (play/pause/scrub/frame-step/slow-motion,
  opacity slider, optional motion trails) and `DifferenceView`
  (per-joint displacement arrows + measured deltas) — the two view modes
  the product brief calls non-negotiable for V0 — assembled into a
  `ResultSection` with timing-change and primary-correction summaries.
  See `/dev/ghost-preview` for a synthetic-data preview that doesn't
  need a camera.

Remaining: **M7** (cross-sport validation pass with a 4th, unplanned
movement, as a hard test of the sport-agnostic architecture).

See `docs/` for the original research/architecture/data-model docs this
was built from.

## Running Locally

**Frontend** (Next.js):

```bash
npm install       # also runs scripts/setup-mediapipe-assets.mjs (postinstall)
npm run dev        # http://localhost:3000 (or PORT=xxxx npm run dev)
npm test           # vitest — unit tests for the motion/rules pipeline
npm run typecheck
```

**Backend** (FastAPI — only needed once you get to the M5 alignment
step; M1–M4 run entirely in the browser):

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload   # http://localhost:8000
.venv/bin/pytest                          # backend/tests/
```

The frontend calls the backend at `NEXT_PUBLIC_API_BASE_URL`
(default `http://localhost:8000`) only for `/align`.

## Tech Stack

- **Frontend**: Next.js, TypeScript, Tailwind CSS
- **Backend**: Python, FastAPI
- **Computer vision**: MediaPipe Pose (self-hosted WASM/model assets —
  see `scripts/setup-mediapipe-assets.mjs`)
- **Alignment**: `dtaidistance` (windowed, phase-seeded DTW)
- **Storage**: not yet needed — no video is persisted (analysis runs
  entirely from the in-memory recording); a `StorageProvider` interface
  exists for when that changes

## Non-Goals for V0

No aggregate "performance score," no multi-camera 3D capture, no personal
baseline/motion-signature learning, no new ML model training — see
`docs/mvp-plan.md` for the full list and rationale.
