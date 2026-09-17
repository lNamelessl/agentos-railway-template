import "server-only";

import type { MissionControlSnapshot } from "@/lib/openclaw/types";
import {
  filterActiveOpenClawGatewayFallbackDiagnostics,
  isOpenClawGatewayTransportIssueActive
} from "@/lib/openclaw/client/gateway-diagnostic-activity";
import { isGatewayDeviceAccessRepairIssue, isGatewayTokenRepairIssue } from "@/lib/openclaw/gateway-auth-actions";
import {
  generateGatewayNativeAuthToken,
  getGatewayNativeAuthStatus,
  repairGatewayNativeDeviceAccess
} from "@/lib/openclaw/application/settings-service";
import { DEFAULT_OPERATOR_SCOPES } from "@/lib/openclaw/client/native-ws-gateway-types";
import { redactErrorMessage } from "@/lib/security/redaction";

export type GatewayAuthSetupIssueKind = "gateway-token" | "device-access";

export type GatewayAuthSetupIssue = {
  kind: GatewayAuthSetupIssueKind;
  detail: string;
};

type GatewayAuthRepairResult = {
  kind: GatewayAuthSetupIssueKind;
  detail: string;
};

type GatewayAuthSetupRecoveryOptions = {
  operationLabel: string;
  onStatus?: (message: string) => Promise<void> | void;
  resolveGatewayAuthIssue?: (error: unknown) => Promise<GatewayAuthSetupIssue | null> | GatewayAuthSetupIssue | null;
  repairGatewayAuth?: (kind: GatewayAuthSetupIssueKind) => Promise<unknown>;
};

export class GatewayAuthSetupRecoveryError extends Error {
  readonly originalError: unknown;

  constructor(message: string, originalError: unknown) {
    super(message);
    this.name = "GatewayAuthSetupRecoveryError";
    this.originalError = originalError;
  }
}

export function isGatewayAuthSetupRecoveryError(error: unknown): error is GatewayAuthSetupRecoveryError {
  return error instanceof GatewayAuthSetupRecoveryError;
}

export async function runWithGatewayAuthSetupRecovery<T>(
  operation: () => Promise<T>,
  options: GatewayAuthSetupRecoveryOptions
): Promise<{ value: T; repaired: GatewayAuthRepairResult | null }> {
  try {
    return {
      value: await operation(),
      repaired: null
    };
  } catch (error) {
    const issue = resolveGatewayAuthSetupIssue(error) ??
      await (options.resolveGatewayAuthIssue?.(error) ?? resolveGatewayAuthSetupIssueAfterGatewayFailure(error));

    if (!issue) {
      throw error;
    }

    await options.onStatus?.(buildGatewayAuthRepairStatus(issue.kind, options.operationLabel));

    try {
      await (options.repairGatewayAuth ?? repairGatewayAuthForModelSetup)(issue.kind);
    } catch (repairError) {
      throw new GatewayAuthSetupRecoveryError(
        buildGatewayAuthRepairFailureMessage(issue.kind, options.operationLabel, repairError),
        repairError
      );
    }

    await options.onStatus?.(buildGatewayAuthRetryStatus(issue.kind, options.operationLabel));

    try {
      return {
        value: await operation(),
        repaired: issue
      };
    } catch (retryError) {
      throw new GatewayAuthSetupRecoveryError(
        buildGatewayAuthRetryFailureMessage(issue.kind, options.operationLabel, retryError),
        retryError
      );
    }
  }
}

export async function repairGatewayAuthForModelSetupSnapshot(
  snapshot: MissionControlSnapshot,
  options: Omit<GatewayAuthSetupRecoveryOptions, "repairGatewayAuth"> & {
    repairGatewayAuth?: (kind: GatewayAuthSetupIssueKind) => Promise<unknown>;
  }
) {
  const issue = resolveGatewayAuthSetupIssueFromSnapshot(snapshot) ??
    await resolveGatewayAuthSetupIssueFromStatus();

  if (!issue) {
    return null;
  }

  await options.onStatus?.(buildGatewayAuthRepairStatus(issue.kind, options.operationLabel));

  try {
    await (options.repairGatewayAuth ?? repairGatewayAuthForModelSetup)(issue.kind);
  } catch (error) {
    throw new GatewayAuthSetupRecoveryError(
      buildGatewayAuthRepairFailureMessage(issue.kind, options.operationLabel, error),
      error
    );
  }

  await options.onStatus?.(buildGatewayAuthRetryStatus(issue.kind, options.operationLabel));

  return issue;
}

