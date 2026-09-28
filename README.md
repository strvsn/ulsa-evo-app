# ULSA EVO App

## 日本語

ULSA EVO超音波風速計のWeb Bluetooth／Capacitor iOSコンパニオンアプリの、承認済みオープンソース公開スナップショットです。

このリポジトリには正式なアプリversionごとに1つの承認済みsource snapshotを収録します。ライブの開発リポジトリではなく、privateな開発履歴、App Storeのcredential、署名資産、TestFlight自動化、firmware binary、R2 catalogの内容、配信credentialは含みません。

アプリの表示versionは`package.json`の`MAJOR.MINOR.PATCH`を正本とし、iOSの`MARKETING_VERSION`も同じ値にします。iOSのbuild番号、ESP32／STM32 firmwareのversion、端末内の設定・ログ保存形式はそれぞれ別管理です。WebブラウザーとiOSの保存内容は自動同期しません。

### ビルド

必要な環境:

- Node.js 24
- npm 11
- iOSビルド: macOS 26とXcode 26.4.1、または互換性のある新しいXcode 26

```bash
npm ci
npm run verify
npm run build:ios
```

`npm run build:ios`は署名なしの汎用iOS buildを行います。実機への書き込みや再配布には、利用者自身のApple Developer team、bundle identifier、署名証明書、provisioning profileが必要です。

### Cloudflare Pagesとfirmwareサービス

Cloudflare Function、R2 catalog validator、download token、Range/ETag streaming、Workerのlocal testを含みます。公式STRVSNのbucket、firmware package、catalog、token secret、配信承認は含みません。forkでは`cloudflare/staging/wrangler.jsonc`と`cloudflare/production/wrangler.jsonc`に自分のPages project名とprivate R2 bucketを設定してください。Cloudflare、GitHub、Apple、署名、firmware管理用secretを`VITE_*`へ置かないでください。

release packagingは`/api/release-identity`へsource SHA、client asset SHA-256、updater状態、channel、deployment IDを埋め込みます。公開後にこのendpointを検証し、mobile release toolingも同じsource SHAであることを確認してください。通常の開発pushをreleaseとして扱わないでください。

```bash
npm run worker:verify
npm run build
npm run pages:package
npm run pages:verify
npm run pages:dev
```

`dist/`はclient assetだけを含み、Capacitor/iOSへの入力です。deployするのは`dist/`ではなく**`build/cloudflare-pages/`**です。packaging commandがserver moduleと`/api/*` routingを追加します。`wrangler.jsonc`は旧Worker rollback用にのみ残しています。

Pagesは任意の`--config` pathを受け付けません。`--cwd cloudflare/staging`または`--cwd cloudflare/production`を使い、各環境の標準`wrangler.jsonc`を検出させてください。外部DNSでは、先にPagesへcustom subdomainを登録し、その後、既存DNS providerへPagesが示すCNAMEを追加します。nameserverの変更は不要です。

### プロジェクト方針

- ソフトウェアsourceは[MIT License](LICENSE)です。
- STRVSN／ULSA EVOの商標、logo、icon、splash、製品画像は[ASSET_LICENSE.md](ASSET_LICENSE.md)の別条件です。
- 各commitは承認済みrelease snapshotであり、開発branchではありません。
- Issues、Discussions、feature request、pull request、個別サポートは提供しません。
- hardware動作、background BLE、location、Motion、firmware更新、App Store審査は実機またはplatform reviewが必要で、source buildだけでは証明されません。

詳細: [Build Web and iOS](docs/BUILD_WEB_IOS.md)、[Architecture](docs/ARCHITECTURE.md)、[Privacy and Permissions](docs/PRIVACY_AND_PERMISSIONS.md)、[Firmware Update Boundary](docs/FIRMWARE_UPDATE_BOUNDARY.md)。

セキュリティ問題は[SECURITY.md](SECURITY.md)のprivate processから報告してください。

