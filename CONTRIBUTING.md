# Local customization

This repository is a release-snapshot distribution and does not accept issues, feature requests, or pull requests.

You may clone or fork the repository and modify software source under the MIT License. Replace restricted STRVSN/ULSA EVO brand assets before distributing a derivative product, configure your own firmware endpoints and Apple signing identity, and run:

```bash
npm ci
npm run verify
npm run build:ios
```

Changes in a fork are maintained by that fork's owner and are not covered by STRVSN compatibility, App Store, firmware service, or individual support guarantees.
