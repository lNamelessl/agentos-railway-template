const gatewayConfigRateLimitPattern = /(^|[^a-z])rate limit(?:ed|ing)?\b|retry after|too many requests|HTTP\s*429/i;
const gatewayConfigMutationPattern = /config\.(?:get|schema|patch|apply|set|unset)|gateway config|config updates?/i;

export function isGatewayConfigRateLimitMessage(message: string | null | undefined) {
  const normalized = message?.trim() ?? "";
  return gatewayConfigRateLimitPattern.test(normalized) && gatewayConfigMutationPattern.test(normalized);
}

export function readGatewayConfigRateLimitRetryAfterMsFromMessage(message: string | null | undefined) {
  if (!isGatewayConfigRateLimitMessage(message)) {
    return null;
  }

  const match = (message ?? "").match(
    /retry after\s+(\d+(?:\.\d+)?)\s*(ms|msec|millisecond(?:s)?|s|sec|second(?:s)?|m|min|minute(?:s)?)?/i
  );

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  const unit = match[2]?.toLowerCase() ?? "s";
  if (unit === "ms" || unit === "msec" || unit.startsWith("millisecond")) {
    return Math.round(amount);
  }

  if (unit === "m" || unit === "min" || unit.startsWith("minute")) {
    return Math.round(amount * 60_000);
  }

  return Math.round(amount * 1_000);
}

export function formatGatewayConfigRateLimitMessage(
  message: string,
  actionLabel = "the config action"
) {
  const retryAfterMs = readGatewayConfigRateLimitRetryAfterMsFromMessage(message);
  const waitLabel = retryAfterMs ? `about ${formatDuration(retryAfterMs)}` : "for the Gateway config cooldown";

  return `OpenClaw Gateway is rate limiting config updates. Wait ${waitLabel}, then retry ${actionLabel}. AgentOS did not use CLI fallback for this operation.`;
}

function formatDuration(valueMs: number) {
  if (valueMs < 1_000) {
    return `${valueMs}ms`;
  }

  const seconds = Math.ceil(valueMs / 1_000);
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
