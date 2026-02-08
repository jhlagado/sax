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
  /**
   * Unknown/unclassified diagnostic.
   *
   * Use a more specific ID when possible; this remains for forward compatibility.
   */
  Unknown: 'ZAX000',

  /** Failed to read a source file from disk. */
  IoReadFailed: 'ZAX001',

  /** Internal error during parsing (unexpected exception). */
  InternalParseError: 'ZAX002',

  /** Import could not be resolved on any search path. */
  ImportNotFound: 'ZAX003',

  /** Generic parse error (syntax / unsupported in current PR subset). */
  ParseError: 'ZAX100',

  /** Generic instruction encoding error (unsupported mnemonic/operands, out-of-range imm, etc.). */
  EncodeError: 'ZAX200',

  /** Generic emission/lowering error (layout/packing/symbol collisions, etc.). */
  EmitError: 'ZAX300',

  /** Generic semantic evaluation error (env building, imm evaluation, etc.). */
  SemanticsError: 'ZAX400',

  /** Divide by zero in an imm expression. */
  ImmDivideByZero: 'ZAX401',

  /** Modulo by zero in an imm expression. */
  ImmModuloByZero: 'ZAX402',

  /** Type/layout error (unknown type, recursion, missing array length, etc.). */
  TypeError: 'ZAX403',
} as const;

/**
 * Union type of all defined diagnostic IDs.
 */
export type DiagnosticId = (typeof DiagnosticIds)[keyof typeof DiagnosticIds];
