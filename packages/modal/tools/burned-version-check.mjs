// Control for tools/skip-burned-versions.mjs.
//
// The plugin exists because 11.0.0 is unpublishable on npm (unpublished on
// magic-modal, occupied on react-native-magic-modal) while every version
// source in this repo says 10.1.1, so the next major computes exactly the
// version npm refuses. The failure mode of the guard itself is silence: if a
// release-it upgrade stops calling `getRecommendedVersion`, or the plugin
// falls out of the config, the pipeline goes right back to computing 11.0.0
// and nothing says so until a real release is rejected mid-publish.
//
// So this drives the REAL `.release-it.js` — not a copy, not the plugin in
// isolation — against a throwaway repo shaped like the hazard: package.json
// at 10.1.1, latest tag magic-modal-10.1.1, one synthetic breaking commit.
// Three things get checked:
//
//   1. the burned map says what the registry surgery decided: 11.0.0 -> 12.0.0
//   2. `release-it --release-version` through the real config prints 12.0.0
//      for a breaking commit, and an ordinary fix still prints 10.1.2 — the
//      guard only touches the poisoned result
//   3. the same repo through the raw @release-it/conventional-changelog
//      plugin, same options, prints 11.0.0 — proving the subclass is the
//      thing doing the work, and that the underlying bump math still lands on
//      the burned number. An assertion that cannot fail is worth nothing.
//
// The throwaway repo is deliberately private, so release-it's npm plugin
// skips its registry/auth checks and the whole run is hermetic. Its
// `latestVersion` still comes from package.json, same as the real release.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BURNED_VERSIONS } from "./skip-burned-versions.mjs";

const here = import.meta.dirname;
const realConfig = join(here, "..", ".release-it.js");
const attachReleaseBranch = join(here, "attach-release-branch.mjs");

// Resolved rather than assumed to sit at ../node_modules/.bin: pnpm hoists,
// and in a workspace the binary can land in the root store instead of the
// package. Resolve the package entry (lib/index.js) and walk to the bin.
const releaseItEntry = fileURLToPath(import.meta.resolve("release-it"));
const releaseItBin = join(
  dirname(releaseItEntry),
  "..",
  "bin",
  "release-it.js",
);

/**
 * Builds a throwaway repo shaped like the hazard — version 10.1.1 everywhere,
 * one release commit on top — and hands it to `run`. The bare "origin" exists
 * because release-it's git plugin refuses to run on a branch with no
 * upstream.
 *
 * @template T
 * @param {string} commitMessage
 * @param {(repo: string) => T | Promise<T>} run
 * @returns {Promise<T>}
 */
const inThrowawayRepo = async (commitMessage, run) => {
  const repo = mkdtempSync(join(tmpdir(), "magic-modal-burned-"));
  const origin = mkdtempSync(join(tmpdir(), "magic-modal-burned-origin-"));
  /** @param {string[]} args */
  const git = (...args) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: "pipe" });

  try {
    execFileSync("git", ["init", "--bare", "--quiet", origin]);
    git("init", "--quiet", "--initial-branch", "main");
    git("config", "user.email", "check@example.com");
    git("config", "user.name", "burned version check");
    writeFileSync(
      join(repo, "package.json"),
      JSON.stringify({
        name: "burned-version-check",
        version: "10.1.1",
        private: true,
      }),
    );
    git("add", ".");
    git("commit", "--quiet", "-m", "chore: initial");
    git("tag", "-a", "magic-modal-10.1.1", "-m", "magic-modal-10.1.1");
    git("remote", "add", "origin", origin);
    git("push", "--quiet", "--set-upstream", "origin", "main");
    git(
      "commit",
      "--quiet",
      "--allow-empty",
      "--cleanup=verbatim",
      "-m",
      commitMessage,
    );

    return await run(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(origin, { recursive: true, force: true });
  }
};

/**
 * What `release-it --release-version` prints for `commitMessage` under
 * `configPath`. Warnings can share stdout with the answer, so the version is
 * the last non-empty line.
 *
 * @param {string} commitMessage
 * @param {string} configPath
 * @param {{ detached?: boolean }} [options]
 * @returns {Promise<string>}
 */
