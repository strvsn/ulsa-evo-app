// Keep the source pattern split so the prohibited branding is not copied into
// production artifacts while still matching third-party error messages.
const EXTERNAL_WIRELESS_TERM = /blue(?:tooth)(?:[\s-]*(?:low[\s-]*energy|le))?/gi;

/**
 * Removes external protocol branding from messages before they reach the UI.
 * Non-string values are intentionally not stringified because they may expose
 * implementation details from third-party errors.
 */
export const normalizeBleUserMessage = (message: unknown): string => {
  if (typeof message !== 'string') return '';
  return message.replace(EXTERNAL_WIRELESS_TERM, 'BLE');
};
