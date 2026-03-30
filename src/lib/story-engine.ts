/**
 * StorySyncHQ — Comprehensive Story Generation Engine
 * Ralph Wiggum Pass #3
 *
 * Pure TypeScript, zero dependencies.
 * Handles NLP-lite prompt parsing, genre-based story structures,
 * per-page illustration prompts, and character consistency tracking.
 */

/* ════════════════════════════════════════════════════════════════
   1. PUBLIC TYPES
   ════════════════════════════════════════════════════════════════ */

export interface StoryOptions {
  pages?: number;          // default 5
  genre?: Genre;
  ageRange?: string;       // e.g. "3-5", "6-8", "9-12"
  style?: "simple" | "detailed" | "poetic";
}

export interface StoryPage {
  id: number;
  text: string;
  illustrationPrompt: string;
}

export interface StoryOutput {
  title: string;
  pages: StoryPage[];
}

export type Genre =
  | "children"
  | "adventure"
  | "fantasy"
  | "educational"
  | "faith-based"
  | "poetry";

/* ════════════════════════════════════════════════════════════════
   2. INTERNAL TYPES
   ════════════════════════════════════════════════════════════════ */

interface ParsedPrompt {
  characters: CharacterInfo[];
  activities: string[];
  settings: string[];
  objects: string[];
  tone: string[];
  rawPrompt: string;
  /** Genre hint extracted from prompt keywords (may be overridden by options) */
  inferredGenre: Genre | null;
}

interface CharacterInfo {
  name: string;
  description: string;   // built up from context clues
  traits: string[];       // adjective descriptors
  role: "protagonist" | "sidekick" | "antagonist" | "mentor" | "friend";
}

interface StoryBeat {
  label: string;
  guidance: string;
}

/* ════════════════════════════════════════════════════════════════
   3. DICTIONARIES & DATA
   ════════════════════════════════════════════════════════════════ */

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "need", "dare",
  "it", "its", "this", "that", "these", "those", "i", "me", "my", "we",
  "our", "you", "your", "he", "him", "his", "she", "her", "they", "them",
  "their", "who", "whom", "which", "what", "where", "when", "how", "why",
  "not", "no", "nor", "so", "if", "then", "than", "too", "very", "just",
  "about", "up", "out", "into", "over", "after", "before", "between",
  "under", "above", "once", "there", "here", "all", "each", "every",
  "both", "few", "more", "most", "other", "some", "such", "only", "own",
  "same", "also", "back", "even", "still", "new", "now", "old", "see",
  "way", "one", "two", "three", "made", "make", "like", "long", "little",
  "big", "great", "small", "get", "got", "go", "goes", "went", "come",
  "came", "take", "took", "know", "knew", "think", "thought", "tell",
  "told", "say", "said", "let", "put", "set", "keep", "kept", "give",
  "gave", "turn", "turned",
]);

const LOCATION_WORDS = new Set([
  "forest", "woods", "jungle", "beach", "ocean", "sea", "lake", "river",
  "stream", "waterfall", "mountain", "hill", "valley", "cave", "canyon",
  "desert", "island", "meadow", "field", "garden", "farm", "barn",
  "school", "classroom", "library", "playground", "park", "zoo",
  "museum", "hospital", "store", "shop", "market", "bakery", "restaurant",
  "home", "house", "apartment", "room", "bedroom", "kitchen", "attic",
  "basement", "castle", "palace", "tower", "dungeon", "kingdom", "village",
  "town", "city", "street", "road", "path", "trail", "bridge", "church",
  "temple", "space", "moon", "planet", "star", "galaxy", "universe",
  "sky", "cloud", "rainbow", "swamp", "pond", "reef", "volcano",
  "glacier", "tundra", "savanna", "prairie", "marsh", "harbor", "dock",
  "lighthouse", "treehouse", "cottage", "cabin", "tent", "campsite",
  "arena", "stadium", "stage", "theater", "circus", "carnival",
  "fairground", "workshop", "laboratory", "observatory", "spaceship",
]);

const OBJECT_WORDS = new Set([
  "ball", "cake", "dog", "cat", "bird", "fish", "rabbit", "horse",
  "dragon", "unicorn", "butterfly", "bee", "bear", "lion", "tiger",
  "elephant", "monkey", "frog", "turtle", "owl", "wolf", "fox",
  "deer", "mouse", "snake", "whale", "dolphin", "shark", "penguin",
  "treasure", "map", "key", "door", "book", "sword", "shield", "wand",
  "crown", "ring", "gem", "crystal", "jewel", "potion", "spell",
  "rocket", "ship", "boat", "train", "car", "bicycle", "airplane",
  "balloon", "kite", "drum", "guitar", "piano", "flute", "trumpet",
  "star", "flower", "tree", "leaf", "seed", "apple", "cookie",
  "candy", "chocolate", "pie", "bread", "cheese", "egg", "milk",
  "toy", "doll", "robot", "puppet", "teddy", "blanket", "pillow",
  "lamp", "candle", "mirror", "clock", "bell", "whistle", "flag",
  "hat", "cape", "boots", "glasses", "backpack", "basket", "jar",
  "box", "chest", "bag", "net", "rope", "ladder", "telescope",
  "compass", "lantern", "feather", "shell", "stone", "pebble",
  "paint", "brush", "crayon", "pencil", "paper", "letter", "note",
  "photograph", "camera", "phone", "computer", "tablet", "coin",
  "medal", "trophy", "badge", "sticker", "stamp", "puzzle", "dice",
]);

const ACTIVITY_VERBS = new Set([
  "playing", "running", "jumping", "swimming", "flying", "climbing",
  "dancing", "singing", "drawing", "painting", "reading", "writing",
  "cooking", "baking", "eating", "sleeping", "dreaming", "waking",
  "walking", "hiking", "camping", "fishing", "sailing", "surfing",
  "skating", "skiing", "riding", "driving", "building", "crafting",
  "creating", "making", "fixing", "finding", "searching", "seeking",
  "discovering", "exploring", "traveling", "visiting", "meeting",
  "helping", "sharing", "caring", "hugging", "laughing", "crying",
  "whispering", "shouting", "calling", "watching", "listening",
  "learning", "teaching", "studying", "growing", "planting",
  "watering", "harvesting", "digging", "hiding", "chasing",
  "racing", "competing", "winning", "losing", "trying", "fighting",
  "battling", "saving", "rescuing", "protecting", "guarding",
  "collecting", "gathering", "sorting", "organizing", "cleaning",
  "washing", "dressing", "decorating", "celebrating", "partying",
  "wishing", "hoping", "praying", "believing", "imagining",
  "pretending", "transforming", "changing", "growing",
  // base forms
  "play", "run", "jump", "swim", "fly", "climb", "dance", "sing",
  "draw", "paint", "read", "write", "cook", "bake", "eat", "sleep",
  "dream", "wake", "walk", "hike", "camp", "fish", "sail", "surf",
  "skate", "ski", "ride", "drive", "build", "craft", "create",
  "find", "search", "seek", "discover", "explore", "travel", "visit",
  "meet", "help", "share", "care", "hug", "laugh", "cry", "whisper",
  "shout", "call", "watch", "listen", "learn", "teach", "study",
  "grow", "plant", "water", "harvest", "dig", "hide", "chase",
  "race", "compete", "win", "lose", "try", "fight", "battle",
  "save", "rescue", "protect", "guard", "collect", "gather",
  "sort", "organize", "clean", "wash", "dress", "decorate",
  "celebrate", "party", "wish", "hope", "pray", "believe",
  "imagine", "pretend", "transform", "change",
]);

