import { beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ensureCliBuilt, exists, normalizePathForCompare, runCli } from './helpers/cli.js';

async function expectNoArtifacts(base: string): Promise<void> {
  expect(await exists(`${base}.hex`)).toBe(false);
  expect(await exists(`${base}.bin`)).toBe(false);
  expect(await exists(`${base}.d8dbg.json`)).toBe(false);
  expect(await exists(`${base}.lst`)).toBe(false);
}

describe('cli failure contract matrix', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('returns code 1 for missing entry file and writes no artifacts', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-missing-entry-'));
    const missingEntry = join(work, 'missing.zax');
    const outHex = join(work, 'out.hex');
    const base = join(work, 'out');

    const res = await runCli(['-o', outHex, missingEntry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('[ZAX001]');
    expect(res.stderr).toContain('Failed to read entry file');
    expect(res.stderr).not.toContain('zax [options] <entry.zax>');
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for unresolved imports with deterministic tried-path diagnostics', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-import-not-found-'));
    const entry = join(work, 'main.zax');
    const outHex = join(work, 'out.hex');
    const base = join(work, 'out');
    await writeFile(
      entry,
      ['import MissingModule', '', 'export func main(): void', '  nop', 'end', ''].join('\n'),
      'utf8',
    );

    const res = await runCli(['-o', outHex, entry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain(`${entry}:1:1`);
    expect(res.stderr).toContain('[ZAX003]');
    expect(res.stderr).toContain('Failed to resolve import MissingModule');
    expect(res.stderr).toContain('Tried:');
    expect(res.stderr).toContain(resolve(work, 'MissingModule.zax'));
    expect(res.stderr).not.toContain('zax [options] <entry.zax>');
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for import cycles and reports the closing import-site span', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-import-cycle-'));
    const entry = join(work, 'a.zax');
    const b = join(work, 'b.zax');
    const outHex = join(work, 'out.hex');
    const base = join(work, 'out');

    await writeFile(entry, 'import "b.zax"\n\nfunc main(): void\n  ret\nend\n', 'utf8');
    await writeFile(b, 'import "a.zax"\n\nfunc bmain(): void\n  ret\nend\n', 'utf8');

    const res = await runCli(['-o', outHex, entry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('[ZAX400]');
    expect(res.stderr).toContain('Import cycle detected');
    expect(res.stderr).toContain(`${b}:1:1`);
    expect(res.stderr).not.toContain('zax [options] <entry.zax>');
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for module-id collisions and reports colliding module span', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-module-id-collision-'));
    const entry = join(work, 'main.zax');
    const aDir = join(work, 'a');
    const bDir = join(work, 'b');
    const aModule = join(aDir, 'lib.zax');
    const bModule = join(bDir, 'lib.zax');
    const outHex = join(work, 'out.hex');
    const base = join(work, 'out');

    await writeFile(
      entry,
      [
        'import "a/lib.zax"',
        'import "b/lib.zax"',
        '',
        'func main(): void',
        '  ret',
        'end',
        '',
      ].join('\n'),
      'utf8',
    );
    await mkdir(aDir, { recursive: true });
    await mkdir(bDir, { recursive: true });
    await writeFile(aModule, 'func a_lib(): void\n  ret\nend\n', 'utf8');
    await writeFile(bModule, 'func b_lib(): void\n  ret\nend\n', 'utf8');

    const res = await runCli(['-o', outHex, entry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('[ZAX400]');
    expect(res.stderr).toContain('Module ID collision');
    expect(res.stderr).toContain(`${bModule}:1:1`);
    expect(res.stderr).not.toContain('zax [options] <entry.zax>');
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for parser diagnostics and does not print CLI usage text', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-parser-error-'));
    const entry = join(work, 'broken.zax');
    const outHex = join(work, 'out.hex');
    const base = join(work, 'out');
    await writeFile(entry, 'func main(: void\nend\n', 'utf8');

    const res = await runCli(['-o', outHex, entry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('[ZAX100]');
    expect(res.stderr).toContain('error:');
    expect(res.stderr).not.toContain('zax [options] <entry.zax>');
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for encoder diagnostics and writes no artifacts', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-encode-error-'));
    const entry = join(work, 'encode-error.zax');
    const outHex = join(work, 'out.hex');
    const base = join(work, 'out');
    await writeFile(entry, 'func main(): void\n  ld a, 300\nend\n', 'utf8');

    const res = await runCli(['-o', outHex, entry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('[ZAX200]');
    expect(res.stderr).toContain('ld A, n expects imm8');
    expect(res.stderr).not.toContain('zax [options] <entry.zax>');
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for emit/lowering diagnostics and writes no artifacts', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-emit-error-'));
    const entry = join(work, 'emit-error.zax');
    const outHex = join(work, 'out.hex');
    const base = join(work, 'out');
    await writeFile(
      entry,
      [
        'section code at $8000',
        'section code at $8100',
        'func main(): void',
        '  ret',
        'end',
        '',
      ].join('\n'),
      'utf8',
    );

    const res = await runCli(['-o', outHex, entry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('[ZAX300]');
    expect(res.stderr).toContain('Section "code" base address may be set at most once.');
    expect(res.stderr).not.toContain('zax [options] <entry.zax>');
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 1 for empty entry modules and writes no artifacts', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-empty-entry-'));
    const entry = join(work, 'empty.zax');
    const outHex = join(work, 'out.hex');
    const base = join(work, 'out');
    await writeFile(entry, '', 'utf8');

    const res = await runCli(['-o', outHex, entry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('[ZAX400]');
    expect(res.stderr).toContain('Program contains no declarations or instruction streams.');
    expect(res.stderr).not.toContain('zax [options] <entry.zax>');
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('emits compile diagnostics in deterministic sorted order across files', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-diagnostic-order-'));
    const entry = join(work, 'main.zax');
    const a = join(work, 'a.zax');
    const b = join(work, 'b.zax');
    const outHex = join(work, 'out.hex');
    const base = join(work, 'out');

    await writeFile(
      entry,
      ['import "b.zax"', 'import "a.zax"', '', 'func main(): void', '  ret', 'end', ''].join('\n'),
      'utf8',
    );
    await writeFile(a, 'func a(: void\nend\n', 'utf8');
    await writeFile(b, 'func b(: void\nend\n', 'utf8');

    const res = await runCli(['-o', outHex, entry]);

    expect(res.code).toBe(1);
    expect(res.stdout).toBe('');
    const normalizedStderr = normalizePathForCompare(res.stderr);
    const aLine1 = normalizePathForCompare(`${a}:1:1`);
    const aLine2 = normalizePathForCompare(`${a}:2:1`);
    const bLine1 = normalizePathForCompare(`${b}:1:1`);
    const bLine2 = normalizePathForCompare(`${b}:2:1`);
    const a1Pos = normalizedStderr.indexOf(aLine1);
    const a2Pos = normalizedStderr.indexOf(aLine2);
    const b1Pos = normalizedStderr.indexOf(bLine1);
    const b2Pos = normalizedStderr.indexOf(bLine2);
    expect(a1Pos).toBeGreaterThanOrEqual(0);
    expect(a2Pos).toBeGreaterThanOrEqual(0);
    expect(b1Pos).toBeGreaterThanOrEqual(0);
    expect(b2Pos).toBeGreaterThanOrEqual(0);
    expect(a1Pos).toBeLessThan(a2Pos);
    expect(a2Pos).toBeLessThan(b1Pos);
    expect(b1Pos).toBeLessThan(b2Pos);
    await expectNoArtifacts(base);

    await rm(work, { recursive: true, force: true });
  });

  it('returns code 2 for CLI parse errors and always includes usage text', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-usage-errors-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main(): void\n  nop\nend\n', 'utf8');

    const cases: Array<{ args: string[]; message: string }> = [
      { args: ['--badflag', entry], message: 'Unknown option' },
      { args: ['--output'], message: '--output expects a value' },
      { args: ['--output=', entry], message: '--output expects a value' },
      { args: ['--type=', entry], message: '--type expects a value' },
      { args: ['--include=', entry], message: '--include expects a value' },
    ];

    for (const c of cases) {
      const res = await runCli(c.args);
      expect(res.code).toBe(2);
      expect(res.stdout).toBe('');
      expect(res.stderr).toContain('zax:');
      expect(res.stderr).toContain(c.message);
      expect(res.stderr).toContain('zax [options] <entry.zax>');
      expect(res.stderr).toContain('Options:');
    }

    await rm(work, { recursive: true, force: true });
  });

  it('accepts uppercase output extensions and prints canonical primary artifact path', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-upper-ext-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main(): void\n  nop\nend\n', 'utf8');

    const outHexUpper = join(work, 'bundle.HEX');
    const resHex = await runCli(['--type', 'hex', '--output', outHexUpper, entry]);
    expect(resHex.code).toBe(0);
    expect(normalizePathForCompare(resHex.stdout.trim())).toBe(
      normalizePathForCompare(join(work, 'bundle.hex')),
    );
    expect(await exists(join(work, 'bundle.hex'))).toBe(true);

    const outBinUpper = join(work, 'bundle.BIN');
    const resBin = await runCli(['--type', 'bin', '--output', outBinUpper, entry]);
    expect(resBin.code).toBe(0);
    expect(normalizePathForCompare(resBin.stdout.trim())).toBe(
      normalizePathForCompare(join(work, 'bundle.bin')),
    );
    expect(await exists(join(work, 'bundle.bin'))).toBe(true);

    await rm(work, { recursive: true, force: true });
  });
});
