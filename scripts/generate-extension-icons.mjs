/**
 * Sinh icon PNG cho manifest extension từ public/favicon.svg
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const svgPath = path.join(root, 'public', 'favicon.svg')
const outDir = path.join(root, 'public', 'icons')
const sizes = [16, 32, 48, 128]

await mkdir(outDir, { recursive: true })

for (const size of sizes) {
  await sharp(svgPath)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(outDir, `icon-${size}.png`))
}

console.log(`Extension icons generated in public/icons/ (${sizes.join(', ')}px)`)
