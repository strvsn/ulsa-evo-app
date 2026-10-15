import { registerPlugin } from '@capacitor/core';
import { isNativeIosApp } from './nativeRuntime';

export type NativeLogSaveResult = { saved: true; filename: string; path: string; bytes: number };
interface NativeLogArchivePlugin {
  begin(options: { filename: string; bytes: number }): Promise<{ id: string }>;
  append(options: { id: string; offset: number; base64: string }): Promise<{ bytes: number }>;
  save(options: { id: string }): Promise<NativeLogSaveResult | { saved: false }>;
  cancel(options: { id: string }): Promise<void>;
}
const UlsaLogArchive = registerPlugin<NativeLogArchivePlugin>('UlsaLogArchive');
const CHUNK_BYTES = 256 * 1024;
export const isNativeMacLogSaveAvailable = (): boolean => (
  isNativeIosApp() && typeof window !== 'undefined' && window.__ULSA_NATIVE_RUNTIME?.isIOSAppOnMac === true
);

const readBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error ?? new Error('ZIPの読み取りに失敗しました'));
  reader.onload = () => {
    const value = typeof reader.result === 'string' ? reader.result : '';
    const separator = value.indexOf(',');
    if (separator < 0) reject(new Error('ZIPの読み取り形式が不正です'));
    else resolve(value.slice(separator + 1));
  };
  reader.readAsDataURL(blob);
});

/** Bounded chunks avoid duplicating a large ZIP in a single bridge payload. */
export const saveNativeMacLogArchive = async (file: File): Promise<NativeLogSaveResult> => {
  if (!isNativeMacLogSaveAvailable()) throw new Error('Macのファイル保存を利用できません');
  const { id } = await UlsaLogArchive.begin({ filename: file.name, bytes: file.size });
  try {
    for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
      const end = Math.min(file.size, offset + CHUNK_BYTES);
      const base64 = await readBase64(file.slice(offset, end));
      const progress = await UlsaLogArchive.append({ id, offset, base64 });
      if (progress.bytes !== end) throw new Error('ZIPの転送サイズが一致しません');
    }
    const result = await UlsaLogArchive.save({ id });
    if (!result.saved) throw new DOMException('保存をキャンセルしました', 'AbortError');
    if (result.bytes !== file.size || !result.path) throw new Error('保存したZIPを確認できません');
    return result;
  } finally {
    // Only this transfer's temporary file is cleaned; app logs remain intact.
    await UlsaLogArchive.cancel({ id }).catch(() => undefined);
  }
};
