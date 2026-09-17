import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatGatewayConfigRateLimitMessage,
  isGatewayConfigRateLimitMessage,
  readGatewayConfigRateLimitRetryAfterMsFromMessage
} from "@/lib/openclaw/gateway-config-errors";

test("Gateway config rate-limit helper detects config.patch cooldowns", () => {
  const message =
    "UNAVAILABLE: rate limit exceeded for config.patch; retry after 60s Gateway-native operation failed; CLI fallback disabled for this operation.";

  assert.equal(isGatewayConfigRateLimitMessage(message), true);
  assert.equal(readGatewayConfigRateLimitRetryAfterMsFromMessage(message), 60_000);
  assert.match(
    formatGatewayConfigRateLimitMessage(message, "surface provisioning"),
    /Wait about 1 minute, then retry surface provisioning/
  );
});

test("Gateway config rate-limit helper ignores unrelated Gateway auth failures", () => {
  assert.equal(
    isGatewayConfigRateLimitMessage("Gateway scope upgrade pending approval for operator.admin"),
    false
  );
});
