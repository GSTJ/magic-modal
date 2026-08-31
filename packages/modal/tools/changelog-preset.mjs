// The commit types that reach the changelog, and which of them can move the
// version. `.release-it.js` and `tools/changelog-check.mjs` both import this
// list, so the check can't pass against a policy the release doesn't use.
//
// Section names are this repo's own. They are what the shipped release bodies
// use, and renaming them would make CHANGELOG.md read as two projects.
//
// What changed, and why:
//
//   `effect` replaces `hidden`. conventional-changelog-conventionalcommits 10
//   reads `effect` and nothing else — `hidden: true` is dead config there. So
//   `chore` was never actually hidden. The 9.0.1 release body lists 20
//   dependency and CI chores under ":curly_loop: What a drag! :curly_loop:",
//   off an entry this file marked `hidden: true`. The list now says what the
//   generator does.
//
//   `build` and `docs` were absent from the list entirely, and a type the list
//   doesn't mention is discarded, so 9.0.1 shipped without the two `docs(ci)`
//   commits in its range (#298 and #300). Both types change what ships:
//   `dist/` is the whole tarball and bunchee's config decides its contents,
//   and README.md is packed alongside it.
//
//   `ci`, `style` and `test` move to hidden. `files` is `["dist"]`, so
//   `.github/`, source formatting and `src/**` tests cannot reach a consumer.
//   `ci` in particular was rendering its own section while the dependency
//   chores that actually move `dist/` were meant to be hidden, which is
//   backwards.
//
//   The `breaking` entry is gone. `breaking:` is not a conventional-commits
//   type, no commit in this repo has ever used it, and the section it pointed
//   at is not the one breaking changes render under — the writer hardcodes
//   that heading and reaches it from a note, not from a type.
//
// The bump/changelog split is the point of `effect`. Only `feat`, `fix`,
// `perf` and `revert` can raise a version. `build`, `refactor`, `chore` and
// `docs` render without bumping, so a month of dependency chores is still a
// patch. This repo has published two wrong majors off a miscomputed bump
// (8.0.0 and 9.0.0, see the tagOpts comment in .release-it.js), and the
// pipeline publishes to npm with no human in the loop, so widening what
// renders must not widen what bumps.
//
// Breaking changes are not configurable here and don't need to be. The
// preset's writer sets `discard = false` the moment a commit carries a note,
// so a `BREAKING CHANGE:` footer or a `!` renders its own section whatever
// type it hangs off, hidden ones included. tools/changelog-check.mjs is the
// control for that.
//
// What *is* configurable, and had to be: how a note gets recognised in the
// first place. See NOTES_PATTERN below.
import createPreset from "conventional-changelog-conventionalcommits";

export { TYPES } from "./release-types.mjs";
import { TYPES } from "./release-types.mjs";

// How a breaking-change note is recognised, and the reason this file overrides
// it at all.
//
// conventional-commits-parser's default is built from the note keywords and is
// deliberately forgiving:
//
//   /^[\s|*]*(BREAKING CHANGE|BREAKING-CHANGE)[:\s]+(.*)/i
//
// Two things in there are a trap. The `i` flag means lowercase prose counts,
// and `[:\s]+` means a plain space counts in place of the colon. Together they
// promote any line that merely *begins* with the words "breaking change" to a
// footer, and one note is all it takes to compute a major.
//
// That is not hypothetical. `feat(modal): cut the web bundle by 83%` (#336) was
// squash-merged with its PR description as the body, re-wrapped at ~72 columns.
// The wrap put this at the start of a line:
//
//   breaking change on `style` typing.
//
// The default pattern matched it, took "on `style` typing." as the note text,
// and release-it computed a major off a commit whose description said in prose
// that it was a minor. magic-modal 11.0.0 and react-native-magic-modal 11.0.0
// went to npm from a pipeline with no human in the loop. A published version
// can't be taken back, so 11.0.0 stays on the registry, deprecated, and the
// same commit was republished as 10.1.0 (then 10.1.1, which fixed the readme
// the manual publish had dropped).
//
// So a note has to look like an actual conventional-commits footer:
//
//   - uppercase `BREAKING CHANGE` or `BREAKING-CHANGE`, no `i` flag
//   - a mandatory colon and a mandatory space after it
//   - at the very start of the line, with no leading whitespace or bullet
//     markers, because a wrapped paragraph and a quoted changelog both
//     routinely produce indented and `*`-prefixed lines
//
// This only narrows what counts as a *footer*. `feat!:` and `fix(deps)!:` go
// through `breakingHeaderPattern` instead and are untouched, so the subject
// marker is still the ordinary way to declare a breaking change and still
// forces a major on its own.
//
// The trade is deliberate: a real footer written as `breaking change: x` in
// lowercase now computes a minor instead of a major. That is a version too low
// on a commit whose author ignored the convention, against a wrong major on a
// commit that did nothing wrong. This repo has published three wrong majors
// (8.0.0, 9.0.0, 11.0.0) and zero wrong minors, and only one of those is
// recoverable.
//
// `notesPattern` is a function of the joined keywords rather than a bare
// RegExp: that is the shape conventional-commits-parser asks for. Both groups
// are capturing and the order is fixed by the parser, which reads `[1]` as the
// note's title and `[2]` as its text. Making the keyword group non-capturing
// silently shifts the text into `[1]` and leaves every note with an undefined
// body, which renders as an empty BREAKING CHANGES bullet.
export const NOTES_PATTERN = (/** @type {string} */ keywords) =>
  new RegExp(`^(${keywords}): (.*)`);

// The same double cast `.release-it.js` needs, for the same reason: the preset
// publishes `createPreset(config?): {}`, so its own return type describes
// neither the `parser` it demonstrably returns nor the `whatBump` beside it.
const preset = /** @type {{ parser: Record<string, unknown> }} */ (
  /** @type {unknown} */ (createPreset({ types: TYPES }))
);

/**
 * The preset's parser options with the strict note pattern applied.
 *
 * Exported because the preset object below is only half the story. Anything
 * that loads the preset *by name* — `.release-it.js` via the plugin's
 * `preset: { name: "conventionalcommits" }`, and `changelog-check.mjs` via
 * `bumper.loadPreset(...)` — gets upstream's parser options, not these. Both
 * pass this explicitly so all three paths parse identically. Merging is safe:
 * `conventional-recommended-bump` and `conventional-changelog` both spread
 * incoming parser params over the preset's.
 */
export const PARSER_OPTS = { ...preset.parser, notesPattern: NOTES_PATTERN };

/**
 * The upstream preset with the strict note pattern in place. This is what the
 * `conventional-changelog` CLI loads via `--config`, which is how
 * `tools/changelog-check.mjs` renders.
 */
const strictPreset = { ...preset, parser: PARSER_OPTS };

export default strictPreset;
