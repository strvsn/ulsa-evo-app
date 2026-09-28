export const userFirmwareLabel = (release: {
  tagName: string; version?: string; title: string; latest: boolean; prerelease?: boolean;
}): string => {
  const version = release.version ?? release.tagName.match(/v?(\d+\.\d+\.\d+)/)?.[1];
  return [version ? `v${version}` : release.title,
    release.latest ? '最新' : '', release.prerelease ? 'テスト版' : ''].filter(Boolean).join(' / ');
};
