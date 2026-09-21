# PGP SMS

Small Hugo static site for browser-side OpenPGP encryption/decryption and key generation.

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

## Security model

The site has no application backend. OpenPGP operations run in the browser.

OpenPGP.js is currently loaded from the pinned CDN URL:

```text
https://unpkg.com/openpgp@6.3.1/dist/openpgp.min.mjs
```

For a fully self-contained deployment, vendor the OpenPGP.js module into `assets/js/vendor/`
and change the import in `assets/js/app.js`.

`PGP1:` is only an SMS-friendly transport wrapper:

```text
PGP1: + Base64(binary OpenPGP message)
```

The underlying encrypted data remains OpenPGP.
