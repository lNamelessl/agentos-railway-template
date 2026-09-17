import { NextResponse } from "next/server";

import { getMissionControlSnapshot } from "@/lib/agentos/control-plane";
import { redactSecrets } from "@/lib/security/redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getMissionControlSnapshot();
  return NextResponse.json(redactSecrets({
    generatedAt: snapshot.generatedAt,
    mode: snapshot.mode,
    diagnostics: snapshot.diagnostics,
    presence: snapshot.presence
  }));
}
