"use client";

import { clsx } from "clsx";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  FileText,
  Folder,
  FolderOpen,
  Grid2x2,
  Library,
  Link2,
  ListTree,
  LocateFixed,
  MapPin,
  PenSquare,
  Search,
  Settings,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

type TabKey = "editor" | "plot-grid" | "corkboard" | "timeline";

const manuscript = [
  "Prologue",
  "Chapter 1: The Awakening",
  "Chapter 2: Whispers in the Dark",
  "Chapter 3: The Lost Key",
  "Chapter 4: Crossings",
  "Chapter 5: The Trial",
  "Chapter 6: Betrayal",
  "Chapter 7: The Confrontation",
  "Chapter 8: Resolution",
];

const characters = ["Elena", "Kaelen", "The Archivist", "Rylan"];
const locations = [
  "The Citadel",
  "Ancient Ruins",
  "The Archives",
  "Whispering Woods",
  "Crystal Spire",
  "Sunken City",
];
const plotPoints = [
  "Inciting Incident",
  "The Discovery",
  "The Confrontation",
  "Climax",
  "Resolution",
  "Key Twists",
];

const plotLines = ["Main Plot", "Elena's Arc", "Kaelen's Journey", "The Archives Mystery"];

const gridScenes: Record<string, Record<number, { title: string; tone: "lore" | "location" | "character" }>> = {
  "Main Plot": {
    1: { title: "Citadel Introduction", tone: "lore" },
    2: { title: "Whispers in the Dark", tone: "lore" },
    3: { title: "The Lost Key Map", tone: "lore" },
    4: { title: "Crossings", tone: "lore" },
    5: { title: "The Trial", tone: "lore" },
    6: { title: "Betrayal", tone: "lore" },
    7: { title: "The Confrontation", tone: "lore" },
    8: { title: "Resolution", tone: "lore" },
  },
  "Elena's Arc": {
    3: { title: "Elena Finds the Map", tone: "location" },
    6: { title: "Trust Broken", tone: "location" },
  },
  "Kaelen's Journey": {
    5: { title: "Kaelen's Choice", tone: "character" },
    7: { title: "Redeems the Oath", tone: "character" },
  },
  "The Archives Mystery": {
    2: { title: "Deciphering the First Riddle", tone: "lore" },
    4: { title: "Deciphering the Text", tone: "lore" },
    6: { title: "Hidden Chamber Discovered", tone: "location" },
  },
};

const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "editor", label: "Editor", icon: PenSquare },
  { key: "plot-grid", label: "Plot Grid", icon: Grid2x2 },
  { key: "corkboard", label: "Corkboard", icon: Clapperboard },
  { key: "timeline", label: "Timeline", icon: CalendarDays },
];

