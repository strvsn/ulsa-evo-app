# Privacy and permissions

The approved app source has no account, advertising, analytics, or tracking SDK.

- BLE discovers and communicates with a user-selected ULSA EVO.
- Location/heading/speed/course are processed on device for true-north display and motion compensation.
- Motion is processed on device for physical upside-down presentation.
- Local Network and Hotspot Configuration are used only for a user-requested firmware update to the device-local endpoint.
- App logs remain in on-device storage for up to 30 days and 100 MiB and can be deleted per session or entirely.
- ZIP export/share occurs only after an explicit user action.

See the application `PrivacyInfo.xcprivacy` and the public policy URL configured in `.env.example`. A fork that adds telemetry, remote logs, accounts, or third-party SDKs must reassess its own privacy declarations.
