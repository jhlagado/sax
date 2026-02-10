import { beforeAll, describe, expect, it } from 'vitest';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function buildOnce(): Promise<void> {
  await execFileAsync('yarn', ['-s', 'build'], {
    encoding: 'utf8',
    // On Windows, yarn is a .cmd shim; running via the shell ensures it resolves correctly.
    shell: process.platform === 'win32',
  });
}

async function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const node = process.execPath;
  const cliPath = resolve(__dirname, '..', 'dist', 'src', 'cli.js');
  try {
    const { stdout, stderr } = await execFileAsync(node, [cliPath, ...args], { encoding: 'utf8' });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('cli artifacts', () => {
  beforeAll(async () => {
    await buildOnce();
  }, 90_000);

  it('writes default sibling artifacts from -o output path', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main(): void\n  asm\n    nop\nend\n', 'utf8');

    const outHex = join(work, 'out.hex');
    const res = await runCli(['-o', outHex, entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outHex);

    expect(await exists(join(work, 'out.hex'))).toBe(true);
    expect(await exists(join(work, 'out.bin'))).toBe(true);
    expect(await exists(join(work, 'out.d8dbg.json'))).toBe(true);
    expect(await exists(join(work, 'out.lst'))).toBe(true);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('uses entry stem as default primary output path when -o is omitted', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-default-out-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main(): void\n  asm\n    nop\nend\n', 'utf8');

    const res = await runCli([entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(join(work, 'main.hex'));

    expect(await exists(join(work, 'main.hex'))).toBe(true);
    expect(await exists(join(work, 'main.bin'))).toBe(true);
    expect(await exists(join(work, 'main.d8dbg.json'))).toBe(true);
    expect(await exists(join(work, 'main.lst'))).toBe(true);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('honors suppression flags', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-suppress-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main(): void\n  asm\n    nop\nend\n', 'utf8');

    const outHex = join(work, 'out.hex');
    const res = await runCli(['--nobin', '--nod8m', '--nolist', '-o', outHex, entry]);
    expect(res.code).toBe(0);

    expect(await exists(join(work, 'out.hex'))).toBe(true);
    expect(await exists(join(work, 'out.bin'))).toBe(false);
    expect(await exists(join(work, 'out.d8dbg.json'))).toBe(false);
    expect(await exists(join(work, 'out.lst'))).toBe(false);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('prints the primary output path for --type bin', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-bin-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main(): void\n  asm\n    nop\nend\n', 'utf8');

    const outBin = join(work, 'out.bin');
    const res = await runCli(['--type', 'bin', '-o', outBin, entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outBin);

    expect(await exists(join(work, 'out.bin'))).toBe(true);
    expect(await exists(join(work, 'out.hex'))).toBe(true);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('resolves imports from repeated -I include paths', async () => {
    const entry = join(__dirname, 'fixtures', 'pr11_include_main.zax');
    const includes = join(__dirname, 'fixtures', 'includes');
    const outHex = join(__dirname, 'tmp', 'cli-include', 'out.hex');

    await rm(join(__dirname, 'tmp'), { recursive: true, force: true });

    const res = await runCli([
      '-I',
      join(__dirname, 'fixtures'),
      '-I',
      includes,
      '-o',
      outHex,
      entry,
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(outHex);
    expect(await exists(outHex)).toBe(true);

    await rm(join(__dirname, 'tmp'), { recursive: true, force: true });
  }, 20_000);

  it('rejects entry when it is not the last argument', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-entry-last-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main(): void\n  asm\n    nop\nend\n', 'utf8');

    const res = await runCli([entry, '--nolist']);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('must be last');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('returns usage error for unknown options', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-unknown-opt-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main(): void\n  asm\n    nop\nend\n', 'utf8');

    const res = await runCli(['--badflag', entry]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Unknown option');

    await rm(work, { recursive: true, force: true });
  }, 20_000);
});