function toneClasses(tone: "lore" | "location" | "character") {
  if (tone === "location") {
    return "border-emerald-300/50 bg-emerald-400/10 shadow-[0_0_24px_rgba(16,185,129,0.28)]";
  }
  if (tone === "character") {
    return "border-amber-300/60 bg-amber-400/10 shadow-[0_0_24px_rgba(251,191,36,0.24)]";
  }
  return "border-violet-300/60 bg-violet-400/10 shadow-[0_0_24px_rgba(168,85,247,0.3)]";
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>("plot-grid");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(7);

  const chapterTitle = useMemo(() => manuscript[chapterIndex] ?? manuscript[0], [chapterIndex]);

  return (
    <main className="min-h-screen bg-[#0f1419] text-slate-100">
      <div className="mx-auto flex h-screen max-w-[1800px] flex-col p-3 sm:p-4">
        <header className="glass-panel mb-3 flex items-center gap-3 p-3">
          <div className="flex min-w-0 items-center gap-2 pr-3">
            <div className="rounded-lg border border-violet-300/40 bg-violet-500/15 p-2">
              <Sparkles className="h-5 w-5 text-violet-300" />
            </div>
            <div>
              <div className="text-xl font-semibold tracking-tight text-violet-200">StorySyncHQ</div>
              <div className="text-xs text-slate-400">The Echoing Realm • Book 1</div>
            </div>
          </div>

          <nav className="mx-auto flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-900/50 p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={clsx(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition",
                    active
                      ? "bg-violet-500/20 text-violet-100 ring-1 ring-violet-300/50 shadow-[0_0_20px_rgba(168,85,247,0.35)]"
                      : "text-slate-300 hover:bg-white/5",
                  )}
                >
                  <Icon className="h-4 w-4" /> {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-400">
              <Search className="h-4 w-4" />
              <input className="w-40 bg-transparent outline-none" placeholder="Search..." />
            </label>
            <button className="icon-btn">
              <Settings className="h-4 w-4" />
            </button>
            <div className="avatar">J</div>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[auto_1fr_auto]">
          {!leftCollapsed && (
            <aside className="glass-panel flex min-h-0 w-full flex-col p-3 lg:w-[330px]">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <ListTree className="h-4 w-4 text-violet-300" /> Navigator
                </h2>
                <button className="icon-btn" onClick={() => setLeftCollapsed(true)}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="custom-scroll min-h-0 space-y-2 overflow-y-auto pr-1 text-sm">
                <TreeGroup title="Manuscript" tone="lore" defaultOpen>
                  <div className="ml-2 rounded-md bg-white/5 p-2">
                    <div className="mb-1 text-slate-300">Book 1: The Echoing Realm</div>
                    {manuscript.map((ch, i) => (
                      <button
                        key={ch}
                        onClick={() => {
                          setChapterIndex(i);
                          setActiveTab("editor");
                        }}
                        className={clsx(
                          "mt-1 w-full rounded-md px-2 py-1 text-left text-slate-300 transition hover:bg-white/5",
                          i === chapterIndex && "bg-violet-400/15 text-violet-100",
                        )}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </TreeGroup>
                <TreeGroup title="Characters" tone="character" defaultOpen>
                  {characters.map((item) => (
                    <TreeLeaf key={item} icon={<User className="h-3.5 w-3.5" />} label={item} />
                  ))}
                </TreeGroup>
                <TreeGroup title="Locations" tone="location" defaultOpen>
                  {locations.map((item) => (
                    <TreeLeaf key={item} icon={<MapPin className="h-3.5 w-3.5" />} label={item} />
                  ))}
                </TreeGroup>
                <TreeGroup title="Plot Points" tone="lore" defaultOpen>
                  {plotPoints.map((item) => (
                    <TreeLeaf key={item} icon={<Link2 className="h-3.5 w-3.5" />} label={item} />
                  ))}
                </TreeGroup>
              </div>
            </aside>
          )}

          {leftCollapsed && (
            <button className="glass-panel h-fit w-fit p-2" onClick={() => setLeftCollapsed(false)}>
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
          )}

          <section className="glass-panel relative min-h-0 overflow-hidden p-3 sm:p-5">
            {activeTab === "editor" && <EditorView title={chapterTitle} />}
            {activeTab === "plot-grid" && <PlotGridView />}
            {activeTab === "corkboard" && <CorkboardView />}
            {activeTab === "timeline" && <TimelineView />}
          </section>

          {!rightCollapsed && (
            <aside className="glass-panel flex min-h-0 w-full flex-col p-3 lg:w-[340px]">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Inspector</h2>
                <button className="icon-btn" onClick={() => setRightCollapsed(true)}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="custom-scroll min-h-0 space-y-4 overflow-y-auto pr-1 text-sm">
                <InspectorField label="Scene Status">
                  <select className="inspector-input">
                    <option>Draft</option>
                    <option>In Progress</option>
                    <option>Revision</option>
                    <option>Final</option>
                  </select>
                </InspectorField>
                <InspectorField label="POV Character">
                  <div className="chip chip-character">Elena</div>
                </InspectorField>
                <InspectorField label="Location">
                  <div className="chip chip-location">The Archives</div>
                </InspectorField>
                <InspectorField label="Word Count">
                  <div className="inspector-input text-right font-medium">2,847</div>
                </InspectorField>

                <InspectorField label="Linked Characters">
                  <div className="flex flex-wrap gap-2">
                    {characters.slice(0, 3).map((name) => (
                      <div className="chip chip-character" key={name}>
                        {name}
                      </div>
                    ))}
                  </div>
                </InspectorField>
                <InspectorField label="Linked Plot Points">
                  <div className="chip chip-lore">The Confrontation</div>
                </InspectorField>
                <InspectorField label="Notes">
                  <textarea
                    className="inspector-input min-h-28 resize-y"
                    defaultValue={
                      "Crucial turning point. Emphasize the scale of The Archives and Elena's internal conflict. Plant a seed for betrayal in the next chapter."
                    }
                  />
                </InspectorField>
                <InspectorField label="Associated Media">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-16 rounded-lg bg-gradient-to-br from-cyan-600/35 to-violet-500/35" />
                    <div className="h-16 rounded-lg bg-gradient-to-br from-amber-500/35 to-rose-500/35" />
                    <button className="h-16 rounded-lg border border-dashed border-violet-300/50 bg-violet-500/10 text-xl text-violet-200">
                      +
                    </button>
                  </div>
                </InspectorField>
              </div>
            </aside>
          )}

          {rightCollapsed && (
            <button className="glass-panel h-fit w-fit p-2" onClick={() => setRightCollapsed(false)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </section>

        <footer className="glass-panel mt-3 flex items-center justify-between px-3 py-2 text-xs text-slate-400">
          <div>Word Count: 45,920 total words</div>
          <div className="flex items-center gap-4">
            <span>Last saved: 2 minutes ago</span>
            <span className="flex items-center gap-2 text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Online
            </span>
            <span>2,847</span>
          </div>
        </footer>
      </div>
    </main>
  );
}

function TreeGroup({
  title,
  tone,
  defaultOpen,
  children,
}: {
  title: string;
  tone: "lore" | "location" | "character";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const toneIcon = tone === "character" ? Users : tone === "location" ? LocateFixed : Library;
  const Icon = toneIcon;

  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/25 p-2">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left">
        {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
        <Icon
          className={clsx(
            "h-4 w-4",
            tone === "character" ? "text-amber-300" : tone === "location" ? "text-emerald-300" : "text-violet-300",
          )}
        />
        <span className="font-medium">{title}</span>
      </button>
      {open && <div className="mt-1 space-y-1 pl-6">{children}</div>}
    </div>
  );
}

function TreeLeaf({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-slate-300 transition hover:bg-white/5">
      <span className="text-slate-500">{icon}</span> {label}
    </button>
  );
}

function EditorView({ title }: { title: string }) {
  return (
    <div className="relative h-full">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">{title.replace("Chapter 7", "Chapter 12")}</h1>
        <div className="floating-toolbar">
          {['B', 'I', 'U', 'H1', '•', '1.', '↔'].map((item) => (
            <button key={item} className="toolbar-btn">
              {item}
            </button>
          ))}
        </div>
      </div>
      <article className="manuscript custom-scroll h-[calc(100%-4.5rem)] overflow-y-auto pr-2 text-[29px] leading-[1.5] text-slate-100/95 [font-family:Georgia,'Times_New_Roman',serif] sm:text-[33px]">
        <p>
          The dust motes danced in the shafts of pale light filtering through the high, narrow windows of The Archives.
          Elena adjusted the strap of her satchel, the weight of the ancient tome she had just unearthed pressing against
          her side. The silence here was profound, a heavy blanket woven from centuries of undisturbed knowledge.
        </p>
        <p className="mt-8">
          Kaelen was close, his presence a low hum in the back of her mind, a beacon in the labyrinth of towering shelves.
          The air grew cooler as she approached the central rotunda, where the colossal data sphere hung suspended,
          pulsing with a faint, rhythmic blue light. It was here, amidst the whispers of forgotten lore, that the truth
          about the Echoing Realm would finally be revealed — and the cost of that revelation would have to be paid.
        </p>
      </article>
    </div>
  );
}

function PlotGridView() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Plot Grid</h2>
        <div className="rounded-md border border-white/10 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300">PLOT GRID VIEW</div>
      </div>

      <div className="custom-scroll min-h-0 flex-1 overflow-auto rounded-xl border border-violet-300/20 bg-slate-950/30 p-3 shadow-[inset_0_0_0_1px_rgba(168,85,247,0.15)]">
        <div className="min-w-[980px]">
          <div className="mb-2 grid grid-cols-[180px_repeat(8,minmax(0,1fr))] gap-2 text-sm text-slate-300">
            <div />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-md border border-white/10 bg-white/5 p-2 text-center">
                Ch{i + 1}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {plotLines.map((line) => (
              <div key={line} className="grid grid-cols-[180px_repeat(8,minmax(0,1fr))] gap-2">
                <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-3 font-medium">{line}</div>
                {Array.from({ length: 8 }).map((_, i) => {
                  const scene = gridScenes[line]?.[i + 1];
                  return (
                    <div key={i} className="min-h-[100px] rounded-lg border border-white/10 bg-[#101924] p-2">
                      {scene ? (
                        <div className={clsx("h-full rounded-md border p-2 text-xs", toneClasses(scene.tone))}>
                          <div className="mb-1 text-slate-300">Scene:</div>
                          <div className="text-sm font-medium text-white">{scene.title}</div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CorkboardView() {
  return (
    <div className="h-full">
      <h2 className="mb-4 text-2xl font-semibold">Corkboard</h2>
      <div className="grid h-[calc(100%-3rem)] grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-amber-100/10 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
            <div className="mb-2 text-sm text-amber-200">Index Card {i + 1}</div>
            <p className="text-sm text-slate-300">Draft placeholder for corkboard scene summary and movable notes.</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineView() {
  return (
    <div className="h-full">
      <h2 className="mb-4 text-2xl font-semibold">Timeline</h2>
      <div className="relative mt-10 h-[calc(100%-5rem)] rounded-xl border border-white/10 bg-slate-950/40 p-6">
        <div className="absolute left-6 right-6 top-1/2 h-[2px] -translate-y-1/2 bg-violet-400/30" />
        <div className="grid h-full grid-cols-8 items-center gap-3">
          {manuscript.slice(1).map((chapter, i) => (
            <div key={chapter} className="relative text-center">
              <div className="mx-auto mb-4 h-3 w-3 rounded-full bg-violet-300 shadow-[0_0_20px_rgba(168,85,247,0.7)]" />
              <div className="rounded-md border border-white/10 bg-white/5 p-2 text-xs text-slate-300">{chapter.replace("Chapter ", "Ch")}</div>
              <div className={clsx("mt-2 text-[10px]", i % 2 ? "text-emerald-300" : "text-amber-300")}>Milestone</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InspectorField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-slate-200">{label}</div>
      {children}
    </div>
  );
}
