/**
 * MagicBand — "Remember the magic?" (reference s01, the phone column), carried
 * over from /classic in Jon's words: why StorySync exists, then the wedge.
 *
 * Product copy, not story data — it lives here, verbatim from the reference.
 * Four lines, in order: the gold mono kicker, the Fraunces-italic h2, the quote
 * on its gold left rule, the label-yellow wedge. The landing places it right
 * after the two doors, under the tape-stripe seam, inside its scroll Reveal.
 * Static: nothing here moves. Styles live in landing-bands.css.
 */

/** The band's heading id — the landing labels its section with it. */
export const MAGIC_TITLE_ID = "ls-magic-title";

export function MagicBand() {
  return (
    <div className="ls-magic" data-ls="magic">
      <p className="ls-magic-kicker sk-font-meta">READ ALONG. LISTEN. FEEL.</p>
      <h2 id={MAGIC_TITLE_ID} className="ls-magic-title sk-font-tape">
        Remember the magic?
      </h2>
      <blockquote className="ls-magic-quote">
        <p>
          Library books with cassette tapes. Reading along while the narrator guided you page by
          page. Background music that made every story feel alive.
        </p>
      </blockquote>
      <p className="ls-magic-wedge sk-font-tape">
        Now any storybook can read itself — in the voice and mood you choose.
      </p>
    </div>
  );
}

export default MagicBand;
