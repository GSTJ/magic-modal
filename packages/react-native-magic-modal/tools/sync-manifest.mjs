// This package exists to make `react-native-magic-modal` and `magic-modal` the
// same install. That only holds if three things stay identical: the version,
// the peer dependency ranges, and which of those peers are optional.
//
// The version matters because the dependency below is `workspace:*`, which pnpm
// rewrites at pack time to the exact version of the linked workspace package.
// Publishing the shim at 10.0.0 with a `magic-modal` dependency pinned to
// 10.0.0 is the lockstep. A stale shim version would publish a duplicate of an
// already-released version number and fail, or worse, succeed with the wrong
// contents.
//
// The peers matter because npm surfaces a missing peer differently for a direct
// dependency than for a transitive one, and because `react-native-screens` is
// optional. Someone who installs the old name should see exactly the warnings
// they saw before the rename.
//
// Run with `--check` (what `pnpm test` does) to fail on drift, or `--write`
// (what the release preparation workflow does) to fix it before opening the
// version PR.
import { readFile, writeFile } from "node:fs/promises";

const shimManifestURL = new URL("../package.json", import.meta.url);
const realManifestURL = new URL("../../modal/package.json", import.meta.url);

// Everything the two manifests have to agree on. Fields not listed here are the
// shim's own — the description and the build scripts differ on purpose.
const MIRRORED_FIELDS = ["version", "peerDependencies", "peerDependenciesMeta"];

/**
 * @param {URL} url
 * @returns {Promise<Record<string, unknown>>}
 */
const readManifest = async (url) =>
  JSON.parse(await readFile(url, { encoding: "utf8" }));

/**
 * @returns {Promise<{ drift: string[]; real: Record<string, unknown>; shim: Record<string, unknown> }>}
 */
export const inspectManifests = async () => {
  const [real, shim] = await Promise.all([
    readManifest(realManifestURL),
    readManifest(shimManifestURL),
  ]);

  const drift = MIRRORED_FIELDS.filter(
    (field) => JSON.stringify(shim[field]) !== JSON.stringify(real[field]),
  );

  return { drift, real, shim };
};

/**
 * Copies the mirrored fields onto the shim's manifest.
 *
 * @returns {Promise<string[]>} the fields that were out of sync, empty when
 *   nothing had to change.
 */
export const syncManifest = async () => {
  const { drift, real, shim } = await inspectManifests();
  if (drift.length === 0) return drift;

  for (const field of drift) shim[field] = real[field];

  // The repo formats package.json with two spaces and a trailing newline.
  // oxfmt does not touch JSON, so matching it here is what keeps the release
  // commit free of unrelated reformatting.
  await writeFile(shimManifestURL, `${JSON.stringify(shim, null, 2)}\n`);
  return drift;
};

const main = async () => {
  const write = process.argv.includes("--write");

  if (write) {
    const synced = await syncManifest();
    const { real } = await inspectManifests();
    console.log(
      synced.length === 0
        ? `react-native-magic-modal already matches magic-modal ${real.version}.`
        : `Synced ${synced.join(", ")} from magic-modal ${real.version}.`,
    );
    return;
  }

  const { drift, real, shim } = await inspectManifests();
  if (drift.length > 0) {
    console.error(
      [
        "react-native-magic-modal has drifted from magic-modal.",
        `  shim: ${shim.version}`,
        `  real: ${real.version}`,
        `  fields out of sync: ${drift.join(", ")}`,
        "",
        "Run `node tools/sync-manifest.mjs --write` from packages/react-native-magic-modal.",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  console.log(`✓ react-native-magic-modal mirrors magic-modal ${real.version}`);
};

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  await main();
}
