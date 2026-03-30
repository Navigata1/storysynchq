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
    orientation?: string; pageTurnSound?: boolean;
    accessibility?: { timingMultiplier?: number; pauseBetweenPages?: string };
  };
  pages: SSyncPage[];
}

/* ─── Utility ─── */
function parseDuration(s?: string): number {
  if (!s) return 3000;
  const n = parseFloat(s);
  return s.includes("ms") ? n : n * 1000;
}

/* ─── Mood Configurations ─── */
const MOOD_CONFIGS = {
  Wonder:     { emoji: "🌟", desc: "Magical and enchanting",   freq1: 220,  freq2: 220.5, gainMult: 1.0, glow: "rgba(245,158,11,0.35)",  pill: "bg-amber-500/20 border-amber-400/40 text-amber-300"  },
  Adventure:  { emoji: "⚔️",  desc: "Bold and exciting",        freq1: 330,  freq2: 331,   gainMult: 1.7, glow: "rgba(234,88,12,0.35)",   pill: "bg-orange-500/20 border-orange-400/40 text-orange-300"},
  Calm:       { emoji: "🌊", desc: "Peaceful and serene",       freq1: 110,  freq2: 110.3, gainMult: 0.5, glow: "rgba(59,130,246,0.35)",  pill: "bg-blue-500/20 border-blue-400/40 text-blue-300"     },
  Suspense:   { emoji: "🌑", desc: "Tense and mysterious",      freq1: 155,  freq2: 156,   gainMult: 1.0, glow: "rgba(139,92,246,0.35)",  pill: "bg-purple-500/20 border-purple-400/40 text-purple-300"},
  Joy:        { emoji: "☀️",  desc: "Bright and cheerful",      freq1: 440,  freq2: 441,   gainMult: 1.3, glow: "rgba(250,204,21,0.35)",  pill: "bg-yellow-500/20 border-yellow-400/40 text-yellow-300"},
  Melancholy: { emoji: "🌧️", desc: "Wistful and reflective",   freq1: 185,  freq2: 185.5, gainMult: 0.8, glow: "rgba(100,116,139,0.35)", pill: "bg-slate-500/20 border-slate-400/40 text-slate-300"  },
} as const;

type MoodName = keyof typeof MOOD_CONFIGS;

/* ─── Page Turn Sound (Web Audio API — no external files) ─── */
function playPageTurnSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    const bufferSize = Math.floor(ctx.sampleRate * 0.05);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 800;
    filter.Q.value = 1.5;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);

    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    noiseSource.start(ctx.currentTime);
    noiseSource.stop(ctx.currentTime + 0.05);

    setTimeout(() => ctx.close(), 200);
  } catch {
    // Silently ignore — audio not critical
  }
}

/* ════════════════════════════════════════════
   IMMERSIVE READER
   ════════════════════════════════════════════ */
type VoiceMode = "ai" | "recorded";
type AnimPhase = "idle" | "flipping" | "settling";

