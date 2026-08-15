# Passala Conciergerie — site vitrine

Site vitrine de **Passala Conciergerie**, conciergerie orientée acquisition de
propriétaires de maisons et de villas en Provence.

Générateur statique maison, sans dépendance : **Node 20 suffit**. Pas de
framework, pas de `node_modules` à installer, un build de moins d'une seconde.

## Démarrer

```bash
node build.js                 # génère dist/
npx serve dist                # ou n'importe quel serveur statique
```

Pour tester la fonction de contact en local, il faut la CLI Netlify :

```bash
npx netlify-cli dev
```

## Structure

```
build.js                    Générateur : assemble les pages, crée une page par bien
data/biens.json             Source de vérité unique des biens gérés
src/
  pages/                    Une page = un fichier, avec un bloc <!--meta {...} --> en tête
  templates/bien.html       Gabarit d'une fiche de bien
  partials/                 layout, header, footer, motif olivier
  assets/                   CSS, JS, logo
netlify/functions/contact.js  Endpoint POST /api/contact → Resend
netlify.toml                Build, redirects, en-têtes de sécurité, CSP
```

### Ajouter un bien

Ajouter un objet dans `data/biens.json` et pousser. Le build crée
automatiquement `/biens/<slug>/` et met à jour la grille et le sitemap.
C'est ce point d'entrée unique qui rendra l'alimentation automatique possible.

```jsonc
{
  "slug": "villa-des-oliviers",   // URL : /biens/villa-des-oliviers/
  "titre": "Villa des Oliviers",
  "commune": "Bandol",
  "type": "Villa",                // Villa | Maison | Mas / bastide | Appartement
  "capacite": 8,
  "chambres": 4,
  "sallesDeBain": 3,
  "surface": 180,                 // m², facultatif
  "tarifNuitBasse": 290,          // €, facultatif
  "description": "…",
  "equipements": ["Piscine chauffée", "…"],
  "photos": [{ "src": "/assets/img/biens/xxx.jpg", "alt": "…" }],
  "publie": true                  // false = généré nulle part
}
```

## Variables d'environnement Netlify

À créer dans **Project configuration → Environment variables**. Aucune ne doit
apparaître dans le dépôt (voir `.env.example`).

| Nom | Rôle | Lue par | Sensibilité |
|---|---|---|---|
| `RESEND_API_KEY` | Authentification Resend | `netlify/functions/contact.js` | **Secret.** Jamais côté client |
| `CONTACT_TO_EMAIL` | Boîte qui reçoit les demandes | idem | Interne |
| `CONTACT_FROM_EMAIL` | Expéditeur affiché | idem | Interne |

`CONTACT_FROM_EMAIL` doit appartenir à un **domaine vérifié dans Resend**.
Aujourd'hui, le seul domaine vérifié du compte est `lavabio.fr` : le site est
donc configuré pour partir de `contact@lavabio.fr` avec un `reply_to` pointant
sur l'email du prospect. Dès que le domaine définitif de la marque sera vérifié
dans Resend, il suffira de changer cette variable — aucun code à modifier.

## Sécurité

- La clé Resend n'est lue que par la fonction serveur. Le navigateur n'appelle
  que `/api/contact`.
- Validation intégrale des champs côté serveur ; celle du navigateur n'est là
  que pour le confort.
- Anti-spam : champ piège invisible, refus des envois de moins de 3 secondes,
  et limitation à 5 envois par IP et par tranche de 10 minutes (au mieux :
  l'état vit en mémoire d'instance, voir le commentaire dans le fichier).
- Toute donnée du visiteur est échappée avant d'entrer dans le HTML de l'email,
  et les retours à la ligne sont neutralisés dans les champs courts.
- En-têtes de sécurité et CSP stricte définis dans `netlify.toml`.

## Points restant à traiter

- [ ] **Domaine et adresse email.** Le site s'appelle désormais Passala
      Conciergerie, mais l'adresse affichée reste `contact@lacleprovencale.fr`
      (pied de page, contact, mentions légales, messages d'erreur du
      formulaire) et l'URL de repli du build pointe encore sur
      `lacleprovencale.netlify.app`. À remplacer dès que le domaine définitif
      est arrêté — c'est une décision, pas un oubli : inventer une adresse
      couperait le seul canal de contact du site.
- [ ] Contenus provisoires signalés par un badge sur `/a-propos/` et
      `/mentions-legales/` (identité du dirigeant, SIRET, zone d'intervention).
- [ ] Les trois biens de `data/biens.json` sont des exemples : à remplacer par
      les biens réels avec leurs photographies.
- [ ] Alimentation automatique des biens : voir le plan d'architecture dédié.