export function resolveGatewayAuthSetupIssue(error: unknown): GatewayAuthSetupIssue | null {
  return resolveGatewayAuthSetupIssueFromText(readErrorMessage(error));
}

export function resolveGatewayAuthSetupIssueFromSnapshot(snapshot: MissionControlSnapshot): GatewayAuthSetupIssue | null {
  const diagnostics = snapshot.diagnostics;
  const transport = diagnostics.transport;
  const transportIssueActive = isOpenClawGatewayTransportIssueActive(transport);
  const activeGatewayFallbackDiagnostics = filterActiveOpenClawGatewayFallbackDiagnostics(
    diagnostics.gatewayFallbackDiagnostics ?? [],
    transport
  );
  const gatewayFallbackReasons = transportIssueActive ? diagnostics.gatewayFallbackReasons ?? [] : [];
  const capabilityMatrixFallbackDiagnostics = transportIssueActive
    ? diagnostics.capabilityMatrix?.fallbackDiagnostics ?? []
    : [];
  const capabilityMatrixFallbackReasons = transportIssueActive
    ? diagnostics.capabilityMatrix?.fallbackReasons ?? []
    : [];
  const messages = [
    ...(transportIssueActive
      ? [
        transport?.lastNativeError,
        transport?.recovery
      ]
      : []),
    ...diagnostics.issues,
    ...gatewayFallbackReasons,
    ...activeGatewayFallbackDiagnostics.flatMap((entry) => [
      entry.issue,
      entry.recovery
    ]),
    ...(diagnostics.capabilityMatrix?.diagnostics ?? []),
    ...capabilityMatrixFallbackReasons,
    ...capabilityMatrixFallbackDiagnostics.flatMap((entry) => [
      entry.issue,
      entry.recovery
    ])
  ];

  for (const message of messages) {
    const issue = resolveGatewayAuthSetupIssueFromText(message);

    if (issue) {
      return issue;
    }
  }

  return null;
}

export function resolveGatewayAuthSetupIssueFromGatewayStatus(
  status: {
    lastError?: unknown;
    rpc?: {
      ok?: unknown;
      error?: unknown;
      capability?: unknown;
      auth?: {
        role?: unknown;
        scopes?: unknown;
        capability?: unknown;
      };
    };
  } | null | undefined
): GatewayAuthSetupIssue | null {
  const scopes = Array.isArray(status?.rpc?.auth?.scopes)
    ? status.rpc.auth.scopes.filter((scope): scope is string => typeof scope === "string")
    : [];
  const messages = [
    status?.lastError,
    status?.rpc?.error,
    status?.rpc?.capability,
    status?.rpc?.auth?.capability,
    scopes.join(" ")
  ];

  for (const message of messages) {
    const issue = resolveGatewayAuthSetupIssueFromText(typeof message === "string" ? message : null);

    if (issue) {
      return issue;
    }
  }

  if (
    status?.rpc?.ok === true &&
    status.rpc.auth?.role === "operator" &&
    scopes.length > 0 &&
    !DEFAULT_OPERATOR_SCOPES.every((scope) => scopes.includes(scope))
  ) {
    return {
      kind: "device-access",
      detail: "Gateway device access needs operator scope."
    };
  }

  return null;
}

export function buildGatewayAuthBlockedMessage(
  issue: GatewayAuthSetupIssue,
  operationLabel: string
) {
  if (issue.kind === "gateway-token") {
    return `AgentOS cannot continue ${operationLabel} because its local Gateway token no longer matches OpenClaw. AgentOS will rotate the token and restart the Gateway automatically; if this repeats, run agentos doctor and retry setup.`;
  }

  return `AgentOS cannot continue ${operationLabel} because the local device is missing OpenClaw operator access. Repair device access in Gateway settings, then retry setup.`;
}

