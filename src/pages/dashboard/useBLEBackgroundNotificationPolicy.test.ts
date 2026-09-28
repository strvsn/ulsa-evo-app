import { describe, expect, it } from 'vitest';
import { shouldPauseSensorNotifications } from './useBLEBackgroundNotificationPolicy';

const base = {
  visibilityState: 'hidden' as const,
  connectionState: 'connected' as const,
  appLogActive: false,
  pipActive: false,
  maintenanceCritical: false,
};

describe('shouldPauseSensorNotifications', () => {
  it('pauses only an idle connected session in the background', () => {
    expect(shouldPauseSensorNotifications(base)).toBe(true);
    expect(shouldPauseSensorNotifications({ ...base, visibilityState: 'visible' })).toBe(false);
    expect(shouldPauseSensorNotifications({ ...base, connectionState: 'disconnected' })).toBe(false);
  });

  it('preserves samples for app logging, PiP, and maintenance', () => {
    expect(shouldPauseSensorNotifications({ ...base, appLogActive: true })).toBe(false);
    expect(shouldPauseSensorNotifications({ ...base, pipActive: true })).toBe(false);
    expect(shouldPauseSensorNotifications({ ...base, maintenanceCritical: true })).toBe(false);
  });
});
