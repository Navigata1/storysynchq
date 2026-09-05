/**
 * The seven-layer packet model (docs/design-direction.md §9.4, docs/format-spec.md §7).
 *
 * One list, two consumers: the inline SVG packet diagram draws it, the legend
 * below the diagram explains it. Adding a layer here changes both — the diagram
 * and the prose can never drift apart.
 */

export interface PacketLayer {
  /** Layer name exactly as the protocol vision names it. */
  name: string;
  /** Where it lives in the manifest. */
  key: string;
  /** The one-line "what it is" printed inside the packet band. */
  gist: string;
  /** The paragraph in the legend under the diagram. */
  detail: string;
  /** Band fill — a tint on tape paper, always dark ink text on top. */
  fill: string;
  /** Band edge. The Signature layer gets the red stripe; the rest stay ink. */
  stroke: string;
  /** Set for the v2.1 draft layer, which the diagram marks as such. */
  draft?: boolean;
}

export const PACKET_LAYERS: PacketLayer[] = [
  {
    name: "Metadata",
    key: "metadata",
    gist: "title · author · language · cover",
    detail:
      "Who made it, what it is called, what language it speaks. The only required field in the whole format is metadata.title — everything else is optional, so a one-page story is a legal story.",
    fill: "#EFE9DC",
    stroke: "#1E1A16",
  },
  {
    name: "Visual",
    key: "pages[].illustration",
    gist: "stills · alt text · entrance",
    detail:
      "Still images, not video: a photograph of a crayon drawing, ≤ 2048px on the long edge, with alt text so the page is describable. An optional entrance animation per page — never required to understand the story.",
    fill: "#E4E0FA",
    stroke: "#1E1A16",
  },
  {
    name: "Text",
    key: "pages[].text.content",
    gist: "the words, page by page",
    detail:
      "The words on the page, kept as text rather than baked into the picture, so they can be re-typeset, resized, read aloud, or highlighted word by word as they are spoken.",
    fill: "#FBF3DF",
    stroke: "#1E1A16",
  },
  {
    name: "Voice",
    key: "pages[].text.audioUrl",
    gist: "recorded narration · audioCodec",
    detail:
      "The recording of a real person reading this page — the reason the format exists. Published narration is always AAC/M4A (WAV as the only fallback), so the tape a parent records on Android plays on a grandparent's iPad.",
    fill: "#FADFDA",
    stroke: "#1E1A16",
  },
  {
    name: "Sound",
    key: "pages[].music",
    gist: "the music bed, per page",
    detail:
      "A mood name for the music bed under the voice — Wonder, Calm, Adventure, Hush. The player generates it and ducks it about −12 dB while narration plays. No mood on a page means silence, on purpose.",
    fill: "#FBEBD2",
    stroke: "#1E1A16",
  },
  {
    name: "Behavior",
    key: "settings · pages[].timing",
    gist: "autoPause · highlight · a11y",
    detail:
      "How the story moves: how long to wait after narration ends, whether to chime on the page turn, whether words light up as they are read, and the accessibility timing multiplier a slower reader needs.",
    fill: "#E6E9EE",
    stroke: "#1E1A16",
  },
  {
    name: "Signature",
    key: "signature",
    gist: "ownership · remix · consent",
    detail:
      "Who owns this tape, what it was remixed from, the share URL it lives at, and the consent record for every recorded voice inside it. Consent travels with the story, not in some server's database. Draft in v2.1 — additive, and v2.0 readers ignore it.",
    fill: "#FFE9A8",
    stroke: "#E3452F",
    draft: true,
  },
];
