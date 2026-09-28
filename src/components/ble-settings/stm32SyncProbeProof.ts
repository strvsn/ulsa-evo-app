import type { Esp32OtaSession } from '../../services/ota/esp32OtaTransfer';
import type { Stm32FirmwareReleaseOption } from '../../services/ota/stm32FirmwareReleaseCatalog';
import type { Stm32UpdateHttpStatus } from '../../services/ota/stm32OtaTransfer';

export type Stm32SyncProbeProof = Readonly<{
  sessionToken: string;
  releaseTarget: string;
  releaseTag: string;
  packageSha256: string;
}>;

const isCatalogPackageSha = (value: string): boolean => /^[0-9a-f]{64}$/i.test(value);

export const doesStm32SessionReleaseMatch = (
  status: Stm32UpdateHttpStatus,
  session: Esp32OtaSession,
  release: Stm32FirmwareReleaseOption,
): boolean => Boolean(
  session.token.length > 0 &&
  status.sessionBound === true &&
  status.sessionTarget === release.target &&
  status.sessionReleaseTag === release.releaseTag &&
  status.target === release.target &&
  status.releaseTag === release.releaseTag
);

export const doesStm32StatusMatchBinding = (
  status: Stm32UpdateHttpStatus,
  session: Esp32OtaSession,
  release: Stm32FirmwareReleaseOption,
): boolean => Boolean(
  doesStm32SessionReleaseMatch(status, session, release) &&
  isCatalogPackageSha(release.packageSha256) &&
  status.packageBytes === release.size &&
  typeof status.packageSha256 === 'string' &&
  status.packageSha256.toLowerCase() === release.packageSha256.toLowerCase()
);

export const doesStm32SyncProbeProofMatch = (
  proof: Stm32SyncProbeProof | null,
  session: Esp32OtaSession | null,
  release: Stm32FirmwareReleaseOption | null,
  status: Stm32UpdateHttpStatus | null,
): boolean => Boolean(
  proof && session && release && status &&
  session.token.length > 0 &&
  isCatalogPackageSha(release.packageSha256) &&
  proof.sessionToken === session.token &&
  proof.releaseTarget === release.target &&
  proof.releaseTag === release.releaseTag &&
  proof.packageSha256.toLowerCase() === release.packageSha256.toLowerCase() &&
  status.packageReady && status.canWrite && status.bootloaderSyncOk === true &&
  doesStm32StatusMatchBinding(status, session, release)
);

export const createStm32SyncProbeProof = (
  session: Esp32OtaSession,
  release: Stm32FirmwareReleaseOption,
  status: Stm32UpdateHttpStatus,
): Stm32SyncProbeProof | null => {
  if (!doesStm32SyncProbeProofMatch({
    sessionToken: session.token,
    releaseTarget: release.target,
    releaseTag: release.releaseTag,
    packageSha256: release.packageSha256,
  }, session, release, status)) return null;

  return Object.freeze({
    sessionToken: session.token,
    releaseTarget: release.target,
    releaseTag: release.releaseTag,
    packageSha256: release.packageSha256.toLowerCase(),
  });
};
