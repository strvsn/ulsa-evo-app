export type PublicPageState = 'configured' | 'missing' | 'invalid';

export type PublicPageConfiguration = {
  url: string | null;
  state: PublicPageState;
};

export type ProductInformation = {
  appName: string;
  support: PublicPageConfiguration;
  privacyPolicy: PublicPageConfiguration;
};

export const DEFAULT_SUPPORT_URL = 'https://ulsa-evo-start.pages.dev/support/';
export const DEFAULT_PRIVACY_POLICY_URL = 'https://ulsa-evo-start.pages.dev/privacy/';
export const DEFAULT_LANDING_PAGE_URL = 'https://ulsa-evo-start.pages.dev/';

export const normalizePublicPageUrl = (
  value: string | undefined,
): PublicPageConfiguration => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return { url: null, state: 'missing' };

  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== 'https:'
      || !url.hostname
      || url.username
      || url.password
      || url.search
      || url.hash
    ) {
      return { url: null, state: 'invalid' };
    }
    return { url: url.toString(), state: 'configured' };
  } catch {
    return { url: null, state: 'invalid' };
  }
};

export const PRODUCT_INFORMATION: ProductInformation = Object.freeze({
  appName: 'EVO APP',
  support: normalizePublicPageUrl(import.meta.env.VITE_SUPPORT_URL || DEFAULT_SUPPORT_URL),
  privacyPolicy: normalizePublicPageUrl(
    import.meta.env.VITE_PRIVACY_POLICY_URL || DEFAULT_PRIVACY_POLICY_URL,
  ),
});
