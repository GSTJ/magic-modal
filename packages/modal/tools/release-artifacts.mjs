import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const metadataName = "release-artifacts.json";
const npmRegistry = "https://registry.npmjs.org/";
const provenancePredicate = "https://slsa.dev/provenance/v1";
const githubActionsBuildType =
  "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1";
const sigstoreBundleType = "application/vnd.dev.sigstore.bundle.v0.3+json";
const inTotoPayloadType = "application/vnd.in-toto+json";

/** @typedef {{ dependencies?: Record<string, string>; name: string; version: string }} PackageManifest */
/** @typedef {{ file: string; integrity: string; name: string; sha256: string; sha512: string; version: string }} ReleaseArtifact */
/** @typedef {{ artifacts: ReleaseArtifact[]; commit: string; ref: string | null; repository: string | null; version: string; workflow: string }} ReleaseMetadata */
/** @typedef {{ dist?: { attestations?: { url?: string }; integrity?: string } }} RegistryManifest */
/** @typedef {{ attestations?: Array<{ bundle: { dsseEnvelope: { payload: string } }; predicateType?: string }> }} AttestationDocument */
/** @typedef {{ _type?: string; predicate?: { buildDefinition?: { buildType?: string; externalParameters?: { workflow?: { path?: string; ref?: string; repository?: string } }; internalParameters?: { github?: { event_name?: string } }; resolvedDependencies?: Array<{ digest?: { gitCommit?: string }; uri?: string }> }; runDetails?: { builder?: { id?: string }; metadata?: { invocationId?: string } } }; predicateType?: string; subject?: Array<{ digest?: { sha512?: string }; name?: string }> }} ProvenanceStatement */
/** @typedef {{ packages?: Record<string, { dependencies?: Record<string, string>; integrity?: string; resolved?: string; version?: string }> }} PackageLock */
/** @typedef {{ invalid?: unknown[]; missing?: unknown[]; verified?: VerifiedSignature[] }} SignatureReport */
/** @typedef {{ attestationBundles?: Array<{ bundle?: { dsseEnvelope?: { payload?: string; payloadType?: string; signatures?: Array<{ sig?: string }> }; mediaType?: string; verificationMaterial?: { certificate?: { rawBytes?: string }; tlogEntries?: unknown[] } }; predicateType?: string }>; attestations?: { provenance?: { predicateType?: string } }; location?: string; name?: string; registry?: string; version?: string }} VerifiedSignature */

const packages = [
  { name: "magic-modal", directory: join(repoRoot, "packages/modal") },
  {
    name: "react-native-magic-modal",
    directory: join(repoRoot, "packages/react-native-magic-modal"),
  },
];

/** @param {string[]} args */
const git = (...args) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();

/**
 * @param {string} algorithm
 * @param {Buffer} bytes
 * @param {import("node:crypto").BinaryToTextEncoding} encoding
 */
const digest = (algorithm, bytes, encoding) =>
  createHash(algorithm).update(bytes).digest(encoding);

/** @param {string} file @returns {PackageManifest} */
const tarManifest = (file) =>
  JSON.parse(
    execFileSync("tar", ["-xOf", file, "package/package.json"], {
      encoding: "utf8",
    }),
  );

/** @param {string} file */
const tarEntries = (file) =>
  execFileSync("tar", ["-tzf", file], { encoding: "utf8" }).trim().split("\n");

/** @param {PackageManifest} manifest @param {string} name @param {string} version */
const assertManifest = (manifest, name, version) => {
  assert.equal(
    manifest.name,
    name,
    `${name} tarball has the wrong package name`,
  );
  assert.equal(
    manifest.version,
    version,
    `${name} tarball has the wrong version`,
  );
  if (name === "react-native-magic-modal") {
    assert.equal(
      manifest.dependencies?.["magic-modal"],
      version,
      "the compatibility tarball must depend on the exact real package version",
    );
  }
};

/**
 * @param {string} directory
 * @param {string} fileName
 * @param {string} name
 * @param {string} version
 * @returns {Promise<ReleaseArtifact>}
 */
