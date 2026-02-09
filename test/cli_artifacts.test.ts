import { describe, expect, it } from 'vitest';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function buildOnce(): Promise<void> {
  const yarn = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
  await execFileAsync(yarn, ['-s', 'build'], { encoding: 'utf8' });
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
  it('writes default sibling artifacts from -o output path', async () => {
    await buildOnce();
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
  });

  it('honors suppression flags', async () => {
    await buildOnce();
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
  });

  it('prints the primary output path for --type bin', async () => {
    await buildOnce();
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
  });
});
