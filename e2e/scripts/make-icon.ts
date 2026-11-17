// Generates scripts/assets/cybertwin.ico (multi-size) from the twin-node logo frontend/public/favicon.svg.
//
//   cd e2e && node scripts/make-icon.ts
//
// Each size is rendered by Chromium from the SVG (not scaled down from one bitmap), stored as PNG inside the ICO
// (supported by Windows Vista and later), so the Desktop shortcut and taskbar get a crisp custom icon.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const svg = readFileSync(resolve(root, "frontend/public/favicon.svg"), "utf8");
const out = resolve(root, "scripts/assets/cybertwin.ico");
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

const browser = await chromium.launch();
const page = await browser.newPage();
const pngs: Buffer[] = [];
for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img src="${dataUrl}" width="${size}" height="${size}" style="display:block"></body></html>`,
  );
  await page.locator("img").evaluate((img: HTMLImageElement) => img.decode());
  pngs.push(await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
}
await browser.close();

// ICO container: ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes) per image + the PNG payloads
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type 1 = icon
header.writeUInt16LE(SIZES.length, 4);
const entries: Buffer[] = [];
let offset = 6 + 16 * SIZES.length;
SIZES.forEach((size, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
  e.writeUInt8(size >= 256 ? 0 : size, 1); // height
  e.writeUInt8(0, 2); // palette colours
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(pngs[i]!.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i]!.length;
  entries.push(e);
});
mkdirSync(resolve(root, "scripts/assets"), { recursive: true });
writeFileSync(out, Buffer.concat([header, ...entries, ...pngs]));
console.log(`wrote ${out} (${SIZES.join(", ")} px)`);
