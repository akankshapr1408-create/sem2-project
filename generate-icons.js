#!/usr/bin/env node
// generate-icons.js — Generates PNG icons for the extension
// Run: node generate-icons.js

const fs = require('fs');
const path = require('path');

const SVG_TEMPLATE = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#7c3aed"/>
      <stop offset="100%" style="stop-color:#0ea5e9"/>
    </linearGradient>
    <clipPath id="c">
      <rect width="${size}" height="${size}" rx="${size * 0.22}" ry="${size * 0.22}"/>
    </clipPath>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#g)" clip-path="url(#c)"/>
  <text x="${size/2}" y="${size * 0.68}" text-anchor="middle" font-size="${size * 0.52}" font-family="system-ui">⚡</text>
</svg>`;

const SIZES = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, 'icons');

if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

SIZES.forEach(size => {
  const svgPath = path.join(iconsDir, `icon${size}.svg`);
  fs.writeFileSync(svgPath, SVG_TEMPLATE(size));
  console.log(`✓ Created icon${size}.svg`);
});

// Also write a placeholder PNG note
const note = `# Icons Note

SVG files are in this folder. To convert to PNG:

Option 1 — Inkscape (recommended):
  inkscape icon16.svg  -o icon16.png
  inkscape icon32.svg  -o icon32.png
  inkscape icon48.svg  -o icon48.png
  inkscape icon128.svg -o icon128.png

Option 2 — ImageMagick:
  magick icon48.svg icon48.png

Option 3 — Use any online SVG→PNG converter.

The extension will use SVG files directly for now (Chrome supports SVG icons).
`;
fs.writeFileSync(path.join(iconsDir, 'README.md'), note);

console.log('\n✅ SVG icons generated in /icons/');
console.log('📖 See icons/README.md to convert to PNG if needed.');
