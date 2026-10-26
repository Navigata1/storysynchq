"use client";

/**
 * The tool rail: three friendly tools first — Photo, Voice, Music — then,
 * past a divider, a quieter Magic. Magic sits apart on purpose: the voice is
 * the moat (s03). Left edge on a tablet or desktop, a bottom toolbar on a
 * phone (studio.css handles the flip). Child-scale targets: the three tools
 * are 92px tiles.
 */

import * as React from "react";
import { Camera, Hourglass, Mic, Music, Sparkles, type LucideIcon } from "lucide-react";
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
  Icon: LucideIcon;
  label: string;
  hint: string;
}

/** The three friendly tools. */
const TOOLS: ToolSpec[] = [
  { id: "photo", Icon: Camera, label: "Photo", hint: "Add a picture to this page" },
  { id: "voice", Icon: Mic, label: "Voice", hint: "Record your voice for this page" },
  { id: "music", Icon: Music, label: "Music", hint: "Choose the music behind your story" },
];

const MAGIC: ToolSpec = { id: "magic", Icon: Sparkles, label: "Magic", hint: "Make a story from an idea" };

export function ToolRail({ active, onSelect, photoBusy, narrated, musicOn }: ToolRailProps) {
  const magicOn = active === MAGIC.id;
  return (
    <nav
      aria-label="Story tools"
      className="studio-rail-list border-t border-white/8 bg-black/25 backdrop-blur-xl md:border-t-0 md:border-r md:bg-[#0b0f1d] md:backdrop-blur-none"
    >
      {TOOLS.map(({ id, Icon, label, hint }) => {
        const isActive = active === id;
        const busy = id === "photo" && photoBusy;
        const Glyph = busy ? Hourglass : Icon;
        return (
          <BigButton
            key={id}
            icon={<Glyph className="size-7 md:size-[30px]" strokeWidth={isActive ? 2.4 : 1.9} />}
            label={label}
            variant={isActive ? "gold" : "ghost"}
            aria-pressed={isActive}
            title={hint}
            onClick={() => onSelect(id)}
            className={`studio-rail-tool w-full flex-col gap-2 rounded-[22px] px-2 text-center text-[14px] font-semibold ${
              isActive ? "" : "text-ss-fg-2"
            }`}
          />
        );
      })}

      <div role="separator" className="studio-rail-sep" />

      <BigButton
        icon={
          <span
            className={`grid size-11 place-items-center rounded-[14px] border border-dashed ${
              magicOn ? "border-ss-ink/30" : "border-white/16"
            }`}
          >
            <MAGIC.Icon className="size-[22px]" strokeWidth={1.8} />
          </span>
        }
        label={MAGIC.label}
        variant={magicOn ? "gold" : "ghost"}
        aria-pressed={magicOn}
        title={MAGIC.hint}
        onClick={() => onSelect(MAGIC.id)}
        className={`studio-rail-magic min-h-0 flex-col gap-1.5 rounded-[18px] px-1 py-0.5 text-center text-[12px] font-medium ${
          magicOn ? "" : "border-transparent bg-transparent text-ss-fg-3 backdrop-blur-none hover:bg-white/5"
        }`}
      />

      <span className="sr-only" aria-live="polite">
        {narrated ? "This page has narration." : "This page has no narration yet."}{" "}
        {musicOn ? "Music bed on." : "Music bed off."}
      </span>
    </nav>
  );
}

export default ToolRail;
