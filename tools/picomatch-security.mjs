import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const hashes = {
  "2.3.2": "be4f6ac53e953aa6c02e6f6c1773b9d035f9c48ac227bd0587049a3a2d9fe936",
  "4.0.7": "5c04741270d46b2aa7aaf6797bfa9d0ea3f6e3318200dd3014a9e8db43110a12",
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
       a.equal(p('+(*(a))')('aaaa'), true);
       a.equal(p('+([ab])')('abba'), true);
       a.equal(p('src/**/*.ts')('src/a/b.ts'), true);`,
    ],
    { timeout: 3000, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || String(result.error));
}
