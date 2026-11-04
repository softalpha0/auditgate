import type { Finding } from "@auditgate/core";

export type ChangeStatus = "added" | "removed" | "modified" | "renamed";

/** One changed file between two commits. Paths are repo-relative with forward slashes. */
export interface FileChange {
  status: ChangeStatus;
  /** Path at the older commit. Missing for added files. */
  oldPath?: string;
  /** Path at the newer commit. Missing for removed files. */
  newPath?: string;
}

/** An audited file that changed. `path` is always the path the auditor saw. */
export interface ChangedAuditedFile {
  path: string;
  status: ChangeStatus;
  /** Set when the file was renamed or moved. */
  renamedTo?: string;
}

export interface DriftedFinding {
  id: string;
  externalId: string;
  /** The finding's audited files that changed. */
  files: string[];
}

export interface DriftReport {
  /** Audited files that changed, sorted by path. */
  changedFiles: ChangedAuditedFile[];
  /** Changed files outside the audit scope, sorted. They never cause drift. */
  outOfScopeFiles: string[];
  /** Findings with at least one location in a changed audited file, in input order. */
  driftedFindings: DriftedFinding[];
}

export type DriftFinding = Pick<Finding, "id" | "externalId" | "file" | "extraLocations">;

export interface DriftInput {
  /** Files in audit scope at the baseline commit. */
  auditedFiles: string[];
  findings: DriftFinding[];
  /** Changes from the baseline commit to the commit being checked. */
  changes: FileChange[];
}

function normalize(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "");
}

/**
 * Works out which audited files changed and which findings that affects. File-level: any change
 * to a file drifts every finding located in it. That is deliberately strict. Line numbers move
 * with every edit, so a line-level rule would miss changes rather than catch more of them.
 *
 * A finding's own files count as in scope even if the audit's scope list forgot them.
 */
export function computeDrift({ auditedFiles, findings, changes }: DriftInput): DriftReport {
  const scope = new Set(auditedFiles.map(normalize).filter(Boolean));
  for (const finding of findings) {
    for (const loc of [finding, ...(finding.extraLocations ?? [])]) {
      if (loc.file) scope.add(normalize(loc.file));
    }
  }

  const changed = new Map<string, ChangedAuditedFile>();
  const outOfScope = new Set<string>();

  for (const change of changes) {
    const oldPath = change.oldPath ? normalize(change.oldPath) : undefined;
    const newPath = change.newPath ? normalize(change.newPath) : undefined;

    // The audited path is the old one when it existed at the baseline. An "added" file can be
    // in scope too: the scope list named it but it didn't exist yet, or it was deleted and re-added.
    const auditedPath = [oldPath, newPath].find((p) => p !== undefined && scope.has(p));
    if (!auditedPath) {
      const path = newPath ?? oldPath;
      if (path) outOfScope.add(path);
      continue;
    }

    const entry: ChangedAuditedFile = { path: auditedPath, status: change.status };
    if (change.status === "renamed" && newPath && newPath !== auditedPath)
      entry.renamedTo = newPath;
    changed.set(auditedPath, entry);
  }

  const driftedFindings: DriftedFinding[] = [];
  for (const finding of findings) {
    const files = [
      ...new Set(
        [finding.file, ...(finding.extraLocations ?? []).map((l) => l.file)]
          .filter(Boolean)
          .map(normalize),
      ),
    ].filter((f) => changed.has(f));
    if (files.length)
      driftedFindings.push({ id: finding.id, externalId: finding.externalId, files });
  }

  return {
    changedFiles: [...changed.values()].sort((a, b) => a.path.localeCompare(b.path)),
    outOfScopeFiles: [...outOfScope].sort(),
    driftedFindings,
  };
}

/** One entry of Bitbucket's diffstat response (GET /2.0/repositories/{w}/{r}/diffstat/{spec}). */
export interface BitbucketDiffstatEntry {
  status?: string;
  old?: { path?: string } | null;
  new?: { path?: string } | null;
}

/**
 * Converts Bitbucket diffstat values to FileChange. Unknown statuses are treated as "modified",
 * because counting an unknown change as drift is safer than ignoring it.
 */
export function fromBitbucketDiffstat(values: BitbucketDiffstatEntry[]): FileChange[] {
  return values.flatMap((entry) => {
    const status: ChangeStatus =
      entry.status === "added" || entry.status === "removed" || entry.status === "renamed"
        ? entry.status
        : "modified";
    const change: FileChange = { status };
    if (entry.old?.path) change.oldPath = entry.old.path;
    if (entry.new?.path) change.newPath = entry.new.path;
    return change.oldPath || change.newPath ? [change] : [];
  });
}

/**
 * Reads a list of changed files as a person would paste it: the output of
 * `git diff --name-status <audited-commit> HEAD`, or just one path per line.
 *
 *   M\tsrc/TokenVault.sol          modified
 *   A\tsrc/New.sol                 added
 *   D\tsrc/Old.sol                 removed
 *   R087\tsrc/A.sol\tsrc/B.sol     renamed (similarity score ignored)
 *   src/PriceOracle.sol            a bare path counts as modified
 *
 * Blank lines and lines starting with # are ignored. Columns may be separated by tabs or
 * runs of spaces. Paths with spaces need tabs, which is what git prints.
 */
export function parseChangedFiles(text: string): FileChange[] {
  const changes: FileChange[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.includes("\t") ? line.split("\t").map((p) => p.trim()) : line.split(/\s+/);
    const code = /^([AMDRCTU])\d*$/i.exec(parts[0] ?? "")?.[1]?.toUpperCase();
    if (!code || parts.length < 2) {
      changes.push({ status: "modified", oldPath: normalize(line), newPath: normalize(line) });
      continue;
    }
    const [first = "", second = ""] = parts.slice(1);
    if (code === "A") changes.push({ status: "added", newPath: normalize(first) });
    else if (code === "D") changes.push({ status: "removed", oldPath: normalize(first) });
    else if ((code === "R" || code === "C") && second) {
      changes.push(
        code === "R"
          ? { status: "renamed", oldPath: normalize(first), newPath: normalize(second) }
          : { status: "added", newPath: normalize(second) },
      );
    } else
      changes.push({ status: "modified", oldPath: normalize(first), newPath: normalize(first) });
  }
  return changes;
}
