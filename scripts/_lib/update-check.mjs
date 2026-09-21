// Once-a-day "is there a newer openbayes-user package" check (#77 decision 2).
//
// Users install from a hosted archive, so nothing can push an update to them;
// the skill has to pull. This module owns the whole pull so the agent never
// has to improvise a curl: it reads the installed VERSION, rate-limits itself
// through a state file under the user config dir (never under the skill dir,
// which a reinstall wipes), fetches versions.json, and reports a small JSON
// verdict. It must never block a task: every failure is reported in the
// verdict and exits 0.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DEFAULT_VERSIONS_URL =
  'https://openbayes.com/skills/openbayes-user/versions.json';
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
// A black-holed host must cost seconds, not the OS connect timeout (~75 s on
// macOS), once a day before the user's first real query.
export const FETCH_TIMEOUT_MS = 3000;
export const STATE_FILENAME = 'update-check.json';

export function readInstalledVersion(skillDir) {
  try {
    const path = join(skillDir, 'VERSION');
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

// "v1.2.3" / "1.2.3" -> [1,2,3]; anything else (dev, git describe with
// -dirty, empty) -> null, which compares as "unknown", never as "outdated".
export function parseSemver(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewer(latest, current) {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

export function readState(statePath) {
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, 'utf-8'));
  } catch {
    return null;
  }
}

// Temp file + rename: a concurrent reader never sees a half-written state.
// Two sessions racing past an expired stamp may both fetch once; that costs
// one extra request, not a wrong verdict, so no lock.
export function writeState(statePath, state) {
  mkdirSync(dirname(statePath), { recursive: true });
  const tmp = `${statePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  renameSync(tmp, statePath);
}

export function isDue(state, now) {
  const last = Date.parse(state?.checked_at ?? '');
  if (Number.isNaN(last)) return true;
  return now - last >= CHECK_INTERVAL_MS;
}

export async function checkForUpdate({
  skillDir,
  userConfigDir,
  versionsUrl = DEFAULT_VERSIONS_URL,
  now = Date.now(),
  fetchImpl = globalThis.fetch,
  fetchTimeoutMs = FETCH_TIMEOUT_MS,
}) {
  const statePath = join(userConfigDir, STATE_FILENAME);
  const current = readInstalledVersion(skillDir);
  const previous = readState(statePath);
  const due = isDue(previous, now);

  let latest = previous?.latest ?? null;
  let changelog = previous?.changelog ?? null;
  let error = null;
  let checked = false;

  if (due) {
    // An explicit timer, not AbortSignal.timeout(): that one is unref'd and
    // cannot fire once nothing else keeps the event loop alive.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`timeout after ${fetchTimeoutMs} ms`)), fetchTimeoutMs);
    try {
      const res = await fetchImpl(versionsUrl, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (typeof body?.latest !== 'string') throw new Error('versions.json has no "latest"');
      latest = body.latest;
      changelog = body.changelog ?? null;
      checked = true;
    } catch (err) {
      error = err?.message || String(err);
    } finally {
      clearTimeout(timer);
    }
    // Written on failure too: an offline machine must not retry on every call.
    // An unwritable config dir is reported the same way, never thrown.
    try {
      writeState(statePath, {
        checked_at: new Date(now).toISOString(),
        latest,
        changelog,
        versions_url: versionsUrl,
        ...(error ? { error } : {}),
      });
    } catch (err) {
      error = [error, `state not saved: ${err?.message || err}`].filter(Boolean).join('; ');
    }
  }

  const checkedAt = due ? now : Date.parse(previous.checked_at);
  return {
    current,
    latest,
    update_available: Boolean(current && latest && isNewer(latest, current)),
    checked,
    ...(error ? { error } : {}),
    checked_at: new Date(checkedAt).toISOString(),
    next_check_at: new Date(checkedAt + CHECK_INTERVAL_MS).toISOString(),
    changelog,
    versions_url: versionsUrl,
    state_file: statePath,
  };
}
