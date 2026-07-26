/**
 * Recense tout ce qui interdit une ouverture au public :
 * texte à trous, badges provisoires, biens d'exemple encore publiés.
 *
 *   node scripts/verifier-contenu.mjs        → rapport, sortie 0
 *   node scripts/verifier-contenu.mjs --strict → sortie 1 s'il reste quelque chose
 *
 * Le jour où le contenu réel est en place, brancher --strict sur la commande de
 * build de production : il deviendra alors impossible de publier une page à trous.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strict = process.argv.includes('--strict')

const MOTIFS = [
  { re: /\[[^\]\n]{2,60}\]/g, quoi: 'texte à trous' },
  { re: /badge-wip/g, quoi: 'badge « provisoire »' },
]

function fichiers(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? fichiers(p) : p.endsWith('.html') ? [p] : []
  })
}

let total = 0

for (const f of fichiers(join(ROOT, 'src'))) {
  const contenu = readFileSync(f, 'utf8')
  for (const { re, quoi } of MOTIFS) {
    const trouves = [...contenu.matchAll(re)].map((m) => m[0])
    if (!trouves.length) continue
    total += trouves.length
    console.log(`\n${relative(ROOT, f)}  — ${quoi} (${trouves.length})`)
    for (const t of [...new Set(trouves)].slice(0, 12)) console.log(`   ${t}`)
  }
}

const biens = JSON.parse(readFileSync(join(ROOT, 'data', 'biens.json'), 'utf8'))
const exemples = biens.filter((b) => b.source === 'exemple' && b.publie !== false)
if (exemples.length) {
  total += exemples.length
  console.log(`\ndata/biens.json — biens d'exemple encore publiés (${exemples.length})`)
  for (const b of exemples) console.log(`   ${b.slug} — ${b.titre}, ${b.commune}`)
}

console.log(
  total === 0
    ? '\n✓ Aucun contenu provisoire. Le site peut passer en SITE_PUBLIC=true.'
    : `\n${total} point(s) à traiter avant d'ouvrir le site au public et de l'autoriser à l'indexation.`,
)

if (strict && total > 0) process.exit(1)
