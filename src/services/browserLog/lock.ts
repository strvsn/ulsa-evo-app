import {
  acquireBrowserLogWriterLease,
  releaseBrowserLogWriterLease,
  renewBrowserLogWriterLease,
} from './store';
import type { BrowserLogWriterLock } from './types';

const LOCK_NAME = 'ulsa-evo-browser-log-writer';
const LEASE_MS = 2 * 60 * 1000;
const LEASE_HEARTBEAT_MS = 30 * 1000;
let fallbackOwnerCounter = 0;

const createOwnerId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint32Array(4));
    return Array.from(bytes, (value) => value.toString(16).padStart(8, '0')).join('-');
  }
  fallbackOwnerCounter += 1;
  return `${Date.now()}-${fallbackOwnerCounter}`;
};

const createLockUnavailableError = (): Error => new Error(
  '別のタブまたは画面でアプリ内ログを使用中です。そちらの記録・ZIP・削除操作を完了してから再試行してください。',
);

const acquireWebLock = async (locks: LockManager): Promise<BrowserLogWriterLock> => {
  let releaseHold: (() => void) | null = null;
  let acquiredResolve: ((acquired: boolean) => void) | null = null;
  let acquiredReject: ((error: unknown) => void) | null = null;
  const acquired = new Promise<boolean>((resolve, reject) => {
    acquiredResolve = resolve;
    acquiredReject = reject;
  });
  const hold = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
  let released = false;
  const requestPromise = locks.request(
    LOCK_NAME,
    { mode: 'exclusive', ifAvailable: true },
    async (lock) => {
      acquiredResolve?.(lock !== null);
      if (lock) await hold;
    },
  ).catch((error: unknown) => {
    acquiredReject?.(error);
  });

  if (!await acquired) {
    await requestPromise;
    throw createLockUnavailableError();
  }

  return {
    assertHeld: async () => {
      if (released) throw createLockUnavailableError();
    },
    release: async () => {
      if (released) return;
      released = true;
      releaseHold?.();
      await requestPromise;
    },
  };
};

const acquireLeaseLock = async (): Promise<BrowserLogWriterLock> => {
  const ownerId = createOwnerId();
  if (!await acquireBrowserLogWriterLease(ownerId, Date.now(), LEASE_MS)) {
    throw createLockUnavailableError();
  }
  let released = false;
  let lost = false;
  const heartbeat = window.setInterval(() => {
    void renewBrowserLogWriterLease(ownerId, Date.now(), LEASE_MS)
      .then((renewed) => { if (!renewed) lost = true; })
      .catch(() => { lost = true; });
  }, LEASE_HEARTBEAT_MS);

  return {
    assertHeld: async () => {
      if (released || lost || !await renewBrowserLogWriterLease(ownerId, Date.now(), LEASE_MS)) {
        lost = true;
        throw createLockUnavailableError();
      }
    },
    release: async () => {
      if (released) return;
      released = true;
      window.clearInterval(heartbeat);
      await releaseBrowserLogWriterLease(ownerId);
    },
  };
};

export const acquireBrowserLogWriterLock = async (): Promise<BrowserLogWriterLock> => {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return acquireWebLock(navigator.locks);
  }
  return acquireLeaseLock();
};