function ImmersiveReader({ data, onExit, startInRemix }: { data: SSyncData; onExit: () => void; startInRemix?: boolean }) {
  const [currentPage, setCurrentPage] = useState(0);
  const [animPhase, setAnimPhase] = useState<AnimPhase>("idle");
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
  const [timingMult2, setTimingMult2] = useState(1.0);
  const [showSplash, setShowSplash] = useState(true);
  const [isLandscape, setIsLandscape] = useState(false);

  /* ── Phase 4: Remix Engine State ── */
  const [showRemix, setShowRemix] = useState(false);
  const [remixTab, setRemixTab] = useState<"voice" | "mood" | "timing" | "style">("mood");
  const [currentMood, setCurrentMood] = useState<MoodName>("Wonder");
  const [hasRemixed, setHasRemixed] = useState(false);
  const [pageTiming, setPageTiming] = useState<Record<number, number>>({});
  const [globalPagePause, setGlobalPagePause] = useState(3);
  const remixSheetRef = useRef<HTMLDivElement | null>(null);
  const remixDragStart = useRef<number | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const autoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /* ── Voice Recording State ── */
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("ai");
  const [recordings, setRecordings] = useState<Record<number, string>>({});
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showRecordPanel, setShowRecordPanel] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);

  /* ── Phase 2: Voice Engine State ── */
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState<number>(-1);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [pageVoicePrefs, setPageVoicePrefs] = useState<Record<number, { type: "tts" | "recorded"; voiceIndex?: number }>>({});
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [narrationVolume, setNarrationVolume] = useState(80);
  const [musicVolume, setMusicVolume] = useState(30);
  const [previewingVoice, setPreviewingVoice] = useState<number | null>(null);

  /* ── Phase 2: Audio Engine Refs ── */
  const audioCtxRef = useRef<AudioContext | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const osc1Ref = useRef<OscillatorNode | null>(null);
  const osc2Ref = useRef<OscillatorNode | null>(null);

  const page = data.pages[currentPage];
  const totalPages = data.pages.length;
  const baseTimingMult = data.settings?.accessibility?.timingMultiplier ?? 1;
  const speedFactor = readingSpeed === "slow" ? 1.5 : readingSpeed === "fast" ? 0.6 : 1.0;
  const timingMult = baseTimingMult * timingMult2 * speedFactor;
  const soundEnabled = data.settings?.pageTurnSound !== false;

  const nextPageIdx = currentPage + 1;
  const nextPage = nextPageIdx < totalPages ? data.pages[nextPageIdx] : null;

  const hasRecording = recordings[page?.id] !== undefined;
  const recordedCount = Object.keys(recordings).length;
  const transitioning = animPhase !== "idle";

  /* ── Start in remix mode if requested ── */
  useEffect(() => {
    if (startInRemix) {
      const timer = setTimeout(() => setShowRemix(true), 2400); // after splash
      return () => clearTimeout(timer);
    }
  }, [startInRemix]);

  /* ── Landscape detection ── */
  useEffect(() => {
    const check = () => { setIsLandscape(window.innerWidth > window.innerHeight); };
    check();
    const mq = window.matchMedia("(orientation: landscape)");
    const handler = () => check();
    mq.addEventListener("change", handler);
    window.addEventListener("resize", check);
    return () => {
      mq.removeEventListener("change", handler);
      window.removeEventListener("resize", check);
    };
  }, []);

  /* ── Load Web Speech API voices ── */
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) setAvailableVoices(voices);
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  /* ── Background Music (Web Audio API ambient pad) ── */
  const startMusic = useCallback((vol: number) => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioCtxRef.current = ctx;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 400;

      const gainNode = ctx.createGain();
      const targetGain = 0.03 * (vol / 100);
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 2);
      musicGainRef.current = gainNode;

      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.value = 220;

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = 220.5;

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1Ref.current = osc1;
      osc2Ref.current = osc2;
    } catch {
      // Web Audio not supported
    }
  }, []);

  const stopMusic = useCallback(() => {
    if (musicGainRef.current && audioCtxRef.current) {
      try {
        musicGainRef.current.gain.linearRampToValueAtTime(0, audioCtxRef.current.currentTime + 1);
        setTimeout(() => {
          try { osc1Ref.current?.stop(); } catch { /* ignore */ }
          try { osc2Ref.current?.stop(); } catch { /* ignore */ }
          audioCtxRef.current?.close();
        }, 1200);
      } catch { /* ignore */ }
      audioCtxRef.current = null;
      musicGainRef.current = null;
      osc1Ref.current = null;
      osc2Ref.current = null;
    }
  }, []);

  /* ── setMusicMood: smooth crossfade to new mood frequencies ── */
  const setMusicMood = useCallback((mood: MoodName) => {
    setCurrentMood(mood);
    if (!audioCtxRef.current || !osc1Ref.current || !osc2Ref.current || !musicGainRef.current) return;
    const cfg = MOOD_CONFIGS[mood];
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;
    const transitionTime = 1.0;
    try {
      osc1Ref.current.frequency.linearRampToValueAtTime(cfg.freq1, now + transitionTime);
      osc2Ref.current.frequency.linearRampToValueAtTime(cfg.freq2, now + transitionTime);
      const targetGain = 0.03 * cfg.gainMult * (musicVolume / 100);
      musicGainRef.current.gain.linearRampToValueAtTime(targetGain, now + transitionTime);
    } catch { /* ignore */ }
  }, [musicVolume]);

  /* ── Music toggle effect ── */
  useEffect(() => {
    if (musicEnabled) {
      startMusic(musicVolume);
    } else {
      stopMusic();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicEnabled]);

  /* ── Music volume real-time update ── */
  useEffect(() => {
    if (musicGainRef.current && audioCtxRef.current) {
      try {
        musicGainRef.current.gain.setTargetAtTime(
          0.03 * (musicVolume / 100),
          audioCtxRef.current.currentTime,
          0.1
        );
      } catch { /* ignore */ }
    }
  }, [musicVolume]);

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

      window.speechSynthesis?.cancel();
    } catch {
      console.error("Microphone access denied");
    }
  };

  const stopRecording = () => { mediaRecorderRef.current?.stop(); };

  const deleteRecording = (pageId: number) => {
    setRecordings(prev => {
      const next = { ...prev };
      if (next[pageId]) { URL.revokeObjectURL(next[pageId]); delete next[pageId]; }
      return next;
    });
  };

  const playRecording = useCallback((pageId: number) => {
    const url = recordings[pageId];
    if (!url) return;
    window.speechSynthesis?.cancel();
    if (audioPlaybackRef.current) { audioPlaybackRef.current.pause(); }
    const audio = new Audio(url);
    audio.volume = narrationVolume / 100;
    audioPlaybackRef.current = audio;
    audio.onplay = () => setNarrating(true);
    audio.onended = () => {
      setNarrating(false);
      if (!paused && data.settings?.autoPlay !== false) {
        const pause = parseDuration(page?.timing?.autoPause) * timingMult;
        autoTimer.current = setTimeout(() => goTo("next"), pause);
      }
    };
    audio.play();
  }, [recordings, narrationVolume, paused, data.settings?.autoPlay, page?.timing?.autoPause, timingMult]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Voice Preview ── */
  const previewVoice = (voiceIndex: number) => {
    window.speechSynthesis?.cancel();
    setPreviewingVoice(voiceIndex);
    const utterance = new SpeechSynthesisUtterance("Once upon a time...");
    if (availableVoices[voiceIndex]) utterance.voice = availableVoices[voiceIndex];
    utterance.rate = 0.9;
    utterance.onend = () => setPreviewingVoice(null);
    utterance.onerror = () => setPreviewingVoice(null);
    window.speechSynthesis.speak(utterance);
  };

  /* Splash screen */
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  /* Progress memory */
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

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      Object.values(recordings).forEach(url => URL.revokeObjectURL(url));
      if (audioPlaybackRef.current) audioPlaybackRef.current.pause();
      // Stop ambient music
      stopMusic();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Navigate */
  const goTo = useCallback((dir: "next" | "prev") => {
    if (transitioning) return;
    const step = isLandscape ? 2 : 1;
    const next = dir === "next" ? currentPage + step : currentPage - step;
    const clamped = Math.max(0, Math.min(next, totalPages - 1));
    if (clamped === currentPage) return;
    window.speechSynthesis?.cancel();
    if (audioPlaybackRef.current) { audioPlaybackRef.current.pause(); audioPlaybackRef.current = null; }
    if (isRecording) stopRecording();
    setDirection(dir);
    setHighlightIdx(-1);
    setNarrating(false);

    if (soundEnabled) playPageTurnSound();

    setAnimPhase("flipping");
    setTimeout(() => {
      setCurrentPage(clamped);
      setAnimPhase("settling");
      setTimeout(() => setAnimPhase("idle"), 150);
    }, 600);
  }, [currentPage, totalPages, transitioning, isLandscape, soundEnabled, isRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Keyboard */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goTo("next"); }
      else if (e.key === "ArrowLeft") goTo("prev");
      else if (e.key === "Escape") {
        stopMusic();
        onExit();
      }
      else if (e.key === "p") setPaused(p => !p);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goTo, onExit, stopMusic]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Swipe gesture support */
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 50) return;
    if (delta < 0) goTo("next");
    else goTo("prev");
  };

  /* Auto-hide controls */
  useEffect(() => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (showControls) {
      controlsTimer.current = setTimeout(() => setShowControls(false), 4000);
    }
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [showControls, currentPage]);

  /* Narration — TTS or recorded voice (with per-page prefs + volume) */
  useEffect(() => {
    if (paused || !page?.text?.content || isRecording) return;

    // Determine effective voice mode for this page
    const pagePref = pageVoicePrefs[page.id];

    // If page prefers recorded and has recording → play it
    const useRecorded =
      (pagePref?.type === "recorded" && recordings[page.id]) ||
      (!pagePref && voiceMode === "recorded" && recordings[page.id]);

    if (useRecorded) {
      const startDelay = setTimeout(() => playRecording(page.id), 800);
      return () => { clearTimeout(startDelay); if (autoTimer.current) clearTimeout(autoTimer.current); };
    }

    // Otherwise TTS
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(page.text.content);
    utterance.rate = 0.85;
    utterance.pitch = 1.05;
    utterance.volume = narrationVolume / 100;

    // Apply per-page voice override first, then global selection
    const effectiveVoiceIndex = pagePref?.type === "tts" && pagePref.voiceIndex !== undefined
      ? pagePref.voiceIndex
      : selectedVoiceIndex;

    if (effectiveVoiceIndex >= 0 && availableVoices[effectiveVoiceIndex]) {
      utterance.voice = availableVoices[effectiveVoiceIndex];
    }

    synthRef.current = utterance;

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
  }, [currentPage, paused, voiceMode, recordings, selectedVoiceIndex, availableVoices, narrationVolume, pageVoicePrefs]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Tap zones */
  const handleTap = (e: React.MouseEvent) => {
    setShowControls(true);
    const x = e.clientX / window.innerWidth;
    if (x < 0.2) goTo("prev");
    else if (x > 0.8) goTo("next");
  };

  /* Render highlighted text */
  const renderText = (pg: SSyncPage | null) => {
    if (!pg?.text?.content) return null;
    const words = pg.text.content.split(/\s+/);
    const fontSize = pg.text.fontSize === "xl" ? "text-4xl md:text-5xl"
      : pg.text.fontSize === "large" ? "text-2xl md:text-3xl"
      : "text-lg md:text-xl";

    const isActivePage = pg === page;
    return (
      <p className={`${fontSize} leading-relaxed ${dyslexiaFont ? "font-sans tracking-wide" : "font-serif"} ${highContrast ? "!text-white" : "text-gray-100"} transition-all duration-500`}
         style={{ fontSize: `${fontsizeMult}em` }}>
        {words.map((word, i) => (
          <span key={i} className={`inline-block mr-[0.3em] transition-all duration-300 ${
            isActivePage
              ? (i < highlightIdx ? "text-white opacity-100"
                : i === highlightIdx ? "text-amber-300 scale-105 opacity-100"
                : highlightIdx === -1 ? "text-gray-200 opacity-90"
                : "text-gray-400 opacity-50")
              : "text-gray-300 opacity-70"
          }`}>{word}</span>
        ))}
      </p>
    );
  };

  /* ── Single Page Layout ── */
  const renderSinglePage = (pg: SSyncPage | null, pageIndex: number) => {
    if (!pg) return null;
    return (
      <div className="flex flex-col items-center justify-center px-6 md:px-16 py-20 w-full h-full">
        {pg?.illustration?.url && (
          <div className="w-full max-w-2xl mb-8 rounded-2xl overflow-hidden shadow-2xl shadow-amber-900/20 animate-fadeIn">
            <img src={pg.illustration.url} alt={pg.illustration.alt || ""} className="w-full h-auto object-cover" />
          </div>
        )}
        <div className="w-full max-w-2xl text-center animate-fadeInUp">
          {renderText(pg)}
        </div>
        <div className="mt-4 text-white/20 text-xs">{pageIndex + 1}</div>
      </div>
    );
  };

  /* ── Compute 3D flip animation class ── */
  const flipClass = animPhase === "flipping"
    ? direction === "next" ? "page-flip-next" : "page-flip-prev"
    : animPhase === "settling" ? "page-settle" : "";

  /* ── Group voices: English first, then others ── */
  const englishVoices = availableVoices.filter(v => v.lang.startsWith("en"));
  const otherVoices = availableVoices.filter(v => !v.lang.startsWith("en"));

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
          <p className="text-white/40 text-sm animate-fadeIn" style={{ animationDelay: "0.3s" }}>by {data.metadata.author}</p>
        )}
        <div className="mt-8 flex gap-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col select-none ${highContrast ? "bg-black" : "bg-[#060a14]"}`}
      onClick={handleTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >

      {/* ── Top bar ── */}
      <div className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-500 ${showControls ? "opacity-100" : "opacity-0"}`}>
        <button onClick={(e) => { e.stopPropagation(); stopMusic(); onExit(); }}
                className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition">
          <span className="text-white text-lg">✕</span>
        </button>
        <div className="text-center">
          <p className="text-white/80 text-sm font-medium">{data.metadata.title}</p>
          <p className="text-white/40 text-xs">
            {isLandscape
              ? `${currentPage + 1}–${Math.min(currentPage + 2, totalPages)} / ${totalPages}`
              : `${currentPage + 1} / ${totalPages}`
            }
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={(e) => { e.stopPropagation(); setPaused(p => !p); }}
                  className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition text-white text-sm">
            {paused ? "▶" : "⏸"}
          </button>

          {/* 🎵 Music toggle */}
          <button onClick={(e) => { e.stopPropagation(); setMusicEnabled(m => !m); }}
                  className={`w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition text-sm ${
                    musicEnabled
                      ? "bg-violet-500/30 border border-violet-400/40 text-violet-300"
                      : "bg-white/10 hover:bg-white/20 text-white/70"
                  }`}
                  title="Background Music">
            🎵
          </button>

          {/* 🗣 Voice picker */}
          <button onClick={(e) => { e.stopPropagation(); setShowVoicePicker(p => !p); setShowAccessibility(false); setShowRecordPanel(false); }}
                  className={`w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition text-sm ${
                    showVoicePicker || selectedVoiceIndex >= 0
                      ? "bg-amber-500/30 border border-amber-400/40 text-amber-300"
                      : "bg-white/10 hover:bg-white/20 text-white/70"
                  }`}
                  title="AI Voice Picker">
            🗣
          </button>

          {/* Voice mode toggle */}
          <button onClick={(e) => { e.stopPropagation(); setVoiceMode(m => m === "ai" ? "recorded" : "ai"); }}
                  className={`h-10 px-3 rounded-full backdrop-blur-sm flex items-center justify-center gap-1.5 transition text-xs font-medium ${
                    voiceMode === "recorded"
                      ? "bg-rose-500/30 border border-rose-400/40 text-rose-300"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  }`}>
            {voiceMode === "recorded" ? "🎙️ My Voice" : "🤖 AI Voice"}
          </button>

          {/* Record button */}
          <button onClick={(e) => { e.stopPropagation(); setShowRecordPanel(p => !p); setShowVoicePicker(false); setShowAccessibility(false); }}
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
          <button onClick={(e) => { e.stopPropagation(); setShowAccessibility(p => !p); setShowVoicePicker(false); setShowRecordPanel(false); }}
                  className={`w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition ${showAccessibility ? "bg-violet-500/30 border border-violet-400/40" : "bg-white/10 hover:bg-white/20"} text-white text-sm`}>
            ⚙️
          </button>

          {/* ✏️ Remix button */}
          <button onClick={(e) => { e.stopPropagation(); setShowRemix(r => !r); setShowVoicePicker(false); setShowRecordPanel(false); setShowAccessibility(false); }}
                  className={`h-10 px-3 rounded-full backdrop-blur-sm flex items-center justify-center gap-1 transition text-xs font-semibold ${
                    showRemix
                      ? "bg-amber-500/30 border border-amber-400/50 text-amber-300"
                      : "bg-white/10 hover:bg-white/20 text-white/80"
                  }`}
                  title="Remix this story">
            ✏️ Remix
          </button>
        </div>
      </div>

      {/* ════════════════════════════
          VOICE PICKER PANEL (slide-in from right, full height)
          ════════════════════════════ */}
      <div
        className={`absolute inset-y-0 right-0 z-50 w-80 max-w-[90vw] transition-transform duration-300 ease-out ${showVoicePicker ? "translate-x-0" : "translate-x-full"}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="h-full bg-[#0f1525]/95 backdrop-blur-xl border-l border-white/10 flex flex-col shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div>
              <h3 className="text-white font-semibold text-sm">🗣 AI Voice Selection</h3>
              <p className="text-white/40 text-xs mt-0.5">
                {selectedVoiceIndex >= 0 ? availableVoices[selectedVoiceIndex]?.name : "Default system voice"}
              </p>
            </div>
            <button onClick={() => setShowVoicePicker(false)} className="text-white/40 hover:text-white text-lg w-8 h-8 flex items-center justify-center">✕</button>
          </div>

          {/* Default option */}
          <div className="px-4 pt-3">
            <button
              onClick={() => setSelectedVoiceIndex(-1)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left ${
                selectedVoiceIndex === -1
                  ? "bg-amber-500/20 border border-amber-400/30"
                  : "hover:bg-white/5 border border-transparent"
              }`}
            >
              <span className="text-lg">🤖</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">Default (System)</p>
                <p className="text-white/40 text-xs">Browser&apos;s default voice</p>
              </div>
              {selectedVoiceIndex === -1 && <span className="text-amber-400 text-xs">✓</span>}
            </button>
          </div>

          {/* Voice list scrollable */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4 mt-3">
            {availableVoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-white/30 text-sm">No voices loaded yet</p>
                <p className="text-white/20 text-xs mt-1">Voices load after first TTS playback</p>
              </div>
            ) : (
              <>
                {/* English voices */}
                {englishVoices.length > 0 && (
                  <div>
                    <p className="text-amber-400/70 text-xs uppercase tracking-widest mb-2 px-1">🇬🇧 English</p>
                    <div className="space-y-1">
                      {englishVoices.map((voice, _) => {
                        const globalIdx = availableVoices.indexOf(voice);
                        const isSelected = selectedVoiceIndex === globalIdx;
                        const isPreviewing = previewingVoice === globalIdx;
                        return (
                          <div
                            key={globalIdx}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition cursor-pointer ${
                              isSelected
                                ? "bg-amber-500/20 border border-amber-400/30"
                                : "hover:bg-white/5 border border-transparent"
                            }`}
                            onClick={() => { setSelectedVoiceIndex(globalIdx); window.speechSynthesis?.cancel(); setPreviewingVoice(null); }}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs font-medium truncate">{voice.name}</p>
                              <p className="text-white/30 text-xs">{voice.lang}</p>
                            </div>
                            {isSelected && <span className="text-amber-400 text-xs flex-shrink-0">✓</span>}
                            <button
                              onClick={(e) => { e.stopPropagation(); if (isPreviewing) { window.speechSynthesis.cancel(); setPreviewingVoice(null); } else { previewVoice(globalIdx); } }}
                              className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition text-xs ${
                                isPreviewing
                                  ? "bg-amber-500/30 text-amber-300"
                                  : "bg-white/10 text-white/50 hover:bg-white/20 hover:text-white"
                              }`}
                              title="Preview voice"
                            >
                              {isPreviewing ? "■" : "▶"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Other language voices */}
                {otherVoices.length > 0 && (
                  <div>
                    <p className="text-white/30 text-xs uppercase tracking-widest mb-2 px-1">🌍 Other Languages</p>
                    <div className="space-y-1">
                      {otherVoices.map((voice) => {
                        const globalIdx = availableVoices.indexOf(voice);
                        const isSelected = selectedVoiceIndex === globalIdx;
                        const isPreviewing = previewingVoice === globalIdx;
                        return (
                          <div
                            key={globalIdx}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition cursor-pointer ${
                              isSelected
                                ? "bg-amber-500/20 border border-amber-400/30"
                                : "hover:bg-white/5 border border-transparent"
                            }`}
                            onClick={() => { setSelectedVoiceIndex(globalIdx); window.speechSynthesis?.cancel(); setPreviewingVoice(null); }}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs font-medium truncate">{voice.name}</p>
                              <p className="text-white/30 text-xs">{voice.lang}</p>
                            </div>
                            {isSelected && <span className="text-amber-400 text-xs flex-shrink-0">✓</span>}
                            <button
                              onClick={(e) => { e.stopPropagation(); if (isPreviewing) { window.speechSynthesis.cancel(); setPreviewingVoice(null); } else { previewVoice(globalIdx); } }}
                              className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition text-xs ${
                                isPreviewing
                                  ? "bg-amber-500/30 text-amber-300"
                                  : "bg-white/10 text-white/50 hover:bg-white/20 hover:text-white"
                              }`}
                              title="Preview voice"
                            >
                              {isPreviewing ? "■" : "▶"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════
          RECORDING PANEL
          ════════════════════════════ */}
      {showRecordPanel && (
        <div className="absolute top-16 left-0 right-0 z-40 px-4 animate-fadeIn" onClick={e => e.stopPropagation()}>
          <div className="max-w-md mx-auto bg-[#0f1525]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-sm">🎤 Record Page {currentPage + 1}</h3>
              <button onClick={() => setShowRecordPanel(false)} className="text-white/40 hover:text-white text-lg">✕</button>
            </div>

            {/* Per-page voice assignment */}
            <div className="mb-4">
              <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Voice for this page</p>
              <div className="flex gap-2 flex-wrap">
                {/* Default AI */}
                <button
                  onClick={() => setPageVoicePrefs(prev => { const next = { ...prev }; delete next[page.id]; return next; })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    !pageVoicePrefs[page.id]
                      ? "bg-amber-500/30 border border-amber-400/40 text-amber-300"
                      : "bg-white/5 border border-white/10 text-white/50 hover:bg-white/10"
                  }`}
                >
                  🤖 Default (AI)
                </button>
                {/* My Recording (only if recording exists) */}
                {hasRecording && (
                  <button
                    onClick={() => setPageVoicePrefs(prev => ({ ...prev, [page.id]: { type: "recorded" } }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      pageVoicePrefs[page.id]?.type === "recorded"
                        ? "bg-rose-500/30 border border-rose-400/40 text-rose-300"
                        : "bg-white/5 border border-white/10 text-white/50 hover:bg-white/10"
                    }`}
                  >
                    🎙️ My Recording
                  </button>
                )}
                {/* Specific voices (top 4 English) */}
                {englishVoices.slice(0, 4).map((voice) => {
                  const globalIdx = availableVoices.indexOf(voice);
                  const isActive = pageVoicePrefs[page.id]?.type === "tts" && pageVoicePrefs[page.id]?.voiceIndex === globalIdx;
                  return (
                    <button
                      key={globalIdx}
                      onClick={() => setPageVoicePrefs(prev => ({ ...prev, [page.id]: { type: "tts", voiceIndex: globalIdx } }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition truncate max-w-[120px] ${
                        isActive
                          ? "bg-amber-500/30 border border-amber-400/40 text-amber-300"
                          : "bg-white/5 border border-white/10 text-white/50 hover:bg-white/10"
                      }`}
                      title={voice.name}
                    >
                      {voice.name.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recording status */}
            {isRecording ? (
              <div className="text-center py-4">
                <div className="flex justify-center gap-1 items-end h-8 mb-3">
                  {[...Array(7)].map((_, i) => (
                    <div key={i} className="w-1.5 bg-rose-400 rounded-full animate-pulse"
                         style={{ height: `${12 + Math.sin(Date.now() / 200 + i) * 16}px`, animationDelay: `${i * 0.1}s` }} />
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

                <button onClick={startRecording}
                        className="w-full py-3 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-300 font-medium hover:bg-rose-500/30 transition flex items-center justify-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
                  {hasRecording ? "Re-record This Page" : "Start Recording"}
                </button>

                {page?.text?.content && (
                  <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/5">
                    <p className="text-white/30 text-xs uppercase tracking-wider mb-1">Read this:</p>
                    <p className="text-white/70 text-sm font-serif leading-relaxed italic">
                      &ldquo;{page.text.content}&rdquo;
                    </p>
                  </div>
                )}

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

      {/* ════════════════════════════
          ACCESSIBILITY PANEL (with audio mixer)
          ════════════════════════════ */}
      {showAccessibility && (
        <div className="absolute top-16 right-4 z-40 animate-fadeIn" onClick={e => e.stopPropagation()}>
          <div className="w-72 bg-[#0f1525]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl">
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
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${readingSpeed === s ? "bg-violet-500/30 border border-violet-400/40 text-violet-300" : "bg-white/5 border border-white/10 text-white/50"}`}>
                    {s === "slow" ? "🐢 Slow" : s === "medium" ? "🚶 Med" : "🏃 Fast"}
                  </button>
                ))}
              </div>
            </div>

            {/* Page Pause timing */}
            <div className="mb-4">
              <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Page Pause: {timingMult2.toFixed(1)}×</p>
              <input type="range" min="0.5" max="3" step="0.1" value={timingMult2}
                     onChange={e => setTimingMult2(parseFloat(e.target.value))} className="w-full accent-violet-500" />
            </div>

            {/* ── Audio Mixer ── */}
            <div className="mb-4 border-t border-white/10 pt-4">
              <p className="text-white/50 text-xs uppercase tracking-wider mb-3">🎚️ Audio Mixer</p>
              {/* Narration volume */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-amber-300/80 text-xs">🗣 Narration</span>
                  <span className="text-amber-400 text-xs font-mono">{narrationVolume}%</span>
                </div>
                <input
                  type="range" min="0" max="100" step="5" value={narrationVolume}
                  onChange={e => setNarrationVolume(parseInt(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
              {/* Music volume */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-violet-300/80 text-xs">🎵 Music</span>
                  <span className="text-violet-400 text-xs font-mono">{musicVolume}%</span>
                </div>
                <input
                  type="range" min="0" max="100" step="5" value={musicVolume}
                  onChange={e => setMusicVolume(parseInt(e.target.value))}
                  className="w-full accent-violet-500"
                />
                {!musicEnabled && (
                  <p className="text-white/20 text-xs mt-1">Enable music with 🎵 button</p>
                )}
              </div>
            </div>

            {/* Font options */}
            <div className="space-y-3 border-t border-white/10 pt-4">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-white/70 text-sm">Dyslexia font</span>
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
                    className={`flex-1 py-2 rounded-lg font-medium transition ${Math.abs(fontsizeMult - s) < 0.05 ? "bg-violet-500/30 border border-violet-400/40 text-violet-300" : "bg-white/5 border border-white/10 text-white/50"}`}
                    style={{ fontSize: `${10 + s * 4}px` }}>Aa</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════
          REMIX BOTTOM SHEET
          ════════════════════════════ */}
      {/* Backdrop */}
      {showRemix && (
        <div
          className="absolute inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
          onClick={(e) => { e.stopPropagation(); setShowRemix(false); }}
        />
      )}

      {/* Bottom sheet */}
      <div
        ref={remixSheetRef}
        className={`absolute bottom-0 left-0 right-0 z-50 transition-transform duration-400 ease-out ${showRemix ? "translate-y-0" : "translate-y-full"}`}
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: "60vh" }}
        onTouchStart={(e) => { remixDragStart.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => {
          if (remixDragStart.current !== null) {
            const delta = e.changedTouches[0].clientY - remixDragStart.current;
            if (delta > 60) setShowRemix(false);
            remixDragStart.current = null;
          }
        }}
      >
        <div className="bg-[#0f1525]/95 backdrop-blur-xl border-t border-white/10 rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: "60vh" }}>
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1.5 rounded-full bg-white/20" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-3">
            <h3 className="text-white font-bold text-sm">✏️ Remix Story</h3>
            <button onClick={() => setShowRemix(false)} className="text-white/40 hover:text-white text-lg w-8 h-8 flex items-center justify-center">✕</button>
          </div>

          {/* Tab pills */}
          <div className="flex gap-2 px-5 pb-3 overflow-x-auto">
            {(["voice", "mood", "timing", "style"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setRemixTab(tab)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 ${
                  remixTab === tab
                    ? "bg-amber-500 text-black shadow-lg shadow-amber-500/30"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                }`}
              >
                {tab === "voice" ? "🎙️ Voice" : tab === "mood" ? "🎵 Mood" : tab === "timing" ? "⏱ Timing" : "🎨 Style"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-5 pb-6">

            {/* ── VOICE TAB ── */}
            {remixTab === "voice" && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Current Voice</p>
                  <p className="text-white text-sm font-medium">
                    {voiceMode === "recorded"
                      ? "🎙️ My Recording"
                      : selectedVoiceIndex >= 0
                        ? `🗣 ${availableVoices[selectedVoiceIndex]?.name}`
                        : "🤖 AI Default"}
                  </p>
                </div>

                <div>
                  <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Quick Switch</p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => { setVoiceMode("ai"); setSelectedVoiceIndex(-1); setHasRemixed(true); }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition text-left ${
                        voiceMode === "ai" && selectedVoiceIndex === -1
                          ? "bg-amber-500/20 border-amber-400/40 text-amber-300"
                          : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                      }`}
                    >
                      <span className="text-xl">🤖</span>
                      <div>
                        <p className="text-sm font-medium">AI Voice (Default)</p>
                        <p className="text-xs text-white/40">Browser default TTS</p>
                      </div>
                    </button>

                    {Object.keys(recordings).length > 0 && (
                      <button
                        onClick={() => { setVoiceMode("recorded"); setHasRemixed(true); }}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition text-left ${
                          voiceMode === "recorded"
                            ? "bg-rose-500/20 border-rose-400/40 text-rose-300"
                            : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                        }`}
                      >
                        <span className="text-xl">🎙️</span>
                        <div>
                          <p className="text-sm font-medium">My Recording</p>
                          <p className="text-xs text-white/40">{Object.keys(recordings).length} page(s) recorded</p>
                        </div>
                      </button>
                    )}

                    {englishVoices.slice(0, 4).map((voice) => {
                      const idx = availableVoices.indexOf(voice);
                      return (
                        <button
                          key={idx}
                          onClick={() => { setVoiceMode("ai"); setSelectedVoiceIndex(idx); setHasRemixed(true); }}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition text-left ${
                            voiceMode === "ai" && selectedVoiceIndex === idx
                              ? "bg-amber-500/20 border-amber-400/40 text-amber-300"
                              : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                          }`}
                        >
                          <span className="text-xl">🗣</span>
                          <div>
                            <p className="text-sm font-medium">{voice.name}</p>
                            <p className="text-xs text-white/40">{voice.lang}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={() => { setShowRemix(false); setShowRecordPanel(true); }}
                  className="w-full py-3 rounded-xl bg-rose-500/10 border border-rose-400/20 text-rose-300 text-sm font-medium hover:bg-rose-500/20 transition flex items-center justify-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                  Record new narration for this page
                </button>
              </div>
            )}

            {/* ── MOOD TAB ── */}
            {remixTab === "mood" && (
              <div className="space-y-4">
                {!musicEnabled && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/20 flex items-center gap-3">
                    <span>💡</span>
                    <p className="text-amber-300/80 text-xs">Enable music (🎵 button) to hear mood changes</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {(Object.entries(MOOD_CONFIGS) as [MoodName, typeof MOOD_CONFIGS[MoodName]][]).map(([mood, cfg]) => (
                    <button
                      key={mood}
                      onClick={() => {
                        setMusicMood(mood);
                        if (!musicEnabled) setMusicEnabled(true);
                        setHasRemixed(true);
                      }}
                      className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 ${
                        currentMood === mood
                          ? `${cfg.pill} scale-[1.03]`
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      }`}
                      style={currentMood === mood ? { boxShadow: `0 0 20px 4px ${cfg.glow}` } : {}}
                    >
                      <span className="text-3xl mb-1">{cfg.emoji}</span>
                      <p className="text-white text-sm font-semibold">{mood}</p>
                      <p className="text-white/40 text-xs text-center mt-0.5">{cfg.desc}</p>
                      {currentMood === mood && (
                        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setMusicMood(currentMood); setHasRemixed(true); }}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-medium hover:bg-white/10 transition"
                  >
                    Apply to This Page
                  </button>
                  <button
                    onClick={() => { setMusicMood(currentMood); setHasRemixed(true); }}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-medium hover:bg-amber-500/30 transition"
                  >
                    Apply to Entire Story
                  </button>
                </div>
              </div>
            )}

            {/* ── TIMING TAB ── */}
            {remixTab === "timing" && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white/70 text-sm font-medium">Page Pause (after narration)</p>
                    <span className="text-amber-400 text-sm font-mono font-bold">{pageTiming[page?.id] ?? globalPagePause}s</span>
                  </div>
                  <input
                    type="range" min="1" max="15" step="0.5"
                    value={pageTiming[page?.id] ?? globalPagePause}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setPageTiming(prev => ({ ...prev, [page.id]: val }));
                      setHasRemixed(true);
                    }}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-white/30 text-xs mt-1">
                    <span>1s</span><span>15s</span>
                  </div>
                </div>

                <div>
                  <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Global Speed</p>
                  <div className="flex gap-2">
                    {(["slow", "medium", "fast"] as const).map(s => (
                      <button key={s} onClick={() => { setReadingSpeed(s); setHasRemixed(true); }}
                        className={`flex-1 py-3 rounded-xl text-sm font-medium transition ${
                          readingSpeed === s
                            ? "bg-amber-500/30 border border-amber-400/40 text-amber-300"
                            : "bg-white/5 border border-white/10 text-white/50 hover:bg-white/10"
                        }`}>
                        {s === "slow" ? "🐢 Slow" : s === "medium" ? "🚶 Med" : "🏃 Fast"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Global Page Pause</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min="1" max="15" step="0.5"
                      value={globalPagePause}
                      onChange={e => { setGlobalPagePause(parseFloat(e.target.value)); setHasRemixed(true); }}
                      className="flex-1 accent-amber-500"
                    />
                    <span className="text-amber-400 text-sm font-mono w-10 text-right">{globalPagePause}s</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const allTimings: Record<number, number> = {};
                    data.pages.forEach(p => { allTimings[p.id] = globalPagePause; });
                    setPageTiming(allTimings);
                    setHasRemixed(true);
                  }}
                  className="w-full py-3 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-300 text-sm font-semibold hover:bg-amber-500/30 transition"
                >
                  Apply Global Pause to All Pages
                </button>
              </div>
            )}

            {/* ── STYLE TAB (placeholder) ── */}
            {remixTab === "style" && (
              <div className="space-y-4">
                <p className="text-white/40 text-xs uppercase tracking-wider">Illustration Style</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: "Watercolor", emoji: "🎨" },
                    { name: "Comic",      emoji: "💥" },
                    { name: "Pencil",     emoji: "✏️" },
                    { name: "Claymation",emoji: "🧸" },
                    { name: "Pixel Art",  emoji: "🕹️" },
                  ].map(style => (
                    <button
                      key={style.name}
                      onClick={() => {
                        // Coming soon toast (no-op)
                      }}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition group"
                    >
                      <span className="text-3xl">{style.emoji}</span>
                      <p className="text-white/70 text-xs font-medium">{style.name}</p>
                      <span className="text-white/20 text-xs group-hover:text-amber-400/60 transition">Coming soon</span>
                    </button>
                  ))}
                </div>
                <div className="mt-4 p-4 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-center">
                  <p className="text-violet-300 text-sm font-semibold mb-1">🚀 Coming Soon</p>
                  <p className="text-violet-300/60 text-xs">AI illustration regeneration — select a style and we'll redraw every page in seconds</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Remix Attribution Badge ── */}
      {hasRemixed && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 animate-fadeIn pointer-events-none">
          <div className="px-4 py-2 rounded-full bg-black/60 backdrop-blur-sm border border-white/10">
            <p className="text-white/50 text-xs whitespace-nowrap">
              Remixed version — Original by {data.metadata.author || "Unknown"}
            </p>
          </div>
        </div>
      )}

      {/* ══ LANDSCAPE: Two-Page Spread ══ */}
      {isLandscape ? (
        <div className={`flex-1 flex flex-row items-stretch relative overflow-hidden ${flipClass}`}>
          <div className="flex-1 flex flex-col items-center justify-center relative bg-[#070b16]">
            {renderSinglePage(page, currentPage)}
          </div>
          <div className="w-[2px] flex-shrink-0 bg-gradient-to-b from-transparent via-white/20 to-transparent self-stretch shadow-[0_0_12px_2px_rgba(255,255,255,0.06)]" />
          <div className="flex-1 flex flex-col items-center justify-center relative bg-[#060a13]">
            {nextPage
              ? renderSinglePage(nextPage, nextPageIdx)
              : (
                <div className="flex flex-col items-center justify-center text-white/20 gap-4">
                  <span className="text-5xl">📖</span>
                  <p className="text-sm">End of story</p>
                </div>
              )
            }
          </div>
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-8 bg-gradient-to-r from-black/30 via-transparent to-black/30 pointer-events-none" />
        </div>
      ) : (
        /* ══ PORTRAIT: Single Page ══ */
        <div className={`flex-1 flex flex-col items-center justify-center ${flipClass}`}>
          {page?.illustration?.url && (
            <div className="w-full max-w-2xl mb-8 px-6 rounded-2xl overflow-hidden shadow-2xl shadow-amber-900/20 animate-fadeIn">
              <img src={page.illustration.url} alt={page.illustration.alt || ""} className="w-full h-auto object-cover rounded-2xl" />
            </div>
          )}
          <div className="w-full max-w-2xl px-6 text-center animate-fadeInUp">
            {renderText(page)}
          </div>
        </div>
      )}

      {/* Bottom progress */}
      <div className={`absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-500 ${showControls ? "opacity-100" : "opacity-0"}`}>
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
        <div className="h-1 bg-white/10">
          <div className="h-full bg-gradient-to-r from-amber-500 to-violet-500 transition-all duration-500"
               style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }} />
        </div>
        <div className="flex justify-between px-6 py-3 bg-gradient-to-t from-black/80 to-transparent">
          <button onClick={(e) => { e.stopPropagation(); goTo("prev"); }}
                  className={`text-white/40 text-sm hover:text-white/70 transition ${currentPage === 0 ? "invisible" : ""}`}>
            ← Previous
          </button>
          <button onClick={(e) => { e.stopPropagation(); goTo("next"); }}
                  className={`text-white/40 text-sm hover:text-white/70 transition ${currentPage >= totalPages - (isLandscape ? 2 : 1) ? "invisible" : ""}`}>
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   STORY CREATOR
   ════════════════════════════════════════════ */

interface CreatorPage {
  id: number;
  text: string;
}

type Genre = "children" | "educational" | "fantasy" | "personal" | "faith-based" | "poetry";
type AgeRange = "0-3" | "3-8" | "8-12" | "12+" | "all ages";

function generateStoryPages(prompt: string): CreatorPage[] {
  const words = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const subject = words.find(w => !["with","that","this","from","into","about","have","they","when","will","your","their","there","would","could","should","been","were","then","than","some","also","just","only","over","more","very"].includes(w)) || "our hero";
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const beats = [
    `Once upon a time, ${capitalize(subject)} lived in a world full of wonder. Every morning brought new possibilities, and today felt especially magical.`,
    `One day, ${capitalize(subject)} set off on a grand adventure. The path ahead was unknown, but curiosity and courage lit the way through every twist and turn.`,
    `Suddenly, ${capitalize(subject)} faced a difficult challenge. It seemed impossible at first — but sometimes the hardest moments teach us the most important lessons.`,
    `With determination and a little help from friends, ${capitalize(subject)} found a way through. Every problem has a solution when you look with an open heart.`,
    `And so ${capitalize(subject)} returned home, changed forever by the journey. The real treasure was never the destination — it was everything learned along the way. The End.`,
  ];

  return beats.map((text, i) => ({ id: i + 1, text }));
}

function StoryCreator({ onExit, onPreview }: { onExit: () => void; onPreview: (data: SSyncData) => void }) {
  const [step, setStep] = useState(1);

  // Step 1 state
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState<Genre>("children");
  const [ageRange, setAgeRange] = useState<AgeRange>("all ages");
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // Step 2 state
  const [pages, setPages] = useState<CreatorPage[]>([{ id: 1, text: "" }]);
  const [images, setImages] = useState<Record<number, string>>({});
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const addPage = () => {
    if (pages.length >= 20) return;
    const newId = Math.max(...pages.map(p => p.id)) + 1;
    setPages(prev => [...prev, { id: newId, text: "" }]);
  };

  const deletePage = (id: number) => {
    if (pages.length <= 1) return;
    setPages(prev => prev.filter(p => p.id !== id));
    setImages(prev => { const next = { ...prev }; delete next[id]; return next; });
  };

  const updatePageText = (id: number, text: string) => {
    setPages(prev => prev.map(p => p.id === id ? { ...p, text } : p));
  };

  const handleImageUpload = (id: number, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImages(prev => ({ ...prev, [id]: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateStory = () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    // Simulate a brief "thinking" moment for magic feel
    setTimeout(() => {
      const generated = generateStoryPages(aiPrompt);
      setPages(generated);
      setGenerating(false);
      setStep(2);
    }, 1200);
  };

  const buildSSyncData = (): SSyncData => ({
    version: "1.0",
    metadata: {
      title: title || "My Story",
      author: author || undefined,
      description: `A ${genre} story for ${ageRange}`,
    },
    settings: {
      autoPlay: false,
      pageTransition: "turn",
      readAlongHighlight: true,
      pageTurnSound: true,
    },
    pages: pages.map(p => ({
      id: p.id,
      layout: "full",
      illustration: images[p.id] ? { url: images[p.id], alt: `Page ${p.id}` } : undefined,
      text: { content: p.text, wordHighlight: true },
    })),
  });

  const handleDownloadSSYNC = () => {
    const data = buildSSyncData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "my-story").toLowerCase().replace(/\s+/g, "-")}.ssync.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = () => {
    onPreview(buildSSyncData());
  };

  const canGoNext = step === 1 ? title.trim().length > 0 : step === 2 ? pages.some(p => p.text.trim()) : false;

  const genres: Genre[] = ["children", "educational", "fantasy", "personal", "faith-based", "poetry"];
  const ageRanges: AgeRange[] = ["0-3", "3-8", "8-12", "12+", "all ages"];

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white flex flex-col">
      {/* ── Header ── */}
      <div className="sticky top-0 z-50 bg-[#0a0e1a]/95 backdrop-blur-xl border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <button onClick={onExit} className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/20 transition">
          ✕
        </button>
        <div className="text-center">
          <p className="text-white font-semibold text-sm">Create Your Story</p>
          <p className="text-gray-500 text-xs">Step {step} of 3</p>
        </div>
        {/* Step dots */}
        <div className="flex gap-1.5">
          {[1, 2, 3].map(s => (
            <div key={s} className={`w-2 h-2 rounded-full transition-all duration-300 ${s === step ? "bg-amber-400 scale-125" : s < step ? "bg-amber-400/50" : "bg-white/20"}`} />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        {/* ══ STEP 1: Title & Details ══ */}
        {step === 1 && (
          <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-1">Title & Details</h2>
              <p className="text-gray-500 text-sm">Give your story an identity</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Story Title *</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="The Brave Little Star"
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-amber-400/50 focus:outline-none focus:bg-white/8 transition text-base"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Author Name</label>
                <input
                  value={author}
                  onChange={e => setAuthor(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-amber-400/50 focus:outline-none transition text-base"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Genre</label>
                <div className="grid grid-cols-3 gap-2">
                  {genres.map(g => (
                    <button key={g} onClick={() => setGenre(g)}
                            className={`py-2 px-3 rounded-xl text-sm font-medium border transition-all duration-200 ${genre === g ? "bg-amber-500/20 border-amber-400/50 text-amber-300" : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Age Range</label>
                <div className="flex flex-wrap gap-2">
                  {ageRanges.map(a => (
                    <button key={a} onClick={() => setAgeRange(a)}
                            className={`py-2 px-4 rounded-xl text-sm font-medium border transition-all duration-200 ${ageRange === a ? "bg-amber-500/20 border-amber-400/50 text-amber-300" : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"}`}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── AI Generation Section ── */}
            <div className="mt-8 p-5 rounded-2xl bg-violet-500/5 border border-violet-400/20">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">✨</span>
                <h3 className="text-sm font-semibold text-violet-300">Generate with AI</h3>
                <span className="text-xs text-violet-400/60 ml-auto">5 pages · instant</span>
              </div>
              <p className="text-gray-500 text-xs mb-3">Describe your story idea and we'll create a 5-page narrative for you</p>
              <textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="A brave little fox who learns about sharing with her forest friends..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-violet-400/50 focus:outline-none transition text-sm resize-none"
              />
              <button
                onClick={handleGenerateStory}
                disabled={!aiPrompt.trim() || generating}
                className="mt-3 w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 text-white font-semibold text-sm shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-[1.02] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Weaving your story...
                  </>
                ) : "✨ Generate Story"}
              </button>
            </div>
          </div>
        )}

        {/* ══ STEP 2: Add Pages ══ */}
        {step === 2 && (
          <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
            <div>
              <h2 className="text-2xl font-bold mb-1">Add Pages</h2>
              <p className="text-gray-500 text-sm">{pages.length} / 20 pages · tap image area to upload</p>
            </div>

            {pages.map((page, idx) => (
              <div key={page.id} className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                {/* Card header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                  <span className="text-gray-600 text-lg leading-none select-none">⠿</span>
                  <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Page {idx + 1}</span>
                  {pages.length > 1 && (
                    <button onClick={() => deletePage(page.id)} className="ml-auto text-gray-600 hover:text-red-400 transition p-1 rounded-lg hover:bg-red-400/10">
                      🗑
                    </button>
                  )}
                </div>

                {/* Image upload area */}
                <div
                  className="mx-4 mt-4 mb-3 h-36 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center cursor-pointer hover:border-amber-400/40 hover:bg-white/[0.03] transition-all duration-200 overflow-hidden"
                  onClick={() => fileInputRefs.current[page.id]?.click()}
                >
                  {images[page.id] ? (
                    <img src={images[page.id]} alt={`Page ${idx + 1}`} className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <div className="text-center pointer-events-none">
                      <p className="text-2xl mb-1">📸</p>
                      <p className="text-gray-500 text-xs">Upload or generate</p>
                    </div>
                  )}
                </div>
                <input
                  ref={el => { fileInputRefs.current[page.id] = el; }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(page.id, f); }}
                />

                {/* Text area */}
                <div className="px-4 pb-4">
                  <textarea
                    value={page.text}
                    onChange={e => updatePageText(page.id, e.target.value)}
                    placeholder="Write the story text for this page..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-amber-400/50 focus:outline-none transition text-sm resize-none"
                  />
                </div>
              </div>
            ))}

            {pages.length < 20 && (
              <button
                onClick={addPage}
                className="w-full py-3.5 rounded-2xl border-2 border-dashed border-white/10 text-gray-400 hover:border-amber-400/30 hover:text-amber-300 transition-all duration-200 text-sm font-medium"
              >
                + Add Page
              </button>
            )}
          </div>
        )}

        {/* ══ STEP 3: Preview & Publish ══ */}
        {step === 3 && (
          <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-1">Preview & Publish</h2>
              <p className="text-gray-500 text-sm">Your story is ready</p>
            </div>

            {/* Summary card */}
            <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <h3 className="text-lg font-bold text-white">{title || "Untitled Story"}</h3>
              {author && <p className="text-gray-400 text-sm">by {author}</p>}
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/20 text-amber-300 text-xs">{genre}</span>
                <span className="px-3 py-1 rounded-full bg-violet-500/15 border border-violet-400/20 text-violet-300 text-xs">{ageRange}</span>
                <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10 text-gray-300 text-xs">{pages.length} page{pages.length !== 1 ? "s" : ""}</span>
              </div>
            </div>

            {/* Thumbnail grid */}
            {pages.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Pages</p>
                <div className="grid grid-cols-4 gap-2">
                  {pages.map((page, idx) => (
                    <div key={page.id} className="aspect-[3/4] rounded-lg bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center relative">
                      {images[page.id] ? (
                        <img src={images[page.id]} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-gray-600 text-xs">{idx + 1}</span>
                      )}
                      {page.text && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-400/40 rounded-b" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <button
                onClick={handlePreview}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold text-base shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-[1.02] transition-all duration-200"
              >
                👁 Preview Story
              </button>
              <button
                onClick={handleDownloadSSYNC}
                className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-semibold text-base hover:bg-white/10 transition-all duration-200"
              >
                📥 Download .ssync
              </button>
              <button
                disabled
                className="w-full py-4 rounded-2xl bg-white/[0.02] border border-white/5 text-gray-600 font-semibold text-base cursor-not-allowed"
              >
                🔗 Share Link — Coming Soon
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed bottom nav ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0a0e1a]/95 backdrop-blur-xl border-t border-white/5 px-4 py-4">
        <div className="max-w-lg mx-auto flex gap-3">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)}
                    className="px-6 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-gray-300 font-medium hover:bg-white/10 transition">
              ← Back
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canGoNext}
              className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold text-base shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:scale-[1.01] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              Next Step →
            </button>
          ) : null}
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
  const [loadingRemix, setLoadingRemix] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [startInRemix, setStartInRemix] = useState(false);

  const openDemo = async (remix = false) => {
    if (remix) setLoadingRemix(true); else setLoading(true);
    try {
      const res = await fetch("/demo/brave-little-star.ssync.json");
      const data = await res.json();
      setStartInRemix(remix);
      setReaderData(data);
    } catch (e) { console.error("Failed to load demo:", e); }
    if (remix) setLoadingRemix(false); else setLoading(false);
  };

  if (showCreator && !readerData) {
    return (
      <StoryCreator
        onExit={() => setShowCreator(false)}
        onPreview={(data) => { setReaderData(data); setShowCreator(false); }}
      />
    );
  }

  if (readerData) {
    return <ImmersiveReader data={readerData} onExit={() => { setReaderData(null); setStartInRemix(false); }} startInRemix={startInRemix} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white overflow-x-hidden">

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 text-center">
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

        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-violet-500/10 blur-[80px] pointer-events-none" />

        <div className="relative mb-8 animate-float">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <span className="text-5xl">⭐</span>
          </div>
          <div className="absolute -inset-3 rounded-full border border-amber-400/20 animate-ping-slow" />
        </div>

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

        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <button onClick={() => openDemo(false)} disabled={loading || loadingRemix}
                  className="px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold text-lg shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-105 transition-all duration-300 disabled:opacity-50">
            {loading ? "Loading..." : "✨ Read Demo Storybook"}
          </button>
          <button onClick={() => setShowCreator(true)}
                  className="px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-medium text-lg backdrop-blur-sm hover:bg-white/10 hover:border-amber-400/30 hover:scale-105 transition-all duration-300">
            🛠 Create Your Story
          </button>
        </div>

        {/* Remix the Demo button */}
        <button
          onClick={() => openDemo(true)}
          disabled={loading || loadingRemix}
          className="mb-16 px-7 py-3.5 rounded-2xl bg-white/5 border border-amber-400/20 text-amber-300/80 font-medium text-base backdrop-blur-sm hover:bg-amber-500/10 hover:border-amber-400/40 hover:text-amber-300 hover:scale-105 transition-all duration-300 disabled:opacity-40 flex items-center gap-2"
        >
          {loadingRemix ? (
            <><span className="inline-block w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" /> Opening Remix...</>
          ) : (
            <><span>✏️</span> Remix the Demo</>
          )}
        </button>

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
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Remember the magic?</h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Library books with cassette tapes. Reading along while the narrator guided you page by page. Background music that made every story feel alive. We&apos;re bringing that magic back — for every device, every story, every reader.
          </p>
        </div>

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

        /* ── 3D Page Turn Animations ── */
        .page-flip-next,
        .page-flip-prev,
        .page-settle {
          perspective: 1200px;
          transform-style: preserve-3d;
        }

        @keyframes pageFlipNext {
          0%   { transform: rotateY(0deg);    box-shadow: none; opacity: 1; }
          40%  { transform: rotateY(-35deg);  box-shadow: -20px 0 60px rgba(0,0,0,0.6); opacity: 1; }
          50%  { transform: rotateY(-90deg);  box-shadow: none; opacity: 0; }
          100% { transform: rotateY(-90deg);  opacity: 0; }
        }

        @keyframes pageFlipPrev {
          0%   { transform: rotateY(0deg);   box-shadow: none; opacity: 1; }
          40%  { transform: rotateY(35deg);  box-shadow: 20px 0 60px rgba(0,0,0,0.6); opacity: 1; }
          50%  { transform: rotateY(90deg);  box-shadow: none; opacity: 0; }
          100% { transform: rotateY(90deg);  opacity: 0; }
        }

        @keyframes pageSettle {
          0%   { transform: rotateY(-8deg); opacity: 0.6; }
          100% { transform: rotateY(0deg);  opacity: 1; }
        }

        .page-flip-next {
          animation: pageFlipNext 600ms ease-in-out forwards;
          transform-origin: left center;
        }
        .page-flip-prev {
          animation: pageFlipPrev 600ms ease-in-out forwards;
          transform-origin: right center;
        }
        .page-settle {
          animation: pageSettle 150ms ease-out forwards;
          transform-origin: center center;
        }
      `}</style>
    </div>
  );
}
