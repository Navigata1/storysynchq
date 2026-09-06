import type { Metadata } from "next";
import Studio from "@/components/studio/Studio";

export const metadata: Metadata = {
  title: "StorySync Creator — The Studio",
  description: "Snap your drawings, record your voice, and press play. The StorySync digital studio.",
};

export default function StudioPage() {
  return <Studio />;
}
