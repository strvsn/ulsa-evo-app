export interface Esp32OtaSession {
  ssid: string;
  password: string;
  token: string;
  ip: string;
  nodeId?: number;
  sessionOrigin?: 'ble' | 'initial_setup' | 'recovery';
  targetProfile?: 'demo';
}

export interface Esp32OtaHttpStatus {
  state: string;
  portalActive: boolean;
  updating: boolean;
  appDriven?: boolean;
  initialSetup?: boolean;
  sessionOrigin?: 'ble' | 'initial_setup' | 'recovery' | string;
  targetProfile?: 'demo' | string | null;
  purpose?: 'esp32_ota' | 'stm32_update' | string;
  nodeId?: number;
  ssid?: string;
  progress: number;
  uploadedBytes: number;
  totalBytes: number;
  remainingSeconds: number;
  firmwareVersion: string;
  firmwareVersionCode?: number;
  firmwareRevision?: number;
  firmwareCommit?: string;
  firmwareProfile?: 'demo' | 'initial' | string;
  firmwareDirty?: boolean;
  firmwareBuildContract?: string;
  error: string | null;
}

export interface Esp32OtaUploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

const getBaseUrl = (session: Esp32OtaSession): string =>
  `http://${session.ip || '192.168.4.1'}`;

const getTokenQuery = (session: Esp32OtaSession): string =>
  `token=${encodeURIComponent(session.token)}`;

export const readEsp32OtaHttpStatus = async (
  session: Esp32OtaSession,
  signal?: AbortSignal
): Promise<Esp32OtaHttpStatus> => {
  const response = await fetch(`${getBaseUrl(session)}/status?${getTokenQuery(session)}`, {
    cache: 'no-store',
    mode: 'cors',
    signal,
  });
  if (!response.ok) {
    throw new Error(`OTA status failed: HTTP ${response.status}`);
  }
  return response.json() as Promise<Esp32OtaHttpStatus>;
};

export const uploadEsp32Firmware = (
  session: Esp32OtaSession,
  file: File,
  onProgress?: (progress: Esp32OtaUploadProgress) => void
): Promise<string> => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append('firmware', file, file.name || 'firmware.bin');

  xhr.open('POST', `${getBaseUrl(session)}/doUpdate?${getTokenQuery(session)}`);
  xhr.timeout = 10 * 60 * 1000;

  xhr.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    const percent = Math.round((event.loaded / event.total) * 100);
    onProgress?.({ loaded: event.loaded, total: event.total, percent });
  };

  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      resolve(xhr.responseText);
      return;
    }
    reject(new Error(xhr.responseText || `OTA upload failed: HTTP ${xhr.status}`));
  };
  xhr.onerror = () => reject(new Error('OTA upload connection error'));
  xhr.ontimeout = () => reject(new Error('OTA upload timed out'));
  xhr.send(formData);
});
