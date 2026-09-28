const DISCONNECT_MESSAGE_PATTERNS = [
  'disconnect',
  'disconnected',
  'not connected',
  'gatt',
  'networkerror',
  'no longer connected',
  'peripheral disconnected',
];

const extractErrorText = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`.toLowerCase();
  }

  if (typeof error === 'object' && error !== null) {
    const maybeError = error as { name?: unknown; message?: unknown };
    return `${String(maybeError.name ?? '')} ${String(maybeError.message ?? '')}`.toLowerCase();
  }

  return String(error).toLowerCase();
};

export const isExpectedActivatePortalDisconnect = (op: string, error: unknown): boolean => {
  if (op !== 'activatePortal') return false;
  const errorText = extractErrorText(error);
  return DISCONNECT_MESSAGE_PATTERNS.some((pattern) => errorText.includes(pattern));
};
