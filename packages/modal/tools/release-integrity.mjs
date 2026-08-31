import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { releaseBoundary } from "./release-boundary.mjs";
import { TYPES } from "./release-types.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const modalManifestURL = new URL("../package.json", import.meta.url);
const shimManifestURL = new URL(
  "../../react-native-magic-modal/package.json",
  import.meta.url,
);
const rootManifestURL = new URL("../../../package.json", import.meta.url);
const changelogURL = new URL("../CHANGELOG.md", import.meta.url);

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const BREAKING_FOOTER = /^BREAKING(?:-| )CHANGE: /mu;
const CONVENTIONAL_SUBJECT = /^([a-zA-Z]+)(?:\(([^)]*)\))?(!)?:/u;
/** @typedef {{ author: string; body: string; sha?: string; subject: string }} ReleaseCommit */
/** @typedef {{ dependencies?: Record<string, string>; private?: boolean; version: string }} Manifest */

/** @param {string[]} args */
const git = (...args) =>
  execFileSync("git", args, {
    cwd: repoRoot,
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

/** @param {URL} url @returns {Promise<Manifest>} */
const readJSON = async (url) => JSON.parse(await readFile(url, "utf8"));

/** @param {string} changelog */
export const releaseHeadingVersion = (changelog) => {
  const match = changelog.match(/^## \[([^\]]+)\]/mu);
  return match?.[1] ?? "";
};

/** @param {string} changelog */
export const releaseNotes = (changelog) => {
  const firstHeading = changelog.search(/^## \[[^\]]+\].*$/mu);
  if (firstHeading === -1) return "";

  const afterHeading = changelog.indexOf("\n", firstHeading);
  if (afterHeading === -1) return "";

  const remainder = changelog.slice(afterHeading + 1);
  const nextHeading = remainder.search(/^## \[[^\]]+\].*$/mu);
  return (
    nextHeading === -1 ? remainder : remainder.slice(0, nextHeading)
  ).trim();
};

/** @param {ReleaseCommit} commit */
export const qualifiesForRelease = ({ author, subject, body }) => {
  const parsed = subject.match(CONVENTIONAL_SUBJECT);
  if (parsed?.[3] === "!") return true;
  if (!author.endsWith("[bot]") && BREAKING_FOOTER.test(body)) return true;
  if (parsed?.[2] !== "modal") return false;
  return TYPES.some(
    ({ effect, type }) => type === parsed[1] && effect === "bump",
  );
};

/** @param {{ requireTag?: boolean }} [options] */
const inspectTree = async ({ requireTag = false } = {}) => {
  const [root, modal, shim, changelog] = await Promise.all([
    readJSON(rootManifestURL),
    readJSON(modalManifestURL),
    readJSON(shimManifestURL),
    readFile(changelogURL, "utf8"),
  ]);

  assert.equal(root.private, true, "the workspace root must be private");
  assert.match(modal.version, VERSION, "magic-modal has an invalid version");
  assert.equal(
    shim.version,
    modal.version,
    "the real package and compatibility package must share a version",
  );
  assert.equal(
    shim.dependencies?.["magic-modal"],
    "workspace:*",
    "the compatibility package must publish an exact workspace dependency",
  );
  assert.equal(
    releaseHeadingVersion(changelog),
    modal.version,
    "the first changelog release must match both package manifests",
  );
  const currentHeadings = changelog.match(
    new RegExp(
      `^## \\[${modal.version.replaceAll(".", String.raw`\.`)}\\]`,
      "gmu",
    ),
  );
  assert.equal(
    currentHeadings?.length,
    1,
    `the changelog must contain exactly one ${modal.version} heading`,
  );
  assert.ok(
    releaseNotes(changelog),
    `the ${modal.version} changelog release must have notes`,
  );

  const tag = `magic-modal-${modal.version}`;
  const head = git("rev-parse", "HEAD");
  const tagCommit = tryGit("rev-parse", `${tag}^{commit}`);
  if (requireTag) {
    assert.equal(tagCommit, head, `${tag} must point at the publishing commit`);
  }

  return { version: modal.version, tag, head, tagCommit, changelog };
};

/** @param {string} name @param {string} version */
const isPublished = async (name, version) => {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(
      `npm registry returned ${response.status} for ${name}@${version}`,
    );
  }
  return true;
};

const commitsSinceBoundary = () => {
  const boundary = releaseBoundary({
    packageDirectory: fileURLToPath(new URL("../", import.meta.url)),
  });
  const range = `${boundary}..HEAD`;
  const output = git("log", range, "--format=%H%x1f%an%x1f%s%x1f%b%x1e");
  if (!output) return [];

  return output
    .split("\u001E")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha = "", author = "", subject = "", ...body] =
        record.split("\u001F");
      return { sha, author, subject, body: body.join("\u001F") };
    });
};

/** @param {Record<string, string | number | boolean>} outputs */
const writeOutputs = async (outputs) => {
  const text = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  console.log(text);
  // This is a release CLI, not application code. GitHub owns this path.
  // eslint-disable-next-line no-restricted-properties
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    await appendFile(githubOutput, `${text}\n`);
  }
};

