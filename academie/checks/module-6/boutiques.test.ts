/**
 * Module 6 : La boutique.
 *
 * Un client ouvre sa boutique : un nom, et un slug, l'adresse courte de sa
 * vitrine (décision 0001). Il devient alors marchand.
 *
 * Contrat attendu, exporté par `src/academie/module-6.ts` :
 *
 *   export function createAccount(input?: {
 *     name?: string                     // par défaut 'Client'
 *     email?: string                    // par défaut un courriel inventé
 *     phone?: string                    // facultatif
 *   }): Promise<string>                 // l'identifiant d'un compte client actif
 *
 *   export function accountRoles(accountId: string): Promise<string[]>
 *
 *   export function openShop(input: {
 *     ownerId: string; name: string; slug: string
 *   }): Promise<{ status: number; shopId?: string; reason?: string }>
 *                                       // 201; 400 hors des règles; 409 slug déjà pris
 *
 *   export function getShop(slug: string): Promise<null | {
 *     shopId: string; name: string; slug: string
 *   }>                                  // null si aucune boutique n'a ce slug
 *
 * Règles imposées par la consigne, que cette suite vérifie :
 *   - un nom fait de 2 à 60 caractères;
 *   - un slug fait de 3 à 40 caractères, en minuscules, chiffres et tirets,
 *     sans tiret au début ni à la fin ni deux tirets de suite;
 *   - les slugs `admin`, `api`, `www`, `boutiques` et `compte` sont réservés;
 *   - un slug déjà pris est refusé avec 409, même demandé au même instant;
 *   - ouvrir une boutique donne le rôle MERCHANT à son propriétaire;
 *   - la fiche publique d'une boutique ne montre ni le courriel ni le
 *     téléphone de son propriétaire.
 */
import { describe, expect, it } from 'vitest'
import { accountRoles, createAccount, getShop, openShop } from '../../../src/academie/module-6'
import { uniqueSlug } from '../_support/temps'

describe('ouvrir une boutique', () => {
  it('crée la boutique, trouvée par son slug', async () => {
    const ownerId = await createAccount({ name: 'Lalao' })
    const slug = uniqueSlug('atelier-lamba')
    const result = await openShop({ ownerId, name: 'Atelier Lamba', slug })

    expect(result.status).toBe(201)
    expect(result.shopId, 'une boutique créée porte un identifiant').toBeTruthy()
    expect(await getShop(slug)).toEqual({ shopId: result.shopId, name: 'Atelier Lamba', slug })
  })

  it('fait du propriétaire un marchand', async () => {
    const ownerId = await createAccount()
    expect(await accountRoles(ownerId)).toEqual(['CUSTOMER'])
    await openShop({ ownerId, name: 'Vanille de Sava', slug: uniqueSlug('vanille') })

    expect([...(await accountRoles(ownerId))].sort()).toEqual(['CUSTOMER', 'MERCHANT'])
  })

  it('ne trouve aucune boutique sous un slug inconnu', async () => {
    expect(await getShop(uniqueSlug('inconnue'))).toBeNull()
  })

  it('ne montre jamais le courriel ni le téléphone du propriétaire', async () => {
    const email = `marchand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.org`
    const ownerId = await createAccount({ name: 'Hery', email, phone: '034 98 765 43' })
    const slug = uniqueSlug('raphia')
    await openShop({ ownerId, name: 'Raphia et Cie', slug })

    const shop = await getShop(slug)
    expect(Object.keys(shop ?? {}).join(' '), 'aucune donnée de contact dans une fiche').not.toMatch(
      /email|courriel|phone|telephone|mail|owner|proprietaire/i,
    )
    expect(JSON.stringify(shop)).not.toContain(email)
  })
})

describe('le nom et le slug', () => {
  it('refuse un nom trop court ou trop long, avec 400 et un motif', async () => {
    const ownerId = await createAccount()
    for (const name of ['A', ' ', 'a'.repeat(61)]) {
      const result = await openShop({ ownerId, name, slug: uniqueSlug('nom') })
      expect(result.status, `nom « ${name.slice(0, 12)} »`).toBe(400)
      expect(result.reason, 'le refus doit porter un motif lisible').toBeTruthy()
    }
  })

  it('refuse un slug mal formé, avec 400', async () => {
    const ownerId = await createAccount()
    for (const slug of ['ab', 'Atelier-Lamba', 'atelier lamba', '-atelier', 'atelier-', 'atelier--lamba', 'atelier_lamba', 'été', 'a'.repeat(41)]) {
      expect((await openShop({ ownerId, name: 'Atelier', slug })).status, `slug « ${slug} »`).toBe(400)
    }
  })

  it('refuse un slug réservé à la plateforme, avec 400', async () => {
    const ownerId = await createAccount()
    for (const slug of ['admin', 'api', 'www', 'boutiques', 'compte']) {
      expect((await openShop({ ownerId, name: 'Boutique', slug })).status, `slug « ${slug} »`).toBe(400)
    }
  })

  it('refuse un slug déjà pris, avec 409 et un motif', async () => {
    const slug = uniqueSlug('doublon')
    expect((await openShop({ ownerId: await createAccount(), name: 'Première', slug })).status).toBe(201)

    const second = await openShop({ ownerId: await createAccount(), name: 'Seconde', slug })
    expect(second.status).toBe(409)
    expect(second.reason).toBeTruthy()
    expect((await getShop(slug))?.name).toBe('Première')
  })

  // Deux marchands qui choisissent le même slug à la même seconde : la base départage.
  it('ne donne le même slug qu’à une seule boutique, même demandé au même instant', async () => {
    const slug = uniqueSlug('course')
    const owners = await Promise.all([1, 2, 3, 4].map(() => createAccount()))
    const results = await Promise.all(owners.map((ownerId) => openShop({ ownerId, name: 'Même nom', slug })))

    expect(results.filter((result) => result.status === 201), 'une seule boutique créée').toHaveLength(1)
    expect(results.filter((result) => result.status === 409), 'les autres reçoivent 409, jamais 500').toHaveLength(3)
  })
})
