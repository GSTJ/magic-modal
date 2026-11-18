import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const hashes = {
  "2.3.2": "4b0501b3f04e1a7e67ef90b32dbc8cb383483be034cc8bfdafae002c60bf1b8a",
  "4.0.7": "a37aea8127ca5f932bcf3ba220efc35dd0fdcbb7a3892a5b0b5ee8feb8af7e22",
};

// Check the installed bytes as well as the public matcher. Each adversarial
// probe runs in a subprocess so a regression cannot hang the audit itself.
export function verifyPicomatch(entry, version) {
  assert.ok(Object.hasOwn(hashes, version), `Unpatched picomatch ${version}`);
  const parser = readFileSync(join(dirname(entry), "lib/parse.js"));
  assert.equal(
    createHash("sha256").update(parser).digest("hex"),
    hashes[version],
    `Unexpected picomatch parser: ${entry}`,
  );
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `const p = require(${JSON.stringify(entry)});
       const a = require('node:assert/strict');
       for (const glob of ['+(*)', '+(*a)', '*(*)', '*(*a)', '+(?*)']) {
         const match = p(glob + 'b');
         a.equal(match('a'.repeat(48) + 'c'), false);
         a.equal(match(glob + 'b'), true);
       }
       a.equal(p('+(a|b)')('abba'), true);
       a.equal(p('+([ab])')('abba'), true);
       a.equal(p('src/**/*.ts')('src/a/b.ts'), true);`,
    ],
    { timeout: 3000, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || String(result.error));
}
