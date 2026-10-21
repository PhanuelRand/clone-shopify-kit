/**
 * Module 17 : Les avis vérifiés. Module Platine.
 *
 * Après avoir reçu son colis, le client note le produit, de 1 à 5, avec un
 * commentaire. Seul un client qui a reçu le produit peut le noter : c'est ce
 * qui fait l'« achat vérifié ». Le marchand répond une fois à chaque avis, mais
 * ne peut ni le modifier ni le retirer. La note d'un produit n'est affichée
 * qu'à partir de trois avis, pour qu'un seul client mécontent, ou un seul ami
 * complaisant, ne la décide pas.
 *
 * Contrat attendu, exporté par `src/academie/module-17.ts` :
 *
 *   export function createAccount(input?: { ...ceux du module 6 }): Promise<string>
 *
 *   export function createDeliveredOrder(input?: {
 *     productId?: string             // par défaut un produit neuf, dans une boutique neuve
 *     customerId?: string            // par défaut un client neuf
 *     deliveredAt?: string           // un instant ISO 8601; par défaut maintenant
 *     status?: 'PAID' | 'SHIPPED' | 'DELIVERED'   // où s'arrêter; par défaut 'DELIVERED'
 *   }): Promise<{ orderId: string; productId: string; shopId: string; ownerId: string; customerId: string }>
 *                                    // une commande de ce produit, passée, payée, expédiée, et livrée
 *                                    // à l'instant deliveredAt
 *
 *   export function leaveReview(input: {
 *     productId: string; authorId: string
 *     rating: number                 // un entier de 1 à 5
 *     body: string                   // 1 000 caractères au plus, peut être vide
 *     now: string                    // un instant ISO 8601
 *   }): Promise<{ status: number; reviewId?: string }>
 *                                    // 201; 400 pour une note invalide ou un commentaire trop long;
 *                                    // 403 sans commande livrée de ce produit; 409 pour un second avis;
 *                                    // 410 plus de trente jours après la dernière livraison
 *
 *   export function productRating(productId: string): Promise<{
 *     average: number | null         // la moyenne, à un chiffre après la virgule; null sous trois avis
 *     count: number                  // le nombre d'avis
 *   }>
 *
 *   export function productReviews(productId: string): Promise<{
 *     rating: number; body: string
 *     authorName: string             // le prénom de l'auteur, rien d'autre
 *     reply: string | null           // la réponse de la boutique
 *   }[]>                             // les plus récents d'abord
 *
 *   export function replyToReview(input: {
 *     reviewId: string; memberId: string; body: string
 *   }): Promise<{ status: number }>  // 201; 400 vide; 403 pour un autre que le propriétaire de la boutique;
 *                                    // 404 avis inconnu; 409 une seconde fois
 *
 * Un avis ne montre ni le courriel ni le téléphone de son auteur.
 */
import { describe, expect, it } from 'vitest'
import {
  createAccount,
  createDeliveredOrder,
  leaveReview,
  productRating,
  productReviews,
  replyToReview,
} from '../../../src/academie/module-17'

const deliveredAt = '2030-07-15T09:30:00.000Z'
const nextDay = '2030-07-16T09:30:00.000Z'

function review(productId: string, authorId: string, rating: number, extra: Partial<Parameters<typeof leaveReview>[0]> = {}) {
  return leaveReview({ productId, authorId, rating, body: 'Belle qualité, conforme aux photos.', now: nextDay, ...extra })
}

describe('écrire un avis', () => {
  it('accepte l’avis du client qui a reçu le produit, une seule fois', async () => {
    const { productId, customerId } = await createDeliveredOrder({ deliveredAt })
    const first = await review(productId, customerId, 5)
    expect(first.status).toBe(201)
    expect(first.reviewId, 'un avis porte un identifiant').toBeTruthy()
    expect((await review(productId, customerId, 1)).status, 'un second avis sur le même produit').toBe(409)
  })

  it('refuse une note hors de 1 à 5 ou à virgule, ou un commentaire trop long, avec 400', async () => {
    const { productId, customerId } = await createDeliveredOrder({ deliveredAt })
    for (const rating of [0, 6, 3.5]) {
      expect((await review(productId, customerId, rating)).status, `note ${rating}`).toBe(400)
    }
    expect((await review(productId, customerId, 4, { body: 'a'.repeat(1_001) })).status).toBe(400)
  })

  // L'achat vérifié : un avis vient d'un client qui a reçu le produit.
  it('refuse l’avis du marchand, d’un tiers, ou d’un client qui n’a pas encore reçu le produit, avec 403', async () => {
    const { productId, ownerId } = await createDeliveredOrder({ deliveredAt })
    const paid = await createDeliveredOrder({ productId, status: 'PAID' })
    const shipped = await createDeliveredOrder({ productId, status: 'SHIPPED' })
    for (const authorId of [ownerId, await createAccount(), paid.customerId, shipped.customerId]) {
      expect((await review(productId, authorId, 5)).status).toBe(403)
    }
  })

  it('accepte un avis jusqu’à trente jours après la livraison, et le refuse ensuite avec 410', async () => {
    const late = await createDeliveredOrder({ deliveredAt })
    expect((await review(late.productId, late.customerId, 4, { now: '2030-08-14T09:31:00.000Z' })).status).toBe(410)

    const onTime = await createDeliveredOrder({ deliveredAt })
    expect((await review(onTime.productId, onTime.customerId, 4, { now: '2030-08-14T09:30:00.000Z' })).status).toBe(201)
  })
})

