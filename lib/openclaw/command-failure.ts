import { redactSecretText } from "@/lib/security/redaction";

export function stringifyCommandFailure(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }

  const stdout = "stdout" in error ? stringifyFailureChunk(error.stdout) : "";
  const stderr = "stderr" in error ? stringifyFailureChunk(error.stderr) : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";

  return redactSecretText(`${message}\n${stdout}\n${stderr}`);
}

export function isOpenClawInvalidConfigError(error: unknown) {
  const detail = stringifyCommandFailure(error);
  const fallbackMessage = error instanceof Error ? error.message : "";
  const combined = `${detail}\n${fallbackMessage}`;

  return (
    /OpenClaw config is invalid/i.test(combined) ||
    /Invalid config at .*openclaw\.json/i.test(combined) ||
    /Status, health, logs, and doctor commands still run with invalid config/i.test(combined)
  );
}

function stringifyFailureChunk(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString();
  }

  return "";
}
