/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'

// Gitコミット情報を取得（ビルド時に埋め込む）
let commitHash = 'unknown'
let commitTime = 'unknown'
try {
  const sourceSha = execSync('git rev-parse HEAD').toString().trim()
  const dirty = execSync('git status --porcelain --untracked-files=all').toString().trim().length > 0
  commitHash = dirty ? `${sourceSha}+dirty` : sourceSha
  commitTime = execSync('git log -1 --format=%ai').toString().trim()
} catch {
  // Gitが利用できない環境ではデフォルト値を使用
}

const httpsKeyPath = process.env.VITE_DEV_HTTPS_KEY
const httpsCertPath = process.env.VITE_DEV_HTTPS_CERT
const devHttps = (() => {
  if (!httpsKeyPath || !httpsCertPath) return undefined
  if (!existsSync(httpsKeyPath) || !existsSync(httpsCertPath)) return undefined
  return {
    key: readFileSync(httpsKeyPath),
    cert: readFileSync(httpsCertPath),
  }
})()

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    legacy()
  ],
  define: {
    __APP_COMMIT_HASH__: JSON.stringify(commitHash),
    __APP_COMMIT_TIME__: JSON.stringify(commitTime),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    include: mode === 'test-product' ? [
      'src/components/BLESettingsDrawer.test.tsx',
      'src/components/ble-settings/UserSettings.test.tsx',
      'src/components/slides/ChartSlide.test.tsx',
      'src/components/charts/ChartLifecycle.test.tsx',
      'src/components/controls/controlMigration.test.ts',
      'src/services/ble/{WebBLEAdapter,CapacitorBLEAdapter,bleDataParser}.test.ts',
      'src/hooks/{useBLE,useSensorData}.test.tsx',
    ] : ['src/**/*.test.{ts,tsx}'],
  },
  server: devHttps ? { https: devHttps } : undefined,
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('echarts')) return 'vendor-echarts'
          if (id.includes('@ionic') || id.includes('ionicons')) return 'vendor-ionic'
          if (id.includes('swiper')) return 'vendor-swiper'
          return 'vendor'
        },
      },
    },
  }
}))
