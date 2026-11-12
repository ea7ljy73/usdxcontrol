// Genera THIRD_PARTY_LICENSES.txt: avisos de ft8_lib y KISS FFT (build/licenses/) y de las
// dependencias que van dentro de la app, con todas sus dependencias transitivas.
// Uso: node scripts/third-party-licenses.cjs
const fs = require('fs'), path = require('path')
const root = path.resolve(__dirname, '..')
// Paquetes que importa la app (src/ y electron/): al añadir una dependencia, añadirla aquí.
const roots = ['serialport','react','react-dom','radix-ui','leaflet','clsx','tailwind-merge','@jtarrio/webrtlsdr']
const seen = new Map()
function resolve(name, from) {
  let dir = from
  while (true) {
    const p = path.join(dir, 'node_modules', name, 'package.json')
    if (fs.existsSync(p)) return fs.realpathSync(path.dirname(p))
    const up = path.dirname(dir); if (up === dir) return null; dir = up
  }
}
function walk(name, from) {
  const dir = resolve(name, from); if (!dir) return
  const pkg = JSON.parse(fs.readFileSync(path.join(dir,'package.json')))
  const key = pkg.name + '@' + pkg.version
  if (seen.has(key)) return
  if (pkg.name.startsWith('@types/')) return
  const lic = fs.readdirSync(dir).find(f => /^(licen[sc]e|copying)/i.test(f))
  seen.set(key, { name: pkg.name, version: pkg.version, license: pkg.license, text: lic ? fs.readFileSync(path.join(dir, lic), 'utf8').trim() : null })
  for (const d of Object.keys(pkg.dependencies || {})) walk(d, dir)
}
for (const r of roots) walk(r, root)
let out = 'Componentes de terceros incluidos en uSDX Control\n' + '='.repeat(50) + '\n\n'
const extra = ['ft8_lib.txt', 'kissfft.txt'].map(f => path.join(root, 'build', 'licenses', f))
for (const f of extra) out += fs.readFileSync(f, 'utf8').trim() + '\n\n' + '-'.repeat(70) + '\n\n'
for (const e of [...seen.values()].sort((a,b)=>a.name.localeCompare(b.name))) {
  out += `${e.name} ${e.version} — ${e.license}\n\n${e.text ?? '(el paquete no incluye fichero de licencia; licencia ' + e.license + ')'}\n\n` + '-'.repeat(70) + '\n\n'
}
fs.writeFileSync(path.join(root, 'THIRD_PARTY_LICENSES.txt'), out)
console.log('THIRD_PARTY_LICENSES.txt: ' + seen.size + ' paquetes; sin texto: ' + [...seen.values()].filter(e=>!e.text).map(e=>e.name).join(', '))
