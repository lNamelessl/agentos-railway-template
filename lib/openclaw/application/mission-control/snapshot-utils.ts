import "server-only";

import os from "node:os";
import path from "node:path";

import type { SnapshotPair } from "@/lib/openclaw/state/snapshot-cache";
import type {
  MissionControlSnapshot,
  WorkspaceProject
} from "@/lib/openclaw/types";

export const MISSION_CONTROL_SNAPSHOT_TTL_MS = 30_000;
export const MISSION_CONTROL_RUNTIME_DIAGNOSTICS_TTL_MS = 5 * 60_000;
export const MISSION_CONTROL_GATEWAY_STATUS_STALE_GRACE_MS = 60_000;

export const MISSION_CONTROL_MISSION_PRESETS = [
  "Audit the selected workspace and generate a concrete first task batch.",
  "Plan a multi-agent delivery mission for the current product goal.",
  "Review active runtimes, identify blockers, and propose the next handoff."
];

export function createSnapshotPair(snapshot: MissionControlSnapshot): SnapshotPair<MissionControlSnapshot> {
  return {
    visible: snapshot,
    full: snapshot
  };
}

export function resolveDefaultWorkspaceRoot() {
  return path.join(os.homedir(), "Documents", "Shared", "projects");
}

export function resolveWorkspaceRoot(configuredWorkspaceRoot?: string | null) {
  return configuredWorkspaceRoot || resolveDefaultWorkspaceRoot();
}

export function createEmptyWorkspace(
  workspacePath: string,
  resolveWorkspaceId: (workspacePath: string) => string
): WorkspaceProject {
  return {
    id: resolveWorkspaceId(workspacePath),
    name: prettifyWorkspaceName(workspacePath),
    slug: slugify(path.basename(workspacePath)),
    path: workspacePath,
    kind: "workspace",
    agentIds: [],
    modelIds: [],
    activeRuntimeIds: [],
    totalSessions: 0,
    health: "standby",
    bootstrap: {
      template: null,
      sourceMode: null,
      agentTemplate: null,
      coreFiles: [],
      optionalFiles: [],
      folders: [],
      projectShell: [],
      localSkillIds: []
    },
    capabilities: {
      skills: [],
      tools: [],
      workspaceOnlyAgentCount: 0
    },
    channels: []
  };
}

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function prettifyWorkspaceName(workspacePath: string) {
  const base = path.basename(workspacePath) || workspacePath;
  return base
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
