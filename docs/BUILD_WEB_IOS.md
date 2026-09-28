# Build Web and iOS

## Web

```bash
npm ci
npm run verify
npm run build
```

Serve `dist/` from HTTPS when using Web BLE. Firmware update catalogs require the optional public endpoint variables in `.env.example`; the distribution backend is not part of this repository.

The production Web build generates `sw.js` and precaches the complete static app shell. After one successful online visit and Service Worker installation, the PWA can reopen `/dashboard` without Internet access. OTA catalogs, firmware packages, and `/api/*` responses are never cached; those operations still require a network connection. A first visit, cleared site data, or an incomplete cache requires Internet access. The Capacitor iOS app uses bundled assets instead of this Service Worker.

本番Webビルドは`sw.js`を生成し、アプリ画面の静的ファイル一式を保存します。オンラインで一度開き、Service Workerの導入が完了すると、通信がない状態でも`/dashboard`を再表示できます。OTA一覧、ファームウェア本体、`/api/*`の応答は保存せず、利用時には通信が必要です。初回起動・サイトデータ消去後・キャッシュ未完成時は通信が必要です。Capacitor iOS版はService Workerではなく同梱資産を使用します。

## iOS unsigned verification

```bash
npm ci
npm run build:ios
```

The command builds current Web assets, syncs them into the Capacitor project, checks asset parity, and invokes Xcode with `CODE_SIGNING_ALLOWED=NO`. It does not prove signing, TestFlight upload, App Store review, BLE hardware behavior, or background delivery.

To run a derivative on a device, use your own Apple Developer team and bundle identifier. Do not use STRVSN signing assets or represent a fork as the official ULSA EVO application.
