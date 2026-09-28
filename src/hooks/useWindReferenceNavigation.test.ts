import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrueHeadingUpdate, TrueNavigationUpdate } from '../services/nativeTrueHeading';

const nativeMock = vi.hoisted(() => ({
  available: vi.fn(() => true),
  start: vi.fn(),
  stop: vi.fn(),
  headingListener: null as null | ((update: TrueHeadingUpdate) => void),
  navigationListener: null as null | ((update: TrueNavigationUpdate) => void),
  headingRemove: vi.fn(),
  navigationRemove: vi.fn(),
}));

vi.mock('../services/nativeTrueHeading', () => ({
  isNativeTrueHeadingAvailable: nativeMock.available,
  startTrueHeading: nativeMock.start,
  stopTrueHeading: nativeMock.stop,
  subscribeToTrueHeading: vi.fn(async (listener) => {
    nativeMock.headingListener = listener;
    return { remove: nativeMock.headingRemove };
  }),
  subscribeToTrueNavigation: vi.fn(async (listener) => {
    nativeMock.navigationListener = listener;
    return { remove: nativeMock.navigationRemove };
  }),
}));

import {
  subscribeToTrueHeading,
  subscribeToTrueNavigation,
} from '../services/nativeTrueHeading';
import {
  useWindReferenceNavigation,
  type WindReferenceMode,
} from './useWindReferenceNavigation';

const initialHeading: TrueHeadingUpdate = {
  trueHeading: null,
  headingAccuracy: null,
  available: false,
  authorization: 'authorized',
};

const navigationUpdate = (
  overrides: Partial<TrueNavigationUpdate> = {},
): TrueNavigationUpdate => ({
  trueHeading: 120,
  headingAccuracy: 4,
  headingTimestamp: 1_000_000,
  speed: 5,
  speedAccuracy: 0.2,
  course: 85,
  courseAccuracy: 3,
  horizontalAccuracy: 4,
  locationTimestamp: 1_000_000,
  accuracyAuthorization: 'full',
  authorization: 'authorized',
  ...overrides,
});

