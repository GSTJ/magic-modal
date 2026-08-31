import { spawnSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const outputDirectory = "public/r";
const directoryEntries = await readdir(outputDirectory);
const files = directoryEntries
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => join(outputDirectory, file));

if (files.length === 0) {
  throw new Error(`No registry JSON files found in ${outputDirectory}`);
}

const require = createRequire(import.meta.url);
const oxfmtPackage = require.resolve("oxfmt/package.json");
const oxfmtBin = join(dirname(oxfmtPackage), "bin", "oxfmt");
const formattedFiles = await Promise.all(
  files.map(async (file) => {
    const result = spawnSync(
      process.execPath,
      [oxfmtBin, `--stdin-filepath=${file}`],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        input: await readFile(file, "utf8"),
        stdio: ["pipe", "pipe", "inherit"],
      },
    );

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(`oxfmt failed for ${file} with status ${result.status}`);
    }

    return [file, result.stdout];
  }),
);

await Promise.all(
  formattedFiles.map(([file, contents]) => writeFile(file, contents)),
);
