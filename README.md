# DevOps Portfolio

Personal portfolio site deployed via GitHub Actions → GitHub Pages.

## Stack

- Pure HTML5 / CSS3 / vanilla JS — zero build step, zero dependencies
- GitHub Actions for CI (HTML validation, CSS lint, broken-link check) + CD
- GitHub Pages for hosting

## CI/CD Pipeline

```
push to main
  └── validate job
        ├── HTML5 validation
        ├── CSS lint (stylelint)
        └── broken internal-link check
  └── deploy job (only on main)
        ├── configure-pages
        ├── upload-pages-artifact
        └── deploy-pages → live URL
```

## Local Development

Open `index.html` directly in a browser, or use any static file server:

```bash
# Python
python3 -m http.server 8080

# Node (npx)
npx serve .
```

## Enabling GitHub Pages

1. Go to **Settings → Pages** in your GitHub repository
2. Under **Source**, select **GitHub Actions**
3. Push to `main` — the workflow handles the rest

## Customising

| What | Where |
|------|-------|
| Name / bio / links | `index.html` — update placeholder text |
| Skills / projects / experience | `index.html` — edit the relevant sections |
| Colors / fonts | `assets/css/style.css` — `:root` design tokens |
| Behaviour (nav, animations) | `assets/js/main.js` |
