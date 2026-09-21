# PGP SMS

Hugo static site with Polish and English using Hugo i18n.

## Languages

- Polish (default): `/`
- English: `/en/`

Translation files:

```text
i18n/pl.toml
i18n/en.toml
```

UI strings and JavaScript status/error messages use the same Hugo translation files.

## Local development

```bash
hugo server
```

## Netlify

The included `netlify.toml` builds with `hugo --gc --minify` and publishes `public/`.

OpenPGP.js is currently loaded from the pinned CDN URL in `assets/js/app.js`.