const classify = async () => {
  const state = await inspectTree();
  const [modalPublished, shimPublished] = await Promise.all([
    isPublished("magic-modal", state.version),
    isPublished("react-native-magic-modal", state.version),
  ]);
  const subject = git("log", "-1", "--pretty=%s");
  const escapedVersion = state.version.replaceAll(".", String.raw`\.`);
  const prepared = new RegExp(
    `^chore\\(release\\): magic modal release v${escapedVersion}(?: \\(#\\d+\\))?$`,
    "u",
  ).test(subject);

  if (prepared) {
    if (state.tagCommit && state.tagCommit !== state.head) {
      throw new Error(
        `${state.tag} exists on ${state.tagCommit}, not ${state.head}`,
      );
    }
    await writeOutputs({
      mode: "publish",
      version: state.version,
      modal_published: modalPublished,
      shim_published: shimPublished,
    });
    return;
  }

  if (!modalPublished || !shimPublished) {
    const boundary = releaseBoundary({
      packageDirectory: fileURLToPath(new URL("../", import.meta.url)),
    });
    const boundarySubject = git("show", "-s", "--format=%s", boundary);
    assert.match(
      boundarySubject,
      new RegExp(
        `^chore\\(release\\): magic modal release v${escapedVersion}(?: \\(#\\d+\\))?$`,
        "u",
      ),
      `${state.version} is missing from npm, but its manifest boundary is not a prepared release commit`,
    );
    if (state.tagCommit && state.tagCommit !== boundary) {
      throw new Error(
        `${state.tag} exists on ${state.tagCommit}, not release boundary ${boundary}`,
      );
    }
    await writeOutputs({
      mode: "recover",
      release_sha: boundary,
      version: state.version,
      modal_published: modalPublished,
      shim_published: shimPublished,
    });
    return;
  }

  const qualifying = commitsSinceBoundary().filter(qualifiesForRelease);
  await writeOutputs({
    mode: qualifying.length > 0 ? "prepare" : "skip",
    version: state.version,
    qualifying_commits: qualifying.length,
  });
};

const selfTest = () => {
  assert.equal(
    qualifiesForRelease({
      author: "Gabriel",
      subject: "fix(modal): input",
      body: "",
    }),
    true,
  );
  assert.equal(
    qualifiesForRelease({
      author: "Gabriel",
      subject: "docs(modal): update the guide",
      body: "",
    }),
    false,
  );
  assert.equal(
    qualifiesForRelease({
      author: "Gabriel",
      subject: "fix: unscoped package fix",
      body: "",
    }),
    false,
  );
  assert.equal(
    qualifiesForRelease({
      author: "renovate[bot]",
      subject: "chore(deps): bump",
      body: "BREAKING CHANGE: quoted",
    }),
    false,
  );
  assert.equal(
    qualifiesForRelease({
      author: "seer[bot]",
      subject: "fix: quote upstream notes",
      body: "BREAKING CHANGE: quoted",
    }),
    false,
  );
  assert.equal(
    qualifiesForRelease({
      author: "Gabriel",
      subject: "docs: update",
      body: "BREAKING CHANGE: remove old API",
    }),
    true,
  );
  assert.equal(
    qualifiesForRelease({
      author: "Gabriel",
      subject: "docs: update",
      body: "A breaking change: prose",
    }),
    false,
  );
  assert.equal(
    releaseHeadingVersion("# Log\n\n## [10.2.1](url)\n\nFix\n"),
    "10.2.1",
  );
  assert.equal(
    releaseNotes("# Log\n\n## [10.2.1](url)\n\nFix\n\n## [10.2.0](url)\nOld\n"),
    "Fix",
  );
  console.log("release integrity self-test passed");
};

const command = process.argv[2] ?? "check";

if (command === "check") {
  const state = await inspectTree({
    requireTag: process.argv.includes("--tag"),
  });
  console.log(`release tree ${state.version} is internally consistent`);
} else if (command === "classify") {
  await classify();
} else if (command === "notes") {
  const { changelog } = await inspectTree();
  const notes = releaseNotes(changelog);
  assert.ok(notes, "the first changelog release has no notes");
  process.stdout.write(`${notes}\n`);
} else if (command === "self-test") {
  selfTest();
} else {
  throw new Error(`unknown release-integrity command: ${command}`);
}
