/**
 * Module 10 : Le paiement par Mobile Money, l'expiration et le remboursement.
 *
 * Le client a trente minutes pour payer sa commande. Payée, elle attend
 * d'être expédiée (PAID). Pas payée à temps, elle expire (EXPIRED) et ses
 * articles reviennent en stock. Le client ou le marchand peut l'annuler tant
 * qu'elle n'est pas expédiée : si elle était payée, le client est remboursé en
 * entier, et les articles reviennent en stock. Une seule fois, quoi qu'il
 * arrive.
 *
 * Le prestataire de paiement est simulé : vous l'écrivez vous-même, dans votre
 * API. Il confirme les paiements et signe ses webhooks comme le ferait un vrai
 * prestataire de Mobile Money. Aucun compte chez un prestataire n'est
 * nécessaire, et aucune carte bancaire.
 *
 * Contrat attendu, exporté par `src/academie/module-10.ts` :
 *
 *   export function createAccount(input?: { ...ceux du module 6 }): Promise<string>
 *
 *   export function createOrder(input?: {
 *     customerId?: string          // par défaut un client neuf
 *     quantity?: number            // par défaut 1
 *     stock?: number               // le stock de la variante avant la commande; par défaut 5
 *     now?: string                 // l'instant de la commande; par défaut maintenant
 *   }): Promise<{
 *     orderId: string; customerId: string
 *     shopId: string; ownerId: string
 *     variantId: string
 *     total: number
 *     expiresAt: string            // ISO 8601
 *   }>                             // une commande en attente de paiement, passée par placeOrder dans
 *                                  // une boutique neuve, pour une variante à 20 000 Ar
 *
 *   export function capturePayment(input: {
 *     orderId: string; customerId: string
 *     amount: number; idempotencyKey: string
 *     now: string                  // un instant ISO 8601
 *   }): Promise<{
 *     status: number               // 201, ou 200 pour une clé déjà vue;
 *                                  // 400 si le montant n'est pas le total de la commande;
 *                                  // 403 si ce n'est pas le client;
 *                                  // 409 si la commande n'attend plus de paiement, ou si
 *                                  // sa réservation est tombée (now >= expiresAt)
 *     chargeId?: string
 *   }>
 *
 *   export function expireReservations(input: { now: string }): Promise<{ expired: number }>
 *                                  // fait expirer les commandes impayées dont la réservation
 *                                  // est tombée, et remet leurs articles en stock
 *
 *   export function cancelOrder(input: { orderId: string; actorId: string }):
 *     Promise<{ status: number }>  // 200 pour le client ou le propriétaire de la boutique;
 *                                  // 403 pour un autre; 409 si elle n'est plus annulable
 *
 *   export function listCharges(orderId: string): Promise<{ chargeId: string; amount: number }[]>
 *   export function listRefunds(orderId: string): Promise<{ refundId: string; amount: number }[]>
 *   export function orderStatus(orderId: string): Promise<string>
 *   export function variantStock(variantId: string): Promise<number>
 *
 *   export function signWebhook(payload: string): string
 *   export function handleWebhook(input: {
 *     payload: string; signature: string
 *   }): Promise<{ status: number }>
 *
 * `signWebhook` n'existe que pour permettre à cette suite de fabriquer une
 * signature valide. Votre serveur, lui, vérifie celle du prestataire.
 *
 * Un événement porte `{ id, type, orderId, customerId, amount, idempotencyKey,
 * paidAt }`. Un événement `payment.succeeded` correctement signé enregistre le
 * débit sous sa clé d'idempotence, exactement comme `capturePayment`. Un débit
 * déjà enregistré sous cette clé ne se dédouble pas. Un paiement qui arrive
 * pour une commande déjà annulée ou expirée est enregistré, puis remboursé
 * aussitôt : la commande garde son statut, et le stock ne bouge pas.
 */
import { describe, expect, it } from 'vitest'
import {
  cancelOrder,
  capturePayment,
  createAccount,
  createOrder,
  expireReservations,
  handleWebhook,
  listCharges,
  listRefunds,
  orderStatus,
  signWebhook,
  variantStock,
} from '../../../src/academie/module-10'
import { inMinutes } from '../_support/temps'

function pay(orderId: string, customerId: string, amount: number, key = `${orderId}-1`, now = inMinutes(0)) {
  return capturePayment({ orderId, customerId, amount, idempotencyKey: key, now })
}

/** L'instant `minutes` minutes après `instant`. */
function after(instant: string, minutes: number) {
  return new Date(new Date(instant).getTime() + minutes * 60_000).toISOString()
}

