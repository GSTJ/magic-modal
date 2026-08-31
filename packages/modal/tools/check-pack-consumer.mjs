import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const packageDirectory = resolve(import.meta.dirname, "..");
const workspaceDirectory = resolve(packageDirectory, "../..");
const fixture = mkdtempSync(join(tmpdir(), "magic-modal-pack-consumer-"));
const packageInstall = join(fixture, "node_modules/magic-modal");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

/** @param {string} name */
const linkWorkspacePackage = (name) => {
  const source = join(workspaceDirectory, "node_modules", name);
  const destination = join(fixture, "node_modules", name);
  mkdirSync(dirname(destination), { recursive: true });
  symlinkSync(
    source,
    destination,
    process.platform === "win32" ? "junction" : "dir",
  );
};

try {
  /** @type {string} */
  const packOutput = execFileSync(
    pnpm,
    ["pack", "--pack-destination", fixture],
    {
      cwd: packageDirectory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const archive = packOutput
    .trim()
    .split("\n")
    .find((line) => line.endsWith(".tgz"));

  if (!archive)
    throw new Error(`pnpm pack returned no archive:\n${packOutput}`);

  mkdirSync(packageInstall, { recursive: true });
  execFileSync(
    "tar",
    ["-xzf", archive, "--strip-components=1", "-C", packageInstall],
    { stdio: "pipe" },
  );

  for (const dependency of [
    "@types/react",
    "react",
    "react-native",
    "react-native-gesture-handler",
    "react-native-reanimated",
    "react-native-screens",
    "react-native-worklets",
  ]) {
    linkWorkspacePackage(dependency);
  }

  writeFileSync(
    join(fixture, "consumer.ts"),
    'import { magicModal } from "magic-modal";\nexport const modal = magicModal;\n',
  );

  for (const [target, customConditions] of [
    ["web", []],
    ["react-native", ["react-native"]],
  ]) {
    const outDir = join(fixture, `types-${target}`);
    const config = join(fixture, `tsconfig.${target}.json`);
    writeFileSync(
      config,
      JSON.stringify({
        compilerOptions: {
          customConditions,
          declaration: true,
          emitDeclarationOnly: true,
          module: "NodeNext",
          moduleResolution: "NodeNext",
          outDir,
          skipLibCheck: true,
          strict: true,
          target: "ES2022",
        },
        files: ["consumer.ts"],
      }),
    );

    execFileSync(
      process.execPath,
      [
        join(workspaceDirectory, "node_modules/typescript/bin/tsc"),
        "-p",
        config,
      ],
      { cwd: fixture, stdio: "pipe" },
    );

    const declaration = readFileSync(join(outDir, "consumer.d.ts"), "utf8");
    if (!declaration.includes("export declare const modal:")) {
      throw new Error(
        `${target} consumer emitted no public modal declaration.`,
      );
    }
  }

  console.log(
    "✓ Packed declarations: web and React Native consumers emit cleanly",
  );
} finally {
  rmSync(fixture, { force: true, recursive: true });
}
