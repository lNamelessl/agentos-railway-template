import "server-only";

import { getOpenClawAdapter } from "@/lib/openclaw/adapter/openclaw-adapter";
import { settleChannelRegistryFromLocalFile } from "@/lib/openclaw/state/channel-registry-payload";
import { channelRegistryPath } from "@/lib/openclaw/state/paths";
import {
  applyChannelAccountDisplayNames,
  buildLegacyRegistrySurfaceAccounts,
  mergeMissionControlSurfaceAccounts,
  readChannelAccounts
} from "@/lib/openclaw/domains/channels";
import { normalizeChannelRegistry } from "@/lib/openclaw/domains/workspace-manifest";
import type { ChannelAccountRecord } from "@/lib/openclaw/types";
import type { SnapshotLoadProfile } from "@/lib/openclaw/state/snapshot-cache";
import {
  buildSurfaceDriftSnapshot,
  loadSurfaceRuntimeSnapshot
} from "@/lib/openclaw/surface-runtime";

export async function hydrateMissionControlChannels(
  profile: SnapshotLoadProfile,
  options: {
    workspaceId?: string | null;
  } = {}
) {
  const channelRegistryResult = await settleChannelRegistryFromLocalFile(channelRegistryPath);
  const channelRegistry =
    channelRegistryResult.status === "fulfilled"
      ? channelRegistryResult.value
      : normalizeChannelRegistry({
          version: 1,
          channels: []
        });
  const channelAccountsRaw =
    profile === "interactive"
      ? ([] as ChannelAccountRecord[])
      : await readChannelAccounts();
  const channelAccounts = applyChannelAccountDisplayNames(
    mergeMissionControlSurfaceAccounts([
      ...channelAccountsRaw,
      ...buildLegacyRegistrySurfaceAccounts(channelRegistry)
    ]),
    channelRegistry
  );
  const surfaceRuntime = await loadSurfaceRuntimeSnapshot({
    profile,
    channelAccounts: channelAccountsRaw,
    channelRegistry
  });
  const currentBindings = profile === "interactive" ? null : await readOpenClawBindings();
  const surfaceDrift = buildSurfaceDriftSnapshot({
    registry: channelRegistry,
    currentBindings,
    surfaceRuntime,
    configuredAccounts: channelAccountsRaw,
    workspaceId: options.workspaceId
  });

  return {
    channelRegistry,
    channelAccounts,
    surfaceRuntime,
    surfaceDrift
  };
}

async function readOpenClawBindings() {
  try {
    const bindings = await getOpenClawAdapter().getConfig<unknown[]>("bindings", { timeoutMs: 5_000 });
    return Array.isArray(bindings) ? bindings : [];
  } catch {
    return null;
  }
}
