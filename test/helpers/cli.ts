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
const lockWaitSliceMs = 250;
const lockWaitMaxMs = 90_000;
const lockStaleMs = 5 * 60_000;

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

function parseLockTimestamp(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as { createdAt?: unknown };
    const value = parsed.createdAt;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return undefined;
  } catch {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
}

async function clearStaleLockIfNeeded(): Promise<void> {
  const lockText = await readFile(buildLockPath, 'utf8').catch(() => '');
  const createdAt = parseLockTimestamp(lockText);
  if (createdAt === undefined) return;
  if (Date.now() - createdAt < lockStaleMs) return;
  await rm(buildLockPath, { force: true });
}

async function buildCliWithLock(): Promise<void> {
  await mkdir(buildTmpDir, { recursive: true });

  while (true) {
    try {
      await writeFile(buildLockPath, JSON.stringify({ pid: process.pid, createdAt: Date.now() }), {
        flag: 'wx',
      });
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
      let waitedMs = 0;
      while (waitedMs < lockWaitMaxMs) {
        if (!(await pathExists(buildLockPath))) break;
        await clearStaleLockIfNeeded();
        if (!(await pathExists(buildLockPath))) break;
        await sleep(lockWaitSliceMs);
        waitedMs += lockWaitSliceMs;
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
