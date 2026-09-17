"use client";

import { useEffect, useMemo, useState } from "react";

type SurfaceTheme = "dark" | "light";

const surfaceThemeStorageKey = "mission-control-surface-theme";
const hiddenRuntimeIdsStorageKey = "mission-control-hidden-runtime-ids";
const hiddenTaskKeysStorageKey = "mission-control-hidden-task-keys";
const lockedTaskKeysStorageKey = "mission-control-locked-task-keys";

export const missionControlPreferenceStorageKeys = {
  surfaceTheme: surfaceThemeStorageKey,
  hiddenRuntimeIds: hiddenRuntimeIdsStorageKey,
  hiddenTaskKeys: hiddenTaskKeysStorageKey,
  lockedTaskKeys: lockedTaskKeysStorageKey
} as const;

function parseStoredStringList(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

export function useMissionControlPreferences() {
  const [surfaceTheme, setSurfaceTheme] = useState<SurfaceTheme>("dark");
  const [hiddenRuntimeIds, setHiddenRuntimeIds] = useState<string[]>([]);
  const [hiddenTaskKeys, setHiddenTaskKeys] = useState<string[]>([]);
  const [lockedTaskKeys, setLockedTaskKeys] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const storedTheme = globalThis.localStorage?.getItem(surfaceThemeStorageKey);

      if (storedTheme === "dark" || storedTheme === "light") {
        setSurfaceTheme(storedTheme);
      }

      setHiddenRuntimeIds(parseStoredStringList(globalThis.localStorage?.getItem(hiddenRuntimeIdsStorageKey) ?? null));
      setHiddenTaskKeys(parseStoredStringList(globalThis.localStorage?.getItem(hiddenTaskKeysStorageKey) ?? null));
      setLockedTaskKeys(parseStoredStringList(globalThis.localStorage?.getItem(lockedTaskKeysStorageKey) ?? null));
      setIsHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    globalThis.localStorage?.setItem(surfaceThemeStorageKey, surfaceTheme);
  }, [isHydrated, surfaceTheme]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    globalThis.localStorage?.setItem(hiddenRuntimeIdsStorageKey, JSON.stringify(hiddenRuntimeIds));
  }, [hiddenRuntimeIds, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    globalThis.localStorage?.setItem(hiddenTaskKeysStorageKey, JSON.stringify(hiddenTaskKeys));
  }, [hiddenTaskKeys, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    globalThis.localStorage?.setItem(lockedTaskKeysStorageKey, JSON.stringify(lockedTaskKeys));
  }, [isHydrated, lockedTaskKeys]);

  const safeHiddenRuntimeIds = useMemo(
    () => (Array.isArray(hiddenRuntimeIds) ? hiddenRuntimeIds : []),
    [hiddenRuntimeIds]
  );
  const safeHiddenTaskKeys = useMemo(
    () => (Array.isArray(hiddenTaskKeys) ? hiddenTaskKeys : []),
    [hiddenTaskKeys]
  );
  const safeLockedTaskKeys = useMemo(
    () => (Array.isArray(lockedTaskKeys) ? lockedTaskKeys : []),
    [lockedTaskKeys]
  );

  const clearPreferenceState = () => {
    setHiddenRuntimeIds([]);
    setHiddenTaskKeys([]);
    setLockedTaskKeys([]);
  };

  return {
    surfaceTheme,
    setSurfaceTheme,
    hiddenRuntimeIds,
    setHiddenRuntimeIds,
    hiddenTaskKeys,
    setHiddenTaskKeys,
    lockedTaskKeys,
    setLockedTaskKeys,
    safeHiddenRuntimeIds,
    safeHiddenTaskKeys,
    safeLockedTaskKeys,
    clearPreferenceState
  };
}