const inspectTarball = async (directory, fileName, name, version) => {
  const file = join(directory, fileName);
  const bytes = await readFile(file);
  const manifest = tarManifest(file);
  assertManifest(manifest, name, version);
  const entries = tarEntries(file);
  assert.ok(
    entries.some((entry) => entry.startsWith("package/dist/")),
    `${name} tarball has no built output`,
  );
  if (name === "magic-modal") {
    assert.ok(
      entries.includes("package/README.md"),
      "magic-modal tarball has no README",
    );
  }
  return {
    name,
    version,
    file: fileName,
    sha256: digest("sha256", bytes, "hex"),
    sha512: digest("sha512", bytes, "hex"),
    integrity: `sha512-${digest("sha512", bytes, "base64")}`,
  };
};

/** @param {string} directory */
const pack = async (directory) => {
  await mkdir(directory, { recursive: true });
  /** @type {PackageManifest} */
  const modalManifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  for (const item of packages) {
    execFileSync("pnpm", ["pack", "--pack-destination", directory], {
      cwd: item.directory,
      stdio: "inherit",
    });
  }
  const artifacts = await Promise.all(
    packages.map((item) =>
      inspectTarball(
        directory,
        `${item.name}-${modalManifest.version}.tgz`,
        item.name,
        modalManifest.version,
      ),
    ),
  );

  // This release CLI runs only in GitHub Actions; no application env module is
  // available or useful here.
  // eslint-disable-next-line no-restricted-properties
  const githubRepository = process.env.GITHUB_REPOSITORY;
  // eslint-disable-next-line no-restricted-properties
  const githubRef = process.env.GITHUB_REF;

  /** @type {ReleaseMetadata} */
  const metadata = {
    version: modalManifest.version,
    commit: git("rev-parse", "HEAD"),
    repository: githubRepository
      ? `https://github.com/${githubRepository}`
      : null,
    ref: githubRef ?? null,
    workflow: ".github/workflows/release.yml",
    artifacts,
  };
  await writeFile(
    join(directory, metadataName),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  console.log(`packed ${artifacts.length} verified release tarballs`);
};

/** @param {string} directory @returns {Promise<ReleaseMetadata>} */
const verify = async (directory) => {
  /** @type {ReleaseMetadata} */
  const metadata = JSON.parse(
    await readFile(join(directory, metadataName), "utf8"),
  );
  const [modalText, shimText, changelog] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(
      new URL("../../react-native-magic-modal/package.json", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8"),
  ]);
  /** @type {PackageManifest} */
  const modal = JSON.parse(modalText);
  /** @type {PackageManifest} */
  const shim = JSON.parse(shimText);
  assert.match(
    metadata.commit,
    /^[0-9a-f]{40}$/u,
    "artifact commit is invalid",
  );
  assert.equal(
    metadata.commit,
    git("rev-parse", "HEAD"),
    "artifact commit drifted",
  );
  assert.equal(
    metadata.version,
    modal.version,
    "artifact version drifted from magic-modal",
  );
  assert.equal(
    metadata.version,
    shim.version,
    "artifact version drifted from the compatibility package",
  );
  assert.equal(
    changelog.match(/^## \[([^\]]+)\]/mu)?.[1],
    metadata.version,
    "artifact version drifted from the changelog",
  );
  const currentHeadings = changelog.match(
    new RegExp(
      `^## \\[${metadata.version.replaceAll(".", String.raw`\.`)}\\]`,
      "gmu",
    ),
  );
  assert.equal(
    currentHeadings?.length,
    1,
    `the changelog must contain exactly one ${metadata.version} heading`,
  );
  assert.equal(
    metadata.artifacts.length,
    packages.length,
    "artifact count drifted",
  );
  assert.deepEqual(
    metadata.artifacts.map(({ name }) => name).sort(),
    packages.map(({ name }) => name).sort(),
    "artifact package set drifted",
  );
  for (const artifact of metadata.artifacts) {
    assert.equal(
      artifact.file,
      basename(artifact.file),
      "artifact path is unsafe",
    );
    assert.equal(
      artifact.file,
      `${artifact.name}-${metadata.version}.tgz`,
      `${artifact.name} has an unexpected artifact filename`,
    );
  }
  const actualArtifacts = await Promise.all(
    metadata.artifacts.map((artifact) =>
      inspectTarball(directory, artifact.file, artifact.name, metadata.version),
    ),
  );
  for (const [index, actual] of actualArtifacts.entries()) {
    const artifact = metadata.artifacts[index];
    assert.ok(artifact, "artifact verification index drifted");
    assert.deepEqual(
      actual,
      artifact,
      `${artifact.name} tarball changed after packing`,
    );
  }
  return metadata;
};

/** @param {string | undefined} value @param {string} message */
const decodeBase64 = (value, message) => {
  assert.ok(value, message);
  const bytes = Buffer.from(value, "base64");
  assert.ok(bytes.length > 0, message);
  return bytes;
};

/** @param {string} integrity */
const sriSha512 = (integrity) => {
  assert.match(integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/u);
  return decodeBase64(
    integrity.slice("sha512-".length),
    "sha512 integrity is empty",
  ).toString("hex");
};

/**
 * @param {ProvenanceStatement["predicate"]} predicate
 * @param {ReleaseMetadata} metadata
 */
const assertProvenanceBuild = (predicate, metadata) => {
  const build = predicate?.buildDefinition;
  const workflow = build?.externalParameters?.workflow;
  assert.equal(build?.buildType, githubActionsBuildType);
  assert.equal(workflow?.repository, metadata.repository);
  assert.equal(workflow?.path, metadata.workflow);
  assert.equal(workflow?.ref, metadata.ref);
  assert.equal(
    build?.internalParameters?.github?.event_name,
    "workflow_dispatch",
  );

  const source = `git+${metadata.repository}@${metadata.ref}`;
  const dependencies = (build?.resolvedDependencies ?? []).filter(
    (dependency) =>
      dependency.uri === source &&
      dependency.digest?.gitCommit === metadata.commit,
  );
  assert.equal(
    dependencies.length,
    1,
    "provenance does not resolve the canonical release ref to its commit",
  );
};

/**
 * @param {ProvenanceStatement} statement
 * @param {ReleaseArtifact} artifact
 * @param {ReleaseMetadata} metadata
 * @param {string} integrity
 */
const assertProvenanceSubject = (statement, artifact, metadata, integrity) => {
  const subjectName = `pkg:npm/${artifact.name}@${metadata.version}`;
  const subjects = (statement.subject ?? []).filter(
    (subject) => subject.name === subjectName,
  );
  assert.equal(subjects.length, 1, "provenance has no unique package subject");
  assert.equal(subjects[0]?.digest?.sha512, artifact.sha512);
  assert.equal(subjects[0]?.digest?.sha512, sriSha512(integrity));
};

/** @param {ProvenanceStatement["predicate"]} predicate */
const assertProvenanceRun = (predicate) => {
  assert.equal(
    predicate?.runDetails?.builder?.id,
    "https://github.com/actions/runner/github-hosted",
  );
  assert.match(
    predicate?.runDetails?.metadata?.invocationId ?? "",
    /^https:\/\/github\.com\/GSTJ\/magic-modal\/actions\/runs\/[1-9]\d*\/attempts\/[1-9]\d*$/u,
  );
};

/**
 * @param {ProvenanceStatement} statement
 * @param {ReleaseArtifact} artifact
 * @param {ReleaseMetadata} metadata
 * @param {string} integrity
 */
const assertProvenanceStatement = (
  statement,
  artifact,
  metadata,
  integrity,
) => {
  assert.equal(statement._type, "https://in-toto.io/Statement/v1");
  assert.equal(statement.predicateType, provenancePredicate);
  assert.equal(metadata.repository, "https://github.com/GSTJ/magic-modal");
  assert.equal(
    metadata.ref,
    `refs/heads/chore/release-publish-${metadata.version}`,
  );
  assertProvenanceBuild(statement.predicate, metadata);
  assertProvenanceSubject(statement, artifact, metadata, integrity);
  assertProvenanceRun(statement.predicate);
};

/**
 * @param {VerifiedSignature} verified
 * @param {ReleaseArtifact} artifact
 * @param {ReleaseMetadata} metadata
 * @param {string} integrity
 */
const assertVerifiedSignature = (verified, artifact, metadata, integrity) => {
  assert.equal(verified.name, artifact.name);
  assert.equal(verified.version, metadata.version);
  assert.equal(verified.location, `node_modules/${artifact.name}`);
  assert.equal(verified.registry, npmRegistry);
  assert.equal(
    verified.attestations?.provenance?.predicateType,
    provenancePredicate,
  );

  const matchingBundles = (verified.attestationBundles ?? []).filter(
    (item) => item.predicateType === provenancePredicate,
  );
  assert.equal(
    matchingBundles.length,
    1,
    `${artifact.name} has no unique SLSA provenance bundle`,
  );
  const bundle = matchingBundles[0]?.bundle;
  assert.equal(bundle?.mediaType, sigstoreBundleType);
  assert.ok(
    bundle?.verificationMaterial?.tlogEntries?.length,
    `${artifact.name} provenance has no transparency-log entry`,
  );
  decodeBase64(
    bundle?.verificationMaterial?.certificate?.rawBytes,
    `${artifact.name} provenance has no signing certificate`,
  );

  const envelope = bundle?.dsseEnvelope;
  assert.equal(envelope?.payloadType, inTotoPayloadType);
  assert.ok(
    envelope?.signatures?.length,
    `${artifact.name} provenance has no DSSE signature`,
  );
  for (const signature of envelope?.signatures ?? []) {
    decodeBase64(signature.sig, `${artifact.name} has an empty DSSE signature`);
  }
  const statement = /** @type {ProvenanceStatement} */ (
    JSON.parse(
      decodeBase64(
        envelope?.payload,
        `${artifact.name} provenance has no DSSE payload`,
      ).toString("utf8"),
    )
  );
  assertProvenanceStatement(statement, artifact, metadata, integrity);
};

/**
 * @param {string} directory
 * @param {string} lockPath
 * @param {string} reportPath
 */
const verifySignatures = async (directory, lockPath, reportPath) => {
  const metadata = await verify(directory);
  const [lockText, reportText] = await Promise.all([
    readFile(resolve(lockPath), "utf8"),
    readFile(resolve(reportPath), "utf8"),
  ]);
  const lock = /** @type {PackageLock} */ (JSON.parse(lockText));
  const report = /** @type {SignatureReport} */ (JSON.parse(reportText));
  assert.ok(Array.isArray(report.invalid));
  assert.ok(Array.isArray(report.missing));
  assert.ok(Array.isArray(report.verified));
  /** @type {VerifiedSignature[]} */
  const verifiedEntries = report.verified;
  assert.deepEqual(report.invalid, [], "npm reported invalid signatures");
  assert.deepEqual(report.missing, [], "npm reported missing signatures");

  const expectedLocations = metadata.artifacts
    .map(({ name }) => `node_modules/${name}`)
    .sort();
  assert.deepEqual(
    Object.keys(lock.packages ?? {})
      .filter(Boolean)
      .sort(),
    expectedLocations,
    "the npm audit tree contains unexpected packages",
  );
  assert.deepEqual(
    lock.packages?.[""]?.dependencies,
    Object.fromEntries(
      metadata.artifacts.map(({ name }) => [name, metadata.version]),
    ),
    "the npm audit roots are not exact release versions",
  );
  assert.deepEqual(
    verifiedEntries.map(({ location }) => location).sort(),
    expectedLocations,
    "npm did not verify the exact installed package set",
  );

  for (const artifact of metadata.artifacts) {
    const location = `node_modules/${artifact.name}`;
    /** @type {{ dependencies?: Record<string, string>; integrity?: string; resolved?: string; version?: string } | undefined} */
    const lockEntry = lock.packages?.[location];
    assert.equal(lockEntry?.version, metadata.version);
    assert.equal(lockEntry?.integrity, artifact.integrity);
    assert.equal(
      lockEntry?.resolved,
      `${npmRegistry}${artifact.name}/-/${artifact.name}-${metadata.version}.tgz`,
    );
    /** @type {VerifiedSignature[]} */
    const matches = verifiedEntries.filter(
      (entry) =>
        entry.name === artifact.name &&
        entry.version === metadata.version &&
        entry.location === location &&
        entry.registry === npmRegistry,
    );
    assert.equal(
      matches.length,
      1,
      `${artifact.name}@${metadata.version} has no unique verified signature`,
    );
    const [match] = matches;
    assert.ok(match);
    assertVerifiedSignature(match, artifact, metadata, artifact.integrity);
  }
  console.log(`npm signatures and provenance match ${metadata.version}`);
};

/** @param {string} name @param {string} version @returns {Promise<RegistryManifest | null>} */
const registryMetadata = async (name, version) => {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `npm registry returned ${response.status} for ${name}@${version}`,
    );
  }
  return /** @type {Promise<RegistryManifest>} */ (response.json());
};