## English

Open-source release snapshots of the Web BLE and Capacitor/iOS application for the ULSA EVO ultrasonic anemometer.

This repository contains one approved source snapshot per formal app version. It is not the live development repository and does not contain private development history, App Store credentials, signing assets, TestFlight automation, firmware binaries, R2 catalog contents, or deployment credentials.

The app's user-visible `MAJOR.MINOR.PATCH` version comes from `package.json`, and the iOS `MARKETING_VERSION` must match. The iOS build number, ESP32/STM32 firmware versions, and local settings/log storage schemas are managed separately. Browser and iOS local data do not synchronize automatically.

## Build

Requirements:

- Node.js 24
- npm 11
- For iOS: macOS 26 and Xcode 26.4.1 or a compatible newer Xcode 26 release

```bash
npm ci
npm run verify
npm run build:ios
```

`npm run build:ios` performs an unsigned generic iOS build. Building for a physical device or redistribution requires your own Apple Developer team, bundle identifier, signing certificate, and provisioning profile.

## Cloudflare Pages and firmware services

The Cloudflare Function source, R2 catalog validator, download-token implementation, Range/ETag streaming, and local Worker tests are included. Pages serves the SPA and the same module Worker handles `/api/*` through an advanced-mode `_worker.js`. The official STRVSN buckets, firmware packages, catalogs, token secrets, and deployment authorization are not included. A fork must choose its own Pages project/bucket names in `cloudflare/staging/wrangler.jsonc` and `cloudflare/production/wrangler.jsonc`, then provision private R2 buckets. Never place Cloudflare, GitHub, Apple, signing, or firmware administration secrets in `VITE_*` variables.

Release packaging embeds a non-secret source SHA, client-asset SHA-256, updater state, channel, and deployment ID in `/api/release-identity`. Deployment automation should verify that endpoint after publishing and require mobile release tooling to match the same source SHA; ordinary development pushes should not be treated as releases.

```bash
npm run worker:verify
npm run build
npm run pages:package
npm run pages:verify
npm run pages:dev
```

`dist/` contains client assets only and is the Capacitor/iOS input. Deploy **`build/cloudflare-pages/`**, not `dist/`: the packaging command adds the server module and `/api/*` routing without copying them into iOS. Static pages do not invoke the Function. `wrangler.jsonc` is retained only for the former Worker rollback path, not the Pages deployment.

Pages does not accept a custom `--config` path. Use `--cwd cloudflare/staging` or `--cwd cloudflare/production` so Wrangler discovers that environment's standard `wrangler.jsonc`. For example, after preparing your own staging project: `npx wrangler pages deploy ../../build/cloudflare-pages --cwd cloudflare/staging --project-name YOUR_PROJECT --branch main`.

Use Wrangler Direct Upload from CI; a Cloudflare Git integration is not required. For external DNS, register the custom subdomain in Pages first, then add the CNAME target shown by Pages at the existing DNS provider. No nameserver change is required. See [Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## Project policy

- Software source is available under the [MIT License](LICENSE).
- STRVSN/ULSA EVO trademarks, logos, icons, splash art, and product images are governed by [ASSET_LICENSE.md](ASSET_LICENSE.md), not MIT.
- Each commit is an approved release snapshot, not a development branch.
- Issues, Discussions, feature requests, pull requests, and individual support are not provided in this repository.
- Hardware behavior, background BLE, location, Motion, firmware updates, and App Store acceptance require real-device or platform review and are not proven by a source build alone.

See [Build Web and iOS](docs/BUILD_WEB_IOS.md), [Architecture](docs/ARCHITECTURE.md), [Privacy and Permissions](docs/PRIVACY_AND_PERMISSIONS.md), and [Firmware Update Boundary](docs/FIRMWARE_UPDATE_BOUNDARY.md).

Report security issues through the private process in [SECURITY.md](SECURITY.md).
