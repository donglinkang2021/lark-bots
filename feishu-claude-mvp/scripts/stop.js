#!/usr/bin/env node
/**
 * Gracefully stop the Feishu Claude bridge.
 *
 * Reads the PID from the lock file and sends SIGINT so the bridge
 * can clean up its lock file and subscriber processes.
 * Also kills any orphaned lark-cli subscriber processes.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lockPath = path.resolve(__dirname, '..', 'data', 'bridge.lock');

function killOrphans(pattern, label) {
  try {
    const output = execSync(
      `ps aux | grep '${pattern}' | grep -v grep | awk '{print $2}'`,
      { encoding: 'utf8' },
    ).trim();

    if (!output) return;

    const pids = output.split('\n').filter(Boolean);
    for (const pid of pids) {
      const num = Number.parseInt(pid, 10);
      if (Number.isInteger(num) && num > 0 && num !== process.pid) {
        try {
          process.kill(num, 'SIGTERM');
          console.log(`Killed orphaned ${label} (PID ${num})`);
        } catch {
          // already gone
        }
      }
    }
  } catch {
    // ps found nothing — that's fine
  }
}

function killAllOrphans() {
  killOrphans('lark-cli.*event.*+subscribe', 'lark-cli subscriber');
  killOrphans('claude --bare.*--output-format stream-json', 'claude subprocess');
}

try {
  const raw = fs.readFileSync(lockPath, 'utf8').trim();
  const pid = Number.parseInt(raw, 10);

  if (!Number.isInteger(pid) || pid <= 0) {
    console.error(`Invalid PID in lock file: ${raw}`);
    process.exit(1);
  }

  try {
    // Send SIGINT to the process group to ensure child processes are also terminated
    try {
      process.kill(-pid, 'SIGINT');
      console.log(`Sent SIGINT to bridge process group (PGID ${pid})`);
    } catch {
      // Fallback: send to the individual process if group kill fails
      process.kill(pid, 'SIGINT');
      console.log(`Sent SIGINT to bridge (PID ${pid})`);
    }
  } catch (err) {
    if (err.code === 'ESRCH') {
      console.log(`Process ${pid} not found — cleaning stale lock file.`);
      fs.unlinkSync(lockPath);
    } else {
      throw err;
    }
  }

  // Clean up any orphaned child processes
  killAllOrphans();
} catch (err) {
  if (err.code === 'ENOENT') {
    console.log('No lock file found — bridge is not running.');
    // Still check for orphaned subscribers
    killAllOrphans();
  } else {
    console.error(`Failed to read lock file: ${err.message}`);
    process.exit(1);
  }
}
