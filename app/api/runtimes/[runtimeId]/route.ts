import { NextResponse } from "next/server";

import { getRuntimeOutput } from "@/lib/agentos/control-plane";
import { redactErrorMessage, redactSecrets } from "@/lib/security/redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runtimeId: string }> }
) {
  try {
    const { runtimeId } = await context.params;
    const output = await getRuntimeOutput(decodeURIComponent(runtimeId));
    return NextResponse.json(redactSecrets(output));
  } catch (error) {
    return NextResponse.json(
      {
        error: redactErrorMessage(error, "Unable to load runtime output.")
      },
      { status: 400 }
    );
  }
}
