import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadEsp32FirmwareRelease,
  fetchEsp32FirmwareReleases,
  formatFirmwareReleaseLabel,
  type Esp32FirmwareReleaseOption,
} from './firmwareReleaseCatalog';

const createJsonResponse = (body: unknown, ok = true, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });

describe('firmwareReleaseCatalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads firmware.bin assets from GitHub releases with latest as the default first option', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse({
      releases: [
        {
          id: '1',
          tagName: 'esp32-fw-20260705134109',
          title: 'ULSA EVO ESP32 Firmware esp32-fw-20260705134109',
          publishedAt: '2026-07-05T13:41:09Z',
          size: 1245984,
          downloadUrl: 'https://ulsa.example/api/firmware/download?tag=esp32-fw-20260705134109',
          latest: true,
          prerelease: true,
          releaseNotes: { ja: ['日本語の変更'], en: ['English change'] },
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const releases = await fetchEsp32FirmwareReleases();

    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({
      id: '1',
      tagName: 'esp32-fw-20260705134109',
      latest: true,
      prerelease: true,
      size: 1245984,
      releaseNotes: { ja: ['日本語の変更'], en: ['English change'] },
    });
    expect(formatFirmwareReleaseLabel(releases[0])).toContain('/ latest');
    expect(formatFirmwareReleaseLabel(releases[0])).toContain('/ prerelease');
  });

  it('keeps the internal release revision out of the user-facing label', () => {
    const release: Esp32FirmwareReleaseOption = {
      id: 'r5',
      tagName: 'esp32-fw-v1.0.3-r5',
      title: 'ESP32 1.0.3',
      publishedAt: '2026-09-20T00:00:00Z',
      size: 1024,
      downloadUrl: '/firmware.bin',
      latest: true,
    };

    expect(formatFirmwareReleaseLabel(release)).toBe('v1.0.3 / latest (1 KB)');
    expect(formatFirmwareReleaseLabel(release)).not.toContain('r5');
  });

  it('excludes prereleases from direct GitHub release responses', async () => {
    const fetchMock = vi.fn(async () => createJsonResponse([
      {
        id: 2,
        tag_name: 'esp32-fw-rc.1',
        name: 'ESP32 RC',
        draft: false,
        prerelease: true,
        published_at: '2026-07-07T00:00:00Z',
        assets: [{
          id: 20,
          name: 'firmware.bin',
          size: 4,
          url: 'https://api.github.example/assets/20',
          browser_download_url: 'https://github.example/rc.bin',
        }],
      },
      {
        id: 1,
        tag_name: 'esp32-fw-stable',
        name: 'ESP32 Stable',
        draft: false,
        prerelease: false,
        published_at: '2026-07-06T00:00:00Z',
        assets: [{
          id: 10,
          name: 'firmware.bin',
          size: 3,
          url: 'https://api.github.example/assets/10',
          browser_download_url: 'https://github.example/stable.bin',
        }],
      },
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const releases = await fetchEsp32FirmwareReleases();

    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({
      tagName: 'esp32-fw-stable',
      prerelease: false,
      latest: true,
    });
  });

  it('downloads the selected firmware release as firmware.bin', async () => {
    const fetchMock = vi.fn(async () => new Response('bin', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const release: Esp32FirmwareReleaseOption = {
      id: '1',
      tagName: 'esp32-fw-test',
      title: 'test',
      publishedAt: '2026-07-05T00:00:00Z',
      size: 3,
      downloadUrl: 'https://ulsa.example/api/firmware/download?tag=esp32-fw-test',
      latest: true,
    };

    const file = await downloadEsp32FirmwareRelease(release);

    expect(fetchMock).toHaveBeenCalledWith(
      release.downloadUrl,
      expect.objectContaining({
        headers: { Accept: 'application/octet-stream' },
      })
    );
    expect(file.name).toBe('firmware.bin');
    expect(file.size).toBe(3);
  });
});
