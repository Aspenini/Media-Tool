# Aspenini Media Tool

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
