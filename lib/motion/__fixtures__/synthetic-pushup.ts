import type { CommonSkeletonFrame } from "../../pose/types";

export const SYNTHETIC_PUSHUP_VIDEO_WIDTH = 640;
export const SYNTHETIC_PUSHUP_VIDEO_HEIGHT = 480;
export const SYNTHETIC_PUSHUP_FPS = 30;

// Same phase-boundary shape as synthetic-squat.ts, deliberately — this
// is the M7 cross-sport check: the exact same depth profile / phase-
// detection machinery, applied to a different movement via config alone.
export const SYNTHETIC_PUSHUP_PHASE_BOUNDARIES = {
  topEnd: 10,
  descentEnd: 25,
  bottomEnd: 35,
  ascentEnd: 50,
};

function rotateDegrees(v: { x: number; y: number }, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 3 * clamped * clamped - 2 * clamped * clamped * clamped;
}

/** The arm (wrist-elbow-shoulder) is the same 2-link forward-kinematics
 * construction as synthetic-squat.ts's leg (wrist=ankle, elbow=knee,
 * shoulder=hip): the hand is planted, and the shoulder's position falls
 * out of a known, controllable elbow angle rather than being guessed. */
function armFrameAtDepth(d: number, sideOffsetX: number, bottomElbowAngleDeg: number) {
  const wrist = { x: 420 + sideOffsetX, y: 400 };
  const forearmLength = 90;
  const upperArmLength = 90;

  const forearmTiltDeg = 5 + 10 * d;
  const wristToElbow = rotateDegrees({ x: 0, y: -1 }, forearmTiltDeg);
  const elbow = {
    x: wrist.x + wristToElbow.x * forearmLength,
    y: wrist.y + wristToElbow.y * forearmLength,
  };

  const elbowToWrist = { x: wrist.x - elbow.x, y: wrist.y - elbow.y };
  const elbowAngleDeg = 180 - (180 - bottomElbowAngleDeg) * d; // 180 at top, bottomElbowAngleDeg at bottom
  const deltaFromStraight = 180 - elbowAngleDeg;
  const elbowToShoulderDir = rotateDegrees(
    { x: -elbowToWrist.x, y: -elbowToWrist.y },
    deltaFromStraight
  );
  const norm = Math.hypot(elbowToShoulderDir.x, elbowToShoulderDir.y);
  const shoulder = {
    x: elbow.x + (elbowToShoulderDir.x / norm) * upperArmLength,
    y: elbow.y + (elbowToShoulderDir.y / norm) * upperArmLength,
  };

  return { wrist, elbow, shoulder, elbowAngleDeg };
}

/** Places the hip along the (fixed) shoulder-to-knee line when
 * `sagAmount` is 0 (a perfectly straight plank — hip_flexion reads
 * exactly 180deg regardless of elbow depth), and displaces it
 * perpendicular to that line otherwise, creating a genuine, calculable
 * bend at the hip — this is what the hip_sag rule (sports/pushup/
 * rules.json) measures. The knee is fixed (legs don't move during a
 * push-up), independent of the arm's own depth-driven motion. */
function hipAtSag(
  shoulder: { x: number; y: number },
  knee: { x: number; y: number },
  sagAmount: number,
  d: number
) {
  const t = 0.4;
  const straightHip = {
    x: shoulder.x + t * (knee.x - shoulder.x),
    y: shoulder.y + t * (knee.y - shoulder.y),
  };
  const bodyDir = { x: knee.x - shoulder.x, y: knee.y - shoulder.y };
  const bodyLen = Math.hypot(bodyDir.x, bodyDir.y);
  const perp = { x: -bodyDir.y / bodyLen, y: bodyDir.x / bodyLen };
  return {
    x: straightHip.x + perp.x * sagAmount * d,
    y: straightHip.y + perp.y * sagAmount * d,
  };
}

function toLandmark(p: { x: number; y: number }) {
  return {
    x: p.x / SYNTHETIC_PUSHUP_VIDEO_WIDTH,
    y: p.y / SYNTHETIC_PUSHUP_VIDEO_HEIGHT,
    confidence: 0.95,
  };
}

function depthAtFrame(i: number): number {
  const { topEnd, descentEnd, bottomEnd, ascentEnd } = SYNTHETIC_PUSHUP_PHASE_BOUNDARIES;
  if (i < topEnd) return 0;
  if (i < descentEnd) return smoothstep((i - topEnd) / (descentEnd - topEnd));
  if (i < bottomEnd) return 1;
  if (i < ascentEnd) return 1 - smoothstep((i - bottomEnd) / (ascentEnd - bottomEnd));
  return 0;
}

export function buildSyntheticPushupFrames(
  totalFrames: number,
  bottomElbowAngleDeg = 90,
  sagAmount = 0
): CommonSkeletonFrame[] {
  const frames: CommonSkeletonFrame[] = [];
  const leftKneeFixed = { x: 120, y: 420 };
  const rightKneeFixed = { x: 160, y: 420 };

  for (let i = 0; i < totalFrames; i++) {
    const d = depthAtFrame(i);
    const left = armFrameAtDepth(d, -20, bottomElbowAngleDeg);
    const right = armFrameAtDepth(d, 20, bottomElbowAngleDeg);
    const leftHip = hipAtSag(left.shoulder, leftKneeFixed, sagAmount, d);
    const rightHip = hipAtSag(right.shoulder, rightKneeFixed, sagAmount, d);

    frames.push({
      frameIndex: i,
      timestampMs: (i * 1000) / SYNTHETIC_PUSHUP_FPS,
      has3D: false,
      joints: {
        left_wrist: toLandmark(left.wrist),
        left_elbow: toLandmark(left.elbow),
        left_shoulder: toLandmark(left.shoulder),
        left_hip: toLandmark(leftHip),
        left_knee: toLandmark(leftKneeFixed),
        right_wrist: toLandmark(right.wrist),
        right_elbow: toLandmark(right.elbow),
        right_shoulder: toLandmark(right.shoulder),
        right_hip: toLandmark(rightHip),
        right_knee: toLandmark(rightKneeFixed),
      },
    });
  }
  return frames;
}