describe('useWindReferenceNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeMock.available.mockReturnValue(true);
    nativeMock.start.mockResolvedValue(initialHeading);
    nativeMock.stop.mockResolvedValue(undefined);
    nativeMock.headingListener = null;
    nativeMock.navigationListener = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call the native bridge on Web or Android', async () => {
    nativeMock.available.mockReturnValue(false);
    const { result } = renderHook(() => useWindReferenceNavigation('gnss', true));

    expect(result.current.isSupported).toBe(false);
    expect(result.current.status).toBe('unavailable');
    expect(result.current.gnssAssessment.status).toBe('unavailable');
    expect(nativeMock.start).not.toHaveBeenCalled();
    expect(subscribeToTrueHeading).not.toHaveBeenCalled();
    expect(subscribeToTrueNavigation).not.toHaveBeenCalled();
    expect(nativeMock.stop).not.toHaveBeenCalled();
  });

  it('uses one serialized native owner while cycling compass, GNSS, and off', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ mode }: { mode: WindReferenceMode }) => useWindReferenceNavigation(mode, true),
      { initialProps: { mode: 'compass' as WindReferenceMode } },
    );

    await waitFor(() => expect(nativeMock.start).toHaveBeenCalledWith({
      navigationMode: false,
    }));
    expect(subscribeToTrueHeading).toHaveBeenCalledOnce();
    expect(subscribeToTrueNavigation).not.toHaveBeenCalled();

    act(() => nativeMock.headingListener?.({
      trueHeading: 42,
      headingAccuracy: 3,
      available: true,
      authorization: 'authorized',
    }));
    expect(result.current.status).toBe('ready');
    expect(result.current.trueHeading).toBe(42);

    rerender({ mode: 'gnss' });
    await waitFor(() => expect(nativeMock.start).toHaveBeenCalledTimes(2));
    expect(nativeMock.stop).toHaveBeenCalledOnce();
    expect(nativeMock.headingRemove).toHaveBeenCalledOnce();
    expect(subscribeToTrueNavigation).toHaveBeenCalledOnce();
    expect(nativeMock.stop.mock.invocationCallOrder[0])
      .toBeLessThan(nativeMock.start.mock.invocationCallOrder[1]);

    rerender({ mode: 'off' });
    await waitFor(() => expect(nativeMock.stop).toHaveBeenCalledTimes(2));
    expect(nativeMock.navigationRemove).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('off');
    expect(result.current.gnssAssessment.status).toBe('off');

    unmount();
    expect(nativeMock.stop).toHaveBeenCalledTimes(2);
  });

  it('maps unified navigation updates to heading and GNSS state', async () => {
    vi.setSystemTime(1_000_200);
    const { result } = renderHook(() => useWindReferenceNavigation('gnss', true));
    await waitFor(() => expect(nativeMock.navigationListener).not.toBeNull());

    act(() => nativeMock.navigationListener?.(navigationUpdate()));

    expect(result.current.status).toBe('ready');
    expect(result.current.trueHeading).toBe(120);
    expect(result.current.headingTimestampMs).toBe(1_000_000);
    expect(result.current.gnssSample).toMatchObject({
      speedMps: 5,
      speedAccuracyMps: 0.2,
      courseDegrees: 85,
      courseAccuracyDegrees: 3,
      horizontalAccuracyMeters: 4,
      timestampMs: 1_000_000,
      available: true,
    });
    expect(result.current.gnssAssessment).toMatchObject({
      status: 'ready',
      usable: true,
      platformSpeedMps: 5,
      platformCourseDegrees: 85,
    });
    expect(result.current.gnssAgeMs).toBe(200);
  });

  it('retains ready heading through moderate in-vehicle magnetic interference', async () => {
    const { result } = renderHook(() => useWindReferenceNavigation('gnss', true));
    await waitFor(() => expect(nativeMock.navigationListener).not.toBeNull());

    act(() => nativeMock.navigationListener?.(navigationUpdate({ headingAccuracy: 20 })));
    expect(result.current.status).toBe('ready');

    act(() => nativeMock.navigationListener?.(navigationUpdate({ headingAccuracy: 40 })));
    expect(result.current.status).toBe('ready');

    act(() => nativeMock.navigationListener?.(navigationUpdate({ headingAccuracy: 46 })));
    expect(result.current.status).toBe('lowAccuracy');
  });

  it('accepts a stopped vehicle without waiting for movement course', async () => {
    vi.setSystemTime(1_000_200);
    const { result } = renderHook(() => useWindReferenceNavigation('gnss', true));
    await waitFor(() => expect(nativeMock.navigationListener).not.toBeNull());

    act(() => nativeMock.navigationListener?.(navigationUpdate({
      speed: 0.2,
      speedAccuracy: 1.2,
      course: null,
      courseAccuracy: null,
    })));

    expect(result.current.gnssAssessment).toMatchObject({
      status: 'stationary',
      usable: true,
      platformSpeedMps: 0,
      platformCourseDegrees: null,
    });
  });

  it('changes a stopped GNSS stream to stale without another native event', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { result } = renderHook(() => useWindReferenceNavigation('gnss', true));
    await act(async () => Promise.resolve());
    act(() => nativeMock.navigationListener?.(navigationUpdate()));
    expect(result.current.gnssAssessment.status).toBe('ready');

    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    expect(result.current.gnssAssessment.status).toBe('stale');
    expect(result.current.gnssAgeMs).toBe(6_000);
  });

  it('stops native navigation while hidden and resumes the selected mode when visible', async () => {
    let visibilityState: DocumentVisibilityState = 'visible';
    const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get')
      .mockImplementation(() => visibilityState);
    const { result } = renderHook(() => useWindReferenceNavigation('gnss', true));

    await waitFor(() => expect(nativeMock.start).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe('requesting');

    act(() => {
      visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(nativeMock.stop).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe('off');

    act(() => {
      visibilityState = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(nativeMock.start).toHaveBeenCalledTimes(2));
    expect(nativeMock.stop.mock.invocationCallOrder[0])
      .toBeLessThan(nativeMock.start.mock.invocationCallOrder[1]);

    visibilitySpy.mockRestore();
  });
});
