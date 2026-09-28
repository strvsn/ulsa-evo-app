export const shouldRenderMemoryMonitor = (isDev: boolean, showMemoryMonitor: boolean): boolean =>
  isDev && showMemoryMonitor;
