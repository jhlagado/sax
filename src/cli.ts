#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from './compile.js';
import type { Diagnostic } from './diagnostics/types.js';
import { defaultFormatWriters } from './formats/index.js';
import type { Artifact } from './formats/types.js';
import type { CaseStyleMode, OpStackPolicyMode } from './pipeline.js';

type CliExit = { code: number };

type CliOptions = {
  entryFile: string;
  outputPath?: string;
  outputType: 'hex' | 'bin';
  emitBin: boolean;
  emitHex: boolean;
  emitD8m: boolean;
  emitListing: boolean;
  caseStyle: CaseStyleMode;
  opStackPolicy: OpStackPolicyMode;
  typePaddingWarnings: boolean;
  includeDirs: string[];
};

function usage(): string {
  return [
    'zax [options] <entry.zax>',
    '',
    'Options:',
    '  -o, --output <file>   Primary output path (must match --type extension)',
    '  -t, --type <type>     Primary output type: hex|bin (default: hex)',
    '  -n, --nolist          Suppress .lst',
    '      --nobin           Suppress .bin',
    '      --nohex           Suppress .hex',
    '      --nod8m           Suppress .d8dbg.json',
    '      --case-style <m>  Case-style lint mode: off|upper|lower|consistent',
    '      --op-stack-policy <m> Op stack-policy mode: off|warn|error',
    '      --type-padding-warn Emit warnings for power-of-2 type storage padding',
    '  -I, --include <dir>   Add import search path (repeatable)',
    '  -V, --version         Print version',
    '  -h, --help            Show help',
    '',
    'Notes:',
    '  - <entry.zax> must be the last argument (assembler-style).',
    '  - Output artifacts are written next to the primary output using the artifact base name.',
    '',
  ].join('\n');
}

function fail(message: string): never {
  throw Object.assign(new Error(message), { name: 'CliError' });
}

