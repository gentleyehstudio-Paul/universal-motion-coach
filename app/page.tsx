import Link from "next/link";
import { MOTION_TEMPLATES } from "@/lib/template/registry";

export default function HomePage() {
  const sports = Object.values(MOTION_TEMPLATES);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-16">
      <div>
        <h1 className="text-3xl font-semibold">Universal Motion Coach</h1>
        <p className="mt-2 text-neutral-400">
          Record a movement, see your skeleton tracked in real time, and get
          one clear correction to work on.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {sports.map((sport) => (
          <Link
            key={sport.sportId}
            href={`/record/${sport.sportId}`}
            className="rounded-lg border border-neutral-800 px-5 py-4 transition hover:border-neutral-600 hover:bg-neutral-900"
          >
            <div className="font-medium">{sport.displayName}</div>
            <div className="mt-1 text-sm text-neutral-500">
              {sport.cameraGuidance.angle}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
