/**
 * Severity level for a diagnostic.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * A compiler diagnostic (error/warning/info) with an optional source location.
 *
 * Diagnostics must have stable IDs so downstream tooling can rely on them.
 */
export interface Diagnostic {
  /** Stable diagnostic identifier (e.g., `ZAX001`). */
  id: DiagnosticId;
  severity: DiagnosticSeverity;
  message: string;
  file: string;
  /** 1-based line number, when known. */
  line?: number;
  /** 1-based column number, when known. */
  column?: number;
}

/**
 * Known diagnostic IDs.
 *
 * PR0 started with a minimal set; later PRs should extend this via contract changes.
 */
export const DiagnosticIds = {
  Unknown: 'ZAX000',
} as const;

/**
 * Union type of all defined diagnostic IDs.
 */
export type DiagnosticId = (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
