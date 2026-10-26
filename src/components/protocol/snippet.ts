/**
 * "Write your own player" — the whole of a working SSYNC reader, in six lines
 * (s08). One constant: /protocol prints it and tests/vision-protocol-cards
 * executes it against the demo packed for real, so the page can only ever
 * show a snippet that runs.
 *
 * It is the reference's snippet with two `?.`: pictures and words are optional
 * layers (only `metadata.title` is required), and the house tape's last page
 * has no picture — the reference's `page.illustration.url` would throw there.
 */
export const PLAYER_SNIPPET = `import { unzipSync, strFromU8 } from 'fflate';
const files = unzipSync(tape);
const m = JSON.parse(strFromU8(files['manifest.json']));
for (const page of m.pages) {
  draw(files[page.illustration?.url], page.text?.content);
}`;

export type SnippetTokenKind = "keyword" | "string" | "call" | "plain";

export interface SnippetToken {
  kind: SnippetTokenKind;
  text: string;
}

const TOKEN = /('(?:[^'\\\n]|\\.)*')|\b(import|from|const|for|of)\b|\b([A-Za-z_$][\w$]*)(?=\()/g;

/**
 * The snippet split for colouring: keywords, string literals and called names;
 * everything else plain. Joined back, the tokens spell the input exactly.
 */
export function snippetTokens(code: string): SnippetToken[] {
  const tokens: SnippetToken[] = [];
  let last = 0;
  for (const match of code.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) tokens.push({ kind: "plain", text: code.slice(last, at) });
    const kind: SnippetTokenKind = match[1] ? "string" : match[2] ? "keyword" : "call";
    tokens.push({ kind, text: match[0] });
    last = at + match[0].length;
  }
  if (last < code.length) tokens.push({ kind: "plain", text: code.slice(last) });
  return tokens;
}
