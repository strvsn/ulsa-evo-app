import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANDING_PAGE_URL,
  DEFAULT_PRIVACY_POLICY_URL,
  DEFAULT_SUPPORT_URL,
  PRODUCT_INFORMATION,
  normalizePublicPageUrl,
} from './appInformation';

describe('normalizePublicPageUrl', () => {
  it('ships permanent public Support and Privacy defaults', () => {
    expect(PRODUCT_INFORMATION.appName).toBe('EVO APP');
    expect(DEFAULT_LANDING_PAGE_URL).toBe('https://ulsa-evo-start.pages.dev/');
    expect(PRODUCT_INFORMATION.support).toEqual({
      url: DEFAULT_SUPPORT_URL,
      state: 'configured',
    });
    expect(PRODUCT_INFORMATION.privacyPolicy).toEqual({
      url: DEFAULT_PRIVACY_POLICY_URL,
      state: 'configured',
    });
  });

  it('accepts credential-free HTTPS pages without query or fragment', () => {
    expect(normalizePublicPageUrl(' https://www.example.com/privacy ')).toEqual({
      url: 'https://www.example.com/privacy',
      state: 'configured',
    });
  });

  it('distinguishes missing values from invalid public URLs', () => {
    expect(normalizePublicPageUrl('')).toEqual({ url: null, state: 'missing' });
    expect(normalizePublicPageUrl('http://example.com/support')).toEqual({
      url: null,
      state: 'invalid',
    });
    expect(normalizePublicPageUrl('https://user:secret@example.com/support')).toEqual({
      url: null,
      state: 'invalid',
    });
    expect(normalizePublicPageUrl('https://example.com/support?token=value')).toEqual({
      url: null,
      state: 'invalid',
    });
  });
});