/**
 * @param {RegistryManifest} published
 * @param {ReleaseArtifact} artifact
 * @param {ReleaseMetadata} metadata
 */
const verifyProvenance = async (published, artifact, metadata) => {
  const url = published.dist?.attestations?.url;
  if (!url) return false;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return false;
  const document = /** @type {AttestationDocument} */ (await response.json());
  const attestation = document.attestations?.find(
    (item) => item.predicateType === "https://slsa.dev/provenance/v1",
  );
  if (!attestation) return false;
  const statement = /** @type {ProvenanceStatement} */ (
    JSON.parse(
      Buffer.from(attestation.bundle.dsseEnvelope.payload, "base64").toString(
        "utf8",
      ),
    )
  );
  const workflow =
    statement.predicate?.buildDefinition?.externalParameters?.workflow;
  const dependencies =
    statement.predicate?.buildDefinition?.resolvedDependencies ?? [];
  const subject = statement.subject?.find(
    (item) => item.name === `pkg:npm/${artifact.name}@${metadata.version}`,
  );
  assert.equal(statement.predicateType, "https://slsa.dev/provenance/v1");
  assert.equal(
    workflow?.repository,
    metadata.repository,
    "provenance repository drifted",
  );
  assert.equal(
    workflow?.path,
    metadata.workflow,
    "provenance workflow drifted",
  );
  assert.equal(workflow?.ref, metadata.ref, "provenance ref drifted");
  assert.ok(
    dependencies.some(
      (dependency) => dependency.digest?.gitCommit === metadata.commit,
    ),
    "provenance does not resolve to the release commit",
  );
  assert.equal(
    subject?.digest?.sha512,
    artifact.sha512,
    "provenance bytes drifted",
  );
  return true;
};

