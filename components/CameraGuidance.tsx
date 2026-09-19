import type { MotionTemplate } from "@/lib/template/types";

export function CameraGuidance({
  guidance,
}: {
  guidance: MotionTemplate["cameraGuidance"];
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
      <div className="mb-2 font-medium text-neutral-200">Before you record</div>
      <ul className="flex flex-col gap-1 text-neutral-400">
        <li>
          <span className="text-neutral-500">Angle:</span> {guidance.angle}
        </li>
        <li>
          <span className="text-neutral-500">Distance:</span> {guidance.distance}
        </li>
        <li>
          <span className="text-neutral-500">Full body visible, good lighting, steady camera.</span>
        </li>
      </ul>
    </div>
  );
}
