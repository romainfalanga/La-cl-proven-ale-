/* Passala Conciergerie — comportements d'interface.
   Volontairement minimal : pas de librairie, pas de dépendance. */

(() => {
  'use strict'

  /* ---------------------------------------------------------- en-tête */

  const header = document.getElementById('header')
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
  }

  /* ----------------------------------------------------- menu mobile */

  const toggle = document.getElementById('nav-toggle')
  const menu = document.getElementById('mobile-menu')

  if (toggle && menu) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open))
      toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu')
      menu.classList.toggle('is-open', open)
      document.body.classList.toggle('is-locked', open)
    }

    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'))
    menu.addEventListener('click', (e) => { if (e.target.tagName === 'A') setOpen(false) })
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false) })
  }

  /* ------------------------------------------------ apparition au scroll */

  const reveals = document.querySelectorAll('.reveal')
  if (reveals.length) {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reveals.forEach((el) => el.classList.add('is-visible'))
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return
            entry.target.classList.add('is-visible')
            io.unobserve(entry.target)
          })
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
      )
      reveals.forEach((el) => io.observe(el))
    }
  }

  /* ------------------------------------------------ formulaire de contact */

  const form = document.getElementById('form-contact')
  if (!form) return

  const statut = document.getElementById('form-statut')
  const bouton = form.querySelector('button[type="submit"]')
  const libelleBouton = bouton ? bouton.textContent : ''

  // Horodatage d'ouverture : un envoi en moins de 3 secondes est un robot.
  const ouvertA = document.getElementById('ouvert-a')
  if (ouvertA) ouvertA.value = String(Date.now())

  const afficher = (state, message) => {
    if (!statut) return
    statut.hidden = false
    statut.dataset.state = state
    statut.textContent = message
    statut.setAttribute('role', state === 'error' ? 'alert' : 'status')
  }

  const marquerErreur = (champ, message) => {
    champ.setAttribute('aria-invalid', 'true')
    const cible = document.getElementById(`erreur-${champ.name}`)
    if (cible) cible.textContent = message
  }

  const nettoyerErreurs = () => {
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'))
    form.querySelectorAll('.field__error').forEach((el) => (el.textContent = ''))
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    nettoyerErreurs()

    const data = Object.fromEntries(new FormData(form).entries())

    // Validation côté client : confort d'usage uniquement.
    // La validation qui fait foi est celle de la fonction serveur.
    let valide = true
    const requis = [
      ['nom', 'Merci d’indiquer votre nom.'],
      ['email', 'Merci d’indiquer votre email.'],
      ['typeBien', 'Merci de sélectionner un type de bien.'],
      ['commune', 'Merci d’indiquer la commune du bien.'],
    ]
    for (const [champ, message] of requis) {
      if (!String(data[champ] || '').trim()) {
        const el = form.elements[champ]
        if (el) marquerErreur(el, message)
        valide = false
      }
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(data.email))) {
      marquerErreur(form.elements.email, 'Cet email ne semble pas valide.')
      valide = false
    }
    if (!form.elements.consentement.checked) {
      marquerErreur(form.elements.consentement, 'Votre accord est nécessaire pour vous recontacter.')
      valide = false
    }

    if (!valide) {
      afficher('error', 'Certains champs demandent votre attention.')
      form.querySelector('[aria-invalid="true"]')?.focus()
      return
    }

    if (bouton) { bouton.disabled = true; bouton.textContent = 'Envoi en cours…' }
    afficher('success', 'Envoi en cours…')

    try {
      const reponse = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const resultat = await reponse.json().catch(() => ({}))

      if (!reponse.ok) {
        afficher('error', resultat.message || 'L’envoi a échoué. Vous pouvez nous écrire directement à contact@lacleprovencale.fr.')
        return
      }

      form.hidden = true
      afficher(
        'success',
        'Merci, votre demande est bien arrivée. Nous revenons vers vous sous 24 heures ouvrées avec une première analyse de votre bien.',
      )
    } catch {
      afficher('error', 'Connexion impossible. Réessayez dans un instant ou écrivez-nous à contact@lacleprovencale.fr.')
    } finally {
      if (bouton) { bouton.disabled = false; bouton.textContent = libelleBouton }
    }
  })
})()