const TONE_WORDS: Record<string, string> = {
  fun: "fun", funny: "fun", silly: "fun", goofy: "fun", playful: "fun",
  happy: "fun", joyful: "fun", cheerful: "fun", lighthearted: "fun",
  scary: "scary", spooky: "scary", creepy: "scary", eerie: "scary",
  frightening: "scary", dark: "scary", haunted: "scary",
  exciting: "exciting", thrilling: "exciting", action: "exciting",
  fast: "exciting", wild: "exciting", intense: "exciting",
  sad: "sad", lonely: "sad", melancholy: "sad", bittersweet: "sad",
  heartbreaking: "sad", tearful: "sad",
  magical: "magical", enchanted: "magical", mystical: "magical",
  wondrous: "magical", fantastical: "magical", whimsical: "magical",
  sparkly: "magical", glowing: "magical",
  brave: "brave", courageous: "brave", heroic: "brave", bold: "brave",
  calm: "calm", peaceful: "calm", gentle: "calm", serene: "calm",
  quiet: "calm", soft: "calm", soothing: "calm",
  curious: "curious", mysterious: "curious", wonder: "curious",
  inspiring: "inspiring", uplifting: "inspiring", hopeful: "inspiring",
  warm: "warm", cozy: "warm", comforting: "warm", loving: "warm",
  tender: "warm",
};

const GENRE_KEYWORDS: Record<string, Genre> = {
  princess: "fantasy", prince: "fantasy", wizard: "fantasy", witch: "fantasy",
  dragon: "fantasy", unicorn: "fantasy", fairy: "fantasy", magic: "fantasy",
  magical: "fantasy", enchanted: "fantasy", kingdom: "fantasy", castle: "fantasy",
  quest: "adventure", journey: "adventure", explore: "adventure",
  treasure: "adventure", pirate: "adventure", expedition: "adventure",
  discover: "adventure", mission: "adventure",
  learn: "educational", science: "educational", math: "educational",
  history: "educational", nature: "educational", experiment: "educational",
  facts: "educational", curious: "educational",
  god: "faith-based", jesus: "faith-based", prayer: "faith-based",
  faith: "faith-based", bible: "faith-based", church: "faith-based",
  blessing: "faith-based", miracle: "faith-based", angel: "faith-based",
  poem: "poetry", rhyme: "poetry", verse: "poetry", rhyming: "poetry",
  poetry: "poetry",
};

const ROLE_WORDS: Record<string, CharacterInfo["role"]> = {
  friend: "friend", buddy: "friend", pal: "friend", companion: "friend",
  helper: "sidekick", sidekick: "sidekick", assistant: "sidekick",
  villain: "antagonist", enemy: "antagonist", monster: "antagonist",
  bully: "antagonist", witch: "antagonist",
  teacher: "mentor", wizard: "mentor", wise: "mentor", guide: "mentor",
  grandma: "mentor", grandpa: "mentor", elder: "mentor",
};

/* ════════════════════════════════════════════════════════════════
   4. GENRE STORY STRUCTURES
   ════════════════════════════════════════════════════════════════ */

const STORY_STRUCTURES: Record<Genre, StoryBeat[]> = {
  children: [
    { label: "Setup", guidance: "Introduce the main character(s) in their everyday world. Show what they love and what makes them special." },
    { label: "Discovery", guidance: "Something new and wonderful appears — a surprise, a new friend, or an unexpected event that sparks curiosity." },
    { label: "Challenge", guidance: "A problem arises that the character must face. It feels big and maybe a little scary, but not overwhelming." },
    { label: "Help from Friend", guidance: "A friend (old or new) helps the character find a way through. Teamwork and kindness shine." },
    { label: "Happy Lesson", guidance: "The problem is solved with a warm, gentle lesson. The character grows and the world feels brighter." },
  ],
  adventure: [
    { label: "Call to Action", guidance: "An urgent call pulls the character from normal life — a map found, a cry for help, a mysterious message." },
    { label: "Journey Begins", guidance: "The character sets off into the unknown, encountering new landscapes and gathering courage." },
    { label: "Obstacle", guidance: "A major obstacle blocks the path — a riddle, a dangerous crossing, a rival. Tension peaks." },
    { label: "Triumph", guidance: "Through bravery, cleverness, or heart, the character overcomes the obstacle in a thrilling moment." },
    { label: "Return Home", guidance: "The hero returns, changed and wiser. The adventure lives on in memory and the world is better for it." },
  ],
  fantasy: [
    { label: "Magical World", guidance: "Paint a vivid, enchanted world with wondrous details — floating islands, talking animals, glowing forests." },
    { label: "Quest Revealed", guidance: "A quest is revealed — something precious is lost, a prophecy must be fulfilled, a wrong must be righted." },
    { label: "Dark Moment", guidance: "Shadows gather. The quest seems impossible. A betrayal, a loss, or a powerful enemy appears." },
    { label: "Magic Saves the Day", guidance: "Inner magic (courage, love, belief) combines with outer magic to turn the tide in a dazzling climax." },
    { label: "New Normal", guidance: "The magical world is restored or transformed. The character finds their place in this new reality." },
  ],
  educational: [
    { label: "Question Posed", guidance: "A fascinating question captures the character's imagination. Why is the sky blue? How do plants grow?" },
    { label: "Exploration", guidance: "The character investigates — visiting places, talking to experts, observing the world with fresh eyes." },
    { label: "Facts Woven In", guidance: "Real facts and knowledge are woven naturally into the narrative as discoveries and aha moments." },
    { label: "Experiment", guidance: "The character tests what they've learned — a hands-on experiment, a creative project, or a real-world application." },
    { label: "Understanding", guidance: "Everything clicks into place. The character now understands something deep about the world and is eager to learn more." },
  ],
  "faith-based": [
    { label: "Peaceful Beginning", guidance: "A serene opening grounded in gratitude, family, community, or the beauty of God's creation." },
    { label: "Challenge to Faith", guidance: "Something difficult happens — a loss, a fear, a situation that tests what the character believes." },
    { label: "Moment of Doubt", guidance: "The character struggles. They wonder if God hears them. They feel alone. This is honest and tender." },
    { label: "Divine Help", guidance: "Through prayer, scripture, a kind act, or a quiet miracle, God's presence becomes real and tangible." },
    { label: "Renewed Purpose", guidance: "Faith is strengthened. The character sees God's hand in their story and moves forward with renewed trust and joy." },
  ],
  poetry: [
    { label: "Opening Verse", guidance: "Set the scene with vivid imagery and a gentle rhythm. Establish the rhyme scheme." },
    { label: "Rising Verse", guidance: "Build on the theme, introduce characters or emotions. Keep the rhyme flowing naturally." },
    { label: "Turning Verse", guidance: "A shift — a twist, a deeper feeling, a new perspective emerges in the verse." },
    { label: "Climax Verse", guidance: "The emotional or narrative peak. The most powerful imagery and feeling." },
    { label: "Closing Verse", guidance: "A gentle landing. Resolve the emotion, leave the reader with a warm feeling or thought." },
  ],
};

