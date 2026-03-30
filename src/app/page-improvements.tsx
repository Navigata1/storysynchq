"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════
   Ralph Wiggum Pass #2 — AI Illustration Generator
   Client-side canvas-based illustration placeholder system.
   Generates mood-appropriate artwork from story page text.
   ═══════════════════════════════════════════════════════════════ */

/* ─── Theme Types ─── */

export interface StoryIllustrationTheme {
  name: "watercolor" | "comic" | "pencil" | "storybook" | "night";
  label: string;
  gradientStops: [string, string, string];
  shapeOpacity: number;
  textColor: string;
  borderStyle: "soft" | "bold" | "sketch" | "dreamy" | "glow";
}

const THEMES: Record<string, StoryIllustrationTheme> = {
  watercolor: {
    name: "watercolor",
    label: "Watercolor",
    gradientStops: ["#f6d365", "#fda085", "#fbc2eb"],
    shapeOpacity: 0.55,
    textColor: "rgba(80, 40, 20, 0.7)",
    borderStyle: "soft",
  },
  comic: {
    name: "comic",
    label: "Comic",
    gradientStops: ["#ff6b6b", "#feca57", "#48dbfb"],
    shapeOpacity: 0.85,
    textColor: "rgba(0, 0, 0, 0.9)",
    borderStyle: "bold",
  },
  pencil: {
    name: "pencil",
    label: "Pencil Sketch",
    gradientStops: ["#e8e8e8", "#c0c0c0", "#909090"],
    shapeOpacity: 0.7,
    textColor: "rgba(40, 40, 40, 0.8)",
    borderStyle: "sketch",
  },
  storybook: {
    name: "storybook",
    label: "Storybook",
    gradientStops: ["#a8edea", "#fed6e3", "#d4fc79"],
    shapeOpacity: 0.6,
    textColor: "rgba(100, 60, 120, 0.7)",
    borderStyle: "dreamy",
  },
  night: {
    name: "night",
    label: "Night",
    gradientStops: ["#0c0527", "#1a1a5e", "#3d2c8d"],
    shapeOpacity: 0.7,
    textColor: "rgba(200, 200, 255, 0.8)",
    borderStyle: "glow",
  },
};

/* ─── Keyword Detection ─── */

interface SceneElements {
  setting: string[];
  characters: string[];
  actions: string[];
  mood: string;
  timeOfDay: string;
}

const SETTING_KEYWORDS: Record<string, string[]> = {
  forest: ["forest", "woods", "trees", "woodland", "grove", "jungle", "canopy"],
  water: ["ocean", "sea", "river", "lake", "pond", "stream", "waterfall", "beach", "waves", "shore"],
  mountain: ["mountain", "hill", "cliff", "peak", "summit", "valley", "canyon"],
  sky: ["sky", "clouds", "flying", "soaring", "air", "wind", "storm"],
  home: ["house", "home", "cottage", "cabin", "room", "kitchen", "bedroom", "door", "window"],
  castle: ["castle", "palace", "tower", "throne", "kingdom", "fortress", "dungeon"],
  garden: ["garden", "flowers", "meadow", "field", "bloom", "roses", "petals"],
  city: ["city", "town", "village", "street", "road", "building", "market"],
  cave: ["cave", "cavern", "underground", "tunnel", "dark", "mine"],
  space: ["space", "stars", "moon", "planet", "galaxy", "cosmos", "asteroid", "rocket"],
};

const CHARACTER_KEYWORDS: Record<string, string[]> = {
  person: ["boy", "girl", "man", "woman", "child", "children", "kid", "baby", "mother", "father", "friend", "hero", "princess", "prince", "king", "queen", "knight", "wizard"],
  animal: ["dog", "cat", "bird", "rabbit", "bear", "fox", "wolf", "horse", "dragon", "fish", "owl", "deer", "lion", "elephant", "mouse", "butterfly", "frog"],
  creature: ["monster", "ghost", "fairy", "elf", "giant", "troll", "unicorn", "mermaid", "robot"],
};