describe('l’encaissement', () => {
  it('débite une fois le total, et marque la commande payée', async () => {
    const { orderId, customerId, total } = await createOrder()
    const charge = await pay(orderId, customerId, total)

    expect(charge.status).toBe(201)
    expect(charge.chargeId, 'un débit porte un identifiant').toBeTruthy()
    expect(await listCharges(orderId)).toEqual([{ chargeId: charge.chargeId, amount: total }])
    expect(await orderStatus(orderId)).toBe('PAID')
  })

  // Un appel réseau qui échoue ne veut pas dire que rien ne s'est passé.
  it('ne double pas le débit quand la même clé est rejouée', async () => {
    const { orderId, customerId, total } = await createOrder()
    const first = await pay(orderId, customerId, total)
    const replay = await pay(orderId, customerId, total)

    expect(replay.status).toBe(200)
    expect(replay.chargeId).toBe(first.chargeId)
    expect(await listCharges(orderId)).toHaveLength(1)
  })

  it('ne double pas le débit sous appels simultanés', async () => {
    const { orderId, customerId, total } = await createOrder()
    await Promise.all(Array.from({ length: 4 }, () => pay(orderId, customerId, total)))
    expect(await listCharges(orderId)).toHaveLength(1)
  })

  it('refuse de faire payer deux fois la même commande sous une autre clé, avec 409', async () => {
    const { orderId, customerId, total } = await createOrder()
    await pay(orderId, customerId, total)
    expect((await pay(orderId, customerId, total, `${orderId}-2`)).status).toBe(409)
    expect(await listCharges(orderId)).toHaveLength(1)
  })

  // Le montant vient de la commande, pas du navigateur.
  it('refuse un montant qui n’est pas le total, avec 400', async () => {
    const { orderId, customerId, total } = await createOrder()
    expect((await pay(orderId, customerId, total - 1_000)).status).toBe(400)
    expect(await listCharges(orderId)).toEqual([])
    expect(await orderStatus(orderId)).toBe('PENDING_PAYMENT')
  })

  it('refuse de payer la commande d’un autre, avec 403', async () => {
    const { orderId, total } = await createOrder()
    expect((await pay(orderId, await createAccount(), total)).status).toBe(403)
    expect(await listCharges(orderId)).toEqual([])
  })
})

describe('les trente minutes pour payer', () => {
  it('accepte un paiement jusqu’à la dernière minute', async () => {
    const { orderId, customerId, total, expiresAt } = await createOrder()
    expect((await pay(orderId, customerId, total, `${orderId}-1`, after(expiresAt, -1))).status).toBe(201)
  })

  it('refuse un paiement une fois la réservation tombée, et remet les articles en stock', async () => {
    const { orderId, customerId, total, expiresAt, variantId } = await createOrder({ quantity: 2, stock: 5 })
    expect(await variantStock(variantId)).toBe(3)

    expect((await pay(orderId, customerId, total, `${orderId}-1`, expiresAt)).status).toBe(409)
    expect(await orderStatus(orderId)).toBe('EXPIRED')
    expect(await variantStock(variantId)).toBe(5)
    expect(await listCharges(orderId)).toEqual([])
  })

  it('fait expirer les commandes impayées, et remet leurs articles en stock une seule fois', async () => {
    const { orderId, variantId, expiresAt } = await createOrder({ quantity: 3, stock: 4 })
    expect(await variantStock(variantId)).toBe(1)

    const first = await expireReservations({ now: after(expiresAt, 1) })
    expect(first.expired, 'au moins cette commande a expiré').toBeGreaterThanOrEqual(1)
    expect(await orderStatus(orderId)).toBe('EXPIRED')
    expect(await variantStock(variantId)).toBe(4)

    await expireReservations({ now: after(expiresAt, 2) })
    expect(await variantStock(variantId), 'une seconde passe ne rend rien de plus').toBe(4)
  })

  it('ne touche pas aux commandes payées, ni à celles dont la réservation court encore', async () => {
    const paid = await createOrder()
    await pay(paid.orderId, paid.customerId, paid.total)
    const waiting = await createOrder()

    await expireReservations({ now: after(waiting.expiresAt, -5) })
    expect(await orderStatus(paid.orderId)).toBe('PAID')
    expect(await orderStatus(waiting.orderId)).toBe('PENDING_PAYMENT')
  })
})

