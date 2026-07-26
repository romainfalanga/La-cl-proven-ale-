/**
 * Générateur statique de La Clé Provençale.
 *
 * Aucune dépendance : Node 20+ suffit. Le principe est volontairement simple —
 * des pages HTML dans src/pages, des morceaux communs dans src/partials, et
 * data/biens.json comme source de vérité unique pour les biens gérés.
 *
 * Chaque bien de data/biens.json produit sa propre page statique dans
 * dist/biens/<slug>/index.html. C'est ce point qui rend l'ajout automatique
 * d'un bien possible plus tard : il suffira d'ajouter une entrée au JSON.
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const SRC = join(ROOT, 'src')
const DIST = join(ROOT, 'dist')

const SITE_URL = process.env.URL || 'https://lacleprovencale.netlify.app'
const SITE_NAME = 'La Clé Provençale'

/**
 * Le site reste en préparation tant que SITE_PUBLIC ne vaut pas "true".
 * Dans cet état il est déployé et consultable, mais désindexé : les moteurs
 * n'iront pas référencer des mentions légales à trous ni des biens d'exemple.
 * Passer la variable à "true" dans Netlify le jour de l'ouverture au public.
 */
const EN_PREPARATION = process.env.SITE_PUBLIC !== 'true'

const read = (...p) => readFileSync(join(...p), 'utf8')

/** Échappe le HTML. Toute donnée issue de data/biens.json passe par ici. */
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Extrait le bloc <!--meta {...} --> en tête de page. */
function parseMeta(html) {
  const m = html.match(/^<!--meta\s*([\s\S]*?)-->\s*/)
  if (!m) return { meta: {}, body: html }
  return { meta: JSON.parse(m[1]), body: html.slice(m[0].length) }
}

function applyLayout(body, meta) {
  const layout = read(SRC, 'partials', 'layout.html')
  const header = read(SRC, 'partials', 'header.html')
  const footer = read(SRC, 'partials', 'footer.html')

  // Marque le lien courant. On n'ajoute qu'un attribut aria-current : le style
  // s'accroche dessus via un sélecteur d'attribut, ce qui évite de dupliquer
  // l'attribut class (qui produirait du HTML invalide).
  const nav = meta.nav || ''
  const activeHeader = nav
    ? header.replaceAll(`data-nav="${nav}"`, `data-nav="${nav}" aria-current="page"`)
    : header

  return layout
    .replaceAll(
      '{{ROBOTS}}',
      EN_PREPARATION ? '\n  <meta name="robots" content="noindex, nofollow">' : '',
    )
    .replaceAll('{{TITLE}}', esc(meta.title || SITE_NAME))
    .replaceAll('{{DESCRIPTION}}', esc(meta.description || ''))
    .replaceAll('{{CANONICAL}}', SITE_URL + (meta.path || '/'))
    .replaceAll('{{BODY_CLASS}}', meta.bodyClass || '')
    .replaceAll('{{HEADER}}', activeHeader)
    .replaceAll('{{FOOTER}}', footer)
    .replaceAll('{{YEAR}}', String(new Date().getFullYear()))
    .replaceAll('{{BODY}}', body)
}

/* ------------------------------------------------------------------ biens */

const biens = JSON.parse(read(ROOT, 'data', 'biens.json'))
const publies = biens.filter((b) => b.publie !== false)

const euro = (n) => (typeof n === 'number' ? `${n}&nbsp;€` : null)

function carteBien(b) {
  const photo = b.photos?.[0]
  const visuel = photo
    ? `<img src="${esc(photo.src)}" alt="${esc(photo.alt || b.titre)}" loading="lazy" width="800" height="600">`
    : `<div class="bien-card__placeholder" aria-hidden="true">${olivierSvg}</div>`

  return `
      <article class="bien-card">
        <a class="bien-card__link" href="/biens/${esc(b.slug)}/">
          <div class="bien-card__media">${visuel}${
            b.source === 'exemple' ? '<span class="bien-card__exemple">Exemple de présentation</span>' : ''
          }</div>
          <div class="bien-card__body">
            <p class="eyebrow">${esc(b.commune)}</p>
            <h3 class="bien-card__titre">${esc(b.titre)}</h3>
            <ul class="bien-card__specs">
              <li>${esc(b.type)}</li>
              <li>${esc(b.capacite)} voyageurs</li>
              <li>${esc(b.chambres)} chambres</li>
            </ul>
            <span class="bien-card__cta">Découvrir le bien</span>
          </div>
        </a>
      </article>`
}