const ACTION_KEYWORDS: Record<string, string[]> = {
  moving: ["walking", "running", "flying", "swimming", "jumping", "dancing", "climbing", "riding"],
  resting: ["sleeping", "sitting", "resting", "dreaming", "lying", "waiting"],
  exploring: ["looking", "searching", "finding", "discovering", "opening", "exploring"],
  creating: ["building", "making", "painting", "cooking", "growing", "planting"],
  playing: ["playing", "laughing", "singing", "reading", "telling"],
};

const MOOD_KEYWORDS: Record<string, string[]> = {
  happy: ["happy", "joy", "laugh", "smile", "bright", "warm", "love", "fun", "celebrate", "cheerful"],
  sad: ["sad", "cry", "tears", "lonely", "miss", "lost", "cold", "gray", "rain"],
  scary: ["scary", "dark", "shadow", "afraid", "fear", "creepy", "spooky", "haunted", "monster"],
  peaceful: ["peaceful", "calm", "quiet", "gentle", "soft", "serene", "still", "rest"],
  adventurous: ["brave", "adventure", "quest", "journey", "explore", "discover", "exciting", "danger"],
  magical: ["magic", "spell", "enchanted", "glow", "sparkle", "wish", "fairy", "mystical", "wand"],
};

const TIME_KEYWORDS: Record<string, string[]> = {
  dawn: ["dawn", "sunrise", "morning", "early"],
  day: ["day", "noon", "afternoon", "bright", "sunny", "sunlight"],
  dusk: ["dusk", "sunset", "evening", "twilight"],
  night: ["night", "dark", "midnight", "stars", "moon", "starlight"],
};

function extractSceneElements(text: string): SceneElements {
  const lower = text.toLowerCase();
  const words = lower.split(/\W+/);

  const matchKeywords = (map: Record<string, string[]>): string[] => {
    const found: string[] = [];
    for (const [category, keywords] of Object.entries(map)) {
      if (keywords.some((kw) => words.includes(kw) || lower.includes(kw))) {
        found.push(category);
      }
    }
    return found;
  };

  const settings = matchKeywords(SETTING_KEYWORDS);
  const characters = matchKeywords(CHARACTER_KEYWORDS);
  const actions = matchKeywords(ACTION_KEYWORDS);
  const moods = matchKeywords(MOOD_KEYWORDS);
  const times = matchKeywords(TIME_KEYWORDS);

  return {
    setting: settings.length > 0 ? settings : ["garden"],
    characters: characters.length > 0 ? characters : ["person"],
    actions: actions.length > 0 ? actions : ["exploring"],
    mood: moods[0] || "peaceful",
    timeOfDay: times[0] || "day",
  };
}

/* ─── Prompt Generation ─── */

function generatePrompt(elements: SceneElements, theme: StoryIllustrationTheme): string {
  const settingStr = elements.setting.join(" and ");
  const charStr = elements.characters.join(", ");
  const actionStr = elements.actions[0] || "standing";
  const styleMap: Record<string, string> = {
    watercolor: "watercolor painting style, soft blended edges, warm tones",
    comic: "comic book illustration, bold outlines, vibrant flat colors",
    pencil: "pencil sketch, crosshatching, grayscale with graphite texture",
    storybook: "children's storybook illustration, pastel palette, dreamy soft focus",
    night: "night scene illustration, deep blues and purples, luminescent accents",
  };
  return `${styleMap[theme.name] || "illustration"}: ${charStr} ${actionStr} in a ${elements.mood} ${settingStr} scene, ${elements.timeOfDay} lighting`;
}

/* ─── Canvas Drawing Helpers ─── */

function getMoodGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: StoryIllustrationTheme,
  mood: string,
  timeOfDay: string
): CanvasGradient {
  const grad = ctx.createLinearGradient(0, 0, 0, h);

  // Override theme gradient for night time
  if (timeOfDay === "night" && theme.name !== "night") {
    grad.addColorStop(0, "#0c0527");
    grad.addColorStop(0.5, "#1a1a5e");
    grad.addColorStop(1, "#1e1e3f");
    return grad;
  }

  // Mood adjustments layered on theme
  const stops = [...theme.gradientStops];
  if (mood === "sad") {
    stops[0] = blendColor(stops[0], "#6b7b8d", 0.4);
    stops[2] = blendColor(stops[2], "#4a5568", 0.4);
  } else if (mood === "scary") {
    stops[0] = blendColor(stops[0], "#2d1b30", 0.5);
    stops[2] = blendColor(stops[2], "#1a1a2e", 0.5);
  } else if (mood === "magical") {
    stops[1] = blendColor(stops[1], "#c471ed", 0.3);
  }

  grad.addColorStop(0, stops[0]);
  grad.addColorStop(0.5, stops[1]);
  grad.addColorStop(1, stops[2]);
  return grad;
}

function blendColor(hex1: string, hex2: string, ratio: number): string {
  const parse = (hex: string) => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const c1 = parse(hex1);
  const c2 = parse(hex2);
  const r = Math.round(c1[0] * (1 - ratio) + c2[0] * ratio);
  const g = Math.round(c1[1] * (1 - ratio) + c2[1] * ratio);
  const b = Math.round(c1[2] * (1 - ratio) + c2[2] * ratio);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/* ─── Shape Drawers ─── */

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  // Trunk
  ctx.fillStyle = "#5d4037";
  ctx.fillRect(x - 4 * scale, y - 20 * scale, 8 * scale, 30 * scale);
  // Canopy
  ctx.fillStyle = "#2e7d32";
  ctx.beginPath();
  ctx.moveTo(x, y - 60 * scale);
  ctx.lineTo(x - 25 * scale, y - 15 * scale);
  ctx.lineTo(x + 25 * scale, y - 15 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - 75 * scale);
  ctx.lineTo(x - 20 * scale, y - 35 * scale);
  ctx.lineTo(x + 20 * scale, y - 35 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawWaves(ctx: CanvasRenderingContext2D, w: number, y: number, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  for (let row = 0; row < 3; row++) {
    const yOff = y + row * 25;
    ctx.strokeStyle = row === 0 ? "#1565c0" : row === 1 ? "#1976d2" : "#1e88e5";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x < w; x += 4) {
      const wy = yOff + Math.sin((x + row * 30) * 0.04) * 12;
      if (x === 0) ctx.moveTo(x, wy);
      else ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }
  // Foam highlights
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  for (let i = 0; i < 8; i++) {
    const fx = (i * w) / 8 + 20;
    ctx.beginPath();
    ctx.arc(fx, y - 5, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStars(ctx: CanvasRenderingContext2D, w: number, h: number, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  const rng = seedRandom(42);
  for (let i = 0; i < 60; i++) {
    const x = rng() * w;
    const y = rng() * h * 0.6;
    const r = rng() * 2.5 + 0.5;
    const brightness = rng() * 0.5 + 0.5;
    ctx.fillStyle = `rgba(255,255,${200 + Math.floor(rng() * 55)},${brightness})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // A few larger twinkling stars
  for (let i = 0; i < 5; i++) {
    const x = rng() * w;
    const y = rng() * h * 0.4;
    drawStarShape(ctx, x, y, 4, 8, 5);
  }
  ctx.restore();
}

function drawStarShape(ctx: CanvasRenderingContext2D, cx: number, cy: number, innerR: number, outerR: number, points: number) {
  ctx.fillStyle = "rgba(255,255,220,0.9)";
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  // Glow
  const glow = ctx.createRadialGradient(x, y, 15, x, y, 50);
  glow.addColorStop(0, "rgba(255,255,200,0.3)");
  glow.addColorStop(1, "rgba(255,255,200,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 50, 0, Math.PI * 2);
  ctx.fill();
  // Moon body
  ctx.fillStyle = "#ffeebb";
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fill();
  // Crescent shadow
  ctx.fillStyle = "rgba(20,20,60,0.5)";
  ctx.beginPath();
  ctx.arc(x + 8, y - 2, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  const w = 50 * scale;
  const h = 40 * scale;
  // Walls
  ctx.fillStyle = "#d4a574";
  ctx.fillRect(x - w / 2, y - h, w, h);
  // Roof
  ctx.fillStyle = "#8b4513";
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 8 * scale, y - h);
  ctx.lineTo(x, y - h - 30 * scale);
  ctx.lineTo(x + w / 2 + 8 * scale, y - h);
  ctx.closePath();
  ctx.fill();
  // Door
  ctx.fillStyle = "#5d3a1a";
  ctx.fillRect(x - 6 * scale, y - 22 * scale, 12 * scale, 22 * scale);
  // Window
  ctx.fillStyle = "#ffeb3b";
  ctx.fillRect(x + 10 * scale, y - h + 10 * scale, 12 * scale, 10 * scale);
  ctx.fillRect(x - 22 * scale, y - h + 10 * scale, 12 * scale, 10 * scale);
  ctx.restore();
}

function drawMountain(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "#5d6d7e";
  ctx.beginPath();
  ctx.moveTo(x, y - 120 * scale);
  ctx.lineTo(x - 80 * scale, y);
  ctx.lineTo(x + 80 * scale, y);
  ctx.closePath();
  ctx.fill();
  // Snow cap
  ctx.fillStyle = "#ecf0f1";
  ctx.beginPath();
  ctx.moveTo(x, y - 120 * scale);
  ctx.lineTo(x - 20 * scale, y - 85 * scale);
  ctx.lineTo(x + 20 * scale, y - 85 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCastle(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  // Main wall
  ctx.fillStyle = "#8e8e8e";
  ctx.fillRect(x - 30 * scale, y - 60 * scale, 60 * scale, 60 * scale);
  // Towers
  ctx.fillStyle = "#7a7a7a";
  ctx.fillRect(x - 38 * scale, y - 80 * scale, 16 * scale, 80 * scale);
  ctx.fillRect(x + 22 * scale, y - 80 * scale, 16 * scale, 80 * scale);
  // Tower tops (crenellations)
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x - 38 * scale + i * 6 * scale, y - 88 * scale, 4 * scale, 8 * scale);
    ctx.fillRect(x + 22 * scale + i * 6 * scale, y - 88 * scale, 4 * scale, 8 * scale);
  }
  // Gate
  ctx.fillStyle = "#4a4a4a";
  ctx.beginPath();
  ctx.arc(x, y - 20 * scale, 12 * scale, Math.PI, 0);
  ctx.fillRect(x - 12 * scale, y - 20 * scale, 24 * scale, 20 * scale);
  ctx.fill();
  // Flag
  ctx.strokeStyle = "#5d4037";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 60 * scale);
  ctx.lineTo(x, y - 95 * scale);
  ctx.stroke();
  ctx.fillStyle = "#e53935";
  ctx.beginPath();
  ctx.moveTo(x, y - 95 * scale);
  ctx.lineTo(x + 15 * scale, y - 88 * scale);
  ctx.lineTo(x, y - 82 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFlowers(ctx: CanvasRenderingContext2D, x: number, y: number, count: number, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  const colors = ["#e91e63", "#ff9800", "#9c27b0", "#ffeb3b", "#f44336", "#ff5722"];
  const rng = seedRandom(x + y);
  for (let i = 0; i < count; i++) {
    const fx = x + (rng() - 0.5) * 120;
    const fy = y + (rng() - 0.5) * 30;
    // Stem
    ctx.strokeStyle = "#4caf50";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx, fy + 15);
    ctx.stroke();
    // Petals
    ctx.fillStyle = colors[i % colors.length];
    for (let p = 0; p < 5; p++) {
      const angle = (p * Math.PI * 2) / 5;
      ctx.beginPath();
      ctx.arc(fx + Math.cos(angle) * 4, fy + Math.sin(angle) * 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Center
    ctx.fillStyle = "#ffeb3b";
    ctx.beginPath();
    ctx.arc(fx, fy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSun(ctx: CanvasRenderingContext2D, x: number, y: number, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  // Glow
  const glow = ctx.createRadialGradient(x, y, 15, x, y, 60);
  glow.addColorStop(0, "rgba(255,235,59,0.4)");
  glow.addColorStop(1, "rgba(255,235,59,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 60, 0, Math.PI * 2);
  ctx.fill();
  // Rays
  ctx.strokeStyle = "rgba(255,193,7,0.5)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * 22, y + Math.sin(angle) * 22);
    ctx.lineTo(x + Math.cos(angle) * 38, y + Math.sin(angle) * 38);
    ctx.stroke();
  }
  // Body
  ctx.fillStyle = "#ffeb3b";
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawClouds(ctx: CanvasRenderingContext2D, w: number, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity * 0.6;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  const drawCloud = (cx: number, cy: number, s: number) => {
    ctx.beginPath();
    ctx.arc(cx, cy, 20 * s, 0, Math.PI * 2);
    ctx.arc(cx + 15 * s, cy - 8 * s, 16 * s, 0, Math.PI * 2);
    ctx.arc(cx + 30 * s, cy, 18 * s, 0, Math.PI * 2);
    ctx.arc(cx - 12 * s, cy + 2 * s, 14 * s, 0, Math.PI * 2);
    ctx.fill();
  };
  drawCloud(w * 0.2, 60, 1);
  drawCloud(w * 0.6, 40, 1.2);
  drawCloud(w * 0.85, 75, 0.8);
  ctx.restore();
}

function drawPersonSilhouette(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "rgba(60,60,80,0.7)";
  // Head
  ctx.beginPath();
  ctx.arc(x, y - 45 * scale, 8 * scale, 0, Math.PI * 2);
  ctx.fill();
  // Body
  ctx.beginPath();
  ctx.moveTo(x, y - 37 * scale);
  ctx.lineTo(x - 12 * scale, y);
  ctx.lineTo(x - 4 * scale, y);
  ctx.lineTo(x, y - 15 * scale);
  ctx.lineTo(x, y);
  ctx.lineTo(x + 4 * scale, y);
  ctx.lineTo(x + 12 * scale, y);
  ctx.lineTo(x, y - 37 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAnimalSilhouette(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "rgba(80,50,30,0.7)";
  // Body (oval)
  ctx.beginPath();
  ctx.ellipse(x, y - 10 * scale, 20 * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.beginPath();
  ctx.arc(x + 18 * scale, y - 18 * scale, 8 * scale, 0, Math.PI * 2);
  ctx.fill();
  // Ears
  ctx.beginPath();
  ctx.ellipse(x + 14 * scale, y - 27 * scale, 3 * scale, 5 * scale, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + 22 * scale, y - 27 * scale, 3 * scale, 5 * scale, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Legs
  ctx.fillRect(x - 12 * scale, y, 4 * scale, 12 * scale);
  ctx.fillRect(x + 8 * scale, y, 4 * scale, 12 * scale);
  // Tail
  ctx.beginPath();
  ctx.moveTo(x - 20 * scale, y - 12 * scale);
  ctx.quadraticCurveTo(x - 30 * scale, y - 30 * scale, x - 24 * scale, y - 35 * scale);
  ctx.lineWidth = 3 * scale;
  ctx.strokeStyle = "rgba(80,50,30,0.7)";
  ctx.stroke();
  ctx.restore();
}

function drawGround(ctx: CanvasRenderingContext2D, w: number, h: number, setting: string, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  const groundY = h * 0.72;
  const grad = ctx.createLinearGradient(0, groundY, 0, h);

  if (setting === "water" || setting === "beach") {
    grad.addColorStop(0, "#1976d2");
    grad.addColorStop(1, "#0d47a1");
  } else if (setting === "cave") {
    grad.addColorStop(0, "#3e2723");
    grad.addColorStop(1, "#1b0f0a");
  } else if (setting === "space") {
    // No ground in space
    ctx.restore();
    return;
  } else if (setting === "city") {
    grad.addColorStop(0, "#616161");
    grad.addColorStop(1, "#424242");
  } else {
    grad.addColorStop(0, "#4caf50");
    grad.addColorStop(1, "#2e7d32");
  }

  ctx.fillStyle = grad;
  // Gentle rolling hill shape
  ctx.beginPath();
  ctx.moveTo(0, groundY + 10);
  for (let x = 0; x <= w; x += 4) {
    const yOff = Math.sin(x * 0.015) * 8 + Math.sin(x * 0.007) * 5;
    ctx.lineTo(x, groundY + yOff);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ─── Seeded random for deterministic layouts ─── */
function seedRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/* ─── Border/Frame Styles ─── */
function applyBorderStyle(ctx: CanvasRenderingContext2D, w: number, h: number, style: string) {
  ctx.save();
  switch (style) {
    case "soft": {
      // Soft vignette
      const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, w * 0.7);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.15)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "bold": {
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      break;
    }
    case "sketch": {
      ctx.strokeStyle = "rgba(60,60,60,0.6)";
      ctx.lineWidth = 2;
      const rng = seedRandom(99);
      // Sketchy border with slight wobble
      ctx.beginPath();
      for (let x = 5; x < w - 5; x += 3) {
        ctx.lineTo(x + (rng() - 0.5) * 2, 5 + (rng() - 0.5) * 2);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let x = 5; x < w - 5; x += 3) {
        ctx.lineTo(x + (rng() - 0.5) * 2, h - 5 + (rng() - 0.5) * 2);
      }
      ctx.stroke();
      break;
    }
    case "dreamy": {
      // Double soft border
      const inner = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.72);
      inner.addColorStop(0, "rgba(255,255,255,0)");
      inner.addColorStop(1, "rgba(255,200,255,0.15)");
      ctx.fillStyle = inner;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(200,150,200,0.4)";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(8, 8, w - 16, h - 16);
      break;
    }
    case "glow": {
      // Glowing edge
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(100,100,255,${0.1 - i * 0.03})`;
        ctx.lineWidth = 8 - i * 2;
        ctx.strokeRect(4 + i * 2, 4 + i * 2, w - 8 - i * 4, h - 8 - i * 4);
      }
      break;
    }
  }
  ctx.restore();
}

/* ─── Main Illustration Generator Function ─── */

export function generateIllustration(text: string, themeName: string = "storybook"): string {
  const theme = THEMES[themeName] || THEMES.storybook;
  const elements = extractSceneElements(text);
  const prompt = generatePrompt(elements, theme);

  // Create offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const w = 512;
  const h = 512;

  // 1. Background gradient
  ctx.fillStyle = getMoodGradient(ctx, w, h, theme, elements.mood, elements.timeOfDay);
  ctx.fillRect(0, 0, w, h);

  // 2. Time-of-day elements
  if (elements.timeOfDay === "night" || theme.name === "night") {
    drawStars(ctx, w, h, theme.shapeOpacity);
    drawMoon(ctx, w * 0.8, 70, theme.shapeOpacity);
  } else if (elements.timeOfDay === "dawn" || elements.timeOfDay === "dusk") {
    drawSun(ctx, w * 0.85, 80, theme.shapeOpacity * 0.8);
    drawClouds(ctx, w, theme.shapeOpacity);
  } else {
    drawSun(ctx, w * 0.82, 65, theme.shapeOpacity);
    drawClouds(ctx, w, theme.shapeOpacity);
  }

  // 3. Setting-specific elements
  const primarySetting = elements.setting[0];
  drawGround(ctx, w, h, primarySetting, theme.shapeOpacity);

  const groundY = h * 0.72;

  switch (primarySetting) {
    case "forest": {
      drawTree(ctx, 60, groundY, 1.2, theme.shapeOpacity);
      drawTree(ctx, 160, groundY - 5, 1.0, theme.shapeOpacity * 0.8);
      drawTree(ctx, 380, groundY, 1.3, theme.shapeOpacity);
      drawTree(ctx, 460, groundY - 8, 0.9, theme.shapeOpacity * 0.7);
      drawTree(ctx, 110, groundY + 5, 0.7, theme.shapeOpacity * 0.5);
      break;
    }
    case "water": {
      drawWaves(ctx, w, groundY, theme.shapeOpacity);
      break;
    }
    case "mountain": {
      drawMountain(ctx, 150, groundY, 1.0, theme.shapeOpacity);
      drawMountain(ctx, 350, groundY, 1.3, theme.shapeOpacity * 0.8);
      drawMountain(ctx, 256, groundY, 0.8, theme.shapeOpacity * 0.6);
      break;
    }
    case "home": {
      drawHouse(ctx, 256, groundY, 1.2, theme.shapeOpacity);
      break;
    }
    case "castle": {
      drawCastle(ctx, 256, groundY, 1.1, theme.shapeOpacity);
      break;
    }
    case "garden": {
      drawFlowers(ctx, 150, groundY - 10, 8, theme.shapeOpacity);
      drawFlowers(ctx, 350, groundY - 5, 6, theme.shapeOpacity);
      drawTree(ctx, 50, groundY, 0.8, theme.shapeOpacity * 0.5);
      break;
    }
    case "space": {
      drawStars(ctx, w, h, theme.shapeOpacity);
      // Planet
      ctx.save();
      ctx.globalAlpha = theme.shapeOpacity;
      const planetGrad = ctx.createRadialGradient(300, 300, 20, 280, 280, 60);
      planetGrad.addColorStop(0, "#e57373");
      planetGrad.addColorStop(1, "#b71c1c");
      ctx.fillStyle = planetGrad;
      ctx.beginPath();
      ctx.arc(300, 300, 50, 0, Math.PI * 2);
      ctx.fill();
      // Ring
      ctx.strokeStyle = "rgba(255,200,100,0.5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(300, 300, 75, 15, -0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "cave": {
      // Dark arch
      ctx.save();
      ctx.globalAlpha = theme.shapeOpacity;
      ctx.fillStyle = "#1a0a00";
      ctx.beginPath();
      ctx.arc(256, groundY, 120, Math.PI, 0);
      ctx.lineTo(376, h);
      ctx.lineTo(136, h);
      ctx.closePath();
      ctx.fill();
      // Stalactites
      ctx.fillStyle = "#3e2723";
      for (let i = 0; i < 6; i++) {
        const sx = 160 + i * 35;
        ctx.beginPath();
        ctx.moveTo(sx - 5, groundY - 100);
        ctx.lineTo(sx, groundY - 60 - Math.random() * 20);
        ctx.lineTo(sx + 5, groundY - 100);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case "city": {
      ctx.save();
      ctx.globalAlpha = theme.shapeOpacity;
      const buildingColors = ["#455a64", "#37474f", "#546e7a", "#607d8b"];
      const rng = seedRandom(7);
      for (let i = 0; i < 8; i++) {
        const bx = i * 65 + 10;
        const bh = 60 + rng() * 100;
        ctx.fillStyle = buildingColors[i % buildingColors.length];
        ctx.fillRect(bx, groundY - bh, 55, bh);
        // Windows
        ctx.fillStyle = "#ffeb3b";
        for (let wy = groundY - bh + 10; wy < groundY - 10; wy += 18) {
          for (let wx = bx + 8; wx < bx + 50; wx += 14) {
            if (rng() > 0.3) {
              ctx.fillRect(wx, wy, 6, 8);
            }
          }
        }
      }
      ctx.restore();
      break;
    }
    default: {
      // Default: gentle garden/meadow
      drawFlowers(ctx, 200, groundY - 5, 5, theme.shapeOpacity);
      drawTree(ctx, 430, groundY, 1.0, theme.shapeOpacity * 0.6);
      break;
    }
  }

  // 4. Characters
  const charX = w * 0.45;
  if (elements.characters.includes("person") || elements.characters.includes("creature")) {
    drawPersonSilhouette(ctx, charX, groundY, 1.0, theme.shapeOpacity * 0.9);
  }
  if (elements.characters.includes("animal")) {
    drawAnimalSilhouette(ctx, charX + 60, groundY + 5, 0.8, theme.shapeOpacity * 0.8);
  }

  // 5. Border/frame
  applyBorderStyle(ctx, w, h, theme.borderStyle);

  // 6. Prompt text overlay at bottom
  ctx.save();
  // Text background strip
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, h - 40, w, 40);
  // Text
  ctx.font = "11px 'Georgia', serif";
  ctx.fillStyle = theme.textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Truncate prompt to fit
  const maxLen = 75;
  const displayPrompt = prompt.length > maxLen ? prompt.slice(0, maxLen) + "…" : prompt;
  ctx.fillText(displayPrompt, w / 2, h - 20);
  ctx.restore();

  return canvas.toDataURL("image/png");
}

/* ─── React Component ─── */

interface AIIllustrationGeneratorProps {
  text: string;
  theme?: string;
  width?: number;
  height?: number;
  className?: string;
  onGenerated?: (dataUrl: string, prompt: string) => void;
}

export function AIIllustrationGenerator({
  text,
  theme = "storybook",
  width = 512,
  height = 512,
  className = "",
  onGenerated,
}: AIIllustrationGeneratorProps) {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("");
  const [selectedTheme, setSelectedTheme] = useState<string>(theme);
  const prevTextRef = useRef<string>("");
  const prevThemeRef = useRef<string>("");

  const generate = useCallback(() => {
    if (!text.trim()) return;

    const themeObj = THEMES[selectedTheme] || THEMES.storybook;
    const elements = extractSceneElements(text);
    const generatedPrompt = generatePrompt(elements, themeObj);
    const dataUrl = generateIllustration(text, selectedTheme);

    setImageUrl(dataUrl);
    setPrompt(generatedPrompt);
    onGenerated?.(dataUrl, generatedPrompt);
  }, [text, selectedTheme, onGenerated]);

  useEffect(() => {
    if (text !== prevTextRef.current || selectedTheme !== prevThemeRef.current) {
      prevTextRef.current = text;
      prevThemeRef.current = selectedTheme;
      generate();
    }
  }, [text, selectedTheme, generate]);

  if (!text.trim()) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 rounded-lg ${className}`}
        style={{ width, height }}
      >
        <p className="text-gray-400 text-sm">Enter story text to generate illustration</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Theme selector */}
      <div className="flex gap-2 flex-wrap">
        {Object.values(THEMES).map((t) => (
          <button
            key={t.name}
            onClick={() => setSelectedTheme(t.name)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              selectedTheme === t.name
                ? "ring-2 ring-offset-1 ring-blue-500 shadow-md scale-105"
                : "opacity-70 hover:opacity-100"
            }`}
            style={{
              background: `linear-gradient(135deg, ${t.gradientStops[0]}, ${t.gradientStops[2]})`,
              color: t.name === "night" || t.name === "pencil" ? "#fff" : "#333",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Illustration */}
      <div className="relative rounded-lg overflow-hidden shadow-lg" style={{ width, height }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={prompt}
            width={width}
            height={height}
            className="block"
            style={{ imageRendering: "auto" }}
          />
        ) : (
          <div
            className="flex items-center justify-center bg-gray-200 animate-pulse"
            style={{ width, height }}
          >
            <p className="text-gray-500 text-sm">Generating...</p>
          </div>
        )}
      </div>

      {/* Generated prompt preview */}
      {prompt && (
        <div className="bg-gray-50 rounded-md px-3 py-2 border border-gray-200">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
            AI Illustration Prompt
          </p>
          <p className="text-xs text-gray-600 leading-relaxed">{prompt}</p>
        </div>
      )}

      {/* Regenerate button */}
      <button
        onClick={generate}
        className="self-start px-4 py-1.5 text-xs bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors"
      >
        🎨 Regenerate
      </button>
    </div>
  );
}

/* ─── Exports ─── */
export { THEMES as IllustrationThemes };
export type { SceneElements, AIIllustrationGeneratorProps };
