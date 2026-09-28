# Firmware update boundary

The application contains user-facing ESP32/STM32 update clients, BLE control contracts, package integrity checks, and local transfer flows.

This public repository does not include:

- STRVSN's firmware binaries, R2 catalog contents, Cloudflare account, or deployment credentials.
- GitHub/private firmware repository credentials.
- STM32 firmware package signing private keys.
- App Store/TestFlight credentials or signing automation.

The included Worker is deployable only after a fork provisions its own private R2 buckets, immutable firmware objects, validated catalogs, and a Worker secret for the STM32 five-minute HMAC token. Never place administration tokens, Cloudflare/GitHub tokens, signing keys, or deployment bypass secrets in `VITE_*` variables because those values are embedded in the client.

The public and TestFlight builds include the user-facing STM32 updater UI. The production STM32 API and catalog provide signed production firmware selected by STRVSN. Internal diagnostic code and specifications are excluded from this source snapshot. Source access does not provide firmware signing keys or production authorization.

Public source access does not authorize firmware updates to devices the user does not own or control. Destructive or recovery operations must preserve target identity, signature, and fail-closed checks.
