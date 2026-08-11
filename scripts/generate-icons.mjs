// Gera os ícones PWA (192, 512 e 512 maskable) a partir do favicon.svg existente.
// Uso: node scripts/generate-icons.mjs
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
const outDir = join(publicDir, 'icons')
mkdirSync(outDir, { recursive: true })

// Ícone "normal" (com bordas arredondadas já embutidas no design, igual ao favicon)
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="10" fill="#1b3025"/>
  <text x="24" y="32" font-family="Georgia, 'Times New Roman', serif" font-size="22" font-weight="600" fill="#f6f2e9" text-anchor="middle">SN</text>
</svg>
`

// Ícone "maskable": mesmo desenho mas sem cantos arredondados e com margem de segurança,
// já que o sistema operativo aplica a própria máscara (círculo, squircle, etc.)
const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" fill="#1b3025"/>
  <text x="24" y="30" font-family="Georgia, 'Times New Roman', serif" font-size="16" font-weight="600" fill="#f6f2e9" text-anchor="middle">SN</text>
</svg>
`

const targets = [
  { svg: iconSvg, size: 192, file: 'icon-192.png' },
  { svg: iconSvg, size: 512, file: 'icon-512.png' },
  { svg: iconSvg, size: 180, file: 'apple-touch-icon.png' },
  { svg: maskableSvg, size: 512, file: 'icon-512-maskable.png' },
]

for (const { svg, size, file } of targets) {
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png()
    .toFile(join(outDir, file))
  console.log(`gerado public/icons/${file} (${size}x${size})`)
}
