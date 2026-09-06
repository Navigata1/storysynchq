import { Suspense } from "react";
import type { Metadata } from "next";
import { ReadRoom } from "@/components/player/ReadRoom";

export const metadata: Metadata = {
  title: "StorySync Reader",
  description: "Tap to begin. A story with a voice, a melody, and pages that turn themselves.",
};

export default function ReadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0e1a]" />}>
      <ReadRoom />
    </Suspense>
  );
}