describe('l’annulation et le remboursement', () => {
  it('annule une commande impayée, sans rien rembourser, et remet les articles en stock', async () => {
    const { orderId, customerId, total, variantId } = await createOrder({ quantity: 2, stock: 5 })
    expect((await cancelOrder({ orderId, actorId: customerId })).status).toBe(200)
    expect(await orderStatus(orderId)).toBe('CANCELLED')
    expect(await listRefunds(orderId)).toEqual([])
    expect(await variantStock(variantId)).toBe(5)

    expect((await pay(orderId, customerId, total)).status, 'une commande annulée ne se paie plus').toBe(409)
  })

  it('rembourse en entier une commande payée que le client annule', async () => {
    const { orderId, customerId, total, variantId } = await createOrder({ quantity: 1, stock: 5 })
    await pay(orderId, customerId, total)

    expect((await cancelOrder({ orderId, actorId: customerId })).status).toBe(200)
    expect(await orderStatus(orderId)).toBe('CANCELLED')
    const refunds = await listRefunds(orderId)
    expect(refunds.map((refund) => refund.amount)).toEqual([total])
    expect(refunds[0]?.refundId, 'un remboursement porte un identifiant').toBeTruthy()
    expect(await variantStock(variantId)).toBe(5)
  })

  it('laisse le marchand annuler une commande de sa boutique, et rembourse le client', async () => {
    const { orderId, customerId, ownerId, total } = await createOrder()
    await pay(orderId, customerId, total)
    expect((await cancelOrder({ orderId, actorId: ownerId })).status).toBe(200)
    expect((await listRefunds(orderId)).map((refund) => refund.amount)).toEqual([total])
  })

  it('ne rembourse et ne remet en stock qu’une fois, et refuse une seconde annulation avec 409', async () => {
    const { orderId, customerId, total, variantId } = await createOrder({ quantity: 1, stock: 5 })
    await pay(orderId, customerId, total)
    await cancelOrder({ orderId, actorId: customerId })

    expect((await cancelOrder({ orderId, actorId: customerId })).status).toBe(409)
    expect(await listRefunds(orderId)).toHaveLength(1)
    expect(await variantStock(variantId)).toBe(5)
  })

  it('refuse l’annulation à un autre client et à un autre marchand, avec 403', async () => {
    const { orderId } = await createOrder()
    const intruder = await createOrder()
    for (const actorId of [await createAccount(), intruder.ownerId]) {
      expect((await cancelOrder({ orderId, actorId })).status).toBe(403)
    }
    expect(await orderStatus(orderId)).toBe('PENDING_PAYMENT')
  })
})

describe('les webhooks du prestataire', () => {
  function event(id: string, orderId: string, customerId: string, amount: number, key = `${orderId}-1`) {
    return JSON.stringify({
      id,
      type: 'payment.succeeded',
      orderId,
      customerId,
      amount,
      idempotencyKey: key,
      paidAt: new Date().toISOString(),
    })
  }

  it('refuse un événement dont la signature est invalide', async () => {
    const { orderId, customerId, total } = await createOrder()
    const response = await handleWebhook({ payload: event(`evt-${orderId}`, orderId, customerId, total), signature: 'inventee' })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(await listCharges(orderId)).toEqual([])
    expect(await orderStatus(orderId)).toBe('PENDING_PAYMENT')
  })

  it('enregistre le débit et marque la commande payée pour un événement correctement signé', async () => {
    const { orderId, customerId, total } = await createOrder()
    const payload = event(`evt-${orderId}`, orderId, customerId, total)
    const response = await handleWebhook({ payload, signature: signWebhook(payload) })

    expect(response.status).toBeGreaterThanOrEqual(200)
    expect(response.status).toBeLessThan(300)
    expect(await listCharges(orderId)).toHaveLength(1)
    expect(await orderStatus(orderId)).toBe('PAID')
  })

  // Un prestataire redélivre ses événements : c'est normal, pas une anomalie.
  it('absorbe la redélivrance du même événement, et un paiement déjà encaissé, sans second effet', async () => {
    const { orderId, customerId, total } = await createOrder()
    await pay(orderId, customerId, total)
    const payload = event(`evt-${orderId}`, orderId, customerId, total)
    const signature = signWebhook(payload)
    await handleWebhook({ payload, signature })
    await handleWebhook({ payload, signature })

    expect(await listCharges(orderId)).toHaveLength(1)
  })

  // Le client a annulé pendant que l'opérateur traitait son paiement.
  it('rembourse aussitôt un paiement arrivé après l’annulation', async () => {
    const { orderId, customerId, total, variantId } = await createOrder({ quantity: 1, stock: 5 })
    await cancelOrder({ orderId, actorId: customerId })
    const payload = event(`evt-${orderId}`, orderId, customerId, total)
    const response = await handleWebhook({ payload, signature: signWebhook(payload) })

    expect(response.status).toBeLessThan(300)
    expect(await listCharges(orderId)).toHaveLength(1)
    expect((await listRefunds(orderId)).map((refund) => refund.amount)).toEqual([total])
    expect(await orderStatus(orderId), 'un paiement tardif ne réveille pas la commande').toBe('CANCELLED')
    expect(await variantStock(variantId), 'les articles ne ressortent pas du stock').toBe(5)
  })

  it('rembourse aussitôt un paiement arrivé après l’expiration', async () => {
    const { orderId, customerId, total, expiresAt } = await createOrder()
    await expireReservations({ now: after(expiresAt, 1) })
    const payload = event(`evt-${orderId}`, orderId, customerId, total)
    await handleWebhook({ payload, signature: signWebhook(payload) })

    expect((await listRefunds(orderId)).map((refund) => refund.amount)).toEqual([total])
    expect(await orderStatus(orderId)).toBe('EXPIRED')
  })
})
