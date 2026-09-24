export interface ParsedVoiceEnv {
  readonly values: ReadonlyMap<string, string>;
  readonly missing: readonly string[];
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseKeyValueEnv(text: string, required: readonly string[] = []): ParsedVoiceEnv {
  const values = new Map<string, string>();
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (!KEY_PATTERN.test(key)) continue;
    values.set(key, unquote(trimmed.slice(separator + 1).trim()));
  }

  const missing = required.filter((key) => !values.get(key));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable name(s): ${missing.join(', ')}`);
  }

  return { values, missing };
}

export function redactSecretValues(message: unknown, secrets: Iterable<string>): string {
  let redacted = message instanceof Error ? message.message : String(message);
  for (const secret of secrets) {
    if (!secret) continue;
    redacted = redacted.split(secret).join('[redacted]');
  }
  return redacted;
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}
