/**
 * ビルド情報ユーティリティ
 * Viteビルド時にGitコミット情報が埋め込まれる
 */

/** 完全なsource SHA。未commit差分を含むbuildは`+dirty`を付け、exact buildと区別する。 */
export const BUILD_COMMIT_HASH: string = __APP_COMMIT_HASH__;

/** コミット日時（ISO 8601形式、例: 2026-02-27 18:43:35 +0900）*/
export const BUILD_COMMIT_TIME: string = __APP_COMMIT_TIME__;

/**
 * コミット日時を表示用にフォーマット
 * 例: "2026-02-27 18:43:35 +0900" → "2026/02/27 18:43"
 */
export const formatCommitTime = (isoTime: string): string => {
  try {
    const date = new Date(isoTime);
    if (isNaN(date.getTime())) return isoTime;
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `${y}/${mo}/${d} ${h}:${mi}`;
  } catch {
    return isoTime;
  }
};
