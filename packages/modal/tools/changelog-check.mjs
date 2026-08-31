// Control for tools/changelog-preset.mjs.
//
// The preset decides which commit types reach the changelog and which of them
// can move the version, so the risk it carries is silent omission: mark a type
// hidden and its commits vanish with no error anywhere. A breaking change
// vanishing that way is the one failure this package cannot ship.
//
// POLICY below is written out longhand on purpose. Deriving it from the
// preset's own type list would make every assertion a tautology — hide a
// section and the check would just change its mind about what it expected. So
// the policy is stated here, the preset is asserted to match it, and the
// rendered output is asserted to match it too. Changing what reaches the
// changelog means changing both files, deliberately.
//
// Three things get checked:
//
//   1. the type list agrees with the policy
//   2. a synthetic history of every type renders the way the policy says,
//      including the `ci!:` case — `ci` is hidden and its breaking note still
//      has to surface
//   3. the recommended bump respects `effect`, so a release of nothing but
//      `build:` and `chore:` commits cannot come out a minor
//   4. a breaking note is only taken from a real footer, so prose that merely
//      starts a line with the words "breaking change" cannot compute a major
//
// Then it renders the same history through a sabotaged type list and fails if
// *that* passes. An assertion that cannot fail is worth nothing. (4) carries
// its own control of the same kind: a bulleted footer is re-run through
// upstream's default note pattern and has to come out a major there, which is
// what makes it a regression test rather than a restatement.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Bumper } from "conventional-recommended-bump";

import preset, { PARSER_OPTS, TYPES } from "./changelog-preset.mjs";

const here = import.meta.dirname;
const presetPath = join(here, "changelog-preset.mjs");
// Resolved rather than assumed to sit at ../node_modules/.bin: pnpm hoists, and
// in a workspace the binary can land in the root store instead of the package.
// The package exports no `./package.json`, so resolve its entry point and walk
// across to the CLI beside it.
const cliEntry = fileURLToPath(import.meta.resolve("conventional-changelog"));
const cliPath = join(dirname(cliEntry), "cli", "index.js");

/**
 * What each type is for. `bump` can raise the version, `changelog` renders
 * without raising it, `hidden` does neither.
 *
 * @type {Record<string, "bump" | "changelog" | "hidden">}
 */
const POLICY = {
  feat: "bump",
  feature: "bump",
  fix: "bump",
  perf: "bump",
  revert: "bump",
  build: "changelog",
  refactor: "changelog",
  chore: "changelog",
  docs: "changelog",
  ci: "hidden",
  style: "hidden",
  test: "hidden",
};

// One commit per type, plus three breaking ones spread across a bump type, a
// changelog type and a hidden type.
const COMMITS = [
  "feat: add a thing",
  "fix: correct a thing",
  "build: shrink the tarball",
  "refactor: rewrite the internals",
  "chore(deps): bump something",
  "docs: update the readme",
  "ci: tweak the workflow",
  "style: reformat",
  "test: add cases",
  "perf!: drop the slow path\n\nBREAKING CHANGE: the slow path is gone",
  "chore: retire the legacy loader\n\nBREAKING CHANGE: the legacy loader is gone",
  "ci!: require node 24\n\nBREAKING CHANGE: node 22 is no longer supported",
];

// Subject fragment -> the type it was committed under. Matching on subjects
// rather than section headings keeps the check working in a repo that renames
// its sections.
const SUBJECTS = {
  feat: "add a thing",
  fix: "correct a thing",
  build: "shrink the tarball",
  refactor: "rewrite the internals",
  chore: "bump something",
  docs: "update the readme",
  ci: "tweak the workflow",
  style: "reformat",
  test: "add cases",
};

const NOTES = {
  "a bump type (perf!)": "the slow path is gone",
  "a changelog type (chore!)": "the legacy loader is gone",
  "a HIDDEN type (ci!)": "node 22 is no longer supported",
};

