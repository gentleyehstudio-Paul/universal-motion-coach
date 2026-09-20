import type { CommonJointId, CommonSkeletonFrame } from "../pose/types";
import { ALL_COMMON_JOINT_IDS } from "../pose/all-joint-ids";
import {
  toPixelSpace,
  jointAngleDegrees,
  segmentAngleFromVertical,
  rotationDifferenceDegrees,
  midpoint,
  distance,
  median,
  type Vec2,
} from "./geometry";
import { butterworthLowpassFiltfilt } from "./filter";
import { JOINT_ANGLE_DEFS } from "./joint-angle-defs";
import { fillGaps, firstNonNull, lastNonNull } from "./array-utils";
import type {
  DetectedPhase,
  JointAccelerationFrame,
  JointAngleFrame,
  JointVelocityFrame,
  MotionSequence,
  MovementDirection,
  Point2D,
  SegmentAngleFrame,
} from "./types";

export interface BuildMotionSequenceInput {
  id: string;
  sourceVideoRef: string | null;
  poseProvider: { name: string; version: string; has3D: boolean };
  videoWidth: number;
  videoHeight: number;
  frames: CommonSkeletonFrame[]; // sorted ascending by frameIndex, one entry per frame with a detected pose
}

interface JointSeries {
  x: (number | null)[];
  y: (number | null)[];
  confidence: (number | null)[];
}

const HORIZONTAL_MOVEMENT_THRESHOLD = 0.1; // fraction of frame width
const SCALE_CHANGE_THRESHOLD = 0.15; // relative change in shoulder-hip distance
const MIN_FRAMES_FOR_ACCELERATION = 5;
const MIN_FPS_FOR_ACCELERATION = 15;

export function buildMotionSequence(input: BuildMotionSequenceInput): MotionSequence {
  const { frames, videoWidth, videoHeight } = input;
  if (frames.length === 0) {
    throw new Error("buildMotionSequence requires at least one frame");
  }

  const firstTs = frames[0]!.timestampMs;
  const lastTs = frames[frames.length - 1]!.timestampMs;
  const duration = frames.length > 1 ? Math.max((lastTs - firstTs) / 1000, 0) : 0;
  const fps = frames.length > 1 && duration > 0 ? (frames.length - 1) / duration : 30;

  const jointSeries = buildFilteredJointSeries(frames, videoWidth, videoHeight);

  const { hipCenterPx, shoulderCenterPx, bodyCenterPx } = buildPixelCenters(
    jointSeries,
    frames.length
  );

  const frameScales = buildFrameScales(jointSeries, frames.length);
  const scaleValuePx = median(frameScales.filter((v): v is number => v !== null)) || 1;

  const torsoAngle = hipCenterPx.map((hip, i) =>
    segmentAngleFromVertical(shoulderCenterPx[i]!, hip)
  );

  const jointAngles = buildJointAngles(frames, jointSeries);
  const segmentAngles = buildSegmentAngles(frames, jointSeries, torsoAngle);
  const velocities = buildVelocities(frames, jointSeries, scaleValuePx);

  const canComputeAcceleration =
    frames.length >= MIN_FRAMES_FOR_ACCELERATION && fps >= MIN_FPS_FOR_ACCELERATION;
  const accelerations = canComputeAcceleration
    ? buildAccelerations(frames, velocities)
    : null;

  const confidence = frames.map((frame) => {
    const values = Object.values(frame.joints)
      .filter((j): j is NonNullable<typeof j> => j != null)
      .map((j) => j.confidence);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  });

  const movementDirection = detectMovementDirection(
    hipCenterPx,
    frameScales,
    videoWidth
  );

  const toNormalized = (p: Vec2): Point2D => ({
    x: p.x / videoWidth,
    y: p.y / videoHeight,
  });

  const phases: DetectedPhase[] = []; // caller runs detectPhases() separately and assigns it in

  return {
    id: input.id,
    sourceVideoRef: input.sourceVideoRef,
    poseProvider: input.poseProvider,
    fps,
    duration,
    frameCount: frames.length,
    videoWidth,
    videoHeight,
    landmarks: frames,
    jointAngles,
    segmentAngles,
    velocities,
    accelerations,
    bodyCenter: bodyCenterPx.map(toNormalized),
    hipCenter: hipCenterPx.map(toNormalized),
    shoulderCenter: shoulderCenterPx.map(toNormalized),
    torsoAngle,
    movementDirection,
    phases,
    confidence,
    normalization: {
      anchor: "hip",
      scaleReference: "shoulder_hip_distance",
      scaleValuePx,
    },
  };
}