function parseArgs(argv: string[]): CliOptions | CliExit {
  let outputPath: string | undefined;
  let outputType: 'hex' | 'bin' = 'hex';
  let emitBin = true;
  let emitHex = true;
  let emitD8m = true;
  let emitListing = true;
  let caseStyle: CaseStyleMode = 'off';
  let opStackPolicy: OpStackPolicyMode = 'off';
  let typePaddingWarnings = false;
  const includeDirs: string[] = [];
  let entryFile: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-h' || a === '--help') {
      process.stdout.write(usage());
      return { code: 0 };
    }
    if (a === '-V' || a === '--version') {
      const require = createRequire(import.meta.url);
      const here = dirname(fileURLToPath(import.meta.url));
      const packageJsonPath = resolve(here, '..', '..', 'package.json');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const pkg = require(packageJsonPath) as { version?: unknown };
      process.stdout.write(`${String(pkg.version ?? '0.0.0')}\n`);
      return { code: 0 };
    }
    if (a === '-o' || a === '--output' || a.startsWith('--output=')) {
      if (a.startsWith('--output=')) {
        const v = a.slice('--output='.length);
        if (!v) fail(`--output expects a value`);
        outputPath = v;
        continue;
      }
      const v = argv[++i];
      if (!v) fail(`${a} expects a value`);
      outputPath = v;
      continue;
    }
    if (a === '-t' || a === '--type' || a.startsWith('--type=')) {
      if (a.startsWith('--type=')) {
        const v = a.slice('--type='.length);
        if (!v) fail(`--type expects a value`);
        if (v !== 'hex' && v !== 'bin') fail(`Unsupported --type "${v}" (expected hex|bin)`);
        outputType = v;
        continue;
      }
      const v = argv[++i];
      if (!v) fail(`${a} expects a value`);
      if (v !== 'hex' && v !== 'bin') fail(`Unsupported --type "${v}" (expected hex|bin)`);
      outputType = v;
      continue;
    }
    if (a === '-n' || a === '--nolist') {
      emitListing = false;
      continue;
    }
    if (a === '--nobin') {
      emitBin = false;
      continue;
    }
    if (a === '--nohex') {
      emitHex = false;
      continue;
    }
    if (a === '--nod8m') {
      emitD8m = false;
      continue;
    }
    if (a === '--case-style' || a.startsWith('--case-style=')) {
      const v = a.startsWith('--case-style=')
        ? a.slice('--case-style='.length)
        : ((argv[++i] ?? '') as string);
      if (!v) fail(`--case-style expects a value`);
      if (v !== 'off' && v !== 'upper' && v !== 'lower' && v !== 'consistent') {
        fail(`Unsupported --case-style "${v}" (expected off|upper|lower|consistent)`);
      }
      caseStyle = v;
      continue;
    }
    if (a === '--op-stack-policy' || a.startsWith('--op-stack-policy=')) {
      const v = a.startsWith('--op-stack-policy=')
        ? a.slice('--op-stack-policy='.length)
        : ((argv[++i] ?? '') as string);
      if (!v) fail(`--op-stack-policy expects a value`);
      if (v !== 'off' && v !== 'warn' && v !== 'error') {
        fail(`Unsupported --op-stack-policy "${v}" (expected off|warn|error)`);
      }
      opStackPolicy = v;
      continue;
    }
    if (a === '--type-padding-warn') {
      typePaddingWarnings = true;
      continue;
    }
    if (a === '-I' || a === '--include' || a.startsWith('--include=')) {
      if (a.startsWith('--include=')) {
        const v = a.slice('--include='.length);
        if (!v) fail(`--include expects a value`);
        includeDirs.push(v);
        continue;
      }
      const v = argv[++i];
      if (!v) fail(`${a} expects a value`);
      includeDirs.push(v);
      continue;
    }
    if (a.startsWith('-')) {
      fail(`Unknown option "${a}"`);
    }
    if (entryFile !== undefined) {
      fail(`Expected exactly one <entry.zax> argument (and it must be last)`);
    }
    if (i !== argv.length - 1) {
      fail(`Expected exactly one <entry.zax> argument (and it must be last)`);
    }
    entryFile = a;
  }

  if (!entryFile) {
    fail(`Expected exactly one <entry.zax> argument (and it must be last)`);
  }

  if (outputType === 'hex' && !emitHex) fail(`--type hex requires HEX output to be enabled`);
  if (outputType === 'bin' && !emitBin) fail(`--type bin requires BIN output to be enabled`);

  if (outputPath) {
    const ext = extname(outputPath).toLowerCase();
    const wantExt = outputType === 'hex' ? '.hex' : '.bin';
    if (ext !== wantExt) {
      fail(`--output must end with "${wantExt}" when --type is "${outputType}"`);
    }
  }

  return {
    entryFile,
    ...(outputPath ? { outputPath } : {}),
    outputType,
    emitBin,
    emitHex,
    emitD8m,
    emitListing,
    caseStyle,
    opStackPolicy,
    typePaddingWarnings,
    includeDirs,
  };
}

function artifactBase(entryFile: string, outputType: 'hex' | 'bin', outputPath?: string): string {
  if (outputPath) {
    const resolved = resolve(outputPath);
    const ext = extname(resolved);
    return ext.length > 0 ? resolved.slice(0, -ext.length) : resolved;
  }
  const entry = resolve(entryFile);
  const ext = extname(entry);
  const stem = ext.length > 0 ? entry.slice(0, -ext.length) : entry;
  // Default primary output path is sibling of entry with extension derived from outputType.
  return stem;
}

async function writeArtifacts(
  base: string,
  artifacts: Artifact[],
  outputType: 'hex' | 'bin',
): Promise<void> {
  const byKind = new Map<string, Artifact>();
  for (const a of artifacts) byKind.set(a.kind, a);

  const hexPath = `${base}.hex`;
  const binPath = `${base}.bin`;
  const d8mPath = `${base}.d8dbg.json`;
  const lstPath = `${base}.lst`;

  const writes: Array<Promise<void>> = [];
  const ensureDir = async (p: string) => mkdir(dirname(p), { recursive: true });

  const hex = byKind.get('hex');
  if (hex && hex.kind === 'hex') {
    await ensureDir(hexPath);
    writes.push(writeFile(hexPath, hex.text, 'utf8'));
  }
  const bin = byKind.get('bin');
  if (bin && bin.kind === 'bin') {
    await ensureDir(binPath);
    writes.push(writeFile(binPath, Buffer.from(bin.bytes)));
  }
  const d8m = byKind.get('d8m');
  if (d8m && d8m.kind === 'd8m') {
    await ensureDir(d8mPath);
    writes.push(writeFile(d8mPath, JSON.stringify(d8m.json, null, 2) + '\n', 'utf8'));
  }
  const lst = byKind.get('lst');
  if (lst && lst.kind === 'lst') {
    await ensureDir(lstPath);
    writes.push(writeFile(lstPath, lst.text, 'utf8'));
  }

  await Promise.all(writes);

  // Primary output path is always the canonical sibling of the base.
  // (The `--output` flag is used only to choose the artifact base.)
  const primaryPath = outputType === 'hex' ? hexPath : binPath;
  process.stdout.write(`${primaryPath}\n`);
}

