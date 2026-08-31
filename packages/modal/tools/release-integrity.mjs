import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const modalManifestURL = new URL("../package.json", import.meta.url);
const shimManifestURL = new URL(
  "../../react-native-magic-modal/package.json",
  import.meta.url,
);
const rootManifestURL = new URL("../../../package.json", import.meta.url);
const changelogURL = new URL("../CHANGELOG.md", import.meta.url);

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const BREAKING_SUBJECT = /^[a-zA-Z]+(?:\([^)]*\))?!:/u;
const BREAKING_FOOTER = /^BREAKING(?:-| )CHANGE: /mu;
const BOT_AUTHORS = new Set([
  "renovate[bot]",
  "dependabot[bot]",
  "github-actions[bot]",
]);

const git = (...args) =>
  execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const tryGit = (...args) => {
  try {
    return git(...args);
  } catch {
    return "";
  }
};

const readJSON = async (url) => JSON.parse(await readFile(url, "utf8"));

export const releaseHeadingVersion = (changelog) => {
  const match = changelog.match(/^## \[([^\]]+)\]/mu);
  return match?.[1] ?? "";
};

export const releaseNotes = (changelog) => {
  const firstHeading = changelog.search(/^## \[[^\]]+\].*$/mu);
  if (firstHeading < 0) return "";

  const afterHeading = changelog.indexOf("\n", firstHeading);
  if (afterHeading < 0) return "";

  const remainder = changelog.slice(afterHeading + 1);
  const nextHeading = remainder.search(/^## \[[^\]]+\].*$/mu);
  return (nextHeading < 0 ? remainder : remainder.slice(0, nextHeading)).trim();
};

export const qualifiesForRelease = ({ author, subject, body }) => {
  if (/\(modal\)/u.test(subject) || BREAKING_SUBJECT.test(subject)) return true;
  return !BOT_AUTHORS.has(author) && BREAKING_FOOTER.test(body);
};

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

  const tag = `magic-modal-${modal.version}`;
  const head = git("rev-parse", "HEAD");
  const tagCommit = tryGit("rev-parse", `${tag}^{commit}`);
  if (requireTag) {
    assert.equal(tagCommit, head, `${tag} must point at the publishing commit`);
  }

  return { version: modal.version, tag, head, tagCommit, changelog };
};

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

const releaseBoundary = () => {
  const candidates = [
    tryGit("describe", "--tags", "--abbrev=0", "--match=magic-modal-*"),
    tryGit("log", "-1", "--pretty=%H", "--grep=^chore(release)"),
    tryGit("log", "-1", "--pretty=%H", "--grep=^chore(modal): sync version"),
  ].filter(Boolean);

  if (candidates.length === 0) return "";
  return candidates
    .map((candidate) => ({
      candidate,
      timestamp: Number(git("show", "-s", "--format=%ct", candidate)),
    }))
    .sort((left, right) => right.timestamp - left.timestamp)[0].candidate;
};

const commitsSinceBoundary = () => {
  const boundary = releaseBoundary();
  const range = boundary ? `${boundary}..HEAD` : "HEAD";
  const output = tryGit("log", range, "--format=%H%x1f%an%x1f%s%x1f%b%x1e");
  if (!output) return [];

  return output
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, author, subject, ...body] = record.split("\x1f");
      return { sha, author, subject, body: body.join("\x1f") };
    });
};

const writeOutputs = async (outputs) => {
  const text = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  console.log(text);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `${text}\n`);
  }
};

const classify = async () => {
  const state = await inspectTree();
  const [modalPublished, shimPublished] = await Promise.all([
    isPublished("magic-modal", state.version),
    isPublished("react-native-magic-modal", state.version),
  ]);
  const subject = git("log", "-1", "--pretty=%s");
  const escapedVersion = state.version.replaceAll(".", "\\.");
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
    throw new Error(
      `main is not a prepared release commit, but ${state.version} is missing from npm`,
    );
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
      author: "renovate[bot]",
      subject: "chore(deps): bump",
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