/** @param {string} directory @param {string} name */
const status = async (directory, name) => {
  const metadata = await verify(directory);
  const artifact = metadata.artifacts.find((item) => item.name === name);
  assert.ok(artifact, `no packed artifact for ${name}`);
  const published = await registryMetadata(name, metadata.version);
  if (!published) {
    console.log("missing");
    return;
  }
  assert.equal(
    published.dist?.integrity,
    artifact.integrity,
    `${name}@${metadata.version} exists with different bytes`,
  );
  assert.equal(
    await verifyProvenance(published, artifact, metadata),
    true,
    `${name}@${metadata.version} has no matching provenance`,
  );
  console.log("matching");
};

/** @param {number} milliseconds */
const delay = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/** @param {ReleaseMetadata} metadata @param {number} attempt */
const verifyRegistryAttempt = async (metadata, attempt) => {
  const results = await Promise.all(
    metadata.artifacts.map(async (artifact) => ({
      artifact,
      published: await registryMetadata(artifact.name, metadata.version),
    })),
  );
  const checks = await Promise.all(
    results.map(({ artifact, published }) => {
      if (!published) return false;
      assert.equal(
        published.dist?.integrity,
        artifact.integrity,
        `${artifact.name}@${metadata.version} exists with different bytes`,
      );
      return verifyProvenance(published, artifact, metadata);
    }),
  );
  if (checks.every(Boolean)) {
    console.log(`registry bytes and provenance match ${metadata.version}`);
    return;
  }
  if (attempt >= 20) {
    throw new Error(
      `npm did not expose both provenance attestations within 60 seconds`,
    );
  }
  await delay(3_000);
  return verifyRegistryAttempt(metadata, attempt + 1);
};

