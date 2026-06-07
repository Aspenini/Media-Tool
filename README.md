# Aspenini Media Tool

[![Deploy](https://github.com/Aspenini/Media-Tool/actions/workflows/deploy.yml/badge.svg)](https://github.com/Aspenini/Media-Tool/actions/workflows/deploy.yml)
[![GitHub Stars](https://img.shields.io/github/stars/Aspenini/Media-Tool?style=flat)](https://github.com/Aspenini/Media-Tool/stargazers)

A powerful browser-based toolkit for pixel-perfect image scaling, diagonal image slicing, vintage audio effects, QR code generation, spatial audio, and more. Perfect for pixel art, game sprites, audio manipulation, and more.

Built with **React + TypeScript + Material UI**, bundled and served by **Bun**. Everything runs locally in your browser — no uploads.

## Features

- **Scaler**: Pixel-perfectly upscale images by any factor (great for pixel art and sprites).
- **PixelSnap POT**: Clean up messy pixel-style images by snapping them to a pixel grid, reducing the palette, and exporting sharp power-of-two PNGs for game engines (Godot/Unity/Unreal).
- **Slicer Tool**: Diagonally slice and combine two images with pixel precision.
- **Audio Effects**: Apply a 1940s-1950s vintage radio sound or 8-/16-bit bitcrushing to one or many files, exported as a TAR archive of WAVs.
- **Color Palette**: Apply retro color palettes (8-bit, NES, Game Boy, PICO-8, etc.) to images, with multiple dithering algorithms.
- **CSV to Image**: Convert CSV data to styled table images (batch export to TAR).
- **QR Code Generator**: Generate customizable QR codes with ECL, size, margin, and color options (PNG or SVG).
- **Brainfuck**: Encode text into Brainfuck, or run Brainfuck code in a built-in interpreter.
- **PAGNAI**: Procedural audio generation using mathematical waveform synthesis.
- **Audio Spinning**: Real-time HRTF orbital audio — the sound circles your head; export a binaural 3D WAV.
- **Audio Hamburger**: Play many tracks at once in 3D space; drag each on a map to position it, then export the binaural mix.
- **Credits Crawl**: Build an end-credits scroll and export it as a WebM video.
- **360° Image Viewer**: View equirectangular, cylindrical, or cube-map panoramas (powered by three.js).
- **Modern UI**: Material UI with light/dark mode, scrollable tabs, and fluid animations.

## Development

Requires [Bun](https://bun.sh) (v1.3+).

```bash
bun install
bun run dev
```

Open http://localhost:3000 (Bun's HTML dev server, with hot reload).

## Build

```bash
bun run build       # bundles index.html into dist/ via Bun.build
bun run typecheck   # tsc --noEmit
```

`bun run build` outputs static files to `dist/` (and copies `public/`, including `CNAME`).

## Deployment (GitHub Pages)

1. Ensure `favicon.png` and `github.png` are in `public/img/`.
2. Push to the `main`/`master` branch. The GitHub Actions workflow installs Bun, typechecks, builds, and deploys to GitHub Pages.
3. Configure the repository: Settings → Pages → Source: GitHub Actions.
4. The site uses CNAME `js-media-tool.aspenini.com` for the custom domain.

## Project Structure

```
index.html            # Minimal root + <script src="src/main.tsx">
build.ts              # Bun production build (Bun.build + copy public/)
public/               # Static assets copied verbatim into dist/ (CNAME, img/)
src/
├── main.tsx          # React root (ThemeProvider, CssBaseline, NotificationProvider)
├── App.tsx           # AppBar + scrollable tabs + animated panels + footer
├── theme.ts          # MUI light/dark theme
├── toolRegistry.tsx  # Single source of truth for tools (id, hash, label, icon, component)
├── hooks/            # useHashTab (deep-link hashes)
├── components/       # Reusable UI (ToolShell, FileDropZone, PreviewSurface, ...)
├── lib/              # Framework-agnostic logic (image, audio, palette, tar, wav, ...)
└── tools/            # One React component per tool
```

## Supported Formats

- **Images**: PNG, JPG, GIF, BMP, and most browser-supported formats.
- **Audio**: WAV, MP3, OGG, M4A, and most browser-supported formats. Output is WAV.

## Credits

- Created by Aspenini
- Built with React, Material UI, and Bun
- Uses the Web Audio API, HTML5 Canvas, [three.js](https://threejs.org/), and [qrcode](https://www.npmjs.com/package/qrcode)

## License

MIT License
