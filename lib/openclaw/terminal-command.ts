export function isOpenClawTerminalCommand(command: string | null | undefined) {
  const segments = splitOpenClawShellSegments(command);

  if (segments.length === 0) {
    return false;
  }

  return segments.every((segment) => isOpenClawExecutable(readFirstShellToken(segment)?.toLowerCase()));
}

function isOpenClawExecutable(executable: string | null | undefined) {
  return Boolean(
    executable === "openclaw" ||
    executable?.endsWith("/openclaw") ||
    executable?.endsWith("\\openclaw")
  );
}

function splitOpenClawShellSegments(command: string | null | undefined) {
  const trimmed = command?.trim();

  if (!trimmed) {
    return [];
  }

  const segments: string[] = [];
  let start = 0;
  let index = 0;
  let mode: "unquoted" | "single" | "double" = "unquoted";

  while (index < trimmed.length) {
    const char = trimmed[index];
    const next = trimmed[index + 1];

    if (mode === "single") {
      if (char === "'") {
        mode = "unquoted";
      }
      index += 1;
      continue;
    }

    if (mode === "double") {
      if (char === "\\") {
        index += 2;
        continue;
      }

      if (char === '"') {
        mode = "unquoted";
      }
      index += 1;
      continue;
    }

    if (char === "'") {
      mode = "single";
      index += 1;
      continue;
    }

    if (char === '"') {
      mode = "double";
      index += 1;
      continue;
    }

    if (char === "&" && next === "&") {
      const segment = trimmed.slice(start, index).trim();
      if (!segment) {
        return [];
      }
      segments.push(segment);
      index += 2;
      start = index;
      continue;
    }

    if (char === ";" || char === "|" || char === "\n" || char === "\r" || char === "`" || char === "<" || char === ">") {
      return [];
    }

    if (char === "$" && next === "(") {
      return [];
    }

    index += 1;
  }

  const lastSegment = trimmed.slice(start).trim();
  if (!lastSegment) {
    return [];
  }

  segments.push(lastSegment);
  return segments;
}

function readFirstShellToken(command: string | null | undefined) {
  const trimmed = command?.trim();

  if (!trimmed) {
    return null;
  }

  let index = 0;

  while (index < trimmed.length && /\s/.test(trimmed[index])) {
    index += 1;
  }

  if (index >= trimmed.length) {
    return null;
  }

  let token = "";
  let mode: "unquoted" | "single" | "double" = "unquoted";

  while (index < trimmed.length) {
    const char = trimmed[index];

    if (mode === "unquoted") {
      if (/\s/.test(char)) {
        break;
      }

      if (char === "'") {
        mode = "single";
        index += 1;
        continue;
      }

      if (char === '"') {
        mode = "double";
        index += 1;
        continue;
      }

      if (char === "\\" && index + 1 < trimmed.length) {
        token += trimmed[index + 1];
        index += 2;
        continue;
      }

      token += char;
      index += 1;
      continue;
    }

    if (mode === "single") {
      if (char === "'") {
        mode = "unquoted";
        index += 1;
        continue;
      }

      token += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      mode = "unquoted";
      index += 1;
      continue;
    }

    if (char === "\\" && index + 1 < trimmed.length) {
      token += trimmed[index + 1];
      index += 2;
      continue;
    }

    token += char;
    index += 1;
  }

  return token;
}
