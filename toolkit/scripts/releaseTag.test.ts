import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createVersionTag,
  type GitHubRequest,
  type GitHubResponse,
} from "./releaseTag.ts";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const REPO = "pboueke/QuaterniTS";
const VERSION = "0.1.0";
const REF = `refs/tags/v${VERSION}`;

function manifest(privateField?: unknown, version = VERSION): string {
  return JSON.stringify({
    name: "quaternits",
    version,
    ...(privateField === undefined ? {} : { private: privateField }),
  });
}

function mockApi(overrides: Readonly<Record<string, GitHubResponse>> = {}): {
  request: GitHubRequest;
  calls: string[];
} {
  const responses: Readonly<Record<string, GitHubResponse>> = {
    "GET git/ref/heads/main": { status: 200, body: { object: { sha: SHA } } },
    [`GET commits/${SHA}/pulls`]: {
      status: 200,
      body: [
        {
          merged_at: "2026-09-25T15:00:00Z",
          merge_commit_sha: SHA,
          base: { ref: "main", repo: { full_name: REPO } },
        },
      ],
    },
    [`GET git/ref/tags/v${VERSION}`]: { status: 404, body: {} },
    "POST git/refs": { status: 201, body: { ref: REF } },
    ...overrides,
  };
  const calls: string[] = [];
  return {
    calls,
    request: async (
      method: "GET" | "POST",
      route: string,
      body?: { readonly ref: string; readonly sha: string },
    ) => {
      calls.push(
        `${method} ${route}${body === undefined ? "" : ` ${JSON.stringify(body)}`}`,
      );
      const response = responses[`${method} ${route}`];
      assert.ok(
        response !== undefined,
        `unexpected API request ${method} ${route}`,
      );
      return response;
    },
  };
}

test("tags a successful merged main commit with a new lightweight version ref", async () => {
  const { request, calls } = mockApi();
  assert.deepEqual(await createVersionTag(SHA, REPO, manifest(), request), {
    kind: "created",
    tag: `v${VERSION}`,
  });
  assert.deepEqual(calls, [
    "GET git/ref/heads/main",
    `GET commits/${SHA}/pulls`,
    `GET git/ref/tags/v${VERSION}`,
    `POST git/refs ${JSON.stringify({ ref: REF, sha: SHA })}`,
  ]);
});

test("private packages are not tagged and make no API calls", async () => {
  const { request, calls } = mockApi();
  assert.deepEqual(await createVersionTag(SHA, REPO, manifest(true), request), {
    kind: "skipped",
    reason: "package is private",
  });
  assert.deepEqual(calls, []);
});

test("obsolete CI runs cannot tag a main branch that moved", async () => {
  const { request, calls } = mockApi({
    "GET git/ref/heads/main": {
      status: 200,
      body: { object: { sha: OTHER_SHA } },
    },
  });
  assert.deepEqual(await createVersionTag(SHA, REPO, manifest(), request), {
    kind: "skipped",
    reason: "main moved past the verified commit",
  });
  assert.deepEqual(calls, ["GET git/ref/heads/main"]);
});

test("direct pushes and unrelated PRs cannot produce a release tag", async () => {
  const { request, calls } = mockApi({
    [`GET commits/${SHA}/pulls`]: {
      status: 200,
      body: [
        {
          merged_at: "2026-09-25T15:00:00Z",
          merge_commit_sha: OTHER_SHA,
          base: { ref: "main", repo: { full_name: REPO } },
        },
        {
          merged_at: null,
          merge_commit_sha: SHA,
          base: { ref: "main", repo: { full_name: REPO } },
        },
        {
          merged_at: "2026-09-25T15:00:00Z",
          merge_commit_sha: SHA,
          base: { ref: "not-main", repo: { full_name: REPO } },
        },
        {
          merged_at: "2026-09-25T15:00:00Z",
          merge_commit_sha: SHA,
          base: { ref: "main", repo: { full_name: "other/repo" } },
        },
      ],
    },
  });
  assert.deepEqual(await createVersionTag(SHA, REPO, manifest(), request), {
    kind: "skipped",
    reason: "commit is not a merged pull request into main",
  });
  assert.deepEqual(calls, [
    "GET git/ref/heads/main",
    `GET commits/${SHA}/pulls`,
  ]);
});

test("existing version tags are never moved or overwritten", async () => {
  for (const target of [SHA, OTHER_SHA]) {
    const { request, calls } = mockApi({
      [`GET git/ref/tags/v${VERSION}`]: {
        status: 200,
        body: { ref: REF, object: { sha: target } },
      },
    });
    assert.deepEqual(await createVersionTag(SHA, REPO, manifest(), request), {
      kind: "existing",
      tag: `v${VERSION}`,
      target,
    });
    assert.ok(calls.every((call) => !call.startsWith("POST ")));
  }
});

test("invalid inputs and manifest values fail before any network request", async () => {
  const invalidInputs: readonly (readonly [string, string, string])[] = [
    ["not-a-sha", REPO, manifest()],
    [SHA, "unsafe repo", manifest()],
    [SHA, REPO, "{"],
    [SHA, REPO, "null"],
    [SHA, REPO, JSON.stringify({ name: "different", version: VERSION })],
    [SHA, REPO, manifest(undefined, "v0.1.0")],
    [SHA, REPO, manifest("false")],
  ];
  for (const [sha, repo, content] of invalidInputs) {
    const { request, calls } = mockApi();
    await assert.rejects(createVersionTag(sha, repo, content, request));
    assert.deepEqual(calls, []);
  }
});

test("unexpected GitHub API responses fail closed without creating a tag", async () => {
  const cases: Readonly<Record<string, GitHubResponse>>[] = [
    { "GET git/ref/heads/main": { status: 403, body: {} } },
    { "GET git/ref/heads/main": { status: 200, body: {} } },
    { [`GET commits/${SHA}/pulls`]: { status: 500, body: {} } },
    { [`GET commits/${SHA}/pulls`]: { status: 200, body: {} } },
    { [`GET git/ref/tags/v${VERSION}`]: { status: 403, body: {} } },
    {
      [`GET git/ref/tags/v${VERSION}`]: {
        status: 200,
        body: { ref: "refs/tags/another", object: { sha: SHA } },
      },
    },
    { "POST git/refs": { status: 422, body: {} } },
    { "POST git/refs": { status: 201, body: {} } },
  ];
  for (const overrides of cases) {
    const { request, calls } = mockApi(overrides);
    await assert.rejects(createVersionTag(SHA, REPO, manifest(), request));
    assert.ok(calls.filter((call) => call.startsWith("POST ")).length <= 1);
  }
});
