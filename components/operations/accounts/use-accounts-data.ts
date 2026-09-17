"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  AccountAccessPermission,
  AccountAccessRulesResponse,
  AccountAccessRuleView
} from "@/lib/agentos/account-access-policy-types";
import type {
  AccountLoginTargetsResponse,
  AccountLoginTargetView
} from "@/lib/agentos/account-login-target-types";
import type {
  OpenClawBrowserProfileMutationResponse,
  OpenClawBrowserProfilesResponse,
  OpenClawBrowserProfileView
} from "@/lib/openclaw/browser-profile-types";

export function useAccountsData(activeWorkspaceId: string | null) {
  const [profiles, setProfiles] = useState<OpenClawBrowserProfileView[]>([]);
  const [loginTargets, setLoginTargets] = useState<AccountLoginTargetView[]>([]);
  const [accessRules, setAccessRules] = useState<AccountAccessRuleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [accessRulesLoading, setAccessRulesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [accessRulesError, setAccessRulesError] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/accounts/browser-profiles", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as OpenClawBrowserProfilesResponse | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Unable to read OpenClaw browser profiles.");
      }

      setProfiles(payload.profiles);
    } catch (loadError) {
      setProfiles([]);
      setError(readBrowserProfileError(loadError, "Unable to read OpenClaw browser profiles."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLoginTargets = useCallback(async () => {
    setTargetsLoading(true);
    setTargetsError(null);

    try {
      const query = activeWorkspaceId ? `?workspaceId=${encodeURIComponent(activeWorkspaceId)}` : "";
      const response = await fetch(`/api/accounts/login-targets${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as AccountLoginTargetsResponse | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Unable to read account login targets.");
      }

      setLoginTargets(payload.targets);
    } catch (loadError) {
      setLoginTargets([]);
      setTargetsError(readBrowserProfileError(loadError, "Unable to read account login targets."));
    } finally {
      setTargetsLoading(false);
    }
  }, [activeWorkspaceId]);

  const loadAccessRules = useCallback(async () => {
    setAccessRulesLoading(true);
    setAccessRulesError(null);

    try {
      const query = activeWorkspaceId ? `?workspaceId=${encodeURIComponent(activeWorkspaceId)}` : "";
      const response = await fetch(`/api/accounts/access-rules${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as AccountAccessRulesResponse | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Unable to read account access rules.");
      }

      setAccessRules(payload.rules);
    } catch (loadError) {
      setAccessRules([]);
      setAccessRulesError(readBrowserProfileError(loadError, "Unable to read account access rules."));
    } finally {
      setAccessRulesLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    void loadLoginTargets();
  }, [loadLoginTargets]);

  useEffect(() => {
    void loadAccessRules();
  }, [loadAccessRules]);

  const postProfileMutation = async (
    body: Record<string, unknown>,
    fallbackError: string
  ) => {
    const response = await fetch("/api/accounts/browser-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null) as OpenClawBrowserProfileMutationResponse | null;

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error ?? fallbackError);
    }

    return payload;
  };

  const saveLoginTarget = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/accounts/login-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null) as AccountLoginTargetsResponse | null;

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error ?? "Unable to save account login target.");
    }

    setLoginTargets(payload.targets);
    return payload;
  };

  const saveAccessRulesForTarget = async (
    target: AccountLoginTargetView,
    rules: Array<{
      agentId: string;
      agentName: string;
      permission: AccountAccessPermission;
      notes?: string | null;
    }>
  ) => {
    const response = await fetch("/api/accounts/access-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: target.workspaceId,
        targetId: target.id,
        rules
      })
    });
    const payload = await response.json().catch(() => null) as AccountAccessRulesResponse | null;

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error ?? "Unable to save account access rules.");
    }

    setAccessRules(payload.rules);
    return payload;
  };

  const deleteLoginTarget = async (target: AccountLoginTargetView) => {
    const response = await fetch("/api/accounts/login-targets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: target.id, workspaceId: activeWorkspaceId })
    });
    const payload = await response.json().catch(() => null) as AccountLoginTargetsResponse | null;

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error ?? "Unable to remove account login target.");
    }

    setLoginTargets(payload.targets);
    return payload;
  };

  return {
    profiles,
    loginTargets,
    accessRules,
    loading,
    targetsLoading,
    accessRulesLoading,
    error,
    targetsError,
    accessRulesError,
    loadProfiles,
    loadLoginTargets,
    loadAccessRules,
    postProfileMutation,
    saveLoginTarget,
    saveAccessRulesForTarget,
    deleteLoginTarget
  };
}

function readBrowserProfileError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
