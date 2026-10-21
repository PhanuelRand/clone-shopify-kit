/**
 * Module 15 : Mise en production.
 *
 * Cette suite n'interroge pas votre code source : elle interroge **votre
 * application déployée**, à son adresse publique. C'est la preuve qu'elle
 * fonctionne vraiment, hors de votre machine.
 *
 * Elle ne crée rien et ne modifie rien : votre base de production ne reçoit
 * aucune donnée de vérification.
 *
 * Renseignez deux secrets dans les paramètres de votre dépôt GitHub (Settings,
 * puis Secrets and variables, puis Actions) :
 *
 *   DEPLOYMENT_URL   l'adresse de votre application, par exemple https://mon-clone.onrender.com
 *   INTERFACE_URL    la même adresse : votre interface y est servie, avec l'API
 *
 * Contrat HTTP exigé :
 *
 *   GET  /health                   -> 2xx
 *   GET  /shops                    -> 2xx et du JSON : l'annuaire des boutiques est public
 *   GET  /shops/:slug/products     -> du JSON, jamais 5xx : la vitrine est publique
 *   POST /shops                    -> 401 sans session : ouvrir une boutique demande d'être connecté
 *   POST /orders                   -> 401 sans session : commander aussi
 *   GET  /orders                   -> 401 sans session : « Mes commandes » est privé
 *   Une requête mal formée         -> 4xx, jamais 5xx
 *
 * Un hébergeur gratuit endort l'application après quelques minutes sans
 * visite : la première requête peut prendre près d'une minute. La suite
 * l'attend.
 */
import { describe, expect, it } from 'vitest'

const apiUrl = (process.env.DEPLOYMENT_URL ?? '').replace(/\/$/, '')
const interfaceUrl = (process.env.INTERFACE_URL ?? '').replace(/\/$/, '')
const timeout = 90_000

function call(url: string, init: RequestInit = {}): Promise<Response> {
  if (!/^https?:\/\//.test(url)) {
    throw new Error('Adresse manquante : renseignez les secrets DEPLOYMENT_URL et INTERFACE_URL.')
  }
  return fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
    // Un déploiement endormi doit se réveiller, mais pas bloquer la suite.
    signal: AbortSignal.timeout(timeout),
  })
}

describe('l’API déployée', () => {
  it('a une adresse configurée, servie en HTTPS', () => {
    expect(apiUrl, 'renseignez le secret DEPLOYMENT_URL avec l’adresse de votre API').toMatch(
      /^https:\/\/.+/,
    )
  })

  it('répond sur son point de santé', { timeout }, async () => {
    const response = await call(`${apiUrl}/health`)
    expect(response.ok).toBe(true)
  })
})

describe('les vitrines publiques', () => {
  // On parcourt les boutiques avant de créer un compte : c'est ainsi qu'on donne envie d'acheter.
  it('ouvre l’annuaire des boutiques à un visiteur anonyme, en JSON', { timeout }, async () => {
    const response = await call(`${apiUrl}/shops`)
    expect(response.ok, 'l’annuaire est public : GET /shops répond sans session').toBe(true)
    expect(response.headers.get('content-type') ?? '').toMatch(/json/)
  })

  it('répond en JSON pour la vitrine d’une boutique, même inconnue', { timeout }, async () => {
    const response = await call(`${apiUrl}/shops/verification-academie-inconnue/products`)
    expect(response.status, 'une vitrine inconnue n’est pas une erreur du serveur').toBeLessThan(500)
    expect(response.status, 'la vitrine est publique : aucune session demandée').not.toBe(401)
    expect(response.headers.get('content-type') ?? '').toMatch(/json/)
  })
})

describe('les routes protégées', () => {
  it('refuse d’ouvrir une boutique sans session', { timeout }, async () => {
    const response = await call(`${apiUrl}/shops`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Boutique anonyme', slug: 'boutique-anonyme' }),
    })
    expect(response.status).toBe(401)
  })

  it('refuse de commander sans session', { timeout }, async () => {
    const response = await call(`${apiUrl}/orders`, {
      method: 'POST',
      body: JSON.stringify({ shopId: 'une-boutique', lines: [], idempotencyKey: 'essai' }),
    })
    expect(response.status).toBe(401)
  })

  it('refuse « Mes commandes » sans session', { timeout }, async () => {
    const response = await call(`${apiUrl}/orders`)
    expect(response.status).toBe(401)
  })

  it('répond à une requête mal formée par une erreur 4xx, jamais 5xx', { timeout }, async () => {
    const malformed = await call(`${apiUrl}/orders`, { method: 'POST', body: '{ pas du json' })
    expect(malformed.status).toBeGreaterThanOrEqual(400)
    expect(malformed.status).toBeLessThan(500)

    const strange = await call(`${apiUrl}/shops/verification-academie-inconnue/products?limit=beaucoup&minPrice=cher&inStock=peut-etre`)
    expect(strange.status).toBeLessThan(500)
  })
})

describe('l’interface déployée', () => {
  it('a une adresse configurée, servie en HTTPS', () => {
    expect(
      interfaceUrl,
      'renseignez le secret INTERFACE_URL avec l’adresse de votre interface',
    ).toMatch(/^https:\/\/.+/)
  })

  it('sert une page HTML', { timeout }, async () => {
    const response = await call(interfaceUrl, { headers: { Accept: 'text/html' } })
    expect(response.ok).toBe(true)
    expect(await response.text()).toMatch(/<html[\s>]/i)
  })
})
