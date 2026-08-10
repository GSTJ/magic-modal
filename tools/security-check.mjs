import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const packageRoot = dirname(dirname(require.resolve("image-size")));

const checks = [
  {
    name: "ICNS zero-length entry",
    source: `
      const { ICNS } = require(${JSON.stringify(join(packageRoot, "dist/types/icns.js"))});
      const input = Buffer.alloc(16);
      input.write("icns", 0);
      input.writeUInt32BE(16, 4);
      input.write("ic07", 8);
      input.writeUInt32BE(0, 12);
      try {
        ICNS.calculate(input);
        throw new Error("malformed ICNS entry was accepted");
      } catch (error) {
        if (error.message !== "Invalid ICNS entry length") throw error;
      }
    `,
  },
  {
    name: "JXL zero-size box",
    source: `
      const { JXL } = require(${JSON.stringify(join(packageRoot, "dist/types/jxl.js"))});
      const input = Buffer.alloc(12);
      input.write("jxlp", 4);
      try {
        JXL.calculate(input);
      } catch (error) {
        if (error.message !== "Reached end of input") throw error;
      }
    `,
  },
  {
    name: "HEIF zero-size box",
    source: `
      const { HEIF } = require(${JSON.stringify(join(packageRoot, "dist/types/heif.js"))});
      const input = Buffer.alloc(8);
      input.write("junk", 4);
      try {
        HEIF.calculate(input);
      } catch (error) {
        if (error.message !== "Invalid HEIF, no size found") throw error;
      }
    `,
  },
];

for (const check of checks) {
  const result = spawnSync(process.execPath, ["--eval", check.source], {
    encoding: "utf8",
    timeout: 2_000,
  });

  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(`${check.name} still blocks the event loop`);
  }
  if (result.status !== 0) {
    throw new Error(`${check.name} failed:\n${result.stderr}`);
  }

  console.log(`PASS ${check.name}`);
}
