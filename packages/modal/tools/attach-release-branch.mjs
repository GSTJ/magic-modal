import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const [sourceSha = "", branchName = ""] = process.argv.slice(2);
const SHA = /^[0-9a-f]{40}$/u;
const BRANCH = /^release-preparation-[1-9]\d*-[1-9]\d*$/u;

/** @param {string[]} args */
const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

/** @param {string[]} args */
const tryGit = (...args) => {
  try {
    return git(...args);
  } catch {
    return "";
  }
};

assert.match(sourceSha, SHA, "the release source must be a full commit SHA");
assert.match(
  branchName,
  BRANCH,
  "the local release branch has an invalid name",
);
assert.equal(
  git("rev-parse", "HEAD"),
  sourceSha,
  "HEAD moved after classification",
);
assert.equal(
  tryGit("symbolic-ref", "--quiet", "HEAD"),
  "",
  "the release checkout must start detached",
);
assert.equal(
  git("rev-parse", "origin/main"),
  sourceSha,
  "origin/main does not match the classified source",
);
assert.equal(
  tryGit("show-ref", "--verify", `refs/heads/${branchName}`),
  "",
  `${branchName} already exists`,
);

git("switch", "--create", branchName, sourceSha);
git("branch", "--set-upstream-to=origin/main", branchName);

assert.equal(
  git("rev-parse", "HEAD"),
  sourceSha,
  "the local branch moved HEAD",
);
assert.equal(
  git("symbolic-ref", "HEAD"),
  `refs/heads/${branchName}`,
  "HEAD is still detached",
);
assert.equal(
  git("rev-parse", "@{upstream}"),
  sourceSha,
  "the local branch does not track the classified main commit",
);

console.log(`release preparation attached to ${branchName} at ${sourceSha}`);
