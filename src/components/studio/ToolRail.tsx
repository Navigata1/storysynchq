"use client";

/**
 * The tool rail: four tools, nothing else. Left edge on a desktop, a bottom
 * toolbar on a phone (studio.css handles the flip). Child-scale targets —
 * --sk-big-h is raised well past the kit default.
 */

import * as React from "react";
import { BigButton } from "@/components/studio-kit/kit";

export type StudioTool = "photo" | "voice" | "music" | "magic";

export interface ToolRailProps {
  active: StudioTool | null;
  onSelect: (tool: StudioTool) => void;
  photoBusy: boolean;
  narrated: boolean;
  musicOn: boolean;
}

interface ToolSpec {
  id: StudioTool;
  icon: string;
  label: string;
  hint: string;
}

const TOOLS: ToolSpec[] = [
  { id: "photo", icon: "📷", label: "Photo", hint: "Add a picture to this page" },
  { id: "voice", icon: "🎙", label: "Voice", hint: "Record your voice for this page" },
  { id: "music", icon: "♪", label: "Music", hint: "Choose the music behind your story" },
  { id: "magic", icon: "✨", label: "Magic", hint: "Make a story from an idea" },
];

export function ToolRail({ active, onSelect, photoBusy, narrated, musicOn }: ToolRailProps) {
  return (
    <nav
      aria-label="Story tools"
      className="studio-rail-list border-t border-white/8 bg-black/25 backdrop-blur-xl md:border-t-0 md:border-r md:border-white/8"
      style={{ "--sk-big-h": "84px" } as React.CSSProperties}
    >
      {TOOLS.map((tool) => {
        const isActive = active === tool.id;
        const busy = tool.id === "photo" && photoBusy;
        return (
          <BigButton
            key={tool.id}
            icon={<span className="text-[26px] leading-none">{busy ? "⏳" : tool.icon}</span>}
            label={tool.label}
            variant={isActive ? "gold" : "ghost"}
            aria-pressed={isActive}
            title={tool.hint}
            onClick={() => onSelect(tool.id)}
            className="w-full flex-col gap-1 rounded-2xl px-2 text-center text-[13px] font-semibold"
          />
        );
      })}
      <span className="sr-only" aria-live="polite">
        {narrated ? "This page has narration." : "This page has no narration yet."}{" "}
        {musicOn ? "Music bed on." : "Music bed off."}
      </span>
    </nav>
  );
}

export default ToolRail;
