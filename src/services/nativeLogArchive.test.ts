import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true), getPlatform: vi.fn(() => 'ios'),
  begin: vi.fn(), append: vi.fn(), save: vi.fn(), cancel: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mock.isNativePlatform, getPlatform: mock.getPlatform },
  registerPlugin: () => mock,
}));
import { isNativeMacLogSaveAvailable, saveNativeMacLogArchive } from './nativeLogArchive';

describe('Mac native ZIP save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.isNativePlatform.mockReturnValue(true);
    mock.getPlatform.mockReturnValue('ios');
    window.__ULSA_NATIVE_RUNTIME = { isIOSAppOnMac: true };
    mock.begin.mockResolvedValue({ id: 'export-1' });
    mock.cancel.mockResolvedValue(undefined);
    mock.append.mockImplementation(async ({ offset, base64 }) => ({ bytes: offset + atob(base64).length }));
  });
  afterEach(() => { window.__ULSA_NATIVE_RUNTIME = { isIOSAppOnMac: false }; });

  it('uses bounded, ordered chunks and only returns a confirmed saved path', async () => {
    const bytes = new Uint8Array(600_000).fill(7);
    const file = new File([bytes], 'ulsa_evo_logs_test.zip');
    mock.save.mockResolvedValue({ saved: true, filename: file.name, path: '/save-fixture/logs.zip', bytes: file.size });
    await expect(saveNativeMacLogArchive(file)).resolves.toMatchObject({ saved: true, bytes: 600_000 });
    expect(mock.append).toHaveBeenCalledTimes(3);
    expect(mock.append.mock.calls.map(([chunk]) => chunk.offset)).toEqual([0, 262_144, 524_288]);
    for (const [chunk] of mock.append.mock.calls) expect(atob(chunk.base64).length).toBeLessThanOrEqual(262_144);
    expect(mock.cancel).toHaveBeenCalledWith({ id: 'export-1' });
  });

  it('does not consume a cancelled save as success and cleans only the transfer', async () => {
    mock.save.mockResolvedValue({ saved: false });
    await expect(saveNativeMacLogArchive(new File(['zip'], 'logs.zip'))).rejects.toMatchObject({ name: 'AbortError' });
    expect(mock.cancel).toHaveBeenCalledOnce();
  });

  it('fails closed for mismatched progress without presenting a partial ZIP', async () => {
    mock.append.mockResolvedValue({ bytes: 1 });
    await expect(saveNativeMacLogArchive(new File(['zip'], 'logs.zip'))).rejects.toThrow('転送サイズ');
    expect(mock.save).not.toHaveBeenCalled();
    expect(mock.cancel).toHaveBeenCalledOnce();
  });

  it('does not start the Mac transfer on an iPhone/iPad or in a browser', async () => {
    window.__ULSA_NATIVE_RUNTIME = { isIOSAppOnMac: false };
    expect(isNativeMacLogSaveAvailable()).toBe(false);
    await expect(saveNativeMacLogArchive(new File(['zip'], 'logs.zip'))).rejects.toThrow();
    window.__ULSA_NATIVE_RUNTIME = { isIOSAppOnMac: true };
    mock.isNativePlatform.mockReturnValue(false);
    expect(isNativeMacLogSaveAvailable()).toBe(false);
    expect(mock.begin).not.toHaveBeenCalled();
  });

  it('preserves error reporting when the OS cannot confirm the saved ZIP', async () => {
    mock.save.mockRejectedValue(new Error('SAVE_FAILED'));
    await expect(saveNativeMacLogArchive(new File(['zip'], 'logs.zip'))).rejects.toThrow('SAVE_FAILED');
    expect(mock.cancel).toHaveBeenCalledOnce();
  });

  it('uses the public system export picker, verifies the file, and never deletes app logs', () => {
    const source = readFileSync('ios/App/App/ULSALogArchivePlugin.swift', 'utf8');
    expect(source).toContain('UIDocumentPickerViewController(forExporting: [source], asCopy: true)');
    expect(source).toContain('bytes == expectedBytes');
    expect(source).toContain('destination.startAccessingSecurityScopedResource()');
    expect(source).toContain('data.count <= 256 * 1024');
    expect(source).not.toContain('IndexedDB');
    expect(source).not.toContain('DocumentsDirectory');
  });
});
