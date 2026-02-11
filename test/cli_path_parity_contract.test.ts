import { beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    shell: process.platform === 'win32',
  });
}

async function runCli(
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const node = process.execPath;
  const cliPath = resolve(__dirname, '..', 'dist', 'src', 'cli.js');
  try {
    const { stdout, stderr } = await execFileAsync(node, [cliPath, ...args], {
      encoding: 'utf8',
      cwd,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

async function readArtifactSet(base: string): Promise<{
  bin: string;
  hex: string;
  d8m: string;
  lst: string;
}> {
  const bin = await readFile(`${base}.bin`);
  const hex = await readFile(`${base}.hex`, 'utf8');
  const d8m = await readFile(`${base}.d8dbg.json`, 'utf8');
  const lst = await readFile(`${base}.lst`, 'utf8');
  return {
    bin: bin.toString('hex'),
    hex,
    d8m,
    lst,
  };
}

function normalizePathForCompare(path: string): string {
  const stripped = path.startsWith('\\\\?\\UNC\\')
    ? `\\\\${path.slice(8)}`
    : path.startsWith('\\\\?\\')
      ? path.slice(4)
      : path;
  const normalized = stripped.replace(/\\/g, '/');
  const normalizedDarwin =
    process.platform === 'darwin' ? normalized.replace(/^\/private\//, '/') : normalized;
  return process.platform === 'win32' ? normalizedDarwin.toLowerCase() : normalizedDarwin;
}

describe('cli path parity contract', () => {
  beforeAll(async () => {
    await buildOnce();
  }, 90_000);

  it('emits byte-identical artifacts for relative and absolute entry/output path forms', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-path-parity-'));
    const sub = join(work, 'sub');
    await mkdir(sub, { recursive: true });

    await writeFile(
      join(work, 'main.zax'),
      'import "lib.zax"\n\nexport func main(): void\n  ld a, IncConst\nend\n',
      'utf8',
    );
    await writeFile(join(work, 'lib.zax'), 'const IncConst = 7\n', 'utf8');

    const relOut = join(work, 'out-rel', 'bundle.hex');
    const absOut = join(work, 'out-abs', 'bundle.hex');

    const relRun = await runCli(['-o', '../out-rel/bundle.hex', '../main.zax'], sub);
    expect(relRun.code).toBe(0);
    expect(normalizePathForCompare(relRun.stdout.trim())).toBe(
      normalizePathForCompare(resolve(relOut)),
    );

    const absRun = await runCli(['-o', absOut, join(work, 'main.zax')], work);
    expect(absRun.code).toBe(0);
    expect(normalizePathForCompare(absRun.stdout.trim())).toBe(
      normalizePathForCompare(resolve(absOut)),
    );

    const relSnap = await readArtifactSet(join(work, 'out-rel', 'bundle'));
    const absSnap = await readArtifactSet(join(work, 'out-abs', 'bundle'));
    expect(absSnap).toEqual(relSnap);

    const d8m = JSON.parse(relSnap.d8m) as { files?: Record<string, string> };
    const fileKeys = Object.keys(d8m.files ?? {});
    expect(fileKeys.every((k) => !k.includes('\\'))).toBe(true);

    await rm(work, { recursive: true, force: true });
  }, 30_000);
});
