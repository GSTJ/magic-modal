import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** @param {string} cwd @param {string[]} args */
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

/** @param {string} cwd @param {string} commit @param {string} path */
const manifestAt = (cwd, commit, path) => {
  try {
    return JSON.parse(git(cwd, "show", `${commit}:${path}`));
  } catch {
    return null;
  }
};

// Find the reviewed main commit that introduced the version in package.json.
// Commit subjects and bodies are deliberately irrelevant: squash bodies can
// contain arbitrary contributor text, so they cannot define a release boundary.
/** @param {{ packageDirectory: string }} options */
export const releaseBoundary = ({ packageDirectory }) => {
  /** @type {{ version: string }} */
  const current = JSON.parse(
    readFileSync(join(packageDirectory, "package.json"), "utf8"),
  );
  const repoRoot = git(packageDirectory, "rev-parse", "--show-toplevel");
  const manifestPath = relative(
    repoRoot,
    join(packageDirectory, "package.json"),
  )
    .split(sep)
    .join("/");
  const commits = git(
    repoRoot,
    "rev-list",
    "--first-parent",
    "HEAD",
    "--",
    manifestPath,
  ).split("\n");

  for (const commit of commits) {
    const manifest = manifestAt(repoRoot, commit, manifestPath);
    if (manifest?.version === current.version) {
      const parent = manifestAt(repoRoot, `${commit}^`, manifestPath);
      if (parent?.version !== current.version) {
        assert.match(
          commit,
          /^[0-9a-f]{40}$/u,
          "release boundary is not a commit SHA",
        );
        git(repoRoot, "merge-base", "--is-ancestor", commit, "HEAD");
        return commit;
      }
    }
  }

  throw new Error(
    `no first-parent release boundary found for ${current.version}`,
  );
};
