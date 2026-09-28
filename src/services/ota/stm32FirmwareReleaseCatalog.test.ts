import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadStm32FirmwarePackage,
  fetchStm32FirmwareReleases,
  formatStm32FirmwareReleaseLabel,
  getStm32FirmwareDownloadUrl,
  type Stm32FirmwareReleaseOption,
} from './stm32FirmwareReleaseCatalog';

describe('stm32FirmwareReleaseCatalog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('loads STM32 package releases from the backend proxy', async () => {
    vi.stubEnv('VITE_STM32_FIRMWARE_RELEASES_URL', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      releases: [
        {
          id: '10:12',
          tagName: 'stm32-fw-20260708',
          title: 'STM32 FW',
          publishedAt: '2026-07-08T00:00:00Z',
          assetName: 'ULSA_EVO_STM32_F411-20260708-stm32-2026.07.08-field.1-field-preserve.ulsa-stm32pkg',
          target: 'ULSA_EVO_STM32_F411',
          version: '20260708',
          releaseTag: 'stm32-2026.07.08-field.1',
          buildProfile: 'field',
          rdpPolicy: 'preserve',
          requiresAdmin: false,
          size: 251000,
          packageSha256: '',
          downloadUrl: '/api/stm32-firmware/download?tag=stm32-fw-20260708&asset=pkg',
          downloadTokenUrl: '/api/stm32-firmware/download-token',
          latest: true,
          prerelease: true,
          releaseNotes: { ja: ['計測を改善しました'], en: ['Improved measurement'] },
        },
      ],
    }), { status: 200 })));

    const releases = await fetchStm32FirmwareReleases();

    expect(fetch).toHaveBeenCalledWith('/api/stm32-firmware/releases', expect.objectContaining({
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'X-ULSA-STM32-Client-Contract': '3',
      },
    }));
    expect(releases[0]).toMatchObject({
      target: 'ULSA_EVO_STM32_F411',
      buildProfile: 'field',
      rdpPolicy: 'preserve',
      latest: true,
      prerelease: true,
      releaseNotes: { ja: ['計測を改善しました'], en: ['Improved measurement'] },
    });
    expect(formatStm32FirmwareReleaseLabel(releases[0])).toContain('/ latest');
    expect(formatStm32FirmwareReleaseLabel(releases[0])).toContain('/ prerelease');
    expect(formatStm32FirmwareReleaseLabel(releases[0])).not.toContain(releases[0].releaseTag);
  });

  it('downloads the selected STM32 package without renaming it to firmware.bin', async () => {
    const release: Stm32FirmwareReleaseOption = {
      id: '10:12',
      tagName: 'stm32-fw-test',
      title: 'STM32 FW',
      publishedAt: '2026-07-08T00:00:00Z',
      assetName: 'ULSA_EVO_STM32_F411-20260708-stm32-2026.07.08-field.1-field-preserve.ulsa-stm32pkg',
      target: 'ULSA_EVO_STM32_F411',
      version: '20260708',
      releaseTag: 'stm32-2026.07.08-field.1',
      buildProfile: 'field',
      rdpPolicy: 'preserve',
      requiresAdmin: false,
      size: 3,
      packageSha256: '',
      downloadUrl: 'https://ulsa.example/api/stm32-firmware/download?tag=stm32-fw-test&asset=pkg',
      downloadTokenUrl: 'https://ulsa.example/api/stm32-firmware/download-token',
      latest: true,
    };
    vi.stubGlobal('fetch', vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        downloadUrl: 'https://ulsa.example/api/stm32-firmware/download?token=download-token',
        downloadToken: 'download-token',
        expiresAt: 1780000000,
        expiresInSeconds: 300,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('pkg', { status: 200 })));

    const file = await downloadStm32FirmwarePackage(release);
    const tokenHeaders = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
    const tokenBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    const downloadHeaders = vi.mocked(fetch).mock.calls[1][1]?.headers as Record<string, string>;

    expect(fetch).toHaveBeenCalledWith(
      release.downloadTokenUrl,
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-ULSA-Device-Id': expect.stringMatching(/^stm32-client-/),
          'X-ULSA-Session-Id': expect.stringMatching(/^stm32-session-/),
          'X-ULSA-STM32-Client-Contract': '3',
        }),
      })
    );
    expect(fetch).toHaveBeenLastCalledWith(
      'https://ulsa.example/api/stm32-firmware/download',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          Accept: 'application/octet-stream',
          'X-ULSA-Device-Id': tokenHeaders['X-ULSA-Device-Id'],
          'X-ULSA-Session-Id': tokenHeaders['X-ULSA-Session-Id'],
          'X-ULSA-STM32-Client-Contract': '3',
          'X-ULSA-STM32-Download-Token': 'download-token',
        }),
      })
    );
    expect(tokenBody).toMatchObject({
      tagName: release.tagName,
      assetName: release.assetName,
      releaseTag: release.releaseTag,
      deviceId: tokenHeaders['X-ULSA-Device-Id'],
      sessionId: tokenHeaders['X-ULSA-Session-Id'],
    });
    expect(downloadHeaders['X-ULSA-Device-Id']).not.toMatch(/^node-/);
    expect(file.name).toBe(release.assetName);
    expect(file.type).toBe('application/octet-stream');
  });

  it('removes legacy query tokens from package download URLs when a header token is available', () => {
    expect(getStm32FirmwareDownloadUrl(
      'https://ulsa.example/api/stm32-firmware/download?token=download-token',
      'download-token'
    )).toBe('https://ulsa.example/api/stm32-firmware/download');
    expect(getStm32FirmwareDownloadUrl(
      'https://ulsa.example/api/stm32-firmware/download?tag=stm32&token=download-token',
      'download-token'
    )).toBe('https://ulsa.example/api/stm32-firmware/download?tag=stm32');
  });
});
