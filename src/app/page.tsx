"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─── Types ─── */
interface SSyncPage {
  id: number;
  layout?: string;
  illustration?: { url?: string; alt?: string; animation?: string; animationDuration?: string };
  text?: { content: string; voice?: string; wordHighlight?: boolean; animation?: string; fontSize?: string };
  music?: string | { crossfade?: string; duration?: string };
  timing?: { autoPause?: string; readingSpeed?: string; minDuration?: string };
}

interface SSyncData {
  version: string;
  metadata: { title: string; author?: string; description?: string; coverImage?: string };
  settings?: {
    autoPlay?: boolean; pageTransition?: string; readAlongHighlight?: boolean;
    orientation?: string; accessibility?: { timingMultiplier?: number; pauseBetweenPages?: string };
  };
  pages: SSyncPage[];
}

/* ─── Utility ─── */
function parseDuration(s?: string): number {
  if (!s) return 3000;
  const n = parseFloat(s);
  return s.includes("ms") ? n : n * 1000;
}

/* ════════════════════════════════════════════
   IMMERSIVE READER
   ════════════════════════════════════════════ */
type VoiceMode = "ai" | "recorded";

function ImmersiveReader({ data, onExit }: { data: SSyncData; onExit: () => void }) {
  const [currentPage, setCurrentPage] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [narrating, setNarrating] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [fontsizeMult, setFontsizeMult] = useState(1);
  const [showAccessibility, setShowAccessibility] = useState(false);
  const [readingSpeed, setReadingSpeed] = useState<"slow" | "medium" | "fast">("medium");
  const [dyslexiaFont, setDyslexiaFont] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [timingMult2, setTimingMult2] = useState(1.0); // user-adjustable multiplier
  const [showSplash, setShowSplash] = useState(true);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const autoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /* ── Voice Recording State ── */
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("ai");
  const [recordings, setRecordings] = useState<Record<number, string>>({}); // pageId → blob URL
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showRecordPanel, setShowRecordPanel] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);

  const page = data.pages[currentPage];
  const totalPages = data.pages.length;
  const baseTimingMult = data.settings?.accessibility?.timingMultiplier ?? 1;
  const speedFactor = readingSpeed === "slow" ? 1.5 : readingSpeed === "fast" ? 0.6 : 1.0;
  const timingMult = baseTimingMult * timingMult2 * speedFactor;

  const hasRecording = recordings[page?.id] !== undefined;
  const recordedCount = Object.keys(recordings).length;

  /* ── Voice Recording Functions ── */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setRecordings(prev => ({ ...prev, [page.id]: url }));
        stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        setRecordingTime(0);
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);

      // Cancel TTS if playing
      window.speechSynthesis?.cancel();
    } catch {
      console.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const deleteRecording = (pageId: number) => {
    setRecordings(prev => {
      const next = { ...prev };
      if (next[pageId]) { URL.revokeObjectURL(next[pageId]); delete next[pageId]; }
      return next;
    });
  };

  const playRecording = (pageId: number) => {
    const url = recordings[pageId];
    if (!url) return;
    window.speechSynthesis?.cancel();
    if (audioPlaybackRef.current) { audioPlaybackRef.current.pause(); }
    const audio = new Audio(url);
    audioPlaybackRef.current = audio;
    audio.onplay = () => setNarrating(true);
    audio.onended = () => {
      setNarrating(false);
      if (!paused && data.settings?.autoPlay !== false) {
        const pause = parseDuration(page.timing?.autoPause) * timingMult;
        autoTimer.current = setTimeout(() => goTo("next"), pause);
      }
    };
    audio.play();
  };

  /* Cleanup recordings on unmount */
  useEffect(() => {
    return () => {
      Object.values(recordings).forEach(url => URL.revokeObjectURL(url));
      if (audioPlaybackRef.current) audioPlaybackRef.current.pause();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Splash screen — show for 2 seconds then fade */
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  /* Progress memory — save current page to localStorage */
  useEffect(() => {
    if (data.metadata.title) {
      const key = `ssync-progress-${data.metadata.title.replace(/\s+/g, '-').toLowerCase()}`;
      localStorage.setItem(key, String(currentPage));
    }
  }, [currentPage, data.metadata.title]);

  /* Restore progress on mount */
  useEffect(() => {
    if (data.metadata.title) {
      const key = `ssync-progress-${data.metadata.title.replace(/\s+/g, '-').toLowerCase()}`;
      const saved = localStorage.getItem(key);
      if (saved && parseInt(saved) > 0 && parseInt(saved) < totalPages) {
        setCurrentPage(parseInt(saved));
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Navigate */
  const goTo = useCallback((dir: "next" | "prev") => {
    if (transitioning) return;
    const next = dir === "next" ? currentPage + 1 : currentPage - 1;
    if (next < 0 || next >= totalPages) return;
    window.speechSynthesis?.cancel();
    if (audioPlaybackRef.current) { audioPlaybackRef.current.pause(); audioPlaybackRef.current = null; }
    if (isRecording) stopRecording();
    setDirection(dir);
    setTransitioning(true);
    setHighlightIdx(-1);
    setNarrating(false);
    setTimeout(() => { setCurrentPage(next); setTransitioning(false); }, 500);
  }, [currentPage, totalPages, transitioning]);

  /* Keyboard */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goTo("next"); }
      else if (e.key === "ArrowLeft") goTo("prev");
      else if (e.key === "Escape") onExit();
      else if (e.key === "p") setPaused(p => !p);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goTo, onExit]);

  /* Auto-hide controls */
  useEffect(() => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (showControls) {
      controlsTimer.current = setTimeout(() => setShowControls(false), 4000);
    }
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [showControls, currentPage]);

  /* Narration — TTS or recorded voice */
  useEffect(() => {
    if (paused || !page?.text?.content || isRecording) return;

    // If we have a recording for this page and voiceMode is "recorded", play it
    if (voiceMode === "recorded" && recordings[page.id]) {
      const startDelay = setTimeout(() => playRecording(page.id), 800);
      return () => { clearTimeout(startDelay); if (autoTimer.current) clearTimeout(autoTimer.current); };
    }

    // Otherwise use TTS
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(page.text.content);
    utterance.rate = 0.85;
    utterance.pitch = 1.05;
    synthRef.current = utterance;

    const words = page.text.content.split(/\s+/);
    let wordIdx = 0;
    utterance.onboundary = (e) => {
      if (e.name === "word") { setHighlightIdx(wordIdx); wordIdx++; }
    };
    utterance.onstart = () => setNarrating(true);
    utterance.onend = () => {
      setNarrating(false);
      setHighlightIdx(-1);
      if (!paused && data.settings?.autoPlay !== false) {
        const pause = parseDuration(page.timing?.autoPause) * timingMult;
        autoTimer.current = setTimeout(() => goTo("next"), pause);
      }
    };

    const startDelay = setTimeout(() => window.speechSynthesis.speak(utterance), 800);
    return () => {
      clearTimeout(startDelay);
      if (autoTimer.current) clearTimeout(autoTimer.current);
      window.speechSynthesis.cancel();
    };
  }, [currentPage, paused, voiceMode, recordings]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Tap zones */
  const handleTap = (e: React.MouseEvent) => {
    setShowControls(true);
    const x = e.clientX / window.innerWidth;
    if (x < 0.25) goTo("prev");
    else if (x > 0.75) goTo("next");
  };

  /* Render highlighted text */
  const renderText = () => {
    if (!page?.text?.content) return null;
    const words = page.text.content.split(/\s+/);
    const fontSize = page.text.fontSize === "xl" ? "text-4xl md:text-5xl"
      : page.text.fontSize === "large" ? "text-2xl md:text-3xl"
      : "text-lg md:text-xl";

    const fontFamily = dyslexiaFont ? "font-sans tracking-wide" : "font-serif";
    const contrastClass = highContrast ? "!text-white" : "";

    return (
      <p className={`${fontSize} leading-relaxed ${fontFamily} text-gray-100 transition-all duration-500 ${contrastClass}`}
         style={{ fontSize: `${fontsizeMult}em` }}>
        {words.map((word, i) => (
          <span key={i} className={`inline-block mr-[0.3em] transition-all duration-300 ${
            i < highlightIdx ? "text-white opacity-100"
            : i === highlightIdx ? "text-amber-300 scale-105 opacity-100"
            : highlightIdx === -1 ? "text-gray-200 opacity-90"
            : "text-gray-400 opacity-50"
          }`}>{word}</span>
        ))}
      </p>
    );
  };

  /* Splash screen */
  if (showSplash) {
    return (
      <div className="fixed inset-0 z-50 bg-[#060a14] flex flex-col items-center justify-center">
        <div className="animate-float mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/40">
            <span className="text-4xl">⭐</span>
          </div>
        </div>
        <h2 className="text-white text-2xl font-bold mb-2 animate-fadeIn">{data.metadata.title}</h2>
        {data.metadata.author && (
          <p className="text-white/40 text-sm animate-fadeIn" style={{ animationDelay: "0.3s" }}>
            by {data.metadata.author}
          </p>
        )}
        <div className="mt-8 flex gap-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
                 style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-50 flex flex-col select-none ${highContrast ? "bg-black" : "bg-[#060a14]"}`}
         onClick={handleTap}>

      {/* Top bar */}
      <div className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-500 ${showControls ? "opacity-100" : "opacity-0"}`}>
        <button onClick={(e) => { e.stopPropagation(); onExit(); }}
                className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition">
          <span className="text-white text-lg">✕</span>
        </button>
        <div className="text-center">
          <p className="text-white/80 text-sm font-medium">{data.metadata.title}</p>
          <p className="text-white/40 text-xs">{currentPage + 1} / {totalPages}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={(e) => { e.stopPropagation(); setPaused(p => !p); }}
                  className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition text-white text-sm">
            {paused ? "▶" : "⏸"}
          </button>
          {/* Voice mode toggle */}
          <button onClick={(e) => {
                    e.stopPropagation();
                    setVoiceMode(m => m === "ai" ? "recorded" : "ai");
                  }}
                  className={`h-10 px-3 rounded-full backdrop-blur-sm flex items-center justify-center gap-1.5 transition text-xs font-medium ${
                    voiceMode === "recorded"
                      ? "bg-rose-500/30 border border-rose-400/40 text-rose-300"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  }`}>
            {voiceMode === "recorded" ? "🎙️ My Voice" : "🤖 AI Voice"}
          </button>
          {/* Record button */}
          <button onClick={(e) => { e.stopPropagation(); setShowRecordPanel(p => !p); }}
                  className={`w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition ${
                    hasRecording
                      ? "bg-emerald-500/30 border border-emerald-400/40 text-emerald-300"
                      : "bg-white/10 hover:bg-white/20 text-white"
                  }`}>
            🎤
          </button>
          <button onClick={(e) => { e.stopPropagation(); setFontsizeMult(m => m >= 1.5 ? 0.8 : m + 0.1); }}
                  className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition text-white text-xs font-bold">
            Aa
          </button>
          <button onClick={(e) => { e.stopPropagation(); setShowAccessibility(p => !p); }}
                  className={`w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition ${
                    showAccessibility ? "bg-violet-500/30 border border-violet-400/40" : "bg-white/10 hover:bg-white/20"
                  } text-white text-sm`}>
            ⚙️
          </button>
        </div>
      </div>

      {/* ── Recording Panel ── */}
      {showRecordPanel && (
        <div className="absolute top-16 left-0 right-0 z-40 px-4 animate-fadeIn" onClick={e => e.stopPropagation()}>
          <div className="max-w-md mx-auto bg-[#0f1525]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-sm">
                🎤 Record Page {currentPage + 1}
              </h3>
              <button onClick={() => setShowRecordPanel(false)}
                      className="text-white/40 hover:text-white text-lg">✕</button>
            </div>

            {/* Recording status */}
            {isRecording ? (
              <div className="text-center py-4">
                <div className="flex justify-center gap-1 items-end h-8 mb-3">
                  {[...Array(7)].map((_, i) => (
                    <div key={i} className="w-1.5 bg-rose-400 rounded-full animate-pulse"
                         style={{ height: `${12 + Math.sin(Date.now()/200 + i) * 16}px`, animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
                <p className="text-rose-300 text-lg font-mono mb-1">
                  {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, "0")}
                </p>
                <p className="text-white/40 text-xs mb-4">Recording your narration...</p>
                <button onClick={stopRecording}
                        className="px-6 py-3 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-300 font-medium hover:bg-rose-500/30 transition">
                  ⏹ Stop Recording
                </button>
              </div>
            ) : (
              <div>
                {/* Show existing recording if any */}
                {hasRecording && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
                    <span className="text-emerald-400">✓</span>
                    <span className="text-emerald-300 text-sm flex-1">Recording saved</span>
                    <button onClick={() => playRecording(page.id)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-medium hover:bg-emerald-500/30 transition">
                      ▶ Play
                    </button>
                    <button onClick={() => deleteRecording(page.id)}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-medium hover:bg-rose-500/30 transition">
                      🗑
                    </button>
                  </div>
                )}

                {/* Record button */}
                <button onClick={startRecording}
                        className="w-full py-3 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-300 font-medium hover:bg-rose-500/30 transition flex items-center justify-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
                  {hasRecording ? "Re-record This Page" : "Start Recording"}
                </button>

                {/* Text preview for reference while recording */}
                {page?.text?.content && (
                  <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/5">
                    <p className="text-white/30 text-xs uppercase tracking-wider mb-1">Read this:</p>
                    <p className="text-white/70 text-sm font-serif leading-relaxed italic">
                      &ldquo;{page.text.content}&rdquo;
                    </p>
                  </div>
                )}

                {/* Progress across all pages */}
                {recordedCount > 0 && (
                  <div className="mt-4 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-amber-500 transition-all duration-500 rounded-full"
                           style={{ width: `${(recordedCount / totalPages) * 100}%` }} />
                    </div>
                    <span className="text-white/40 text-xs">{recordedCount}/{totalPages}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Accessibility Panel ── */}
      {showAccessibility && (
        <div className="absolute top-16 right-0 z-40 px-4 animate-fadeIn" onClick={e => e.stopPropagation()}
             style={{ left: showRecordPanel ? "50%" : "0" }}>
          <div className="max-w-sm ml-auto bg-[#0f1525]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-sm">⚙️ Reading Settings</h3>
              <button onClick={() => setShowAccessibility(false)} className="text-white/40 hover:text-white text-lg">✕</button>
            </div>

            {/* Reading Speed */}
            <div className="mb-4">
              <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Reading Speed</p>
              <div className="flex gap-2">
                {(["slow", "medium", "fast"] as const).map(s => (
                  <button key={s} onClick={() => setReadingSpeed(s)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${
                      readingSpeed === s
                        ? "bg-violet-500/30 border border-violet-400/40 text-violet-300"
                        : "bg-white/5 border border-white/10 text-white/50 hover:text-white/70"
                    }`}>
                    {s === "slow" ? "🐢 Slow" : s === "medium" ? "🚶 Medium" : "🏃 Fast"}
                  </button>
                ))}
              </div>
            </div>

            {/* Timing Multiplier */}
            <div className="mb-4">
              <p className="text-white/50 text-xs uppercase tracking-wider mb-2">
                Page Pause: {timingMult2.toFixed(1)}×
              </p>
              <input type="range" min="0.5" max="3" step="0.1" value={timingMult2}
                     onChange={e => setTimingMult2(parseFloat(e.target.value))}
                     className="w-full accent-violet-500" />
              <div className="flex justify-between text-white/30 text-xs mt-1">
                <span>Quick</span><span>Long pause</span>
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-white/70 text-sm">Dyslexia-friendly font</span>
                <button onClick={() => setDyslexiaFont(d => !d)}
                        className={`w-10 h-6 rounded-full transition-colors ${dyslexiaFont ? "bg-violet-500" : "bg-white/20"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ml-1 ${dyslexiaFont ? "translate-x-4" : ""}`} />
                </button>
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-white/70 text-sm">High contrast</span>
                <button onClick={() => setHighContrast(c => !c)}
                        className={`w-10 h-6 rounded-full transition-colors ${highContrast ? "bg-violet-500" : "bg-white/20"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ml-1 ${highContrast ? "translate-x-4" : ""}`} />
                </button>
              </label>
            </div>

            {/* Font size */}
            <div className="mt-4">
              <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Font Size</p>
              <div className="flex gap-2">
                {[0.8, 1.0, 1.2, 1.5].map(s => (
                  <button key={s} onClick={() => setFontsizeMult(s)}
                    className={`flex-1 py-2 rounded-lg font-medium transition ${
                      Math.abs(fontsizeMult - s) < 0.05
                        ? "bg-violet-500/30 border border-violet-400/40 text-violet-300"
                        : "bg-white/5 border border-white/10 text-white/50 hover:text-white/70"
                    }`} style={{ fontSize: `${10 + s * 4}px` }}>
                    Aa
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page content */}
      <div className={`flex-1 flex flex-col items-center justify-center px-6 md:px-16 py-20 transition-all duration-500 ${
        transitioning
          ? direction === "next" ? "translate-x-[-100%] opacity-0" : "translate-x-[100%] opacity-0"
          : "translate-x-0 opacity-100"
      }`}>

        {/* Illustration */}
        {page?.illustration?.url && (
          <div className="w-full max-w-2xl mb-8 rounded-2xl overflow-hidden shadow-2xl shadow-amber-900/20 animate-fadeIn">
            <img src={page.illustration.url} alt={page.illustration.alt || ""}
                 className="w-full h-auto object-cover" />
          </div>
        )}

        {/* Text */}
        <div className="w-full max-w-2xl text-center animate-fadeInUp">
          {renderText()}
        </div>
      </div>

      {/* Bottom progress */}
      <div className={`absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-500 ${showControls ? "opacity-100" : "opacity-0"}`}>
        {/* Narration / Recording indicator */}
        {isRecording ? (
          <div className="flex justify-center items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-rose-400 text-xs font-medium">Recording...</span>
          </div>
        ) : narrating ? (
          <div className="flex justify-center items-center gap-2 mb-2">
            <div className="flex gap-1 items-end h-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className={`w-1 rounded-full animate-pulse ${voiceMode === "recorded" ? "bg-rose-400/70" : "bg-amber-400/70"}`}
                     style={{ height: `${8 + Math.random() * 12}px`, animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            {voiceMode === "recorded" && <span className="text-rose-400/60 text-xs">Your voice</span>}
          </div>
        ) : null}
        {/* Progress bar */}
        <div className="h-1 bg-white/10">
          <div className="h-full bg-gradient-to-r from-amber-500 to-violet-500 transition-all duration-500"
               style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }} />
        </div>
        {/* Nav hint */}
        <div className="flex justify-between px-6 py-3 bg-gradient-to-t from-black/80 to-transparent">
          <button onClick={(e) => { e.stopPropagation(); goTo("prev"); }}
                  className={`text-white/40 text-sm hover:text-white/70 transition ${currentPage === 0 ? "invisible" : ""}`}>
            ← Previous
          </button>
          <button onClick={(e) => { e.stopPropagation(); goTo("next"); }}
                  className={`text-white/40 text-sm hover:text-white/70 transition ${currentPage === totalPages - 1 ? "invisible" : ""}`}>
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   LANDING PAGE
   ════════════════════════════════════════════ */
export default function Home() {
  const [readerData, setReaderData] = useState<SSyncData | null>(null);
  const [loading, setLoading] = useState(false);

  const openDemo = async () => {
    setLoading(true);
    try {
      const res = await fetch("/demo/brave-little-star.ssync.json");
      const data = await res.json();
      setReaderData(data);
    } catch (e) { console.error("Failed to load demo:", e); }
    setLoading(false);
  };

  if (readerData) {
    return <ImmersiveReader data={readerData} onExit={() => setReaderData(null)} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white overflow-x-hidden">

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center">
        {/* Ambient stars */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(40)].map((_, i) => (
            <div key={i} className="absolute w-1 h-1 bg-white rounded-full animate-twinkle"
                 style={{
                   left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
                   animationDelay: `${Math.random() * 5}s`, animationDuration: `${2 + Math.random() * 4}s`,
                   opacity: 0.2 + Math.random() * 0.6,
                 }} />
          ))}
        </div>

        {/* Glow orb */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-violet-500/10 blur-[80px] pointer-events-none" />

        {/* Star icon */}
        <div className="relative mb-8 animate-float">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <span className="text-5xl">⭐</span>
          </div>
          <div className="absolute -inset-3 rounded-full border border-amber-400/20 animate-ping-slow" />
        </div>

        {/* Title */}
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-3">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-300 via-white to-violet-300">
            StorySyncHQ
          </span>
        </h1>
        <p className="text-lg md:text-xl text-amber-200/80 font-medium mb-2">
          The Immersive Storybook Protocol
        </p>
        <p className="text-gray-400 text-base md:text-lg max-w-xl mb-10">
          Read along. Listen. Feel. A new universal standard for storytelling that brings the magic of childhood storybooks to every screen.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mb-16">
          <button onClick={openDemo} disabled={loading}
                  className="px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold text-lg shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-105 transition-all duration-300 disabled:opacity-50">
            {loading ? "Loading..." : "✨ Read Demo Storybook"}
          </button>
          <button disabled
                  className="px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-gray-300 font-medium text-lg backdrop-blur-sm hover:bg-white/10 transition-all duration-300 opacity-50 cursor-not-allowed">
            🛠 Create Your Story (Coming Soon)
          </button>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 animate-bounce">
          <div className="w-6 h-10 rounded-full border-2 border-white/20 flex justify-center pt-2">
            <div className="w-1.5 h-3 rounded-full bg-white/40 animate-scroll-dot" />
          </div>
        </div>
      </section>

      {/* ── What is SSYNC ── */}
      <section className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-amber-400 text-sm font-semibold uppercase tracking-widest mb-3">The Protocol</p>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Remember the magic?
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Library books with cassette tapes. Reading along while the narrator guided you page by page. Background music that made every story feel alive. We&apos;re bringing that magic back — for every device, every story, every reader.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: "🎙️", title: "Narrate",
              desc: "Record your own voice, choose AI narrators, or clone a loved one's voice. Every word syncs to the page with real-time highlighting.",
              color: "from-amber-500/20 to-amber-500/5", border: "border-amber-500/20"
            },
            {
              icon: "🎨", title: "Illustrate",
              desc: "Import existing art, generate AI illustrations, or photograph hand-drawn pages. Each image becomes an immersive canvas.",
              color: "from-violet-500/20 to-violet-500/5", border: "border-violet-500/20"
            },
            {
              icon: "✨", title: "Immerse",
              desc: "Background music adapts to mood. Pages turn with cinematic flow. Focus mode silences everything else. The story is all that exists.",
              color: "from-emerald-500/20 to-emerald-500/5", border: "border-emerald-500/20"
            },
          ].map((card) => (
            <div key={card.title}
                 className={`p-8 rounded-2xl bg-gradient-to-b ${card.color} border ${card.border} backdrop-blur-sm hover:scale-[1.02] transition-all duration-300`}>
              <div className="text-4xl mb-4">{card.icon}</div>
              <h3 className="text-xl font-bold text-white mb-2">{card.title}</h3>
              <p className="text-gray-400 leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-24 px-6 max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-violet-400 text-sm font-semibold uppercase tracking-widest mb-3">Simple as 1-2-3</p>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">How It Works</h2>
        </div>

        <div className="space-y-8">
          {[
            { num: "01", title: "Bring Your Story", desc: "Type it, paste it, upload a PDF, photograph drawings, or let AI create it from a prompt." },
            { num: "02", title: "Add Your Voice", desc: "Record narration, pick an AI voice, or import audio. Time each page. Choose background music." },
            { num: "03", title: "Share the Magic", desc: "Get a link, QR code, or downloadable .ssync file. Anyone can read it on any device. No app needed." },
          ].map((step) => (
            <div key={step.num} className="flex gap-6 items-start group">
              <div className="w-14 h-14 flex-shrink-0 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-amber-500/40 transition-colors duration-300">
                <span className="text-amber-400 font-bold text-lg">{step.num}</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-1">{step.title}</h3>
                <p className="text-gray-400">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Use Cases ── */}
      <section className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-emerald-400 text-sm font-semibold uppercase tracking-widest mb-3">For Everyone</p>
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Who Is This For?</h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {[
            { emoji: "👶", title: "Children", desc: "A 4-year-old can narrate their own drawings. Build bedtime stories together." },
            { emoji: "📚", title: "Authors", desc: "Turn your illustrated book into a premium immersive edition with narration and music." },
            { emoji: "🏫", title: "Educators", desc: "Create curriculum-aligned interactive reading experiences. Multi-language support." },
            { emoji: "💝", title: "Families", desc: "Preserve a loved one's voice reading their favorite story. A gift that lasts forever." },
          ].map((card) => (
            <div key={card.title}
                 className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all duration-300">
              <span className="text-3xl">{card.emoji}</span>
              <h3 className="text-lg font-bold text-white mt-3 mb-1">{card.title}</h3>
              <p className="text-gray-500 text-sm">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Protocol CTA ── */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-2xl mx-auto p-10 rounded-3xl bg-gradient-to-b from-white/5 to-transparent border border-white/10 backdrop-blur-sm">
          <p className="text-amber-400 text-sm font-semibold uppercase tracking-widest mb-3">Open Standard</p>
          <h2 className="text-3xl font-bold mb-4">The SSYNC Protocol</h2>
          <p className="text-gray-400 mb-6">
            SSYNC is an open JSON-based format for immersive storybooks. Like PDF for documents — but for narrated, illustrated, musical reading experiences. Build renderers, create tools, publish stories.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/protocol/v1.schema.json" target="_blank"
               className="px-6 py-3 rounded-xl bg-white/10 border border-white/10 text-white font-medium hover:bg-white/15 transition">
              📄 View Schema v1.0
            </a>
            <a href="https://github.com/Navigata1/storysynchq" target="_blank" rel="noopener"
               className="px-6 py-3 rounded-xl bg-white/10 border border-white/10 text-white font-medium hover:bg-white/15 transition">
              🐙 GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-12 px-6 border-t border-white/5 text-center">
        <p className="text-gray-500 text-sm">
          StorySyncHQ · A product of <span className="text-gray-400">Island Development Crew</span>
        </p>
        <p className="text-gray-600 text-xs mt-2">
          Part of the SyncHQ Suite · CareSyncHQ · StorySyncHQ · ListSyncHQ · BookSyncHQ
        </p>
      </footer>

      {/* ── CSS Animations ── */}
      <style jsx global>{`
        @keyframes twinkle { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes ping-slow { 0% { transform: scale(1); opacity: 0.4; } 100% { transform: scale(1.5); opacity: 0; } }
        @keyframes scroll-dot { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(8px); opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-twinkle { animation: twinkle var(--tw-animate-duration, 3s) ease-in-out infinite; }
        .animate-float { animation: float 4s ease-in-out infinite; }
        .animate-ping-slow { animation: ping-slow 3s ease-out infinite; }
        .animate-scroll-dot { animation: scroll-dot 1.5s ease-in-out infinite; }
        .animate-fadeIn { animation: fadeIn 1s ease-out forwards; }
        .animate-fadeInUp { animation: fadeInUp 1s ease-out forwards; animation-delay: 0.3s; opacity: 0; }
        .font-serif { font-family: Georgia, "Times New Roman", serif; }
      `}</style>
    </div>
  );
}