export function buildGatewayAuthRepairStatus(kind: GatewayAuthSetupIssueKind, operationLabel: string) {
  if (kind === "gateway-token") {
    return `Gateway auth changed during setup. Repairing the local Gateway token before ${operationLabel}...`;
  }

  return `Gateway device access needs operator scope. Repairing local device access before ${operationLabel}...`;
}

function buildGatewayAuthRetryStatus(kind: GatewayAuthSetupIssueKind, operationLabel: string) {
  if (kind === "gateway-token") {
    return `Gateway token repaired. Retrying ${operationLabel}...`;
  }

  return `Gateway device access repaired. Retrying ${operationLabel}...`;
}

function buildGatewayAuthRepairFailureMessage(
  kind: GatewayAuthSetupIssueKind,
  operationLabel: string,
  error: unknown
) {
  const detail = readSafeGatewayAuthDetail(kind, error);

  if (kind === "gateway-token") {
    return `AgentOS could not repair the local Gateway token before ${operationLabel}. Open Gateway settings, run Repair token, then retry ${operationLabel}. ${detail}`;
  }

  return `AgentOS could not repair local device access before ${operationLabel}. Open Gateway settings, run Repair access, then retry ${operationLabel}. ${detail}`;
}

function buildGatewayAuthRetryFailureMessage(
  kind: GatewayAuthSetupIssueKind,
  operationLabel: string,
  error: unknown
) {
  const detail = readSafeGatewayAuthDetail(kind, error);

  if (kind === "gateway-token") {
    return `Gateway token was repaired, but OpenClaw still rejected ${operationLabel}. Restart the OpenClaw Gateway, run agentos doctor, then retry ${operationLabel}. ${detail}`;
  }

  return `Gateway device access was repaired, but OpenClaw still rejected ${operationLabel}. Run agentos doctor, then retry ${operationLabel}. ${detail}`;
}

function resolveGatewayAuthSetupIssueFromText(message: string | null | undefined): GatewayAuthSetupIssue | null {
  if (isGatewayTokenRepairIssue(message)) {
    return {
      kind: "gateway-token",
      detail: "Gateway token mismatch."
    };
  }

  if (isGatewayDeviceAccessRepairIssue(message)) {
    return {
      kind: "device-access",
      detail: "Gateway device access needs operator scope."
    };
  }

  return null;
}

async function resolveGatewayAuthSetupIssueFromStatus(): Promise<GatewayAuthSetupIssue | null> {
  const status = await getGatewayNativeAuthStatus().catch(() => null);

  if (!status) {
    return null;
  }

  return resolveGatewayAuthSetupIssueFromText([
    status.native.issue,
    status.recommendation
  ].filter(Boolean).join("\n"));
}

async function resolveGatewayAuthSetupIssueAfterGatewayFailure(error: unknown): Promise<GatewayAuthSetupIssue | null> {
  if (!shouldProbeGatewayAuthStatusAfterFailure(error)) {
    return null;
  }

  return resolveGatewayAuthSetupIssueFromStatus();
}

function shouldProbeGatewayAuthStatusAfterFailure(error: unknown) {
  const message = readErrorMessage(error);

  return /Gateway-native operation failed|Timed out|timeout|unreachable|failed to connect|connection closed|gateway starting|retry shortly/i.test(message);
}

async function repairGatewayAuthForModelSetup(kind: GatewayAuthSetupIssueKind) {
  if (kind === "gateway-token") {
    const result = await generateGatewayNativeAuthToken();

    if (!result.verified) {
      throw new Error(
        result.verificationIssue ||
          result.restartIssue ||
          "Gateway token was rotated, but the new token did not verify after restarting OpenClaw."
      );
    }

    return result;
  }

  return repairGatewayNativeDeviceAccess();
}

function readSafeGatewayAuthDetail(kind: GatewayAuthSetupIssueKind, error: unknown) {
  const message = readErrorMessage(error);

  if (kind === "gateway-token" || isGatewayTokenRepairIssue(message)) {
    return "Gateway reported a token mismatch.";
  }

  if (kind === "device-access" || isGatewayDeviceAccessRepairIssue(message)) {
    return "Gateway reported missing operator device access.";
  }

  return redactErrorMessage(error, "Gateway auth repair failed.");
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error || "");
}
