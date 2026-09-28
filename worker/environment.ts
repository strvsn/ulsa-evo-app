// Non-secret bindings are generated from the Pages staging config by `wrangler types`.
// Secret names are intentionally absent from that file and are added here as a
// narrow intersection without redefining the generated Env interface.
export type RuntimeEnv = Env & {
  // Pages supplies this implicit binding; it is not emitted by wrangler types.
  readonly ASSETS: Fetcher;
  readonly STM32_DOWNLOAD_TOKEN_SECRET: string;
};
