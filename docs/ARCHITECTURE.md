# Architecture

ULSA EVO App uses one React/Ionic interface for browser Web BLE and a Capacitor/iOS wrapper.

- Shared UI, state, parsing, charts, logging, and controls live under `src/`.
- Web BLE and Capacitor/iOS BLE differences are isolated in the BLE adapter layer.
- Native Swift plugins provide iOS screen/orientation events, true heading/GNSS inputs, firmware Wi-Fi joining, app metadata, and Picture in Picture.
- `ios/App/App/public` is generated from `dist/` and is not source-controlled.
- `worker/` serves the built SPA and the existing firmware API contract from private R2 bindings. It validates fixed catalog schemas, never lists the bucket, never accepts an arbitrary object key, and streams approved artifacts with Range and ETag support.
- GitHub is source/CI only. The Worker has no runtime GitHub API dependency.

Production sensor values are never simulated. Missing, stale, disconnected, unsupported, and permission-denied states remain explicit.
