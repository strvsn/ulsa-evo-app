const ULSA_EVO_NODE_NAME_PATTERN = /^ULSA EVO #\d+$/i;

/**
 * Service Data で確認した Node ID を、ULSA EVO の一覧表示名へ反映する。
 *
 * iOS は既接続 peripheral の GAP 名をキャッシュすることがあるため、
 * scan result の名前より広告 Service Data の Node ID を優先する。
 */
export const normalizeUlsaEvoDeviceName = (
  name: string | null,
  nodeId: number | undefined
): string | null => {
  if (nodeId === undefined) return name;
  if (name === null || ULSA_EVO_NODE_NAME_PATTERN.test(name)) {
    return `ULSA EVO #${nodeId}`;
  }
  return name;
};
