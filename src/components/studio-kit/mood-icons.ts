/**
 * The mood icon set — one Lucide symbol per mood in the canonical vocabulary
 * (src/lib/audio/moods.ts), as the reference sprite draws them (brief
 * design_system). The one source for every surface that shows a mood's icon:
 * the Read it in… chips, the Studio's Stage, Filmstrip and Inspector, the
 * grown-up gate's tape sheet, the end card's J-card and /protocol's FIG. 1.
 *
 * A plain module (no CSS, no "use client"), so a surface can take the icons
 * without the chip's stylesheet.
 */

import { Cloud, CloudRain, Compass, Eye, Leaf, Moon, Star, Sun, type LucideIcon } from "lucide-react";
import type { MoodName } from "@/lib/audio/moods";

export const MOOD_ICON: Record<MoodName, LucideIcon> = {
  Wonder: Star,
  Adventure: Compass,
  Calm: Moon,
  Joy: Sun,
  Hush: Cloud,
  Rain: CloudRain,
  Suspense: Eye,
  Melancholy: Leaf,
};
