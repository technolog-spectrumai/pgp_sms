# PGP SMS

Small Hugo static site for browser-side OpenPGP encryption/decryption, key generation,
and exporting keys as QR images.

## Local development

Install Hugo Extended, then run:

```bash
hugo server
```

Open:

```text
http://localhost:1313
```

## Netlify

The repository includes `netlify.toml`.

Netlify build settings are:

- Build command: `hugo --gc --minify`
- Publish directory: `public`
- Hugo version: pinned in `netlify.toml`

Push the project to GitHub/GitLab/Bitbucket, import it into Netlify, and deploy.

## Key QR

The **Key QR** tab turns an OpenPGP key into a PNG you can print or display on another screen.
A `Show QR` button sits next to each key field on the other three tabs. The image carries a
title above the code and the key's user ID and fingerprint below it.

Reading a key back from an image is **not implemented yet**; see the TODO below.

Capacity is the practical limit. One QR code holds at most 2953 bytes, so the curve25519 keys
this site generates fit comfortably (roughly 810 bytes public, 1040 bytes private) at every
error-correction level. **RSA keys do not fit** and are rejected with an explanatory message.

> **A private key QR is a secret.** Anyone who photographs or copies the image can attempt to
> use the key. Protect the key with a passphrase before exporting it, and keep the PNG out of
> cloud-synced photo folders. The tab warns you, and warns harder when the key has no
> passphrase.

## TODO

### Read a key back from a QR image

Deferred. The intent is to upload a PNG or JPEG and recover the key, with no camera access, so
the `Permissions-Policy` header can keep denying `camera`.

The decoder must be **loaded on demand**, only when the user actually asks to read an image,
never as part of the initial page load.

Two candidate decoders, both measured against real exported key images:

| | bundled decoder | opencv.js `QRCodeDetectorAruco` |
| --- | --- | --- |
| Added transfer size (gzipped) | ~11 KB | ~3.6 MB |
| Decode time | 3-29 ms | ~320 ms |
| Decoded all test key images | yes | yes |

The already-vendored library also decodes; rebuilding its bundle with
`{ Encoder, Decoder, Detector, Byte, binarize, grayscale }` instead of `{ Encoder, Byte }`
grows it from ~9 KB to ~20 KB gzipped, and it decoded every test image correctly. That is the
cheap option and needs no lazy loading at all.

`opencv.js` is the maximum-robustness option and is the one that genuinely needs deferring.
Notes from evaluating it:

- `QRCodeDetectorAruco` **is** exposed to JavaScript and decoded the app's own key PNGs.
- The legacy `cv.QRCodeDetector` failed on the same images; use the Aruco detector.
- `QRCodeEncoder` is **not** exposed, so opencv.js can only ever cover the read direction.
- The distributed `opencv.js` is a UMD bundle whose factory returns a Promise, so a bare
  `import()` is not enough; inject a script tag (or wrap it) and await the resolved module.

## Security model

The site has no application backend. OpenPGP operations run in the browser.

OpenPGP.js is currently loaded from the pinned CDN URL:

```text
https://unpkg.com/openpgp@6.3.1/dist/openpgp.min.mjs
```

For a fully self-contained deployment, vendor the OpenPGP.js module into `assets/js/vendor/`
and change the import in `assets/js/app.js`.

The QR library is already vendored that way. `assets/js/vendor/qrcode.min.js` is a prebuilt,
encode-only bundle of [@nuintun/qrcode](https://github.com/nuintun/qrcode) 5.0.3 (MIT, licence
text in `assets/js/vendor/qrcode.LICENSE`); the header of that file records the exact command
that regenerates it. It is served from this origin, not a CDN, and encodes locally with no
network access of its own.

`layouts/_default/baseof.html` runs `assets/js/app.js` through Hugo's `js.Build`, which bundles
the vendored module into the single fingerprinted script the page loads under its SRI
`integrity` hash. The remote OpenPGP.js import is left untouched by the bundler.

`PGP1:` is only an SMS-friendly transport wrapper:

```text
PGP1: + Base64(binary OpenPGP message)
```

The underlying encrypted data remains OpenPGP.
