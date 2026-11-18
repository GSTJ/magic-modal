import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const hashes = {
  "2.3.2": "296547ec9d733720b648854bc52a4cfa1c255247336c10b0f6745433bd9e01f2",
  "4.0.7": "eddbd5fcdabdac7e5983ac07c955d2d0b1b5a2d2833cac88ca71cb4a4a6fa6a8",
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
       a.equal(p('src/**/*.ts')('src/a/b.ts'), true);
       for (const [glob, input] of [
         ['+(file?.ts)', 'file1.tsfile2.ts'],
         ['+("*")', '***'],
         ['+([[:alpha:]*])', 'a*a'],
       ]) a.equal(p(glob)(input), true, glob);
       const patterns = new Set();
       for (const body of ['*', '*a', 'a*', '?*', 'a?', '*(a)', '+(a)', '?(a)', '@(a)', '!(a)', '[a*]', '[ab]']) {
         for (const outer of ['+', '*']) {
           patterns.add(outer + '(' + body + ')b');
           for (const inner of ['@', '+', '*', '?', '!']) patterns.add(outer + '(' + inner + '(' + body + '))b');
         }
       }
       for (const extra of ['+([a]a*|c)b', '+(abc|abcabc)b', '+(@(a|aa))b', '+(@(a|a?))b', '+(@(@(*a)))b', '+([[]*a)b']) patterns.add(extra);
       for (const glob of patterns) {
         for (const input of ['a'.repeat(48)+'c', 'abc'.repeat(30)+'c', 'x'.repeat(48)+'c']) a.equal(p(glob)(input), false, glob);
       }`,
    ],
    { timeout: 3000, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || String(result.error));
}