/* ════════════════════════════════════════════════════════════════
   5. ART STYLE MAPPINGS
   ════════════════════════════════════════════════════════════════ */

const ART_STYLES: Record<Genre, string> = {
  children: "soft watercolor",
  adventure: "detailed digital painting",
  fantasy: "luminous fantasy art",
  educational: "friendly vector illustration",
  "faith-based": "warm oil painting with golden light",
  poetry: "dreamy pastel illustration",
};

const MOOD_COLORS: Record<string, { mood: string; colors: string }> = {
  fun: { mood: "joyful and playful", colors: "bright yellows, oranges, and sky blues" },
  scary: { mood: "mysterious and slightly eerie", colors: "deep purples, dark blues, and moonlight silver" },
  exciting: { mood: "dynamic and energetic", colors: "bold reds, electric blues, and golden highlights" },
  sad: { mood: "tender and reflective", colors: "soft blues, lavenders, and muted grays" },
  magical: { mood: "enchanted and wondrous", colors: "iridescent purples, shimmering golds, and starlight whites" },
  brave: { mood: "heroic and determined", colors: "strong reds, deep golds, and steel blues" },
  calm: { mood: "peaceful and serene", colors: "soft greens, gentle blues, and warm creams" },
  curious: { mood: "intrigued and wonderstruck", colors: "warm ambers, curious teals, and soft whites" },
  inspiring: { mood: "uplifting and hopeful", colors: "sunrise oranges, hopeful yellows, and clear blues" },
  warm: { mood: "cozy and loving", colors: "warm browns, soft pinks, and golden ambers" },
};

/* ════════════════════════════════════════════════════════════════
   6. NLP-LITE PROMPT PARSER
   ════════════════════════════════════════════════════════════════ */

/** Common first-name list for character detection backup */
const COMMON_NAMES = new Set([
  "mia", "jake", "emma", "noah", "olivia", "liam", "ava", "sophia",
  "lucas", "lily", "mason", "ella", "aiden", "chloe", "ethan", "zoe",
  "jack", "maya", "leo", "ruby", "max", "luna", "sam", "ivy",
  "ben", "rose", "kai", "aria", "owen", "isla", "finn", "nora",
  "alex", "ellie", "miles", "hazel", "cole", "violet", "luke", "clara",
  "adam", "grace", "ryan", "faith", "daniel", "hope", "james", "joy",
  "david", "sarah", "peter", "ruth", "paul", "mary", "john", "anna",
  "tommy", "rosie", "charlie", "daisy", "oliver", "poppy", "henry",
  "willow", "theo", "penny", "oscar", "stella", "felix", "aurora",
]);

/** Words that look like proper nouns but aren't characters */
const FALSE_POSITIVE_NAMES = new Set([
  "once", "upon", "time", "the", "about", "story", "tale",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december",
  "god", "jesus", "christ", "lord", "bible", "christmas", "easter",
  "earth", "north", "south", "east", "west",
]);

