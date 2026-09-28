export const isStm32UpdaterEnabled = (
  value: string | undefined = import.meta.env.VITE_STM32_UPDATER_ENABLED
): boolean => value === 'true';
