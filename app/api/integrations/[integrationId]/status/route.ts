import { NextResponse } from "next/server";

import {
  getIntegrationDescriptor,
  isIntegrationId
} from "@/lib/agentos/integrations/registry";
import { getOpenClawAdapter } from "@/lib/openclaw/adapter/openclaw-adapter";
import {
  buildSurfaceGatewayAccessFromMessage,
  createEmptySurfaceRuntimeSnapshot,
  normalizeSurfaceIntegrationStatus,
  normalizeSurfaceRuntimeFromChannelStatus
} from "@/lib/openclaw/surface-runtime";
import { redactErrorMessage } from "@/lib/security/redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await context.params;

  if (!isIntegrationId(integrationId)) {
    return NextResponse.json(
      {
        error: "Unknown integration."
      },
      { status: 404 }
    );
  }

  const descriptor = getIntegrationDescriptor(integrationId);
  if (!descriptor?.surfaceProvider) {
    return NextResponse.json(
      {
        error: "This integration does not expose an OpenClaw channel status check."
      },
      { status: 400 }
    );
  }

  try {
    const payload = await getOpenClawAdapter().getChannelStatus(
      {
        probe: true,
        timeoutMs: 5_000
      },
      {
        timeoutMs: 7_000
      }
    );
    const runtime = normalizeSurfaceRuntimeFromChannelStatus(payload, {
      source: "gateway-probe",
      checkedAt: new Date().toISOString()
    });
    const resolved = normalizeSurfaceIntegrationStatus(runtime, descriptor.surfaceProvider);

    return NextResponse.json({
      ok: resolved.status === "connected",
      status: resolved.status,
      statusLabel: resolved.statusLabel,
      connectionHealth: resolved.connectionHealth,
      lastSyncLabel: "Checked just now",
      uptimeLabel: "Unavailable from OpenClaw",
      rateLimitLabel: "Unavailable from OpenClaw",
      errorMessage: resolved.errorMessage,
      sourceMethods: ["OpenClawAdapter.getChannelStatus", "channels.status"]
    });
  } catch (error) {
    const message = redactErrorMessage(error, "OpenClaw channel status is unavailable.");
    const runtime = {
      ...createEmptySurfaceRuntimeSnapshot("unavailable", message),
      gatewayAccess: buildSurfaceGatewayAccessFromMessage(message)
    };
    const resolved = normalizeSurfaceIntegrationStatus(runtime, descriptor.surfaceProvider);

    return NextResponse.json({
      ok: false,
      status: resolved.status,
      statusLabel: resolved.statusLabel,
      connectionHealth: resolved.connectionHealth,
      lastSyncLabel: "Check failed",
      uptimeLabel: "Unavailable from OpenClaw",
      rateLimitLabel: "Unavailable from OpenClaw",
      errorMessage: resolved.errorMessage ?? message,
      sourceMethods: ["OpenClawAdapter.getChannelStatus", "channels.status"]
    });
  }
}
