// Once-a-day anonymous presence ping ("heartbeat").
//
// The package ships no analytics in the usual sense: nothing here reads
// behaviour, operations, queries or results. The only signal is "this install
// exists and runs version X" — at most one POST per install per 24 h, riding
// the same state-file rhythm as the update check. The payload is exactly
// {version, install_id}: no operation names, no counts, no endpoints, no
// account data (install_id is a random UUID unrelated to any OpenBayes
// account). OPENBAYES_NO_TELEMETRY=1 turns the whole thing off.
//
// Failures are silent by contract: a send is attempted at most once per day
// (the attempt is recorded whether it succeeded or not, mirroring the update
// check's "written on failure too" policy), never throws, and never delays
// the caller beyond the fetch timeout.

import { randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  CHECK_INTERVAL_MS,
  FETCH_TIMEOUT_MS,
  clientUserAgent,
  readInstalledVersion,
  readState,
  writeState,
} from './update-check.mjs';

export const DEFAULT_HEARTBEAT_URL = 'https://get.openbayes.net/api/event';
export const HEARTBEAT_STATE_FILENAME = 'telemetry.json';

// Two run_graphql processes starting together must not each mint their own
// install_id and send their own heartbeat. The daily attempt is claimed with
// an exclusive-create lock file next to the state file; a lock left behind by
// a crashed process is stolen once it outlives the whole send window, so a
// crash can never silence the heartbeat for good.
const CLAIM_LOCK_STALE_MS = 30_000;

function claimDailySend(lockPath, now) {
  const create = () => {
    // First run on a machine: the config dir does not exist yet.
    mkdirSync(dirname(lockPath), { recursive: true });
    const fd = openSync(lockPath, 'wx');
    try {
      writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date(now).toISOString() }));
    } finally {
      closeSync(fd);
    }
  };
  try {
    create();
    return true;
  } catch (err) {
    if (err?.code !== 'EEXIST') return false; // unwritable config dir → stay silent
  }
  let lockAt = NaN;
  try {
    lockAt = Date.parse(JSON.parse(readFileSync(lockPath, 'utf8'))?.at ?? '');
  } catch {
    // corrupt lock file: treat as stale and reclaim it below
  }
  if (!Number.isNaN(lockAt) && now - lockAt < CLAIM_LOCK_STALE_MS) return false;
  try {
    rmSync(lockPath, { force: true });
    create();
    return true;
  } catch {
    return false; // lost the race against another stealer → stay silent
  }
}

export function isHeartbeatDue(state, now) {
  const last = Date.parse(state?.sent_at ?? '');
  if (Number.isNaN(last)) return true;
  return now - last >= CHECK_INTERVAL_MS;
}

export async function sendHeartbeat({
  skillDir,
  userConfigDir,
  heartbeatUrl = DEFAULT_HEARTBEAT_URL,
  now = Date.now(),
  fetchImpl = globalThis.fetch,
  timeoutMs = FETCH_TIMEOUT_MS,
  disabled = process.env.OPENBAYES_NO_TELEMETRY === '1',
}) {
  const statePath = join(userConfigDir, HEARTBEAT_STATE_FILENAME);
  const lockPath = `${statePath}.lock`;
  if (disabled) return { sent: false, reason: 'disabled' };

  const previous = readState(statePath);
  if (!isHeartbeatDue(previous, now)) {
    return { sent: false, reason: 'not-due', install_id: previous?.install_id ?? null };
  }

  if (!claimDailySend(lockPath, now)) {
    return { sent: false, reason: 'claimed-elsewhere', install_id: previous?.install_id ?? null };
  }

  let installId;
  let version;
  try {
    // Re-read under the claim: the process that won it has already recorded
    // the attempt before we got here.
    const claimed = readState(statePath);
    if (!isHeartbeatDue(claimed, now)) {
      return { sent: false, reason: 'not-due', install_id: claimed?.install_id ?? null };
    }

    // install_id is a random UUID minted once per install: it survives daily
    // sends (state file) but not a reinstall (state file wiped with the config
    // dir only if the user wipes it — a reinstall itself keeps ~/.config). It
    // is deliberately unrelated to any OpenBayes account.
    installId = claimed?.install_id ?? randomUUID();
    version = readInstalledVersion(skillDir);

    // Record the attempt BEFORE sending: a process killed mid-send must not
    // let a sibling mint a second install_id for the same install. An
    // unwritable config dir is swallowed — telemetry must never break a task.
    try {
      writeState(statePath, {
        install_id: installId,
        sent_at: new Date(now).toISOString(),
        heartbeat_url: heartbeatUrl,
      });
    } catch {
      // state not saved; the send below still happens
    }
  } finally {
    rmSync(lockPath, { force: true });
  }

  const body = {
    name: 'skill_heartbeat',
    domain: 'openbayes.com',
    url: 'https://openbayes.com/skills',
    props: {
      ...(version ? { version } : {}),
      install_id: installId,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs} ms`)), timeoutMs);
  let sent = false;
  let error = null;
  try {
    const res = await fetchImpl(heartbeatUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': clientUserAgent(version),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    // The body is never read; an unconsumed body keeps the connection open
    // for as long as the server keeps writing. Cancel it on every path.
    try {
      await res.body?.cancel();
    } catch {
      // already consumed or not cancellable — harmless either way
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    sent = true;
  } catch (err) {
    error = err?.message || String(err);
  } finally {
    clearTimeout(timer);
  }

  // Annotate the recorded attempt with the failure reason, best-effort: the
  // send itself was already counted, this only helps debugging.
  if (error) {
    try {
      writeState(statePath, {
        install_id: installId,
        sent_at: new Date(now).toISOString(),
        heartbeat_url: heartbeatUrl,
        error,
      });
    } catch {
      // keep the original state; telemetry must never break a task
    }
  }

  return { sent, install_id: installId, ...(error ? { error } : {}) };
}