function buildFilteredJointSeries(
  frames: CommonSkeletonFrame[],
  videoWidth: number,
  videoHeight: number
): Map<CommonJointId, JointSeries> {
  const series = new Map<CommonJointId, JointSeries>();

  for (const jointId of ALL_COMMON_JOINT_IDS) {
    const x: (number | null)[] = new Array(frames.length).fill(null);
    const y: (number | null)[] = new Array(frames.length).fill(null);
    const confidence: (number | null)[] = new Array(frames.length).fill(null);

    frames.forEach((frame, i) => {
      const lm = frame.joints[jointId];
      if (!lm) return;
      const px = toPixelSpace(lm, videoWidth, videoHeight);
      x[i] = px.x;
      y[i] = px.y;
      confidence[i] = lm.confidence;
    });

    const presentIndices = x
      .map((v, i) => (v !== null ? i : -1))
      .filter((i) => i !== -1);

    if (presentIndices.length >= 2) {
      const presentTs = presentIndices.map((i) => frames[i]!.timestampMs);
      const spanSec =
        (presentTs[presentTs.length - 1]! - presentTs[0]!) / 1000;
      const effectiveFps =
        spanSec > 0 ? (presentIndices.length - 1) / spanSec : 30;

      const compactX = presentIndices.map((i) => x[i]!);
      const compactY = presentIndices.map((i) => y[i]!);
      const filteredX = butterworthLowpassFiltfilt(compactX, effectiveFps);
      const filteredY = butterworthLowpassFiltfilt(compactY, effectiveFps);

      presentIndices.forEach((frameIdx, k) => {
        x[frameIdx] = filteredX[k]!;
        y[frameIdx] = filteredY[k]!;
      });
    }

    series.set(jointId, { x, y, confidence });
  }

  return series;
}

function seriesPoint(
  series: Map<CommonJointId, JointSeries>,
  jointId: CommonJointId,
  i: number
): Vec2 | null {
  const s = series.get(jointId);
  if (!s) return null;
  const x = s.x[i];
  const y = s.y[i];
  return x !== null && x !== undefined && y !== null && y !== undefined
    ? { x, y }
    : null;
}

function buildPixelCenters(series: Map<CommonJointId, JointSeries>, frameCount: number) {
  const hipRaw: (Vec2 | null)[] = [];
  const shoulderRaw: (Vec2 | null)[] = [];
  const bodyRaw: (Vec2 | null)[] = [];

  for (let i = 0; i < frameCount; i++) {
    const lh = seriesPoint(series, "left_hip", i);
    const rh = seriesPoint(series, "right_hip", i);
    const hip = lh && rh ? midpoint(lh, rh) : lh || rh || null;

    const ls = seriesPoint(series, "left_shoulder", i);
    const rs = seriesPoint(series, "right_shoulder", i);
    const shoulder = ls && rs ? midpoint(ls, rs) : ls || rs || null;

    hipRaw.push(hip);
    shoulderRaw.push(shoulder);
    bodyRaw.push(hip && shoulder ? midpoint(hip, shoulder) : hip || shoulder || null);
  }

  // Extreme edge case: a joint never detected across the whole clip.
  // fillGaps can't hold a value that never existed, so fall back to the
  // frame center rather than propagate null into a "number[]" schema field.
  const frameCenterFallback: Vec2 = { x: 0, y: 0 };
  const fallbackFill = (arr: (Vec2 | null)[]) =>
    firstNonNull(arr) === null ? arr.map(() => frameCenterFallback) : fillGaps(arr);

  return {
    hipCenterPx: fallbackFill(hipRaw),
    shoulderCenterPx: fallbackFill(shoulderRaw),
    bodyCenterPx: fallbackFill(bodyRaw),
  };
}

function buildFrameScales(
  series: Map<CommonJointId, JointSeries>,
  frameCount: number
): (number | null)[] {
  const scales: (number | null)[] = [];
  for (let i = 0; i < frameCount; i++) {
    const distances: number[] = [];
    const ls = seriesPoint(series, "left_shoulder", i);
    const lh = seriesPoint(series, "left_hip", i);
    if (ls && lh) distances.push(distance(ls, lh));
    const rs = seriesPoint(series, "right_shoulder", i);
    const rh = seriesPoint(series, "right_hip", i);
    if (rs && rh) distances.push(distance(rs, rh));
    scales.push(distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : null);
  }
  return scales;
}

