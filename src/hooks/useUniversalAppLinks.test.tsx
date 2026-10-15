import { act, renderHook, waitFor } from '@testing-library/react';
import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';

const native = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(),
  addListener: vi.fn(),
  getLaunchUrl: vi.fn(),
  remove: vi.fn(),
  open: undefined as undefined | ((event: { url: string }) => void),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: native }));
vi.mock('@capacitor/app', () => ({ App: native }));

import { getUniversalAppLinkRoute, useUniversalAppLinks } from './useUniversalAppLinks';

const url = 'https://ulsa-evo.strvsn.net/app/open';
const mount = (path = '/') => {
  const history = createMemoryHistory({ initialEntries: [path] });
  const replace = vi.spyOn(history, 'replace');
  const wrapper = ({ children }: PropsWithChildren) => <Router history={history}>{children}</Router>;
  return { ...renderHook(() => useUniversalAppLinks(), { wrapper }), history, replace };
};

describe('Universal Links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.open = undefined;
    native.isNativePlatform.mockReturnValue(true);
    native.getPlatform.mockReturnValue('ios');
    native.remove.mockResolvedValue(undefined);
    native.getLaunchUrl.mockResolvedValue(undefined);
    native.addListener.mockImplementation(async (_event, listener) => {
      native.open = listener;
      return { remove: native.remove };
    });
  });

  it.each([url, `${url}/`, `${url}?source=nfc#open`])('accepts the dedicated app path: %s', (value) => {
    expect(getUniversalAppLinkRoute(value)).toBe('/dashboard');
  });

  it.each([
    'invalid', 'ulsaevo://app/open', 'http://ulsa-evo.strvsn.net/app/open',
    'https://ulsa-evo.strvsn.net/', 'https://ulsa-evo.strvsn.net/firmware/',
    'https://ulsa-evo.strvsn.net/app/open/other', 'https://ulsa-evo.strvsn.net:8443/app/open',
    'https://ulsa-evo.strvsn.net.evil.example/app/open',
    'https://user@ulsa-evo.strvsn.net/app/open',
  ])('does not route unrelated or malformed links: %s', (value) => {
    expect(getUniversalAppLinkRoute(value)).toBeNull();
  });

  it('handles a cold launch after registering the warm-link listener', async () => {
    native.getLaunchUrl.mockImplementation(async () => {
      expect(native.open).toBeDefined();
      return { url };
    });
    const { history } = mount();
    await waitFor(() => expect(history.location.pathname).toBe('/dashboard'));
    expect(history.length).toBe(1);
  });

  it('handles a link received while the app is running', async () => {
    const { history } = mount('/other');
    await waitFor(() => expect(native.open).toBeDefined());
    act(() => native.open?.({ url }));
    expect(history.location.pathname).toBe('/dashboard');
  });

  it('does not replace or remount an existing dashboard', async () => {
    const { replace } = mount('/dashboard');
    await waitFor(() => expect(native.open).toBeDefined());
    act(() => native.open?.({ url }));
    expect(replace).not.toHaveBeenCalled();
  });

  it('ignores unrelated warm links and releases its listener on unmount', async () => {
    const { history, unmount } = mount('/other');
    await waitFor(() => expect(native.open).toBeDefined());
    act(() => native.open?.({ url: 'https://ulsa-evo.strvsn.net/firmware/' }));
    expect(history.location.pathname).toBe('/other');
    unmount();
    expect(native.remove).toHaveBeenCalledOnce();
    act(() => native.open?.({ url }));
    expect(history.location.pathname).toBe('/other');
  });

  it('cleans up a listener that resolves after unmount', async () => {
    let resolveListener!: (value: { remove: typeof native.remove }) => void;
    native.addListener.mockReturnValue(new Promise((resolve) => { resolveListener = resolve; }));
    const { unmount } = mount();
    unmount();
    await act(async () => resolveListener({ remove: native.remove }));
    expect(native.remove).toHaveBeenCalledOnce();
    expect(native.getLaunchUrl).not.toHaveBeenCalled();
  });

  it.each(['web', 'android'])('does not register iOS links on %s', (platform) => {
    native.getPlatform.mockReturnValue(platform);
    native.isNativePlatform.mockReturnValue(platform !== 'web');
    mount();
    expect(native.addListener).not.toHaveBeenCalled();
    expect(native.getLaunchUrl).not.toHaveBeenCalled();
  });
});