function pageBien(b) {
  const template = read(SRC, 'templates', 'bien.html')

  const galerie = (b.photos || [])
    .map(
      (p, i) =>
        `<figure class="bien-galerie__item${i === 0 ? ' bien-galerie__item--large' : ''}">
          <img src="${esc(p.src)}" alt="${esc(p.alt || b.titre)}" loading="${i === 0 ? 'eager' : 'lazy'}" width="1200" height="900">
        </figure>`,
    )
    .join('\n')

  const equipements = (b.equipements || [])
    .map((e) => `<li>${esc(e)}</li>`)
    .join('\n')

  const chiffres = [
    ['Capacité', `${esc(b.capacite)} voyageurs`],
    ['Chambres', esc(b.chambres)],
    ['Salles de bain', esc(b.sallesDeBain)],
    ['Surface', b.surface ? `${esc(b.surface)}&nbsp;m²` : null],
    ['Tarif indicatif', euro(b.tarifNuitBasse) ? `dès ${euro(b.tarifNuitBasse)}<span class="bien-chiffre__unite"> / nuit</span>` : null],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="bien-chiffre"><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('\n')

  // Un bien d'exemple ne doit jamais pouvoir passer pour un bien réellement
  // géré : la mention est portée par la page elle-même, pas par une note interne.
  const avertissement =
    b.source === 'exemple'
      ? `<div class="container"><p class="avis-exemple">
           <strong>Exemple de présentation.</strong> Ce bien illustre la mise en page d'une fiche.
           Il ne fait pas partie des biens gérés par La Clé Provençale : le descriptif, les tarifs
           et les photographies sont fictifs.
         </p></div>`
      : ''

  const body = template
    .replaceAll('{{AVERTISSEMENT}}', avertissement)
    .replaceAll('{{TITRE}}', esc(b.titre))
    .replaceAll('{{COMMUNE}}', esc(b.commune))
    .replaceAll('{{TYPE}}', esc(b.type))
    .replaceAll('{{DESCRIPTION}}', esc(b.description))
    .replaceAll('{{GALERIE}}', galerie || `<div class="bien-galerie__vide">${olivierSvg}<p>Photographies en cours de préparation.</p></div>`)
    .replaceAll('{{CHIFFRES}}', chiffres)
    .replaceAll('{{EQUIPEMENTS}}', equipements || '<li>À compléter</li>')
    .replaceAll('{{SLUG}}', esc(b.slug))

  return applyLayout(body, {
    title: `${b.titre} — ${b.commune} | ${SITE_NAME}`,
    description: (b.description || '').slice(0, 155),
    nav: 'biens',
    path: `/biens/${b.slug}/`,
  })
}

/* ------------------------------------------------------------------ build */

const olivierSvg = read(SRC, 'partials', 'olivier.svg')

if (existsSync(DIST)) rmSync(DIST, { recursive: true })
mkdirSync(DIST, { recursive: true })

// Pages simples
const pagesDir = join(SRC, 'pages')
for (const file of readdirSync(pagesDir).filter((f) => f.endsWith('.html'))) {
  const { meta, body } = parseMeta(read(pagesDir, file))

  const rendu = body
    .replaceAll('{{OLIVIER}}', olivierSvg)
    .replaceAll(
      '{{AVIS_EXEMPLES}}',
      publies.some((b) => b.source === 'exemple')
        ? `<p class="avis-exemple">
             <strong>Ces fiches sont des exemples de présentation.</strong> Elles montrent la mise en
             page d'un bien et ne correspondent à aucun logement réellement géré à ce jour : titres,
             descriptifs, tarifs et photographies sont fictifs.
           </p>`
        : '',
    )
    .replaceAll(
      '{{GRILLE_BIENS}}',
      publies.length
        ? publies.map(carteBien).join('\n')
        : `<p class="biens-vide">Nos biens sont en cours de mise en ligne.</p>`,
    )

  const html = applyLayout(rendu, { ...meta, path: meta.path || (file === 'index.html' ? '/' : `/${file.replace('.html', '')}`) })

  if (file === 'index.html' || file === '404.html') {
    writeFileSync(join(DIST, file), html)
  } else {
    const dir = join(DIST, file.replace('.html', ''))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), html)
  }
}

// Une page par bien
for (const b of publies) {
  const dir = join(DIST, 'biens', b.slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), pageBien(b))
}

// Assets
cpSync(join(SRC, 'assets'), join(DIST, 'assets'), { recursive: true })

// Sitemap + robots
const urls = [
  '/',
  '/nos-biens',
  '/partenaires',
  '/a-propos',
  '/contact',
  '/mentions-legales',
  ...publies.map((b) => `/biens/${b.slug}/`),
]
writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join('\n')}
</urlset>
`,
)
writeFileSync(
  join(DIST, 'robots.txt'),
  EN_PREPARATION
    ? `# Site en préparation : indexation refusée tant que SITE_PUBLIC != "true".\nUser-agent: *\nDisallow: /\n`
    : `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
)

console.log(`✓ ${readdirSync(pagesDir).length} pages + ${publies.length} biens générés dans dist/`)
