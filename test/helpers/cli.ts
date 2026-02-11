import { execFile } from 'node:child_process';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const cliPath = resolve(repoRoot, 'dist', 'src', 'cli.js');
const buildTmpDir = resolve(repoRoot, '.tmp');
const buildLockPath = resolve(buildTmpDir, 'cli-build.lock');

let buildPromise: Promise<void> | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function buildCliWithLock(): Promise<void> {
  if (await pathExists(cliPath)) return;

  await mkdir(buildTmpDir, { recursive: true });

  while (true) {
    if (await pathExists(cliPath)) return;
    try {
      await writeFile(buildLockPath, `${process.pid}\n`, { flag: 'wx' });
      try {
        await execFileAsync('yarn', ['-s', 'build'], {
          encoding: 'utf8',
          shell: process.platform === 'win32',
        });
      } finally {
        await rm(buildLockPath, { force: true });
      }
      return;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code && e.code !== 'EEXIST') throw err;
      for (let i = 0; i < 360; i++) {
        if (!(await pathExists(buildLockPath))) break;
        await sleep(250);
      }
    }
  }
}

export async function ensureCliBuilt(): Promise<void> {
  if (!buildPromise) {
    buildPromise = buildCliWithLock();
  }
  return buildPromise;
}

export async function runCli(
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const node = process.execPath;
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

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readArtifactSet(base: string): Promise<{
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

function stripExtendedWindowsPrefix(path: string): string {
  if (path.startsWith('\\\\?\\UNC\\')) return `\\\\${path.slice(8)}`;
  if (path.startsWith('\\\\?\\')) return path.slice(4);
  return path;
}

export function normalizePathForCompare(path: string): string {
  const stripped = stripExtendedWindowsPrefix(path);
  const normalized = stripped.replace(/\\/g, '/');
  const normalizedDarwin =
    process.platform === 'darwin' ? normalized.replace(/^\/private\//, '/') : normalized;
  return process.platform === 'win32' ? normalizedDarwin.toLowerCase() : normalizedDarwin;
}
