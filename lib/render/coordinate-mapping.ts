import type { Point2D } from "../motion/types";

/** Maps SpatialAlignmentResult positions (anchor-relative, in body-length
 * units — see spatial-aligner.ts) into canvas pixel space. The anchor
 * sits at the canvas center regardless of which anchor a sport uses
 * (hip/torso/foot); a body extends roughly 4-5 body-length units head to
 * toe, so pixelsPerUnit is chosen to fit that within a typical canvas
 * height with headroom on both sides. */
export interface CanvasMapping {
  width: number;
  height: number;
  pixelsPerUnit: number;
}

export const DEFAULT_CANVAS_MAPPING: CanvasMapping = {
  width: 360,
  height: 560,
  pixelsPerUnit: 90,
};

export function makeCanvasMapper(mapping: CanvasMapping = DEFAULT_CANVAS_MAPPING) {
  return (p: Point2D): Point2D => ({
    x: mapping.width / 2 + p.x * mapping.pixelsPerUnit,
    y: mapping.height / 2 + p.y * mapping.pixelsPerUnit,
  });
}