/**
 * Builds a throwaway repo out of `commits` and hands it to `run`. Async on
 * purpose: `bumpFor` below is, and a synchronous `finally` would delete the
 * repo out from under it.
 *
 * `tag` says where v1.0.0 goes, and the two callers need different answers.
 * The renderer wants it last, so `--release-count 0` has a released section to
 * render — a chunk whose version matches the last tag comes out empty. The
 * bumper wants it first, so the commits are the range being measured.
 *
 * @template T
 * @param {string[]} commits
 * @param {"before" | "after"} tag
 * @param {(repo: string) => T | Promise<T>} run
 * @returns {Promise<T>}
 */
const inThrowawayRepo = async (commits, tag, run) => {
  const repo = mkdtempSync(join(tmpdir(), "magic-modal-changelog-"));
  /** @param {string[]} args */
  const git = (...args) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: "pipe" });

  try {
    git("init", "--quiet", "--initial-branch", "main");
    git("config", "user.email", "check@example.com");
    git("config", "user.name", "changelog check");
    writeFileSync(
      join(repo, "package.json"),
      JSON.stringify({ name: "changelog-check", version: "1.0.0" }),
    );
    git("add", ".");
    git("commit", "--quiet", "-m", "chore: initial");
    if (tag === "before") git("tag", "-a", "v1.0.0", "-m", "v1.0.0");

    for (const message of commits) {
      git(
        "commit",
        "--quiet",
        "--allow-empty",
        "--cleanup=verbatim",
        "-m",
        message,
      );
    }

    if (tag === "after") git("tag", "-a", "v1.0.0", "-m", "v1.0.0");

    return await run(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
};

/**
 * Renders COMMITS through a preset module and returns the changelog text.
 *
 * @param {string} configPath
 * @returns {Promise<string>}
 */
const render = (configPath) =>
  inThrowawayRepo(COMMITS, "after", (repo) =>
    execFileSync(
      process.execPath,
      [cliPath, "--config", configPath, "--release-count", "0", "--stdout"],
      { cwd: repo, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    ),
  );

/**
 * The release type conventional-recommended-bump lands on for `commits`, read
 * through the real preset. `null` means "nothing here warrants a release".
 *
 * `parserOpts` defaults to the shipped options and is only overridden by the
 * control in (4), which needs upstream's defaults to prove the strict note
 * pattern is the thing doing the work. Passing them explicitly mirrors
 * `.release-it.js`: `loadPreset` by name gets upstream's parser options, so
 * without this the check would be measuring a config the release never uses.
 *
 * @param {string[]} commits
 * @param {Record<string, unknown> | null} [parserOpts]
 * @returns {Promise<string | null>}
 */
const bumpFor = (commits, parserOpts = PARSER_OPTS) =>
  inThrowawayRepo(commits, "before", async (repo) => {
    const bumper = new Bumper(repo);
    bumper.loadPreset({ name: "conventionalcommits", types: TYPES });
    if (parserOpts) bumper.commits({}, parserOpts);
    // Same double cast .release-it.js needs: the preset publishes
    // `createPreset(config?): {}`, so its own return type doesn't describe the
    // `whatBump` it demonstrably returns. `bump()` is typed as a union whose
    // empty arm has no `releaseType`, which is the `null` case here.
    const { whatBump } =
      /** @type {{ whatBump: Parameters<Bumper["bump"]>[0] }} */ (
        /** @type {unknown} */ (await preset)
      );
    const recommendation = /** @type {{ releaseType?: string }} */ (
      await bumper.bump(whatBump)
    );
    return recommendation.releaseType ?? null;
  });

/** @type {string[]} */
const failures = [];
/**
 * @param {string} label
 * @param {boolean} condition
 */
const expect = (label, condition) => {
  if (!condition) failures.push(label);
};

// 1. The type list says what the policy says.
for (const [type, effect] of Object.entries(POLICY)) {
  const entry = TYPES.find((candidate) => candidate.type === type);
  expect(`${type} is in the type list`, entry !== undefined);
  expect(`${type} is "${effect}"`, entry?.effect === effect);
}
for (const entry of TYPES) {
  expect(`${entry.type} is covered by the policy`, entry.type in POLICY);
}

/**
 * 2. The rendered output says what the policy says.
 *
 * @param {string} output
 * @returns {string[]}
 */
const assessRendering = (output) => {
  /** @type {string[]} */
  const found = [];
  /**
   * @param {string} label
   * @param {boolean} condition
   */
  const check = (label, condition) => {
    if (!condition) found.push(label);
  };

  // Breaking changes render whatever type they hang off, hidden ones included.
  // The preset prefixes the heading with a warning sign, so match on the words.
  check("BREAKING CHANGES heading", /^### .*BREAKING CHANGES$/m.test(output));
  for (const [label, text] of Object.entries(NOTES)) {
    check(`breaking note on ${label}`, output.includes(text));
  }

  for (const [type, subject] of Object.entries(SUBJECTS)) {
    const shouldRender = POLICY[type] !== "hidden";
    check(
      shouldRender ? `${type} renders` : `${type} stays hidden`,
      output.includes(subject) === shouldRender,
    );
  }

  return found;
};

failures.push(...assessRendering(await render(presetPath)));

// 3. `effect` decides the bump, not just the rendering. The middle case is the
// one that matters: those four types all render, and none of them may push a
// release past a patch.
const bumps = {
  breaking: await bumpFor(["feat!: drop the old API"]),
  feature: await bumpFor(["feat: add a thing"]),
  fix: await bumpFor(["fix: correct a thing"]),
  changelogOnly: await bumpFor([
    "build: shrink the tarball",
    "refactor: rewrite the internals",
    "chore(deps): bump something",
    "docs: update the readme",
  ]),
  hiddenOnly: await bumpFor(["ci: tweak the workflow", "style: reformat"]),
};

expect("a breaking feat is a major", bumps.breaking === "major");
expect("a feat is a minor", bumps.feature === "minor");
expect("a fix is a patch", bumps.fix === "patch");
expect(
  `build/refactor/chore/docs alone do not bump (got ${bumps.changelogOnly})`,
  bumps.changelogOnly === null,
);
expect(
  `ci/style alone do not bump (got ${bumps.hiddenOnly})`,
  bumps.hiddenOnly === null,
);

// 4. A breaking note comes from a footer, not from prose.
//
// The body below is the shape that published 11.0.0. Squash-merging #336 put
// the PR description in the commit body re-wrapped at ~72 columns, and the wrap
// started a line with "breaking change on `style` typing.". Upstream's note
// pattern is case-insensitive and accepts a space where the colon belongs, so
// it read that as a footer and the release computed a major off a commit that
// said, in the same paragraph, that it was a minor.
//
// The `!` marker and a genuine uppercase footer both still have to work, or
// this would just be a switch that turns breaking changes off.
const PROSE_BODY = [
  "feat(modal): cut the web bundle by 83% going full DOM",
  "",
  "This is the companion to the rename, which has since shipped as v10.0.0;",
  "this lands on top of it as v10.1.0. It also carries the web-only",
  "breaking change on `style` typing.",
].join("\n");

const notes = {
  prose: await bumpFor([PROSE_BODY]),
  footer: await bumpFor([
    "feat: add a thing\n\nBREAKING CHANGE: the old API is gone",
  ]),
  hyphenFooter: await bumpFor([
    "feat: add a thing\n\nBREAKING-CHANGE: the old API is gone",
  ]),
  marker: await bumpFor(["feat!: drop the old API"]),
  // Both of these are why the pattern is anchored and case-sensitive. A
  // lowercase footer is a convention the writer did not follow, and an indented
  // or bulleted one is what quoting someone else's changelog produces.
  lowercaseFooter: await bumpFor([
    "feat: add a thing\n\nbreaking change: gone",
  ]),
  indentedFooter: await bumpFor([
    "feat: add a thing\n\n  BREAKING CHANGE: the old API is gone",
  ]),
  bulletedFooter: await bumpFor([
    "feat: add a thing\n\n* BREAKING CHANGE: the old API is gone",
  ]),
  bulletedFooterUnderDefaults: await bumpFor(
    ["feat: add a thing\n\n* BREAKING CHANGE: the old API is gone"],
    null,
  ),
};

expect(
  `wrapped prose starting "breaking change" is not a major (got ${notes.prose})`,
  notes.prose === "minor",
);
expect(
  "a real BREAKING CHANGE: footer is still a major",
  notes.footer === "major",
);
expect(
  "a real BREAKING-CHANGE: footer is still a major",
  notes.hyphenFooter === "major",
);
expect("a `!` subject marker is still a major", notes.marker === "major");
expect(
  `a lowercase "breaking change:" footer is not a major (got ${notes.lowercaseFooter})`,
  notes.lowercaseFooter === "minor",
);
expect(
  `an indented BREAKING CHANGE: is not a major (got ${notes.indentedFooter})`,
  notes.indentedFooter === "minor",
);
expect(
  `a bulleted BREAKING CHANGE: is not a major (got ${notes.bulletedFooter})`,
  notes.bulletedFooter === "minor",
);

// Control for the four assertions above. Under upstream's default note pattern
// the bulleted footer has to come out a major, or the strict pattern is not
// what is holding the line and these assertions prove nothing.
expect(
  `control: a bulleted footer computes a major under the default note pattern (got ${notes.bulletedFooterUnderDefaults})`,
  notes.bulletedFooterUnderDefaults === "major",
);

// The rendered changelog has to agree with the bump. A note the writer picks up
// prints a BREAKING CHANGES section whatever the bump did.
const proseRendering = await inThrowawayRepo([PROSE_BODY], "after", (repo) =>
  execFileSync(
    process.execPath,
    [cliPath, "--config", presetPath, "--release-count", "0", "--stdout"],
    { cwd: repo, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ),
);
expect(
  "wrapped prose renders no BREAKING CHANGES section",
  !/^### .*BREAKING CHANGES$/m.test(proseRendering),
);

if (failures.length > 0) {
  console.error("changelog preset check FAILED:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

// Negative control. Same commits, same assertions, a type list with every
// visible type forced to `hidden`. POLICY doesn't move, so hiding a section has
// to show up as a failure.
const sabotaged = TYPES.map((entry) =>
  entry.effect === "hidden" ? entry : { ...entry, effect: "hidden" },
);
// Written next to the real preset rather than in the temp dir so the bare
// `conventional-changelog-conventionalcommits` specifier still resolves.
const sabotagedPath = join(
  here,
  `.changelog-preset-sabotaged.${process.pid}.mjs`,
);
writeFileSync(
  sabotagedPath,
  'import createPreset from "conventional-changelog-conventionalcommits";\n' +
    `export default createPreset({ types: ${JSON.stringify(sabotaged)} });\n`,
);

let sabotagedFailures;
try {
  sabotagedFailures = assessRendering(await render(sabotagedPath));
} finally {
  rmSync(sabotagedPath, { force: true });
}

if (sabotagedFailures.length === 0) {
  console.error(
    "negative control FAILED: hiding every visible type changed nothing, so the assertions above are not testing anything.",
  );
  process.exit(1);
}

console.log(
  `changelog preset check passed (${COMMITS.length} synthetic commits, 3 breaking; bumps: feat!=${bumps.breaking}, feat=${bumps.feature}, fix=${bumps.fix}, changelog-only=${bumps.changelogOnly}, hidden-only=${bumps.hiddenOnly})`,
);
console.log(
  `note pattern check passed (prose=${notes.prose}, footer=${notes.footer}, hyphen-footer=${notes.hyphenFooter}, marker=${notes.marker}, lowercase=${notes.lowercaseFooter}, indented=${notes.indentedFooter}, bulleted=${notes.bulletedFooter}; control: bulleted footer under upstream defaults=${notes.bulletedFooterUnderDefaults})`,
);
console.log(
  `negative control passed (hiding the visible types breaks ${sabotagedFailures.length} assertions: ${sabotagedFailures.join(", ")})`,
);

// `--print` is for looking at the control by hand, which is the only way to
// judge the section names and ordering. The assertions above cannot.
if (process.argv.includes("--print")) {
  console.log("\n--- rendered through the real preset ---\n");
  console.log(await render(presetPath));
}