/** @param {string} directory */
const verifyRegistry = async (directory) => {
  const metadata = await verify(directory);
  await verifyRegistryAttempt(metadata, 1);
};

const selfTest = () => {
  assertManifest(
    {
      name: "react-native-magic-modal",
      version: "1.2.3",
      dependencies: { "magic-modal": "1.2.3" },
    },
    "react-native-magic-modal",
    "1.2.3",
  );
  assert.throws(() =>
    assertManifest(
      {
        name: "react-native-magic-modal",
        version: "1.2.3",
        dependencies: { "magic-modal": "workspace:*" },
      },
      "react-native-magic-modal",
      "1.2.3",
    ),
  );
  const version = "1.2.3";
  const sha512 = "00".repeat(64);
  const integrity = `sha512-${Buffer.alloc(64).toString("base64")}`;
  /** @type {ReleaseArtifact} */
  const artifact = {
    name: "magic-modal",
    version,
    file: `magic-modal-${version}.tgz`,
    integrity,
    sha256: "00".repeat(32),
    sha512,
  };
  /** @type {ReleaseMetadata} */
  const metadata = {
    version,
    commit: "a".repeat(40),
    repository: "https://github.com/GSTJ/magic-modal",
    ref: `refs/heads/chore/release-publish-${version}`,
    workflow: ".github/workflows/release.yml",
    artifacts: [artifact],
  };
  /** @type {ProvenanceStatement} */
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    predicateType: provenancePredicate,
    subject: [{ name: `pkg:npm/magic-modal@${version}`, digest: { sha512 } }],
    predicate: {
      buildDefinition: {
        buildType: githubActionsBuildType,
        externalParameters: {
          workflow: {
            repository: metadata.repository ?? undefined,
            ref: metadata.ref ?? undefined,
            path: metadata.workflow,
          },
        },
        internalParameters: { github: { event_name: "workflow_dispatch" } },
        resolvedDependencies: [
          {
            uri: `git+${metadata.repository}@${metadata.ref}`,
            digest: { gitCommit: metadata.commit },
          },
        ],
      },
      runDetails: {
        builder: { id: "https://github.com/actions/runner/github-hosted" },
        metadata: {
          invocationId:
            "https://github.com/GSTJ/magic-modal/actions/runs/123/attempts/2",
        },
      },
    },
  };
  /** @type {VerifiedSignature} */
  const verified = {
    name: artifact.name,
    version,
    location: `node_modules/${artifact.name}`,
    registry: npmRegistry,
    attestations: { provenance: { predicateType: provenancePredicate } },
    attestationBundles: [
      {
        predicateType: provenancePredicate,
        bundle: {
          mediaType: sigstoreBundleType,
          verificationMaterial: {
            certificate: {
              rawBytes: Buffer.from("certificate").toString("base64"),
            },
            tlogEntries: [{}],
          },
          dsseEnvelope: {
            payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
            payloadType: inTotoPayloadType,
            signatures: [{ sig: Buffer.from("signature").toString("base64") }],
          },
        },
      },
    ],
  };
  assert.doesNotThrow(() =>
    assertVerifiedSignature(verified, artifact, metadata, integrity),
  );
  const missingLog = structuredClone(verified);
  const missingLogBundle = missingLog.attestationBundles?.[0]?.bundle;
  assert.ok(missingLogBundle?.verificationMaterial);
  missingLogBundle.verificationMaterial.tlogEntries = [];
  assert.throws(() =>
    assertVerifiedSignature(missingLog, artifact, metadata, integrity),
  );
  const wrongDigest = structuredClone(verified);
  const wrongDigestEnvelope =
    wrongDigest.attestationBundles?.[0]?.bundle?.dsseEnvelope;
  assert.ok(wrongDigestEnvelope);
  const wrongStatement = structuredClone(statement);
  const wrongSubject = wrongStatement.subject?.[0];
  assert.ok(wrongSubject?.digest);
  wrongSubject.digest.sha512 = "ff".repeat(64);
  wrongDigestEnvelope.payload = Buffer.from(
    JSON.stringify(wrongStatement),
  ).toString("base64");
  assert.throws(() =>
    assertVerifiedSignature(wrongDigest, artifact, metadata, integrity),
  );
  console.log("release artifact self-test passed");
};

const [command = "verify", rawDirectory, name, reportPath] =
  process.argv.slice(2);
const directory = resolve(rawDirectory ?? "release-artifacts");

if (command === "pack") {
  await pack(directory);
} else if (command === "verify") {
  await verify(directory);
  console.log("release artifacts are intact");
} else if (command === "status") {
  assert.ok(name, "status requires a package name");
  await status(directory, name);
} else if (command === "registry") {
  await verifyRegistry(directory);
} else if (command === "signatures") {
  assert.ok(name, "signatures requires a package-lock path");
  assert.ok(reportPath, "signatures requires an npm audit report path");
  await verifySignatures(directory, name, reportPath);
} else if (command === "self-test") {
  selfTest();
} else {
  throw new Error(`unknown release-artifacts command: ${command}`);
}
