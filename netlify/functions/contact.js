/**
 * POST /api/contact
 *
 * Reçoit le formulaire de contact et envoie un email au gérant via Resend.
 * La clé API n'existe que dans cet environnement serveur : elle n'est jamais
 * exposée au navigateur, jamais renvoyée dans une réponse, jamais journalisée.
 */

const MAX = {
  nom: 120,
  email: 180,
  telephone: 30,
  typeBien: 40,
  commune: 120,
  chambres: 20,
  situation: 80,
  message: 2000,
}

const TYPES_BIEN = ['Villa', 'Maison', 'Mas / bastide', 'Appartement', 'Autre']

/* ------------------------------------------------------------ utilitaires */

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })

/** Toute valeur venant du visiteur est échappée avant d'entrer dans l'email. */
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Neutralise les retours à la ligne : évite l'injection d'en-têtes email. */
const monoligne = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim()

const estEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= MAX.email

/**
 * Limitation de débit en mémoire. Le conteneur d'une fonction serverless est
 * éphémère et il peut en exister plusieurs en parallèle : cette protection est
 * volontairement décrite comme « au mieux ». Elle arrête les envois répétés
 * depuis une même instance, pas une attaque distribuée. Un vrai plafond
 * demanderait un stockage partagé (Netlify Blobs ou base externe).
 */
const seau = new Map()
const FENETRE_MS = 10 * 60 * 1000
const MAX_PAR_FENETRE = 5

function tropDeRequetes(ip) {
  const maintenant = Date.now()
  const historique = (seau.get(ip) || []).filter((t) => maintenant - t < FENETRE_MS)
  if (historique.length >= MAX_PAR_FENETRE) return true
  historique.push(maintenant)
  seau.set(ip, historique)
  if (seau.size > 5000) seau.clear() // garde-fou mémoire
  return false
}

/* ------------------------------------------------------------- traitement */

