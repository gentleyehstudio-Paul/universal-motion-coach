"""Pydantic mirrors of docs/data-model.md. These are the JSON contract
crossing the Next.js <-> FastAPI boundary; keep field names identical
(camelCase) to the TypeScript types in lib/motion/types.ts and
lib/pose/types.ts so no translation layer is needed on either side.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base for every model in this file: (de)serializes camelCase JSON
    while keeping snake_case Python field names, so `has3_d` <-> `has3D`,
    `frame_index` <-> `frameIndex`, etc. without a manual alias per field.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


CommonJointId = Literal[
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
    "left_heel", "right_heel", "left_foot_index", "right_foot_index",
]


class Landmark(CamelModel):
    x: float
    y: float
    z: float | None = None
    confidence: float


class CommonSkeletonFrame(CamelModel):
    frame_index: int
    timestamp_ms: float
    joints: dict[CommonJointId, Landmark]
    has3_d: bool


class Point2D(CamelModel):
    x: float
    y: float


class JointAngleFrame(CamelModel):
    frame_index: int
    angles: dict[str, float]


class SegmentAngleFrame(CamelModel):
    frame_index: int
    angles: dict[str, float]


class DetectedPhase(CamelModel):
    name: str
    start_frame: int
    end_frame: int
    confidence: float


class MotionSequence(CamelModel):
    id: str
    source_video_ref: str | None
    pose_provider: dict[str, str | bool]
    fps: float
    duration: float
    frame_count: int
    video_width: float
    video_height: float
    landmarks: list[CommonSkeletonFrame]
    joint_angles: list[JointAngleFrame]
    segment_angles: list[SegmentAngleFrame]
    phases: list[DetectedPhase]
    confidence: list[float]


QualityDimension = Literal[
    "alignment", "symmetry", "stability", "coordination", "tempo", "completeness"
]


class Finding(CamelModel):
    issue_id: str
    quality_dimension: QualityDimension
    phase: str
    confidence: float
    measured_value: float
    baseline_value: float
    unit: Literal["degrees", "seconds", "ratio", "normalized_distance"]
    severity: Literal["mild", "moderate", "severe"]
    baseline_source: Literal[
        "template_default", "biomechanical_rule", "user_baseline", "user_history"
    ]


class Correction(CamelModel):
    finding_id: str
    what: str
    when: str
    why: str
    what_to_change: str
    cue: str
    drill: str


class PhaseAlignment(CamelModel):
    phase_name: str
    before_range: tuple[int, int]
    after_range: tuple[int, int]


class AlignmentParams(CamelModel):
    sakoe_chiba_radius: int
    feature_space: Literal["joint_angles"]


class AlignmentMap(CamelModel):
    before_sequence_id: str
    after_sequence_id: str
    frame_map: dict[int, int]
    phase_alignment: list[PhaseAlignment]
    method: Literal["dtw_windowed_phase_seeded"]
    params: AlignmentParams
