import { useEffect } from 'react';
import type { UlsaThemeId } from '../../constants/themes';

type ThemeBackground = {
  gradient: string;
  isLight: boolean;
  themeId: UlsaThemeId;
};

export const useThemeBackgroundSync = ({ gradient, isLight, themeId }: ThemeBackground) => {
  useEffect(() => {
    const colorMatch = gradient.match(/#[0-9a-fA-F]{6}/);
    const baseColor = colorMatch ? colorMatch[0] : '#0a0a1a';

    let themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      document.head.appendChild(themeMeta);
    }
    themeMeta.content = baseColor;

    document.documentElement.dataset.ulsaTheme = themeId;
    document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';

    document.documentElement.style.setProperty('--app-background', gradient);
    document.documentElement.style.background = gradient;
    document.body.style.background = gradient;
    const root = document.getElementById('root');
    if (root) root.style.background = gradient;

    const ionApp = document.querySelector('ion-app') as HTMLElement | null;
    if (ionApp) ionApp.style.background = gradient;
    const ionPage = document.querySelector('ion-page') as HTMLElement | null;
    if (ionPage) ionPage.style.background = gradient;

    return () => {
      document.documentElement.style.background = '';
      delete document.documentElement.dataset.ulsaTheme;
      document.documentElement.style.colorScheme = '';
      document.documentElement.style.removeProperty('--app-background');
      document.body.style.background = '';
      if (root) root.style.background = '';
      if (ionApp) ionApp.style.background = '';
      if (ionPage) ionPage.style.background = '';
    };
  }, [gradient, isLight, themeId]);
};