function normalizeDiagnosticPath(file: string): string {
  const normalized = file.replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function compareDiagnosticsForCli(a: Diagnostic, b: Diagnostic): number {
  const fileCmp = normalizeDiagnosticPath(a.file).localeCompare(normalizeDiagnosticPath(b.file));
  if (fileCmp !== 0) return fileCmp;

  const lineCmp = (a.line ?? Number.POSITIVE_INFINITY) - (b.line ?? Number.POSITIVE_INFINITY);
  if (lineCmp !== 0) return lineCmp;

  const colCmp = (a.column ?? Number.POSITIVE_INFINITY) - (b.column ?? Number.POSITIVE_INFINITY);
  if (colCmp !== 0) return colCmp;

  const sevRank = (severity: Diagnostic['severity']): number => {
    if (severity === 'error') return 0;
    if (severity === 'warning') return 1;
    return 2;
  };
  const sevCmp = sevRank(a.severity) - sevRank(b.severity);
  if (sevCmp !== 0) return sevCmp;

  const idCmp = a.id.localeCompare(b.id);
  if (idCmp !== 0) return idCmp;

  return a.message.localeCompare(b.message);
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    if ('code' in parsed) return parsed.code;

    const base = artifactBase(parsed.entryFile, parsed.outputType, parsed.outputPath);

    const res = await compile(
      parsed.entryFile,
      {
        emitBin: parsed.emitBin,
        emitHex: parsed.emitHex,
        emitD8m: parsed.emitD8m,
        emitListing: parsed.emitListing,
        caseStyle: parsed.caseStyle,
        opStackPolicy: parsed.opStackPolicy,
        typePaddingWarnings: parsed.typePaddingWarnings,
        includeDirs: parsed.includeDirs,
      },
      { formats: defaultFormatWriters },
    );

    const sortedDiagnostics = [...res.diagnostics].sort(compareDiagnosticsForCli);
    if (sortedDiagnostics.length > 0) {
      for (const d of sortedDiagnostics) {
        const loc =
          d.line !== undefined && d.column !== undefined
            ? `${d.file}:${d.line}:${d.column}`
            : d.file;
        process.stderr.write(`${loc}: ${d.severity}: [${d.id}] ${d.message}\n`);
      }
    }

    if (sortedDiagnostics.some((d) => d.severity === 'error')) {
      return 1;
    }

    await writeArtifacts(base, res.artifacts, parsed.outputType);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`zax: ${msg}\n`);
    process.stderr.write(`${usage()}\n`);
    return 2;
  }
}

function stripExtendedWindowsPrefix(path: string): string {
  if (path.startsWith('\\\\?\\UNC\\')) return `\\\\${path.slice(8)}`;
  if (path.startsWith('\\\\?\\')) return path.slice(4);
  return path;
}

function normalizePathForCompare(path: string): string {
  const resolved = resolve(path);
  const real = (() => {
    try {
      return realpathSync.native(resolved);
    } catch {
      return resolved;
    }
  })();
  const stripped = stripExtendedWindowsPrefix(real);
  const normalized = stripped.replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function samePath(a: string, b: string): boolean {
  return normalizePathForCompare(a) === normalizePathForCompare(b);
}

function isDirectCliInvocation(invokedAs: string | undefined): boolean {
  if (!invokedAs) return false;
  const self = fileURLToPath(import.meta.url);
  if (samePath(invokedAs, self)) return true;

  const invoked = normalizePathForCompare(invokedAs);
  const normalizedSelf = normalizePathForCompare(self);
  // Windows CI can surface different canonical path spellings for the same file.
  // Fall back to stable suffix matching for the built CLI entry path.
  return invoked.endsWith('/dist/src/cli.js') && normalizedSelf.endsWith('/dist/src/cli.js');
}

if (isDirectCliInvocation(process.argv[1])) {
  // eslint-disable-next-line no-void
  void runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
