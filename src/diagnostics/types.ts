export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  id: DiagnosticId; // stable (e.g., ZAX001)
  severity: DiagnosticSeverity;
  message: string;
  file: string;
  line?: number; // 1-based, optional when unknown
  column?: number; // 1-based, optional when unknown
}

// Intentionally minimal starter set for PR0. Later PRs add IDs via contract-change PRs.
export const DiagnosticIds = {
  Unknown: 'ZAX000',
} as const;

export type DiagnosticId = (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
