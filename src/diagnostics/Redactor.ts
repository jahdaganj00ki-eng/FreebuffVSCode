// `Redactor.ts` — deterministic secret redaction.
//
// Applied to every string that crosses the adapter boundary and to
// everything written into OutputChannels. The patterns are
// deliberately conservative: match a superset, never a subset.

const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  // OpenAI / Anthropic style keys
  /\b(?:sk|sk-ant|sk-proj)-[A-Za-z0-9_-]{8,}/g,
  // GitHub classic tokens
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  // GitHub fine-grained PAT
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  // Slack tokens
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  // Authorization headers and query-style key/value pairs
  /\b(?:authorization|cookie|set-cookie|x-api-key|x-auth-token)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]+/gi,
  // Generic key=value secret assignments (conservative)
  /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9._-]{12,}/gi,
  // Environment variable style for the known SDK variable
  /\bCODEBUFF_API_KEY\s*[:=]\s*["']?[A-Za-z0-9._-]{8,}/gi,
  // Bearer tokens
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  // PEM blocks (no leading word boundary: '-----' starts with a non-word char)
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
];

export const REDACTED_PLACEHOLDER = '«REDACTED»';

export type Redactor = (input: string) => string;

export function createRedactor(): Redactor {
  return (input: string): string => {
    let out = input;
    for (const pattern of SECRET_PATTERNS) {
      out = out.replace(pattern, REDACTED_PLACEHOLDER);
    }
    return out;
  };
}