const releaseVersionFor = (
  commitMessage,
  configPath,
  { detached = false } = {},
) =>
  inThrowawayRepo(commitMessage, (repo) => {
    if (detached) {
      const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repo,
        encoding: "utf8",
      }).trim();
      execFileSync("git", ["push", "--quiet", "origin", "main"], {
        cwd: repo,
        stdio: "pipe",
      });
      execFileSync("git", ["switch", "--detach", sourceSha], {
        cwd: repo,
        stdio: "pipe",
      });
      execFileSync(
        process.execPath,
        [attachReleaseBranch, sourceSha, "release-preparation-1-1"],
        { cwd: repo, stdio: "pipe" },
      );
    }

    const output = execFileSync(
      process.execPath,
      [releaseItBin, "--release-version", "--ci", "--config", configPath],
      { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return output.trim().split("\n").at(-1)?.trim() ?? "";
  });

const BREAKING =
  "feat(modal)!: synthetic breaking change\n\nBREAKING CHANGE: synthetic, never pushed anywhere";
const ORDINARY = "fix(modal): synthetic fix";

/** @type {string[]} */
const failures = [];
/**
 * @param {string} label
 * @param {boolean} condition
 */
const expect = (label, condition) => {
  if (!condition) failures.push(label);
};

// 1. The map states the policy the registry surgery decided.
expect(
  `the burned map skips 11.0.0 to 12.0.0 (got ${BURNED_VERSIONS["11.0.0"]})`,
  BURNED_VERSIONS["11.0.0"] === "12.0.0",
);

// 2. The real config remaps the major and leaves an ordinary fix alone.
const guardedMajor = await releaseVersionFor(BREAKING, realConfig);
expect(
  `a breaking commit over 10.1.1 releases 12.0.0 through the real config (got ${guardedMajor})`,
  guardedMajor === "12.0.0",
);

const guardedPatch = await releaseVersionFor(ORDINARY, realConfig);
expect(
  `a fix over 10.1.1 still releases 10.1.2 (got ${guardedPatch})`,
  guardedPatch === "10.1.2",
);

const detachedPatch = await releaseVersionFor(ORDINARY, realConfig, {
  detached: true,
});
expect(
  `a detached release checkout attaches safely and releases 10.1.2 (got ${detachedPatch})`,
  detachedPatch === "10.1.2",
);

// 3. Negative control: the raw plugin with the same options computes the
// burned 11.0.0. Written next to the real config so its relative import and
// the bare specifier both resolve; the plugin key is an absolute path for the
// same reason the real config's is — release-it resolves plugin names against
// the throwaway repo's cwd, where nothing is installed.
const controlConfig = join(
  here,
  "..",
  `.release-it-control.${process.pid}.mjs`,
);
writeFileSync(
  controlConfig,
  [
    'import { fileURLToPath } from "node:url";',
    "",
    'import real from "./.release-it.js";',
    "",
    "const ccPlugin = fileURLToPath(",
    '  import.meta.resolve("@release-it/conventional-changelog"),',
    ");",
    "",
    "export default {",
    "  ...real,",
    "  plugins: { [ccPlugin]: Object.values(real.plugins)[0] },",
    "};",
    "",
  ].join("\n"),
);

let unguardedMajor;
try {
  unguardedMajor = await releaseVersionFor(BREAKING, controlConfig);
} finally {
  rmSync(controlConfig, { force: true });
}

if (unguardedMajor !== "11.0.0") {
  console.error(
    `negative control FAILED: the raw plugin computed ${unguardedMajor}, not the burned 11.0.0, so the assertions above are not testing the guard.`,
  );
  process.exit(1);
}

if (failures.length > 0) {
  console.error("burned version check FAILED:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `burned version check passed (breaking over 10.1.1: guarded=${guardedMajor}, raw plugin=${unguardedMajor}; fix over 10.1.1: attached=${detachedPatch}, branch=${guardedPatch})`,
);
