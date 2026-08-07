/**
 * Frees local dev ports blocked by stale Netlify Dev / audio-asset-worker processes.
 * Used before npm run dev / dev:all so EADDRINUSE does not block startup.
 */
import { execSync } from 'node:child_process';

const DEFAULT_PORTS = [8090, 8888] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePorts(argv: string[]): number[] {
  const ports = argv
    .map((value) => Number.parseInt(value, 10))
    .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535);

  if (ports.length > 0) return ports;
  return [...DEFAULT_PORTS];
}

function getListeningPids(port: number): number[] {
  try {
    const output = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (!output) return [];

    return [
      ...new Set(
        output
          .split('\n')
          .map((line) => Number(line.trim()))
          .filter((pid) => pid > 0)
      ),
    ];
  } catch {
    return [];
  }
}

function killPid(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch {
    // Process may have already exited.
  }
}

async function freePort(port: number): Promise<void> {
  let pids = getListeningPids(port);
  if (pids.length === 0) return;

  const label = pids.length === 1 ? 'process' : 'processes';
  console.log(
    `🔧 Port ${port} is in use (PID${pids.length === 1 ? '' : 's'}: ${pids.join(', ')}) — stopping stale dev ${label}...`
  );

  for (const pid of pids) {
    killPid(pid, 'SIGTERM');
  }

  await sleep(600);

  pids = getListeningPids(port);
  if (pids.length > 0) {
    for (const pid of pids) {
      killPid(pid, 'SIGKILL');
    }
    await sleep(200);
  }

  const remaining = getListeningPids(port);
  if (remaining.length > 0) {
    console.error(
      `❌ Could not free port ${port} (still held by PID${remaining.length === 1 ? '' : 's'}: ${remaining.join(', ')})`
    );
    console.error('   Stop it manually, then rerun dev.\n');
    process.exit(1);
  }

  console.log(`✅ Port ${port} is free\n`);
}

async function main(): Promise<void> {
  const ports = parsePorts(process.argv.slice(2));

  for (const port of ports) {
    await freePort(port);
  }
}

main().catch((error) => {
  console.error('[free-dev-ports] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
