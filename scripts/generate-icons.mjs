// Рендерит PNG-иконки из public/odintsov-live-app-icon.svg
// для apple-touch-icon (iOS) и manifest.json (Android/PWA).
// Запуск: npm run icons:generate
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const svg = await readFile(join(publicDir, 'odintsov-live-app-icon.svg'));

// Фон непрозрачный: прозрачный PNG на iOS даёт чёрный квадрат
const BACKGROUND = '#0F0F0F';
// SVG объявлен 512×512 при 72 DPI
const SVG_SIZE = 512;

const targets = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'apple-touch-icon-120.png', size: 120 },
  { name: 'apple-touch-icon-152.png', size: 152 },
  { name: 'apple-touch-icon-167.png', size: 167 },
  { name: 'apple-touch-icon-180.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  // Поля 14% уже заложены в SVG — логотип внутри safe-zone maskable
  { name: 'icon-512-maskable.png', size: 512 },
];

for (const { name, size } of targets) {
  const density = Math.ceil((size * 72) / SVG_SIZE) * 2;
  await sharp(svg, { density })
    .resize(size, size)
    .flatten({ background: BACKGROUND })
    .png({ compressionLevel: 9 })
    .toFile(join(publicDir, name));
  console.log(`✓ ${name} (${size}×${size})`);
}
