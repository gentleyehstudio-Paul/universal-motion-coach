# Universal Motion Coach

Sport-agnostic AI motion coaching: record a movement, analyze it,
identify what to fix, show the correction, record again, and visually
overlay before/after motion to make invisible movement differences
visible.

## Status: Phase 1 (Research & Architecture) — implementation not started

This repository currently contains the research, architecture, and
planning deliverables produced before any code is written. See `docs/`:

- [`docs/research.md`](docs/research.md) — comparison of pose-estimation
  engines (MediaPipe/BlazePose, MoveNet, MMPose/RTMPose) and reference
  projects (Sports2D, Pose2Sim, OpenCap), plus DTW alignment and action
  quality assessment (AQA) prior art.
- [`docs/open-source-audit.md`](docs/open-source-audit.md) — license and
  reuse verdict for every project/library evaluated.
- [`docs/architecture.md`](docs/architecture.md) — the sport-agnostic
  system design: `PoseProvider` abstraction, `MotionTemplate` plugin
  system, the CV → rule engine → LLM separation, temporal/spatial
  alignment, and ghost-overlay visualization.
- [`docs/data-model.md`](docs/data-model.md) — the normalized
  `MotionSequence` schema and everything downstream of it (`Finding`,
  `Correction`, `AlignmentMap`, `MotionComparison`).
- [`docs/mvp-plan.md`](docs/mvp-plan.md) — V0 milestones, demonstrated
  against three deliberately different movements (squat, basketball jump
  shot, golf swing) to test whether the engine is genuinely sport-agnostic.

## Planned Tech Stack

- **Frontend**: Next.js, TypeScript, Tailwind CSS
- **Backend**: Python, FastAPI
- **Computer vision**: MediaPipe Pose (V0), OpenCV, NumPy, SciPy
- **Alignment**: `dtaidistance` (windowed, phase-seeded DTW)
- **Storage**: local filesystem behind a `StorageProvider` interface (POC),
  cloud-ready later

## Non-Goals for V0

No aggregate "performance score," no multi-camera 3D capture, no personal
baseline/motion-signature learning, no new ML model training — see
`docs/mvp-plan.md` for the full list and rationale.
