import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyPicomatch } from "./picomatch-security.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync("pnpm", ["audit", "--json"], {
  cwd: root,
  encoding: "utf8",
  timeout: 60000,
});
assert.ok(result.status === 0 || result.status === 1, result.stderr);
const audit = JSON.parse(result.stdout);
assert.ok(audit.metadata && audit.advisories, "Missing audit response");
const checked = new Set();
let paths = 0;
for (const finding of Object.values(audit.advisories)) {
  // There is no published fix. Accept this advisory only after checking every
  // installed dependency path against our exact patch and timeout regressions.
  assert.equal(
    finding.github_advisory_id,
    "GHSA-fc5q-39xc-vjpf",
    `Unmitigated advisory: ${finding.github_advisory_id}`,
  );
  assert.equal(finding.module_name, "picomatch");
  assert.ok(finding.findings.length > 0);
  for (const installed of finding.findings) {
    assert.ok(installed.paths.length > 0);
    for (const path of installed.paths) {
      const [importer, ...packages] = path.split(">");
      const importerPath = importer === "." ? "." : importer.replaceAll("__", "/");
      let entry = resolve(root, importerPath, "package.json");
      assert.ok(entry.startsWith(root), `Unexpected importer: ${importer}`);
      for (const name of packages) {
        // pnpm reports the upstream name for this workspace's npm alias.
        const installedName = name === "@fumadocs/base-ui" ? "fumadocs-ui" : name;
        const paths = createRequire(entry).resolve.paths(installedName) || [];
        const manifest = paths
          .map((path) => join(path, installedName, "package.json"))
          .find(existsSync);
        assert.ok(manifest, `Missing dependency ${name} in ${path}`);
        entry = realpathSync(manifest);
      }
      entry = createRequire(entry).resolve("./");
      const manifest = JSON.parse(readFileSync(join(dirname(entry), "package.json"), "utf8"));
      assert.equal(manifest.name, "picomatch");
      assert.equal(manifest.version, installed.version);
      if (!checked.has(entry)) {
        verifyPicomatch(entry, installed.version);
        checked.add(entry);
      }
      paths++;
    }
  }
}
console.log(
  `Audit passed: ${paths} locally patched picomatch paths, ${checked.size} installed copies. Raw registry advisory remains visible.`,
);
