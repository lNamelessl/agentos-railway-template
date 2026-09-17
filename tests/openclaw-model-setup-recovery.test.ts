import assert from "node:assert/strict";
import { test } from "node:test";

import { createErrorSnapshot } from "@/lib/openclaw/fallback";
import {
  buildGatewayAuthBlockedMessage,
  GatewayAuthSetupRecoveryError,
  resolveGatewayAuthSetupIssueFromGatewayStatus,
  resolveGatewayAuthSetupIssueFromSnapshot,
  runWithGatewayAuthSetupRecovery
} from "@/lib/openclaw/model-setup-recovery";

test("model setup recovery detects Gateway token mismatch from snapshot diagnostics", () => {
  const snapshot = createErrorSnapshot("Gateway unavailable.", {
    installed: true,
    loaded: true,
    rpcOk: false
  });
  snapshot.diagnostics.transport = {
    mode: "native-ws",
    gatewayMode: "degraded",
    statusLabel: "degraded",
    recovery: "Check the OpenClaw Gateway token/password.",
    connectionState: "error",
    protocolVersion: null,
    protocolRange: {
      min: 1,
      max: 2
    },
    fallbackCounts: {},
    fallbackTotal: 1,
    recentFallbackDiagnostics: [],
    lastNativeError: "INVALID_REQUEST: unauthorized: gateway token mismatch (provide gateway auth token)",
    lastNativeFailureAt: new Date("2026-05-22T10:00:00.000Z").toISOString(),
    lastConnectedAt: null,
    lastDisconnectedAt: null
  };

  const issue = resolveGatewayAuthSetupIssueFromSnapshot(snapshot);

  assert.equal(issue?.kind, "gateway-token");
  assert.ok(issue);
  assert.match(buildGatewayAuthBlockedMessage(issue, "model setup"), /local Gateway token no longer matches OpenClaw/);
});

test("model setup recovery detects missing operator scope from Gateway status", () => {
  const issue = resolveGatewayAuthSetupIssueFromGatewayStatus({
    rpc: {
      ok: true,
      capability: "connected_no_operator_scope",
      auth: {
        role: "operator",
        scopes: [],
        capability: "connected_no_operator_scope"
      }
    }
  });

  assert.equal(issue?.kind, "device-access");
});

test("model setup recovery detects read-only Gateway device access", () => {
  const issue = resolveGatewayAuthSetupIssueFromGatewayStatus({
    rpc: {
      ok: true,
      capability: "read_only",
      auth: {
        role: "operator",
        scopes: [
          "operator.pairing",
          "operator.read"
        ],
        capability: "read_only"
      }
    }
  });

  assert.equal(issue?.kind, "device-access");
});

test("model setup recovery detects pending Gateway device pairing", () => {
  const issue = resolveGatewayAuthSetupIssueFromGatewayStatus({
    rpc: {
      ok: false,
      capability: "pairing_pending",
      error: "scope upgrade pending approval"
    }
  });

  assert.equal(issue?.kind, "device-access");
});

test("model setup recovery ignores stale Gateway token mismatch after reconnect", () => {
  const snapshot = createErrorSnapshot("OpenClaw system readiness snapshot.", {
    installed: true,
    loaded: true,
    rpcOk: true
  });
  snapshot.diagnostics.issues = [];
  snapshot.diagnostics.gatewayFallbackDiagnostics = [{
    at: new Date("2026-05-22T10:00:00.000Z").toISOString(),
    operation: "config.set",
    operationLabel: "Config set",
    kind: "auth",
    issue: "INVALID_REQUEST: unauthorized: gateway token mismatch (provide gateway auth token)",
    recovery: "Check the OpenClaw Gateway token/password."
  }];
  snapshot.diagnostics.gatewayFallbackReasons = [
    "Config set (config.set): auth: gateway token mismatch Recovery: Check the OpenClaw Gateway token/password."
  ];
  snapshot.diagnostics.transport = {
    mode: "native-ws",
    gatewayMode: "native-ws",
    statusLabel: "Native Gateway: OK",
    recovery: null,
    connectionState: "connected",
    protocolVersion: 4,
    protocolRange: {
      min: 3,
      max: 4
    },
    fallbackCounts: {
      "config.set": 1
    },
    fallbackTotal: 1,
    recentFallbackDiagnostics: [],
    lastNativeError: "INVALID_REQUEST: unauthorized: gateway token mismatch (provide gateway auth token)",
    lastNativeFailureAt: new Date("2026-05-22T10:00:00.000Z").toISOString(),
    lastConnectedAt: new Date("2026-05-22T10:01:00.000Z").toISOString(),
    lastDisconnectedAt: new Date("2026-05-22T10:00:30.000Z").toISOString()
  };

  assert.equal(resolveGatewayAuthSetupIssueFromSnapshot(snapshot), null);
});

test("model setup recovery repairs Gateway auth and retries the model config mutation once", async () => {
  const statuses: string[] = [];
  const repairs: string[] = [];
  let attempts = 0;

  const result = await runWithGatewayAuthSetupRecovery(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("unauthorized: gateway token mismatch (provide gateway auth token)");
      }

      return "saved";
    },
    {
      operationLabel: "setting the default model",
      onStatus: (message) => {
        statuses.push(message);
      },
      repairGatewayAuth: async (kind) => {
        repairs.push(kind);
      }
    }
  );

  assert.equal(result.value, "saved");
  assert.equal(result.repaired?.kind, "gateway-token");
  assert.equal(attempts, 2);
  assert.deepEqual(repairs, ["gateway-token"]);
  assert.match(statuses.join("\n"), /Repairing the local Gateway token/);
  assert.match(statuses.join("\n"), /Retrying setting the default model/);
});

test("Gateway auth recovery can classify native timeouts from current auth status", async () => {
  const repairs: string[] = [];
  let attempts = 0;

  const result = await runWithGatewayAuthSetupRecovery(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('Timed out waiting for OpenClaw Gateway method "agents.list".');
      }

      return "synced";
    },
    {
      operationLabel: "syncing the agent config",
      resolveGatewayAuthIssue: () => ({
        kind: "device-access",
        detail: "Gateway device access needs operator scope."
      }),
      repairGatewayAuth: async (kind) => {
        repairs.push(kind);
      }
    }
  );

  assert.equal(result.value, "synced");
  assert.equal(result.repaired?.kind, "device-access");
  assert.equal(attempts, 2);
  assert.deepEqual(repairs, ["device-access"]);
});

test("model setup recovery returns a clean message when Gateway auth repair fails", async () => {
  await assert.rejects(
    () => runWithGatewayAuthSetupRecovery(
      async () => {
        throw new Error("unauthorized: gateway token mismatch (provide gateway auth token)");
      },
      {
        operationLabel: "adding models",
        repairGatewayAuth: async () => {
          throw new Error("repair failed with token=query-secret");
        }
      }
    ),
    (error) => {
      assert.equal(error instanceof GatewayAuthSetupRecoveryError, true);
      assert.match((error as Error).message, /could not repair the local Gateway token/);
      assert.doesNotMatch((error as Error).message, /query-secret/);
      assert.match((error as Error).message, /Gateway reported a token mismatch/);
      return true;
    }
  );
});
