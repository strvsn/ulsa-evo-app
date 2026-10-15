import { useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

export const getUniversalAppLinkRoute = (value: string): '/dashboard' | null => {
  try {
    const url = new URL(value);
    return url.origin === 'https://ulsa-evo.strvsn.net'
      && !url.username && !url.password
      && (url.pathname === '/app/open' || url.pathname === '/app/open/')
      ? '/dashboard' : null;
  } catch {
    return null;
  }
};

export const useUniversalAppLinks = (): void => {
  const history = useHistory();

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return;

    let disposed = false;
    let listener: PluginListenerHandle | undefined;
    const open = ({ url }: { url: string }) => {
      const route = getUniversalAppLinkRoute(url);
      if (!disposed && route && history.location.pathname !== route) {
        history.replace(route);
      }
    };

    void (async () => {
      // Listen first so a link arriving during launch-URL retrieval is not lost.
      const handle = await App.addListener('appUrlOpen', open);
      if (disposed) {
        await handle.remove();
        return;
      }
      listener = handle;
      const launch = await App.getLaunchUrl();
      if (launch) open(launch);
    })().catch(() => {
      console.warn('EVO APP could not initialize app links.');
    });

    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [history]);
};