function parsePrompt(raw: string): ParsedPrompt {
  const prompt = raw.trim();
  const lower = prompt.toLowerCase();
  const words = lower.split(/[\s,;:.!?()]+/).filter(Boolean);
  const originalWords = prompt.split(/[\s,;:.!?()]+/).filter(Boolean);

  // ── Characters ──
  const characters: CharacterInfo[] = [];
  const seenNames = new Set<string>();

  // Strategy 1: capitalized words not at sentence start
  for (let i = 0; i < originalWords.length; i++) {
    const w = originalWords[i];
    const cleaned = w.replace(/[^a-zA-Z'-]/g, "");
    if (!cleaned || cleaned.length < 2) continue;

    const isCapitalized = cleaned[0] === cleaned[0].toUpperCase() && cleaned[0] !== cleaned[0].toLowerCase();
    const isAllCaps = cleaned === cleaned.toUpperCase() && cleaned.length > 1;
    const lc = cleaned.toLowerCase();

    if (isAllCaps) continue;
    if (!isCapitalized) continue;
    if (FALSE_POSITIVE_NAMES.has(lc)) continue;
    if (STOP_WORDS.has(lc)) continue;
    if (LOCATION_WORDS.has(lc)) continue;
    if (OBJECT_WORDS.has(lc) && !COMMON_NAMES.has(lc)) continue;
    if (ACTIVITY_VERBS.has(lc)) continue;

    // Skip if it's the first word (sentence start) unless it's a known name
    const isFirstWord = i === 0 || /[.!?]$/.test(originalWords[i - 1] || "");
    if (isFirstWord && !COMMON_NAMES.has(lc)) continue;

    // Accept: known name OR mid-sentence capitalized
    if (COMMON_NAMES.has(lc) || !isFirstWord) {
      if (!seenNames.has(lc)) {
        seenNames.add(lc);
        characters.push({
          name: cleaned,
          description: "",
          traits: [],
          role: characters.length === 0 ? "protagonist" : "friend",
        });
      }
    }
  }

  // Strategy 2: pattern-based — "named X", "called X", "X the [noun]"
  const namePatterns = [
    /(?:named|called|known as)\s+([A-Z][a-z]+)/g,
    /([A-Z][a-z]+)\s+the\s+\w+/g,
  ];
  for (const pattern of namePatterns) {
    let match;
    while ((match = pattern.exec(prompt)) !== null) {
      const name = match[1];
      const lc = name.toLowerCase();
      if (!seenNames.has(lc) && !FALSE_POSITIVE_NAMES.has(lc)) {
        seenNames.add(lc);
        characters.push({
          name,
          description: "",
          traits: [],
          role: characters.length === 0 ? "protagonist" : "friend",
        });
      }
    }
  }

  // Extract traits for characters ("brave Mia", "little Jake", "a kind princess")
  const traitWords = [
    "brave", "kind", "clever", "smart", "shy", "bold", "gentle", "fierce",
    "curious", "tiny", "little", "big", "tall", "young", "old", "wise",
    "magical", "fearless", "funny", "silly", "strong", "sweet", "grumpy",
    "happy", "sad", "friendly", "loyal", "mischievous", "cheerful",
  ];
  for (const char of characters) {
    const charIdx = lower.indexOf(char.name.toLowerCase());
    if (charIdx > 0) {
      const before = lower.substring(Math.max(0, charIdx - 30), charIdx).trim();
      const beforeWords = before.split(/\s+/);
      for (const bw of beforeWords) {
        if (traitWords.includes(bw)) {
          char.traits.push(bw);
        }
      }
    }
  }

  // Assign roles from context
  for (const char of characters) {
    const charContext = extractContext(lower, char.name.toLowerCase(), 40);
    for (const [keyword, role] of Object.entries(ROLE_WORDS)) {
      if (charContext.includes(keyword)) {
        char.role = role;
        break;
      }
    }
  }

  // If no characters found, create a default protagonist
  if (characters.length === 0) {
    // Check for role-based characters: "a princess", "a boy", "a girl"
    const roleChars = [
      { pattern: /\b(?:a|the)\s+(princess|prince|king|queen|knight)\b/i, name: null as string | null },
      { pattern: /\b(?:a|the)\s+(boy|girl|child|kid|baby)\b/i, name: null },
      { pattern: /\b(?:a|the)\s+(puppy|kitten|bunny|bear cub|dragon)\b/i, name: null },
    ];
    for (const rc of roleChars) {
      const m = prompt.match(rc.pattern);
      if (m) {
        const role = m[1].toLowerCase();
        const defaultNames: Record<string, string> = {
          princess: "Princess", prince: "Prince", king: "King", queen: "Queen",
          knight: "Knight", boy: "Sam", girl: "Lily", child: "Alex", kid: "Alex",
          baby: "Baby", puppy: "Buddy", kitten: "Whiskers", bunny: "Clover",
          "bear cub": "Teddy", dragon: "Ember",
        };
        characters.push({
          name: defaultNames[role] || capitalize(role),
          description: `a ${role}`,
          traits: [],
          role: "protagonist",
        });
        break;
      }
    }
  }

  // ── Activities ──
  const activities: string[] = [];
  for (const w of words) {
    if (ACTIVITY_VERBS.has(w) && !activities.includes(w)) {
      activities.push(w);
    }
  }
  // Also check for "go + gerund" or "goes to"
  const activityPatterns = [
    /(?:go|goes|going|went)\s+(to\s+)?(\w+ing)/gi,
    /(?:loves?|likes?|enjoys?)\s+(?:to\s+)?(\w+ing)/gi,
  ];
  for (const pat of activityPatterns) {
    let m;
    while ((m = pat.exec(prompt)) !== null) {
      const verb = (m[2] || m[1]).toLowerCase();
      if (!activities.includes(verb)) activities.push(verb);
    }
  }

  // ── Settings ──
  const settings: string[] = [];
  for (const w of words) {
    if (LOCATION_WORDS.has(w) && !settings.includes(w)) {
      settings.push(w);
    }
  }
  // Multi-word locations
  const multiLocations = [
    "candy castle", "ice castle", "dark forest", "enchanted forest",
    "outer space", "deep sea", "coral reef", "north pole", "south pole",
    "haunted house", "pirate ship", "fairy garden", "magic kingdom",
    "tree house", "space station",
  ];
  for (const loc of multiLocations) {
    if (lower.includes(loc) && !settings.includes(loc)) {
      settings.push(loc);
    }
  }

  // ── Objects ──
  const objects: string[] = [];
  for (const w of words) {
    if (OBJECT_WORDS.has(w) && !objects.includes(w)) {
      objects.push(w);
    }
  }

  // ── Tone ──
  const toneSet = new Set<string>();
  for (const w of words) {
    const mapped = TONE_WORDS[w];
    if (mapped) toneSet.add(mapped);
  }
  // Default tones based on genre inference
  if (toneSet.size === 0) {
    toneSet.add("fun"); // warm default
  }
  const tone = Array.from(toneSet);

  // ── Inferred Genre ──
  let inferredGenre: Genre | null = null;
  const genreVotes: Record<string, number> = {};
  for (const w of words) {
    const g = GENRE_KEYWORDS[w];
    if (g) {
      genreVotes[g] = (genreVotes[g] || 0) + 1;
    }
  }
  if (Object.keys(genreVotes).length > 0) {
    inferredGenre = Object.entries(genreVotes).sort((a, b) => b[1] - a[1])[0][0] as Genre;
  }

  // Build character descriptions from context
  for (const char of characters) {
    const parts: string[] = [];
    if (char.traits.length > 0) parts.push(char.traits.join(", "));
    const ctx = extractContext(lower, char.name.toLowerCase(), 60);
    // Look for "who is/has/lives" patterns
    const whoMatch = ctx.match(/who\s+(is|has|lives|loves|wants|wears|carries)\s+([^,.]+)/);
    if (whoMatch) parts.push(`who ${whoMatch[1]} ${whoMatch[2].trim()}`);
    char.description = parts.length > 0 ? parts.join(", ") : "";
  }

  return { characters, activities, settings, objects, tone, rawPrompt: prompt, inferredGenre };
}

/** Extract surrounding context for a word in a string */
function extractContext(text: string, word: string, radius: number): string {
  const idx = text.indexOf(word);
  if (idx < 0) return "";
  return text.substring(Math.max(0, idx - radius), Math.min(text.length, idx + word.length + radius));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ════════════════════════════════════════════════════════════════
   7. TITLE GENERATOR
   ════════════════════════════════════════════════════════════════ */

function generateTitle(parsed: ParsedPrompt, genre: Genre): string {
  const mainChar = parsed.characters[0]?.name || "A Little Friend";
  const activity = parsed.activities[0];
  const setting = parsed.settings[0];
  const object = parsed.objects[0];
  const tone = parsed.tone[0] || "fun";

  const templates: Record<Genre, string[]> = {
    children: [
      `${mainChar}'s ${capitalize(tone)} Day`,
      `${mainChar} and the ${capitalize(object || "Surprise")}`,
      `${mainChar}'s ${capitalize(setting || "Big")} Adventure`,
      `The Day ${mainChar} ${capitalize(activity || "Found Something Special")}`,
    ],
    adventure: [
      `${mainChar} and the ${capitalize(object || "Lost")} ${capitalize(setting || "Treasure")}`,
      `The ${capitalize(tone)} Quest of ${mainChar}`,
      `${mainChar}'s Journey to the ${capitalize(setting || "Unknown")}`,
      `The Legend of ${mainChar}`,
    ],
    fantasy: [
      `${mainChar} and the ${capitalize(tone)} ${capitalize(object || "Magic")}`,
      `The Enchanted ${capitalize(setting || "Kingdom")} of ${mainChar}`,
      `${mainChar}'s Magical ${capitalize(activity || "Quest")}`,
      `The ${capitalize(object || "Crystal")} of ${capitalize(setting || "Wonder")}`,
    ],
    educational: [
      `${mainChar} Discovers ${capitalize(object || "the World")}`,
      `Why Does the ${capitalize(object || "World")} ${capitalize(activity || "Work")}?`,
      `${mainChar}'s ${capitalize(setting || "Science")} Adventure`,
      `The Curious Case of ${mainChar}`,
    ],
    "faith-based": [
      `${mainChar}'s Prayer for ${capitalize(object || "Hope")}`,
      `God's ${capitalize(tone)} Plan for ${mainChar}`,
      `${mainChar} and the ${capitalize(object || "Blessing")}`,
      `Walking with Faith: ${mainChar}'s Story`,
    ],
    poetry: [
      `Verses of ${capitalize(tone)}`,
      `A Poem for ${mainChar}`,
      `${capitalize(setting || "Dreamy")} Rhymes`,
      `Songs of ${capitalize(object || "Wonder")}`,
    ],
  };

  const options = templates[genre];
  // Deterministic pick based on prompt hash
  const hash = simpleHash(parsed.rawPrompt);
  return options[hash % options.length];
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/* ════════════════════════════════════════════════════════════════
   8. STORY TEXT GENERATOR
   ════════════════════════════════════════════════════════════════ */

function generatePageText(
  pageIndex: number,
  beat: StoryBeat,
  parsed: ParsedPrompt,
  genre: Genre,
  style: "simple" | "detailed" | "poetic",
  totalPages: number,
  characterTracker: Map<string, string>,
): string {
  const mainChar = parsed.characters[0];
  const charName = mainChar?.name || "our hero";
  const otherChars = parsed.characters.slice(1);
  const activity = parsed.activities[0] || "exploring";
  const setting = parsed.settings[0] || "a wonderful place";
  const object = parsed.objects[0] || "something special";
  const tone = parsed.tone[0] || "fun";

  // Ensure character consistency by using tracked descriptions
  const charDesc = characterTracker.get(charName) || mainChar?.description || "";
  const charIntro = charDesc ? `${charName}, ${charDesc},` : charName;

  // For poetry genre, generate rhyming verses
  if (genre === "poetry") {
    return generatePoetryPage(pageIndex, beat, parsed, characterTracker);
  }

  // Build contextual page based on beat and position
  const isFirst = pageIndex === 0;
  const isLast = pageIndex === totalPages - 1;

  // Sentence complexity based on style
  const connector = style === "simple" ? ". " : style === "poetic" ? ", and " : ". Then, ";

  let text = "";

  if (isFirst) {
    // Opening — establish character and world
    const openings = buildOpenings(charIntro, charName, setting, tone, style, otherChars);
    text = openings;
  } else if (isLast) {
    // Closing — resolve and warm ending
    text = buildClosing(charName, setting, tone, style, activity, object, otherChars, genre);
  } else {
    // Middle pages — driven by the beat
    text = buildMiddlePage(charName, beat, setting, activity, object, tone, style, otherChars, genre, pageIndex);
  }

  // Track character descriptions for consistency
  if (isFirst && mainChar) {
    const desc = buildCharacterDescription(mainChar, setting);
    characterTracker.set(charName, desc);
    for (const oc of otherChars) {
      characterTracker.set(oc.name, buildCharacterDescription(oc, setting));
    }
  }

  return text;
}

function buildCharacterDescription(char: CharacterInfo, setting: string): string {
  const traits = char.traits.length > 0 ? char.traits.join(" and ") + " " : "";
  const desc = char.description ? ` (${char.description})` : "";
  return `${traits}${char.name}${desc}`;
}

function buildOpenings(
  charIntro: string, charName: string, setting: string, tone: string,
  style: "simple" | "detailed" | "poetic", otherChars: CharacterInfo[],
): string {
  const settingDesc = describeLocation(setting);
  const companions = otherChars.length > 0
    ? ` Along with ${otherChars.map(c => c.name).join(" and ")}, ${charName} was ready for anything.`
    : "";

  if (style === "simple") {
    return `${charIntro} lived near ${settingDesc}. Every day was full of ${tone} things to do.${companions} Today was going to be the best day yet!`;
  }
  if (style === "poetic") {
    return `In a place where ${settingDesc} stretched as far as the eye could see, there lived ${charIntro}. The air hummed with the promise of ${tone} and wonder.${companions} And on this particular day, something extraordinary was about to begin.`;
  }
  return `${charIntro} woke up with a feeling of ${tone} bubbling inside. Outside, ${settingDesc} sparkled in the morning light, as if the whole world was waiting for an adventure.${companions} Little did ${charName} know, today would change everything.`;
}

function buildClosing(
  charName: string, setting: string, tone: string, style: "simple" | "detailed" | "poetic",
  activity: string, object: string, otherChars: CharacterInfo[], genre: Genre,
): string {
  const friends = otherChars.map(c => c.name).join(" and ");
  const friendMention = friends ? ` with ${friends} by their side` : "";

  const lessons: Record<Genre, string> = {
    children: `And so ${charName} learned that the best adventures are the ones you share${friendMention}. With a heart full of ${tone}, ${charName} smiled, knowing tomorrow would bring even more wonderful surprises.`,
    adventure: `${charName} returned home${friendMention}, tired but triumphant. The ${object} was safe, the ${setting} was peaceful again, and ${charName} knew: true courage isn't about being fearless — it's about being ${tone} enough to try.`,
    fantasy: `The magic of the ${setting} had changed ${charName} forever${friendMention}. As the last sparkles of enchantment settled, ${charName} whispered a promise to the wind: "I'll always believe."`,
    educational: `${charName} looked at the ${object} with new eyes${friendMention}. Every question led to another, and that was the most ${tone} part of all. The world was full of wonders waiting to be understood.`,
    "faith-based": `${charName} bowed their head in thanks${friendMention}. God's love had been there all along — in the ${setting}, in the kindness of friends, and in the quiet moments of faith. "Thank You, Lord," ${charName} whispered with a peaceful heart.`,
    poetry: `And so the tale draws to a close, like petals on a folding rose. ${charName} smiles, the day is done, beneath the setting, golden sun.`,
  };

  return lessons[genre];
}

function buildMiddlePage(
  charName: string, beat: StoryBeat, setting: string, activity: string,
  object: string, tone: string, style: "simple" | "detailed" | "poetic",
  otherChars: CharacterInfo[], genre: Genre, pageIndex: number,
): string {
  const settingDesc = describeLocation(setting);
  const friends = otherChars.map(c => c.name);

  // Templates per beat label patterns
  const beatTemplates: Record<string, (s: "simple" | "detailed" | "poetic") => string> = {
    // Discovery / Exploration / Magical World / Opening
    Discovery: (s) => {
      if (s === "simple") return `${charName} found something amazing near ${settingDesc}! A ${object} was glowing softly, as if it was waiting to be discovered.${friends.length > 0 ? ` "${friends[0]}, come look!" ${charName} called out.` : ""}`;
      if (s === "poetic") return `There, among the whispers of ${settingDesc}, ${charName} discovered a ${object} unlike anything seen before. It shimmered with a ${tone} light that seemed to sing a secret song.`;
      return `While ${activity} through ${settingDesc}, ${charName} stumbled upon something extraordinary — a ${object} that seemed to glow with a gentle, ${tone} light.${friends.length > 0 ? ` "${friends[0]}! You have to see this!" ${charName} called excitedly.` : ""} ${charName} reached out carefully, heart pounding with wonder.`;
    },
    Challenge: (s) => {
      if (s === "simple") return `Oh no! There was a big problem. The ${object} was stuck, and ${charName} didn't know what to do.${friends.length > 0 ? ` ${friends[0]} looked worried too.` : ""} But ${charName} took a deep breath and decided to try.`;
      if (s === "poetic") return `But shadows fell across the ${setting}, and ${charName}'s heart grew heavy. The ${object} dimmed, the path grew tangled, and for a moment, all the ${tone} drained from the world like water through sand.`;
      return `Just when things seemed perfect, trouble appeared. The ${object} began to fade, and a rumbling sound echoed through ${settingDesc}.${friends.length > 0 ? ` ${friends[0]} grabbed ${charName}'s hand. "We can figure this out together," ${friends[0]} said firmly.` : ""} ${charName} felt a knot of worry, but also a spark of determination.`;
    },
    "Help from Friend": (s) => {
      const helper = friends[0] || "a new friend";
      if (s === "simple") return `Then ${helper} had a great idea! "What if we try ${activity} together?" And that's exactly what they did. Teamwork made everything better!`;
      if (s === "poetic") return `It was ${helper} who found the way — a gentle word, a steady hand, a heart that knew just what to say. Together they turned toward the ${tone} light, and the darkness began to fade.`;
      return `${helper} stepped forward with a bright idea. "I've been thinking," ${helper} said. "What if we combine ${activity} with a little bit of creativity?" ${charName}'s eyes widened. Of course! Working together, they began to solve the problem, their ${tone} spirits lifting with every step.`;
    },
    "Quest Revealed": (s) => {
      if (s === "simple") return `${charName} found out there was a special mission — find the ${object} hidden in ${settingDesc} before it was too late!`;
      if (s === "poetic") return `A voice like silver bells rang through the air: "Brave ${charName}, the ${object} of ${setting} must be found. Only one with a ${tone} heart can restore what was lost."`;
      return `An ancient message revealed itself, written in shimmering letters that only ${charName} could read: "The ${object} of ${setting} has been lost. Only a heart full of ${tone} can find it." ${charName} looked at ${friends[0] || "the path ahead"} and nodded. The quest had begun.`;
    },
    "Dark Moment": (s) => {
      if (s === "simple") return `Everything went wrong. The ${object} broke, the ${setting} turned gray, and ${charName} felt like giving up.${friends.length > 0 ? ` Even ${friends[0]} was scared.` : ""}`;
      if (s === "poetic") return `The sky wept gray, the ${object} shattered like a dream at dawn. ${charName} fell to their knees in ${settingDesc}, wondering if any magic remained. The world felt cold, and hope felt very far away.`;
      return `The worst had happened. The ${object} lay broken at ${charName}'s feet, its light extinguished. ${settingDesc} grew dark and cold, shadows creeping in from every corner.${friends.length > 0 ? ` ${friends[0]} looked at ${charName} with tears in their eyes.` : ""} For the first time, ${charName} wondered if this quest could be won.`;
    },
    "Magic Saves the Day": (s) => {
      if (s === "simple") return `But then — magic! ${charName}'s heart was so full of ${tone} that the ${object} started to glow again, brighter than ever! The ${setting} filled with light and color.`;
      if (s === "poetic") return `Then from deep within, a ${tone} fire bloomed — ${charName}'s own heart, ablaze with love and courage. The ${object} reformed, the ${setting} sang, and magic poured like golden rain across the land.`;
      return `${charName} closed their eyes and thought of everything that mattered — ${friends.length > 0 ? `${friends.join(", ")}, ` : ""}the beauty of ${settingDesc}, the joy of ${activity}, and the power of never giving up. A warm light erupted from within, swirling around the broken ${object}. Piece by piece, it reformed, more beautiful than before. The ${setting} erupted in a symphony of ${tone} colors.`;
    },
    Obstacle: (s) => buildMiddlePage(charName, { label: "Challenge", guidance: "" }, setting, activity, object, tone, s, otherChars, genre, pageIndex),
    Triumph: (s) => buildMiddlePage(charName, { label: "Magic Saves the Day", guidance: "" }, setting, activity, object, tone, s, otherChars, genre, pageIndex),
    "Journey Begins": (s) => buildMiddlePage(charName, { label: "Discovery", guidance: "" }, setting, activity, object, tone, s, otherChars, genre, pageIndex),
    "Call to Action": (s) => {
      if (s === "simple") return `One day, ${charName} heard a sound from ${settingDesc}. Someone needed help! Without thinking twice, ${charName} grabbed the ${object} and set off.`;
      if (s === "poetic") return `A cry rang out across ${settingDesc}, and ${charName}'s heart answered before their mind could wonder why. With the ${object} in hand and ${tone} as their compass, the journey began.`;
      return `It started with a whisper carried on the wind from ${settingDesc}. ${charName} paused, listening. There it was again — a call for help, urgent and unmistakable. ${charName} knew what had to be done.${friends.length > 0 ? ` "Let's go," ${charName} said to ${friends[0]}.` : ""} Clutching the ${object} tightly, they stepped into the unknown.`;
    },
    "Return Home": (s) => buildMiddlePage(charName, { label: "Help from Friend", guidance: "" }, setting, activity, object, tone, s, otherChars, genre, pageIndex),
    "Magical World": (s) => {
      if (s === "simple") return `${settingDesc} was the most amazing place ${charName} had ever seen! Everything sparkled and glowed with magic. Even the air tasted like ${object || "starlight"}.`;
      if (s === "poetic") return `Imagine a place where ${settingDesc} dreams itself into being each morning — where the trees hum lullabies and the rivers flow with liquid ${tone}. This was the world ${charName} stepped into, wide-eyed and breathless.`;
      return `${charName} stepped through the shimmering portal and gasped. ${capitalize(settingDesc)} stretched in every direction, but not like any ${setting} ${charName} had ever known. Here, the colors were deeper, the sounds were music, and every ${object} seemed alive with ${tone} energy.${friends.length > 0 ? ` ${friends[0]} appeared beside ${charName}, equally amazed.` : ""}`;
    },
    "New Normal": (s) => buildClosing(charName, setting, tone, s, activity, object, otherChars, genre),
    "Question Posed": (s) => {
      if (s === "simple") return `${charName} looked at the ${object} and wondered: "How does it work?" It was the kind of question that made ${charName}'s brain tingle with excitement!`;
      if (s === "poetic") return `"Why?" asked ${charName}, gazing at the ${object} with wonder-filled eyes. The simplest question in the world, and yet the most powerful — for every great discovery begins with why.`;
      return `${charName} had always been curious about the ${object}. How did it work? Why did it do what it did? Today, standing in ${settingDesc}, that curiosity sparked into something bigger.${friends.length > 0 ? ` "Let's find out together," said ${friends[0]}.` : ""} It was time to investigate.`;
    },
    Exploration: (s) => buildMiddlePage(charName, { label: "Discovery", guidance: "" }, setting, activity, object, tone, s, otherChars, genre, pageIndex),
    "Facts Woven In": (s) => {
      if (s === "simple") return `${charName} learned something amazing! The ${object} worked because of something really cool. "Wow!" said ${charName}. "I didn't know that!"`;
      if (s === "poetic") return `And there among the wonders of ${settingDesc}, the truth revealed itself — not with a shout, but with the quiet ${tone} of understanding. ${charName} smiled. Knowledge is its own kind of magic.`;
      return `As ${charName} explored deeper into ${settingDesc}, the pieces started coming together. The ${object} wasn't just interesting — it was connected to everything around it in the most fascinating way.${friends.length > 0 ? ` ${friends[0]} helped ${charName} see a pattern they'd almost missed.` : ""} "So THAT'S how it works!" ${charName} exclaimed with ${tone} delight.`;
    },
    Experiment: (s) => buildMiddlePage(charName, { label: "Help from Friend", guidance: "" }, setting, activity, object, tone, s, otherChars, genre, pageIndex),
    Understanding: (s) => buildClosing(charName, setting, tone, s, activity, object, otherChars, genre),
    "Peaceful Beginning": (s) => {
      if (s === "simple") return `${charName} woke up to a beautiful morning. The sun was shining, the birds were singing, and ${charName} said a little prayer of thanks. It was going to be a good day!`;
      if (s === "poetic") return `Morning light streamed through the window like a gentle blessing, and ${charName} whispered, "Thank You, God, for this new day." Outside, ${settingDesc} glowed with the warmth of creation's love.`;
      return `The morning air carried the sweet scent of ${settingDesc} as ${charName} opened their eyes. Before even getting out of bed, ${charName} folded their hands and whispered a quiet prayer of gratitude. "Thank You, God, for another beautiful day."${friends.length > 0 ? ` Downstairs, ${friends[0]} was already waiting with a warm smile.` : ""}`;
    },
    "Challenge to Faith": (s) => {
      if (s === "simple") return `But then something hard happened. ${charName} felt sad and didn't understand why God would let this happen.${friends.length > 0 ? ` ${friends[0]} tried to help, but even they didn't have answers.` : ""}`;
      if (s === "poetic") return `Clouds gathered where the sun once shone, and ${charName}'s prayer turned to a whispered question: "Lord, are You still there?" The ${setting} felt emptier, and the ${object} lost its shine.`;
      return `Later that day, something unexpected happened that shook ${charName} to the core. The ${object} — so precious and dear — was gone. ${charName} searched ${settingDesc} frantically, but it was nowhere to be found.${friends.length > 0 ? ` ${friends[0]} put a hand on ${charName}'s shoulder, but there were no easy words.` : ""} For the first time, ${charName}'s heart felt heavy with doubt.`;
    },
    "Moment of Doubt": (s) => {
      if (s === "simple") return `${charName} sat alone and cried. "Why, God?" ${charName} asked. Everything felt confusing and sad.`;
      if (s === "poetic") return `Tears fell like rain upon the ${setting}, and ${charName} wondered if prayers could reach past clouds so dark. "I'm trying to believe," ${charName} whispered, "but I'm so afraid."`;
      return `Sitting quietly in ${settingDesc}, ${charName} let the tears come. "God, I don't understand," ${charName} prayed softly. "I've tried to be good. I've tried to have faith. But right now, I just feel lost." The silence felt enormous.${friends.length > 0 ? ` Even ${friends[0]}, usually so strong, was quiet.` : ""}`;
    },
    "Divine Help": (s) => {
      if (s === "simple") return `Then something wonderful happened. A warm feeling filled ${charName}'s heart, like a hug from the inside. God was listening all along!${friends.length > 0 ? ` ${friends[0]} smiled. "See? He never left."` : ""}`;
      if (s === "poetic") return `And then — as gentle as a dove's wing — peace settled over ${charName}'s heart. The ${object} was found where light broke through the clouds, and ${charName} knew: God's love had been there every moment.`;
      return `Just when the darkness felt deepest, something shifted. A warm, golden light seemed to fill ${settingDesc}, and ${charName} felt a peace that words couldn't describe — deep and real and strong. The ${object} appeared, restored and radiant, right where ${charName} had first prayed.${friends.length > 0 ? ` ${friends[0]}'s eyes went wide. "It's a miracle," ${friends[0]} breathed.` : ""} And in that moment, ${charName} knew: God had been listening the whole time.`;
    },
    "Renewed Purpose": (s) => buildClosing(charName, setting, tone, s, activity, object, otherChars, genre),
    "Opening Verse": () => "",
    "Rising Verse": () => "",
    "Turning Verse": () => "",
    "Climax Verse": () => "",
    "Closing Verse": () => "",
  };

  const generator = beatTemplates[beat.label];
  if (generator) {
    const result = generator(style);
    if (result) return result;
  }

  // Fallback: generic beat-based text
  return `${charName} continued on through ${describeLocation(setting)}. ${beat.guidance} The feeling of ${tone} kept ${charName} moving forward.${otherChars.length > 0 ? ` ${otherChars[0].name} stayed close, a true friend through it all.` : ""}`;
}

function generatePoetryPage(
  pageIndex: number, beat: StoryBeat, parsed: ParsedPrompt,
  characterTracker: Map<string, string>,
): string {
  const charName = parsed.characters[0]?.name || "little one";
  const setting = parsed.settings[0] || "garden";
  const object = parsed.objects[0] || "star";
  const activity = parsed.activities[0] || "dreaming";
  const tone = parsed.tone[0] || "magical";
  const friends = parsed.characters.slice(1).map(c => c.name);

  const verses: string[][] = [
    // Opening Verse
    [
      `In a ${tone} ${setting}, bright and fair,`,
      `Where ${object}s sparkle in the air,`,
      `Lived ${charName}, so brave and true,`,
      `With a heart for me and you.`,
      ...(friends.length > 0 ? [`With ${friends[0]} always by their side,`, `Together on this ${tone} ride.`] : []),
    ],
    // Rising Verse
    [
      `One fine day while ${activity} along,`,
      `${charName} heard a gentle song,`,
      `It came from deep within the ${setting},`,
      `A melody both wild and ${tone === "fun" ? "betting" : "letting"},`,
      `"Come and see," the voices cried,`,
      `"There's wonder waiting just inside!"`,
    ],
    // Turning Verse
    [
      `But shadows fell across the way,`,
      `And ${charName} didn't want to stay,`,
      `The ${object} dimmed, the path grew long,`,
      `And for a moment, things felt wrong.`,
      ...(friends.length > 0 ? [`Then ${friends[0]} whispered, "Don't you fear,`, `"I'll be right here, I'll be right here."`] : [`But deep inside, a light held strong,`, `And ${charName} knew where they'd belong.`]),
    ],
    // Climax Verse
    [
      `With courage bright as morning sun,`,
      `${charName} knew what must be done!`,
      `They ${activity.replace(/ing$/, "ed") || "stepped forth"} with all their might,`,
      `And turned the darkness into light.`,
      `The ${setting} bloomed, the ${object} gleamed,`,
      `More beautiful than ever dreamed!`,
    ],
    // Closing Verse
    [
      `And so the tale comes to an end,`,
      `Of ${charName} and each dear friend,`,
      `The ${setting} hums a lullaby,`,
      `Beneath a painted, starlit sky.`,
      `Remember well this ${tone} rhyme:`,
      `Love makes magic, every time.`,
    ],
  ];

  // Use modular index to handle different page counts
  const verseIdx = Math.min(pageIndex, verses.length - 1);
  return verses[verseIdx].join("\n");
}

function describeLocation(setting: string): string {
  const descriptions: Record<string, string> = {
    forest: "a deep, green forest where sunlight danced between ancient trees",
    woods: "the quiet woods where every path led to a new mystery",
    beach: "a golden beach where waves whispered secrets to the sand",
    ocean: "the vast, sparkling ocean stretching to the horizon",
    mountain: "a towering mountain whose peak touched the clouds",
    castle: "a magnificent castle with towers reaching toward the sky",
    garden: "a beautiful garden bursting with colorful flowers",
    school: "a friendly school buzzing with laughter and learning",
    park: "a sunny park where children played and birds sang",
    space: "the endless wonder of outer space, filled with twinkling stars",
    lake: "a crystal-clear lake reflecting the sky like a mirror",
    cave: "a mysterious cave glittering with hidden crystals",
    village: "a cozy little village where everyone knew each other's name",
    island: "a secret island surrounded by turquoise waters",
    jungle: "a wild, lush jungle alive with exotic sounds and colors",
    desert: "a vast golden desert shimmering under an endless sky",
    kingdom: "a grand kingdom where magic flowed through every cobblestone street",
    palace: "a dazzling palace with halls that echoed with ancient stories",
    meadow: "a peaceful meadow dotted with wildflowers swaying in the breeze",
    library: "a magical library where every book was a doorway to adventure",
    treehouse: "a cozy treehouse nestled high in the branches of a grand old oak",
    playground: "a colorful playground where laughter filled the air",
    farm: "a cheerful farm where animals roamed freely and crops grew tall",
    river: "a winding river that sang as it tumbled over smooth stones",
    volcano: "a rumbling volcano with rivers of glowing lava",
    "candy castle": "a fantastic castle made entirely of candy and sweets",
    "enchanted forest": "an enchanted forest where the trees whispered ancient secrets",
    "outer space": "the infinite wonder of outer space, with planets and nebulae swirling in cosmic dance",
    "deep sea": "the mysterious deep sea, where bioluminescent creatures drifted like living stars",
    "haunted house": "a creaky old haunted house with shadows that seemed to move on their own",
    "pirate ship": "a grand pirate ship with billowing sails cutting through the waves",
  };

  return descriptions[setting] || `the beautiful ${setting}`;
}

/* ════════════════════════════════════════════════════════════════
   9. ILLUSTRATION PROMPT GENERATOR
   ════════════════════════════════════════════════════════════════ */

function generateIllustrationPrompt(
  pageIndex: number,
  pageText: string,
  parsed: ParsedPrompt,
  genre: Genre,
  characterTracker: Map<string, string>,
): string {
  const artStyle = ART_STYLES[genre];
  const tone = parsed.tone[0] || "fun";
  const moodColors = MOOD_COLORS[tone] || MOOD_COLORS.fun;

  // Build scene description from page text
  const sceneKeywords = extractSceneKeywords(pageText);
  const sceneDesc = sceneKeywords.length > 0
    ? sceneKeywords.join(", ")
    : `a scene from a ${genre} story`;

  // Build character descriptions from tracker
  const charDescs: string[] = [];
  for (const char of parsed.characters) {
    const tracked = characterTracker.get(char.name);
    if (tracked) {
      charDescs.push(tracked);
    } else {
      const traits = char.traits.length > 0 ? `${char.traits.join(" ")} ` : "";
      charDescs.push(`${traits}${char.name}`);
    }
  }
  const characterStr = charDescs.length > 0
    ? charDescs.join(" and ")
    : "a young child protagonist";

  // Detect specific scene elements from page text
  const setting = parsed.settings[0] || "magical setting";
  const isOutdoor = ["forest", "beach", "mountain", "park", "garden", "meadow", "ocean", "lake", "island", "jungle", "desert", "field"].includes(setting);
  const lighting = isOutdoor ? "natural sunlight" : "warm interior lighting";

  return `${artStyle}, ${sceneDesc}, ${characterStr} in a ${describeLocation(setting).substring(0, 60)}, ${moodColors.mood} atmosphere, ${moodColors.colors}, ${lighting}, children's book illustration, high quality, detailed, expressive characters`;
}

function extractSceneKeywords(text: string): string[] {
  const keywords: string[] = [];
  const lower = text.toLowerCase();

  // Extract action scenes
  const actionPatterns = [
    /(\w+ing)\s+(?:through|across|over|into|toward)/g,
    /(?:found|discovered|saw|noticed)\s+(?:a|an|the)\s+(\w+(?:\s+\w+)?)/g,
  ];
  for (const pat of actionPatterns) {
    let m;
    while ((m = pat.exec(lower)) !== null) {
      keywords.push(m[1] || m[0]);
      if (keywords.length >= 4) break;
    }
  }

  // Extract emotional beats
  if (lower.includes("tears") || lower.includes("cried") || lower.includes("sad")) keywords.push("emotional moment");
  if (lower.includes("laugh") || lower.includes("smile") || lower.includes("joy")) keywords.push("joyful moment");
  if (lower.includes("scared") || lower.includes("dark") || lower.includes("shadow")) keywords.push("dramatic shadows");
  if (lower.includes("magic") || lower.includes("glow") || lower.includes("sparkle")) keywords.push("magical glow effects");
  if (lower.includes("hugged") || lower.includes("together") || lower.includes("friend")) keywords.push("warm friendship scene");

  return keywords.slice(0, 5);
}

/* ════════════════════════════════════════════════════════════════
   10. MAIN EXPORT — generateStory()
   ════════════════════════════════════════════════════════════════ */

export function generateStory(prompt: string, options?: StoryOptions): StoryOutput {
  const parsed = parsePrompt(prompt);

  // Resolve options with defaults
  const pageCount = options?.pages ?? 5;
  const genre: Genre = (options?.genre as Genre) || parsed.inferredGenre || "children";
  const style = options?.style ?? "detailed";
  const ageRange = options?.ageRange ?? "4-8";

  // Adjust style for young readers
  const effectiveStyle: "simple" | "detailed" | "poetic" =
    ageRange.startsWith("2") || ageRange.startsWith("3") ? "simple" : style;

  // Get story structure and adjust to page count
  const baseBeats = STORY_STRUCTURES[genre];
  const beats = adjustBeatsToPageCount(baseBeats, pageCount);

  // Track characters for consistency
  const characterTracker = new Map<string, string>();

  // Generate title
  const title = generateTitle(parsed, genre);

  // Generate pages
  const pages: StoryPage[] = beats.map((beat, idx) => {
    const text = generatePageText(idx, beat, parsed, genre, effectiveStyle, pageCount, characterTracker);
    const illustrationPrompt = generateIllustrationPrompt(idx, text, parsed, genre, characterTracker);

    return {
      id: idx + 1,
      text,
      illustrationPrompt,
    };
  });

  return { title, pages };
}

/** Adjust story beats to match requested page count */
function adjustBeatsToPageCount(beats: StoryBeat[], targetCount: number): StoryBeat[] {
  if (targetCount === beats.length) return beats;

  if (targetCount < beats.length) {
    // Trim: always keep first and last, pick most important middle beats
    const result: StoryBeat[] = [beats[0]];
    const middleCount = targetCount - 2;
    const middle = beats.slice(1, -1);
    const step = middle.length / middleCount;
    for (let i = 0; i < middleCount; i++) {
      result.push(middle[Math.floor(i * step)]);
    }
    result.push(beats[beats.length - 1]);
    return result;
  }

  // Expand: repeat/expand middle beats
  const result: StoryBeat[] = [beats[0]];
  const middleBeats = beats.slice(1, -1);
  const extraNeeded = targetCount - 2;
  for (let i = 0; i < extraNeeded; i++) {
    const beat = middleBeats[i % middleBeats.length];
    const suffix = i >= middleBeats.length ? ` (continued, part ${Math.floor(i / middleBeats.length) + 1})` : "";
    result.push({
      label: beat.label,
      guidance: beat.guidance + suffix,
    });
  }
  result.push(beats[beats.length - 1]);
  return result;
}

/* ════════════════════════════════════════════════════════════════
   11. UTILITY EXPORTS (for testing & external use)
   ════════════════════════════════════════════════════════════════ */

/** Expose the parser for testing or for the UI to show extracted elements */
export function analyzePrompt(prompt: string): ParsedPrompt {
  return parsePrompt(prompt);
}

/** Get available genres */
export function getGenres(): Genre[] {
  return Object.keys(STORY_STRUCTURES) as Genre[];
}

/** Get story structure for a genre */
export function getStoryStructure(genre: Genre): StoryBeat[] {
  return STORY_STRUCTURES[genre] || STORY_STRUCTURES.children;
}
