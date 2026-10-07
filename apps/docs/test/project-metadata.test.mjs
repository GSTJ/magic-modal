import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveProjectMetadata,
  emptyProjectMetadataSnapshot,
  fetchProjectMetadata,
  isProjectMetadataFresh,
  mergeProjectMetadataSnapshots,
  parseProjectMetadataCache,
  projectAgeInYears,
  projectMetadataConfig,
} from "../lib/project-metadata.ts";

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });

const fetcher = (url) => {
  if (url === projectMetadataConfig.githubApi) {
    return jsonResponse({
      created_at: "2022-02-21T10:00:00Z",
      license: { spdx_id: "MIT" },
      stargazers_count: 641,
    });
  }
  if (url === projectMetadataConfig.npmDownloadsApi) {
    return jsonResponse({ downloads: 3950 });
  }
  return jsonResponse({ version: "9.0.1" });
};

test("collects project metadata without rounding or fallback metrics", async () => {
  const snapshot = await fetchProjectMetadata({
    fetcher,
    now: () => new Date("2026-07-28T12:00:00Z"),
  });
  const metadata = deriveProjectMetadata(
    snapshot,
    new Date("2026-07-28T12:00:00Z"),
  );

  assert.equal(metadata.stars, 641);
  assert.equal(metadata.downloadsLastWeek, 3950);
  assert.equal(metadata.license, "MIT");
  assert.equal(metadata.createdYear, 2022);
  assert.equal(metadata.ageYears, 4);
  assert.equal(metadata.versionLabel, "v9.0.1");
  assert.equal(
    metadata.releaseUrl,
    "https://github.com/GSTJ/magic-modal/releases/tag/magic-modal-9.0.1",
  );
});

test("keeps known values when one refresh source is unavailable", () => {
  const current = {
    createdAt: "2022-02-21T10:00:00.000Z",
    downloadsLastWeek: 3950,
    fetchedAt: "2026-07-28T10:00:00.000Z",
    latestVersion: "9.0.1",
    license: "MIT",
    sources: {
      github: true,
      npmDownloads: true,
      npmRegistry: true,
    },
    stars: 641,
  };
  const refreshed = {
    ...emptyProjectMetadataSnapshot(),
    downloadsLastWeek: 4012,
    fetchedAt: "2026-07-28T12:00:00.000Z",
    sources: {
      github: false,
      npmDownloads: true,
      npmRegistry: false,
    },
  };

  assert.deepEqual(mergeProjectMetadataSnapshots(current, refreshed), {
    ...current,
    downloadsLastWeek: 4012,
    fetchedAt: refreshed.fetchedAt,
  });
});

test("uses null when every source fails", async () => {
  const snapshot = await fetchProjectMetadata({
    fetcher: () => jsonResponse({ message: "unavailable" }, 503),
  });

  assert.deepEqual(snapshot, emptyProjectMetadataSnapshot());
});

test("rejects invalid metrics from successful responses", async () => {
  const snapshot = await fetchProjectMetadata({
    fetcher: (url) => {
      if (url === projectMetadataConfig.githubApi) {
        return jsonResponse({
          created_at: "sometime",
          license: { spdx_id: "NOASSERTION" },
          stargazers_count: -1,
        });
      }
      if (url === projectMetadataConfig.npmDownloadsApi) {
        return jsonResponse({ downloads: "many" });
      }
      return jsonResponse({ version: "latest" });
    },
    now: () => new Date("2026-07-28T12:00:00Z"),
  });

  assert.deepEqual(snapshot, {
    ...emptyProjectMetadataSnapshot(),
    fetchedAt: "2026-07-28T12:00:00.000Z",
    sources: {
      github: true,
      npmDownloads: true,
      npmRegistry: true,
    },
  });
});

test("validates cache payloads before using them", () => {
  const snapshot = {
    ...emptyProjectMetadataSnapshot(),
    fetchedAt: "2026-07-28T12:00:00.000Z",
    latestVersion: "9.0.1",
    sources: {
      github: false,
      npmDownloads: false,
      npmRegistry: true,
    },
  };

  assert.deepEqual(
    parseProjectMetadataCache(JSON.stringify(snapshot)),
    snapshot,
  );
  assert.equal(parseProjectMetadataCache('{"stars":"many"}'), null);
  assert.equal(parseProjectMetadataCache("not json"), null);
});

test("computes completed years and cache freshness", () => {
  assert.equal(
    projectAgeInYears(
      "2022-07-29T00:00:00.000Z",
      new Date("2026-07-28T23:59:59.000Z"),
    ),
    3,
  );
  assert.equal(
    projectAgeInYears(
      "2022-07-28T00:00:00.000Z",
      new Date("2026-07-28T00:00:00.000Z"),
    ),
    4,
  );

  const snapshot = {
    ...emptyProjectMetadataSnapshot(),
    fetchedAt: "2026-07-28T10:00:00.000Z",
  };
  assert.equal(
    isProjectMetadataFresh(
      snapshot,
      60 * 60 * 1_000,
      Date.parse("2026-07-28T10:59:59.000Z"),
    ),
    true,
  );
  assert.equal(
    isProjectMetadataFresh(
      snapshot,
      60 * 60 * 1_000,
      Date.parse("2026-07-28T11:00:00.000Z"),
    ),
    false,
  );
});
