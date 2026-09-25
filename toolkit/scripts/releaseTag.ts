/*
 * A narrow release-tag decision, called only after CI succeeds on a main push.
 * The caller provides authenticated GitHub API requests. A tag is created only
 * for a merged PR whose commit is still main's tip and whose checked manifest
 * is publishable; an existing tag is never moved or overwritten.
 */

export interface GitHubResponse {
  readonly status: number;
  readonly body: unknown;
}

export type GitHubRequest = (
  method: "GET" | "POST",
  route: string,
  body?: { readonly ref: string; readonly sha: string },
) => Promise<GitHubResponse>;

export type TagOutcome =
  | { readonly kind: "created"; readonly tag: string }
  | { readonly kind: "existing"; readonly tag: string; readonly target: string }
  | { readonly kind: "skipped"; readonly reason: string };

const VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

/** Return a useful tag outcome without ever updating an existing ref. */
export async function createVersionTag(
  sha: string,
  repo: string,
  manifestText: string,
  request: GitHubRequest,
): Promise<TagOutcome> {
  if (
    !/^[0-9a-f]{40}$/u.test(sha) ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo)
  ) {
    throw new Error("release-tag: invalid commit SHA or repository");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText);
  } catch {
    throw new Error("release-tag: invalid package JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("release-tag: package.json is not an object");
  }
  const pkg = parsed as Record<string, unknown>;
  if (
    pkg.name !== "quaternits" ||
    typeof pkg.version !== "string" ||
    !VERSION.test(pkg.version)
  ) {
    throw new Error("release-tag: invalid package name or version");
  }
  if (pkg.private === true) {
    return { kind: "skipped", reason: "package is private" };
  }
  if (pkg.private !== undefined && pkg.private !== false) {
    throw new Error("release-tag: invalid private field");
  }

  const main = await request("GET", "git/ref/heads/main");
  const mainRef = main.body as {
    readonly object?: { readonly sha?: string };
  } | null;
  if (main.status !== 200 || typeof mainRef?.object?.sha !== "string") {
    throw new Error("release-tag: cannot confirm main's tip");
  }
  if (mainRef.object.sha !== sha) {
    return { kind: "skipped", reason: "main moved past the verified commit" };
  }

  const associated = await request("GET", `commits/${sha}/pulls`);
  if (associated.status !== 200 || !Array.isArray(associated.body)) {
    throw new Error("release-tag: cannot confirm a merged pull request");
  }
  const prs = associated.body as readonly {
    readonly merged_at: string | null;
    readonly merge_commit_sha: string;
    readonly base: {
      readonly ref: string;
      readonly repo: { readonly full_name: string };
    };
  }[];
  if (
    !prs.some(
      (pr) =>
        pr.merged_at !== null &&
        pr.merge_commit_sha === sha &&
        pr.base.ref === "main" &&
        pr.base.repo.full_name.toLowerCase() === repo.toLowerCase(),
    )
  ) {
    return {
      kind: "skipped",
      reason: "commit is not a merged pull request into main",
    };
  }

  const tag = `v${pkg.version}`;
  const ref = `refs/tags/${tag}`;
  const existing = await request("GET", `git/ref/tags/${tag}`);
  if (existing.status === 200) {
    const tagRef = existing.body as {
      readonly ref?: string;
      readonly object?: { readonly sha?: string };
    } | null;
    if (tagRef?.ref !== ref || typeof tagRef.object?.sha !== "string") {
      throw new Error("release-tag: malformed existing tag ref");
    }
    return { kind: "existing", tag, target: tagRef.object.sha };
  }
  if (existing.status !== 404) {
    throw new Error("release-tag: cannot check existing tag ref");
  }

  const created = await request("POST", "git/refs", { ref, sha });
  const result = created.body as { readonly ref?: string } | null;
  if (created.status !== 201 || result?.ref !== ref) {
    throw new Error("release-tag: GitHub did not create the expected tag");
  }
  return { kind: "created", tag };
}