describe('la note d’un produit', { timeout: 60_000 }, () => {
  async function rated(ratings: number[]) {
    const first = await createDeliveredOrder({ deliveredAt })
    const productId = first.productId
    const others = await Promise.all(ratings.slice(1).map(() => createDeliveredOrder({ productId, deliveredAt })))
    const orders = [first, ...others]
    for (const [index, rating] of ratings.entries()) {
      const order = orders[index]
      if (order) await review(productId, order.customerId, rating)
    }
    return { productId, orders }
  }

  it('reste cachée sous trois avis, mais compte les avis', async () => {
    const { productId } = await rated([5, 4])
    expect(await productRating(productId)).toEqual({ average: null, count: 2 })
  })

  it('fait la moyenne à partir de trois avis, arrondie à un chiffre après la virgule', async () => {
    const { productId } = await rated([5, 4, 4])
    expect(await productRating(productId)).toEqual({ average: 4.3, count: 3 })
  })

  it('montre les avis les plus récents d’abord, avec le seul prénom de leur auteur', async () => {
    const email = `cliente-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.org`
    const first = await createDeliveredOrder({ deliveredAt, customerId: await createAccount({ name: 'Fara', email, phone: '034 98 765 43' }) })
    const second = await createDeliveredOrder({ productId: first.productId, deliveredAt, customerId: await createAccount({ name: 'Njaka' }) })
    await review(first.productId, first.customerId, 3, { body: 'Couleur un peu plus pâle.' })
    await review(first.productId, second.customerId, 5, { body: 'Parfait.', now: '2030-07-17T09:30:00.000Z' })

    const items = await productReviews(first.productId)
    expect(items).toEqual([
      { rating: 5, body: 'Parfait.', authorName: 'Njaka', reply: null },
      { rating: 3, body: 'Couleur un peu plus pâle.', authorName: 'Fara', reply: null },
    ])
    expect(Object.keys(items[0] ?? {}).join(' '), 'un avis ne porte aucune coordonnée').not.toMatch(/email|courriel|phone|telephone/i)
    expect(JSON.stringify(items)).not.toContain(email)
  })

  it('ne mélange pas les avis de deux produits', async () => {
    const { productId } = await rated([5, 5, 5])
    const other = await rated([1, 1, 1])
    expect((await productRating(productId)).average).toBe(5)
    expect((await productRating(other.productId)).average).toBe(1)
  })
})

describe('la réponse de la boutique', () => {
  it('laisse le marchand répondre une fois, et montre la réponse sous l’avis', async () => {
    const { productId, customerId, ownerId } = await createDeliveredOrder({ deliveredAt })
    const { reviewId = '' } = await review(productId, customerId, 2, { body: 'Reçu avec une semaine de retard.' })

    expect((await replyToReview({ reviewId, memberId: ownerId, body: '  ' })).status).toBe(400)
    expect((await replyToReview({ reviewId, memberId: ownerId, body: 'Toutes nos excuses, le transporteur a pris du retard.' })).status).toBe(201)
    expect((await replyToReview({ reviewId, memberId: ownerId, body: 'Encore' })).status).toBe(409)
    expect((await productReviews(productId))[0]?.reply).toBe('Toutes nos excuses, le transporteur a pris du retard.')
  })

  it('refuse la réponse à un autre marchand ou au client avec 403, et un avis inconnu avec 404', async () => {
    const { productId, customerId, ownerId } = await createDeliveredOrder({ deliveredAt })
    const { reviewId = '' } = await review(productId, customerId, 4)
    const intruder = await createDeliveredOrder({ deliveredAt })

    for (const memberId of [intruder.ownerId, customerId]) {
      expect((await replyToReview({ reviewId, memberId, body: 'Merci !' })).status).toBe(403)
    }
    expect((await replyToReview({ reviewId: '00000000-0000-4000-8000-000000000000', memberId: ownerId, body: 'Merci !' })).status).toBe(404)
  })
})