export default async (req) => {
  if (req.method !== 'POST') {
    return json(405, { ok: false, message: 'Méthode non autorisée.' })
  }

  const ip =
    req.headers.get('x-nf-client-connection-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'inconnue'

  if (tropDeRequetes(ip)) {
    return json(429, {
      ok: false,
      message: 'Trop de demandes envoyées. Merci de réessayer dans quelques minutes.',
    })
  }

  let data
  try {
    data = await req.json()
  } catch {
    return json(400, { ok: false, message: 'Requête invalide.' })
  }
  if (!data || typeof data !== 'object') {
    return json(400, { ok: false, message: 'Requête invalide.' })
  }

  /* --- Pièges à robots. On répond 200 sans rien envoyer : le robot croit
         avoir réussi et ne réessaie pas. --- */

  if (String(data.societe || '').trim() !== '') {
    return json(200, { ok: true })
  }

  const ouvertA = Number(data.ouvertA)
  const ecoule = Date.now() - ouvertA
  if (!Number.isFinite(ouvertA) || ecoule < 3000 || ecoule > 24 * 60 * 60 * 1000) {
    return json(200, { ok: true })
  }

  /* --- Validation. C'est celle-ci qui fait foi. --- */

  const champs = {}
  for (const [cle, limite] of Object.entries(MAX)) {
    champs[cle] = monoligne(data[cle]).slice(0, limite)
  }
  // Le message garde ses retours à la ligne, mais reste plafonné.
  champs.message = String(data.message ?? '').slice(0, MAX.message)

  const erreurs = []
  if (champs.nom.length < 2) erreurs.push('nom')
  if (!estEmail(champs.email)) erreurs.push('email')
  if (!TYPES_BIEN.includes(champs.typeBien)) erreurs.push('typeBien')
  if (champs.commune.length < 2) erreurs.push('commune')
  if (data.consentement !== true && data.consentement !== 'on') erreurs.push('consentement')

  if (erreurs.length) {
    return json(422, {
      ok: false,
      message: 'Certaines informations sont manquantes ou invalides.',
      champs: erreurs,
    })
  }

  /* --- Configuration serveur --- */

  const cle = process.env.RESEND_API_KEY
  const destinataire = process.env.CONTACT_TO_EMAIL
  const expediteur = process.env.CONTACT_FROM_EMAIL

  if (!cle || !destinataire || !expediteur) {
    // On ne dit jamais au visiteur ce qui manque côté serveur.
    console.error('[contact] Configuration incomplète : vérifier RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL.')
    return json(500, {
      ok: false,
      message: "L'envoi est momentanément indisponible. Écrivez-nous directement par email.",
    })
  }

  /* --- Email --- */

  const ligne = (label, valeur) =>
    valeur
      ? `<tr>
           <td style="padding:8px 16px 8px 0;color:#55696F;font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td>
           <td style="padding:8px 0;color:#22343A;font-size:14px;font-weight:600;">${esc(valeur)}</td>
         </tr>`
      : ''

  const html = `<!doctype html>
<html lang="fr"><body style="margin:0;padding:24px;background:#FAF8F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #E4DFD5;border-radius:14px;overflow:hidden;">
    <div style="padding:20px 28px;background:#33474E;">
      <p style="margin:0;color:#C2A46A;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;">La Clé Provençale</p>
      <p style="margin:6px 0 0;color:#FFFFFF;font-size:19px;">Nouvelle demande de propriétaire</p>
    </div>

    <div style="padding:24px 28px;">
      <table style="width:100%;border-collapse:collapse;">
        ${ligne('Nom', champs.nom)}
        ${ligne('Email', champs.email)}
        ${ligne('Téléphone', champs.telephone)}
        ${ligne('Type de bien', champs.typeBien)}
        ${ligne('Commune', champs.commune)}
        ${ligne('Chambres', champs.chambres)}
        ${ligne('Situation', champs.situation)}
      </table>

      ${
        champs.message.trim()
          ? `<div style="margin-top:20px;padding-top:20px;border-top:1px solid #EFEBE3;">
               <p style="margin:0 0 8px;color:#55696F;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;">Message</p>
               <p style="margin:0;color:#22343A;font-size:14px;line-height:1.7;white-space:pre-wrap;">${esc(champs.message)}</p>
             </div>`
          : ''
      }

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #EFEBE3;">
        <a href="mailto:${esc(champs.email)}" style="display:inline-block;padding:11px 22px;background:#33474E;color:#FFFFFF;border-radius:999px;font-size:13px;font-weight:600;text-decoration:none;">Répondre à ${esc(champs.nom)}</a>
      </div>
    </div>

    <div style="padding:14px 28px;background:#F4F1E9;color:#7B8C91;font-size:11px;">
      Reçu via le formulaire de lacleprovencale.fr — ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
    </div>
  </div>
</body></html>`

  const texte = [
    'Nouvelle demande de propriétaire — La Clé Provençale',
    '',
    `Nom : ${champs.nom}`,
    `Email : ${champs.email}`,
    champs.telephone ? `Téléphone : ${champs.telephone}` : null,
    `Type de bien : ${champs.typeBien}`,
    `Commune : ${champs.commune}`,
    champs.chambres ? `Chambres : ${champs.chambres}` : null,
    champs.situation ? `Situation : ${champs.situation}` : null,
    champs.message.trim() ? `\nMessage :\n${champs.message}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const reponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cle}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: expediteur,
        to: [destinataire],
        // Le gérant répond au prospect d'un simple « Répondre ». On ne met
        // jamais l'adresse du prospect en expéditeur : ce serait de
        // l'usurpation, et SPF/DKIM feraient tomber le message en spam.
        reply_to: champs.email,
        subject: `Nouveau bien à étudier — ${champs.typeBien} à ${champs.commune} (${champs.nom})`,
        html,
        text: texte,
      }),
    })

    if (!reponse.ok) {
      const detail = await reponse.text().catch(() => '')
      console.error('[contact] Resend a refusé l’envoi', reponse.status, detail.slice(0, 500))
      return json(502, {
        ok: false,
        message: "Votre demande n'a pas pu être transmise. Réessayez ou écrivez-nous directement par email.",
      })
    }

    return json(200, { ok: true })
  } catch (e) {
    console.error('[contact] Erreur réseau vers Resend :', e?.message)
    return json(502, {
      ok: false,
      message: "Votre demande n'a pas pu être transmise. Réessayez ou écrivez-nous directement par email.",
    })
  }
}