function buildJointAngles(
  frames: CommonSkeletonFrame[],
  series: Map<CommonJointId, JointSeries>
): JointAngleFrame[] {
  return frames.map((frame, i) => {
    const angles: Record<string, number> = {};
    for (const [key, def] of Object.entries(JOINT_ANGLE_DEFS)) {
      const from = seriesPoint(series, def.from, i);
      const vertex = seriesPoint(series, def.vertex, i);
      const to = seriesPoint(series, def.to, i);
      if (from && vertex && to) {
        angles[key] = jointAngleDegrees(from, vertex, to);
      }
    }
    return { frameIndex: frame.frameIndex, angles };
  });
}

function buildSegmentAngles(
  frames: CommonSkeletonFrame[],
  series: Map<CommonJointId, JointSeries>,
  torsoAngle: number[]
): SegmentAngleFrame[] {
  return frames.map((frame, i) => {
    const angles: Record<string, number> = { torso: torsoAngle[i]! };

    const ls = seriesPoint(series, "left_shoulder", i);
    const rs = seriesPoint(series, "right_shoulder", i);
    const lh = seriesPoint(series, "left_hip", i);
    const rh = seriesPoint(series, "right_hip", i);
    if (ls && rs && lh && rh) {
      const shoulderVec: Vec2 = { x: rs.x - ls.x, y: rs.y - ls.y };
      const hipVec: Vec2 = { x: rh.x - lh.x, y: rh.y - lh.y };
      angles.shoulder_hip_separation = rotationDifferenceDegrees(shoulderVec, hipVec);
    }

    return { frameIndex: frame.frameIndex, angles };
  });
}

function buildVelocities(
  frames: CommonSkeletonFrame[],
  series: Map<CommonJointId, JointSeries>,
  scaleValuePx: number
): JointVelocityFrame[] {
  const result: JointVelocityFrame[] = frames.map((frame) => ({
    frameIndex: frame.frameIndex,
    velocities: {},
  }));

  for (const jointId of ALL_COMMON_JOINT_IDS) {
    let lastIndex: number | null = null;
    for (let i = 0; i < frames.length; i++) {
      const p = seriesPoint(series, jointId, i);
      if (!p) continue;
      if (lastIndex !== null) {
        const prev = seriesPoint(series, jointId, lastIndex)!;
        const dtSec = (frames[i]!.timestampMs - frames[lastIndex]!.timestampMs) / 1000;
        if (dtSec > 0) {
          const vx = (p.x - prev.x) / scaleValuePx / dtSec;
          const vy = (p.y - prev.y) / scaleValuePx / dtSec;
          result[i]!.velocities[jointId] = { vx, vy, speed: Math.hypot(vx, vy) };
        }
      }
      lastIndex = i;
    }
  }

  return result;
}

function buildAccelerations(
  frames: CommonSkeletonFrame[],
  velocities: JointVelocityFrame[]
): JointAccelerationFrame[] {
  const result: JointAccelerationFrame[] = frames.map((frame) => ({
    frameIndex: frame.frameIndex,
    accelerations: {},
  }));

  for (const jointId of ALL_COMMON_JOINT_IDS) {
    let lastIndex: number | null = null;
    for (let i = 0; i < frames.length; i++) {
      const v = velocities[i]!.velocities[jointId];
      if (!v) continue;
      if (lastIndex !== null) {
        const prevV = velocities[lastIndex]!.velocities[jointId]!;
        const dtSec = (frames[i]!.timestampMs - frames[lastIndex]!.timestampMs) / 1000;
        if (dtSec > 0) {
          result[i]!.accelerations[jointId] = {
            ax: (v.vx - prevV.vx) / dtSec,
            ay: (v.vy - prevV.vy) / dtSec,
          };
        }
      }
      lastIndex = i;
    }
  }

  return result;
}

function detectMovementDirection(
  hipCenterPx: Vec2[],
  frameScales: (number | null)[],
  videoWidth: number
): MovementDirection {
  const first = hipCenterPx[0];
  const last = hipCenterPx[hipCenterPx.length - 1];
  if (first && last) {
    const deltaXFraction = (last.x - first.x) / videoWidth;
    if (deltaXFraction > HORIZONTAL_MOVEMENT_THRESHOLD) return "right";
    if (deltaXFraction < -HORIZONTAL_MOVEMENT_THRESHOLD) return "left";
  }

  const firstScale = firstNonNull(frameScales);
  const lastScale = lastNonNull(frameScales);
  if (firstScale && lastScale) {
    const relativeChange = (lastScale - firstScale) / firstScale;
    if (relativeChange > SCALE_CHANGE_THRESHOLD) return "toward_camera";
    if (relativeChange < -SCALE_CHANGE_THRESHOLD) return "away_from_camera";
  }

  return "unknown";
}
