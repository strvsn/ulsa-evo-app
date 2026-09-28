import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    include: ['worker/**/*.test.ts'],
    poolOptions: {
      workers: {
        main: './worker/index.ts',
        wrangler: {
          configPath: './cloudflare/staging/wrangler.jsonc',
        },
      },
    },
  },
});
