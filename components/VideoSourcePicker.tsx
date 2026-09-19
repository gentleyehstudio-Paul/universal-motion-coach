"use client";

import { useRef, useState } from "react";

interface VideoSourcePickerProps {
  onVideoReady: (src: string) => void;
}

/** Record via the device camera or upload an existing clip. Per
 * docs/mvp-plan.md M1, this is deliberately minimal — no countdown,
 * multi-camera, or trimming UI yet. */
export function VideoSourcePicker({ onVideoReady }: VideoSourcePickerProps) {
  const [mode, setMode] = useState<"idle" | "recording">("idle");
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    if (previewRef.current) {
      previewRef.current.srcObject = stream;
      await previewRef.current.play();
    }
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      onVideoReady(URL.createObjectURL(blob));
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setMode("recording");
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setMode("idle");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onVideoReady(URL.createObjectURL(file));
  };

  return (
    <div className="flex flex-col gap-4">
      {mode === "recording" ? (
        <div className="flex flex-col gap-3">
          <video ref={previewRef} muted className="w-full rounded-lg bg-black" />
          <button
            onClick={stopRecording}
            className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-500"
          >
            Stop Recording
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={startRecording}
            className="rounded-md bg-neutral-100 px-4 py-2 font-medium text-black hover:bg-white"
          >
            Record with Camera
          </button>
          <label className="cursor-pointer rounded-md border border-neutral-700 px-4 py-2 font-medium hover:border-neutral-500">
            Upload a Video
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>
      )}
    </div>
  );
}
