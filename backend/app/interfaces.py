"""Provider interfaces per docs/architecture.md. No concrete implementation
lives here — RTMPoseProvider (M?/V1), the DTW-based AlignmentEngine (M5),
and the local-filesystem StorageProvider are separate modules that satisfy
these Protocols, so callers (FastAPI route handlers) depend only on this
file, never on a specific provider.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from .models import AlignmentMap, CommonSkeletonFrame, MotionSequence


@runtime_checkable
class PoseProvider(Protocol):
    """Server-side pose extraction (e.g. RTMPose via rtmlib). The V0
    pose path (MediaPipe, browser-side) never calls this — it exists for
    the V1 upgrade path described in docs/mvp-plan.md.
    """

    name: str
    version: str

    def extract(self, frame_bgr, frame_index: int, timestamp_ms: float) -> CommonSkeletonFrame | None:
        ...


@runtime_checkable
class StorageProvider(Protocol):
    def save(self, data: bytes, content_type: str) -> str:
        """Returns an opaque ref, not necessarily a filesystem path."""
        ...

    def load(self, ref: str) -> bytes:
        ...

    def delete(self, ref: str) -> None:
        ...


@runtime_checkable
class AlignmentEngine(Protocol):
    """dtaidistance-based, windowed, phase-seeded DTW — see
    docs/architecture.md §3.6. Implemented starting at M5.
    """

    def align(self, before: MotionSequence, after: MotionSequence) -> AlignmentMap:
        ...
