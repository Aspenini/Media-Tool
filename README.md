# Aspenini Media Tool

![Visits](https://img.shields.io/endpoint?url=https://js-media-tool.aspenini.com/badges/visits.json)
[![Deploy](https://github.com/Aspenini/Media-Tool/actions/workflows/deploy.yml/badge.svg)](https://github.com/Aspenini/Media-Tool/actions/workflows/deploy.yml)
[![GitHub Stars](https://img.shields.io/github/stars/Aspenini/Media-Tool?style=flat)](https://github.com/Aspenini/Media-Tool/stargazers)

A powerful browser-based tool for pixel-perfect image scaling, diagonal image slicing, vintage audio effects, QR code generation, and more. Perfect for pixel art, game sprites, audio manipulation, and more.

## Features

- **Scaler**: Pixel-perfectly upscale images by any factor (great for pixel art and sprites).
- **Slicer Tool**: Diagonally slice and combine two images with pixel precision.
- **Audio Effects**: Apply effects like a 1940s-1950s vintage radio sound to your audio files, with subtle static and authentic EQ.
- **Color Palette**: Apply retro color palettes (8-bit, NES, Game Boy, PICO-8, etc.) to images.
- **CSV to Image**: Convert CSV data to table images.
- **QR Code Generator**: Generate customizable QR codes with ECL, size, margin, and color options.
- **Brainfuck Encoder**: Encode text into Brainfuck code.
- **PAGNAI**: Procedural audio generation using mathematical algorithms.
- **Modern UI**: Sleek, animated, and responsive interface.
- **All processing is done in your browser**: No uploads, no privacy concerns.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Build

```bash
npm run build
```

Output goes to `dist/` for static deployment.

## Deployment (GitHub Pages)

1. Ensure `favicon.png` and `github.png` are in `public/img/`.
2. Push to the `master` branch. The GitHub Actions workflow builds and deploys to GitHub Pages.
3. Configure the repository: Settings → Pages → Source: GitHub Actions.
4. The site uses CNAME `js-media-tool.aspenini.com` for custom domain.

## Free Analytics Badge (GA4 + Shields.io)

This repo includes a free analytics badge pipeline:
- **Google Analytics 4** tracks visits on the static site.
- **GitHub Actions** periodically queries GA4 via the Google Analytics Data API.
- The workflow writes a Shields endpoint JSON at `public/badges/visits.json`.
- **Shields.io** renders the live badge from that JSON.

### 1) Add GA4 to the site

In `index.html`, replace both `G-XXXXXXXXXX` values with your GA4 Measurement ID (for example `G-ABC123XYZ9`).

### 2) Create a GA4 service account and enable API access

1. In Google Cloud, create/select a project linked to your GA usage.
2. Enable **Google Analytics Data API** for that project.
3. Create a **Service Account**.
4. Create and download a JSON key for that service account.
5. In Google Analytics (GA4): **Admin → Property Access Management**.
6. Add the service account email (ends with `iam.gserviceaccount.com`) and grant at least **Viewer** access.
7. Copy your GA4 **Property ID** from GA4 Admin.

### 3) Add required GitHub Secrets

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**

- `GA4_PROPERTY_ID`: your numeric GA4 property id (example: `123456789`)
- `GA_SERVICE_ACCOUNT_KEY`: full JSON key contents from the service account file

The workflow file is `.github/workflows/update-analytics-badge.yml` and runs:
- every 6 hours on schedule
- on-demand with **workflow_dispatch** (Run workflow button)

### 4) Badge JSON location and URL

The generated file is:
- `public/badges/visits.json` in the repo
- served as `/badges/visits.json` on your Pages site

Badge markdown:

```md
![Visits](https://img.shields.io/endpoint?url=https://YOUR_SITE_URL/badges/visits.json)
```

Use one of:
- Custom domain: `https://js-media-tool.aspenini.com/badges/visits.json`
- Default Pages domain: `https://<username>.github.io/<repo>/badges/visits.json`

### 5) Maintenance notes

- Metric is configured as `screenPageViews` in the workflow env (`GA4_METRIC`).
- Badge style is controlled by `BADGE_LABEL` and `BADGE_COLOR`.
- The workflow commits only when `public/badges/visits.json` changes.
- Keep all secrets in GitHub Actions secrets. Never commit GA credential files.

## Project Structure

```
src/
├── main.ts           # Entry point
├── ui/               # Shared UI (tabs, notifications)
├── tools/            # Tool modules (scaler, slicer, audio, etc.)
└── utils/            # Utilities (tar, wav)
```

## Supported Formats

- **Images**: PNG, JPG, GIF, BMP, and most browser-supported formats.
- **Audio**: WAV, MP3, OGG, and most browser-supported formats. Output is WAV.

## Credits

- Created by Aspenini
- Uses the Web Audio API, HTML5 Canvas, and [qrcode](https://www.npmjs.com/package/qrcode) for QR generation

## License

MIT License
