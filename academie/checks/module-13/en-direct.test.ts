/**
 * Module 13 : L'expédition et les commandes en direct.
 *
 * Le marchand expédie le colis avec le nom du transporteur et un numéro de
 * suivi, puis le marque livré. Le client voit sa commande changer sans
 * recharger la page. Et le tableau de bord du marchand affiche chaque commande
 * payée à l'instant où elle l'est : c'est le « ding » qu'attend tout marchand.
 * Deux règles font la différence entre des commandes en direct et une fuite
 * de données :
 *
 * - seuls le client et le propriétaire de la boutique suivent une commande, et
 *   le serveur le vérifie à chaque lecture et à chaque abonnement;
 * - le flux d'une boutique n'est ouvert qu'à son propriétaire, et ne porte
 *   rien du client : ni son nom, ni son adresse, ni ses coordonnées.
 *
 * Contrat attendu, exporté par `src/academie/module-13.ts` :
 *
 *   export function createAccount(input?: { ...ceux du module 6 }): Promise<string>
 *   export function createOrder(input?: { ...ceux du module 10 })
 *   export function capturePayment(input: { ...ceux du module 10 })
 *   export function cancelOrder(input: { ...ceux du module 10 })
 *
 *   export function createPaidOrder(input?: { customerId?: string }): Promise<{
 *     orderId: string; customerId: string; shopId: string; ownerId: string; total: number
 *   }>                                // une commande passée et payée dans une boutique neuve
 *
 *   export function shipOrder(input: {
 *     orderId: string; memberId: string
 *     carrier: string                 // 2 à 40 caractères : « Colis Express », « Paositra Malagasy »
 *     trackingNumber: string          // 4 à 40 caractères
 *   }): Promise<{ status: number }>   // 200; 400 hors des règles; 403 pour un autre que le propriétaire;
 *                                     // 409 si la commande n'est pas payée
 *
 *   export function markDelivered(input: { orderId: string; memberId: string }):
 *     Promise<{ status: number }>     // 200; 403 pour un autre; 409 si elle n'est pas expédiée
 *
 *   export function trackOrder(input: { orderId: string; viewerId: string }): Promise<{
 *     status: number                  // 200, ou 403 pour un tiers
 *     order?: { status: string; carrier: string | null; trackingNumber: string | null }
 *   }>
 *
 *   export type OrderEvent = { seq: number; status: string; trackingNumber: string | null }
 *
 *   export function subscribeOrder(input: {
 *     orderId: string; viewerId: string
 *     onEvent: (event: OrderEvent) => void
 *   }): Promise<{ status: number; unsubscribe: () => void }>
 *
 *   export type ShopEvent = { type: 'ORDER_PAID'; orderId: string; total: number }
 *
 *   export function subscribeShop(input: {
 *     shopId: string; memberId: string
 *     onEvent: (event: ShopEvent) => void
 *   }): Promise<{ status: number; unsubscribe: () => void }>   // 200, ou 403 pour un autre que le propriétaire
 *
 *   export function applyEvent(
 *     state: { seq: number; status: string; trackingNumber: string | null },
 *     event: OrderEvent,
 *   ): typeof state
 *
 * Chaque changement de statut d'une commande envoie un événement numéroté,
 * `seq`, au client et au marchand abonnés, une fois la transaction validée.
 * Chaque paiement envoie un événement ORDER_PAID aux abonnés de la boutique.
 * Un abonnement refusé rend quand même une fonction `unsubscribe`, qui ne fait
 * rien.
 *
 * `applyEvent` est ce que l'interface fait d'un événement reçu : elle ignore un
 * numéro déjà appliqué ou plus ancien, et applique un événement plus récent.
 * Après une coupure, l'interface relit `trackOrder`, puis reprend les
 * événements.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyEvent,
  cancelOrder,
  capturePayment,
  createAccount,
  createOrder,
  createPaidOrder,
  markDelivered,
  shipOrder,
  subscribeOrder,
  subscribeShop,
  trackOrder,
  type OrderEvent,
  type ShopEvent,
} from '../../../src/academie/module-13'
import { inMinutes } from '../_support/temps'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

const shipment = { carrier: 'Colis Express', trackingNumber: 'CE-2030-77841' }

/** Attend qu'une condition soit vraie, ou échoue au bout de trois secondes. */
async function eventually(check: () => boolean, message: string) {
  const deadline = Date.now() + 3_000
  while (!check()) {
    if (Date.now() > deadline) throw new Error(message)
    await new Promise((resolveWait) => setTimeout(resolveWait, 25))
  }
}

/** Enregistre les événements reçus par un abonné à une commande. */
async function listen(orderId: string, viewerId: string) {
  const events: OrderEvent[] = []
  const subscription = await subscribeOrder({ orderId, viewerId, onEvent: (event) => events.push(event) })
  cleanups.push(subscription.unsubscribe)
  // Laisse le temps à l'abonnement d'être en place.
  await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  return { status: subscription.status, events }
}

/** Enregistre les événements reçus par un abonné au flux d'une boutique. */
async function watch(shopId: string, memberId: string) {
  const events: ShopEvent[] = []
  const subscription = await subscribeShop({ shopId, memberId, onEvent: (event) => events.push(event) })
  cleanups.push(subscription.unsubscribe)
  await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  return { status: subscription.status, events }
}

describe('l’expédition', () => {
  it('expédie une commande payée, avec son transporteur et son numéro de suivi', async () => {
    const { orderId, customerId, ownerId } = await createPaidOrder()
    expect((await shipOrder({ orderId, memberId: ownerId, ...shipment })).status).toBe(200)

    const tracked = await trackOrder({ orderId, viewerId: customerId })
    expect(tracked.status).toBe(200)
    expect(tracked.order).toEqual({ status: 'SHIPPED', ...shipment })
  })

  it('marque livrée une commande expédiée, et pas avant', async () => {
    const { orderId, ownerId } = await createPaidOrder()
    expect((await markDelivered({ orderId, memberId: ownerId })).status, 'pas encore expédiée').toBe(409)
    await shipOrder({ orderId, memberId: ownerId, ...shipment })
    expect((await markDelivered({ orderId, memberId: ownerId })).status).toBe(200)
    expect((await trackOrder({ orderId, viewerId: ownerId })).order?.status).toBe('DELIVERED')
  })

  it('refuse d’expédier une commande impayée, avec 409', async () => {
    const { orderId, ownerId } = await createOrder()
    expect((await shipOrder({ orderId, memberId: ownerId, ...shipment })).status).toBe(409)
  })

  it('refuse un transporteur ou un numéro de suivi hors des règles, avec 400', async () => {
    const { orderId, ownerId } = await createPaidOrder()
    expect((await shipOrder({ orderId, memberId: ownerId, carrier: ' ', trackingNumber: 'CE-1234' })).status).toBe(400)
    expect((await shipOrder({ orderId, memberId: ownerId, carrier: 'Colis Express', trackingNumber: '12' })).status).toBe(400)
  })

  it('refuse l’expédition au client et à un autre marchand, avec 403', async () => {
    const { orderId, customerId } = await createPaidOrder()
    const intruder = await createPaidOrder()
    for (const memberId of [customerId, intruder.ownerId]) {
      expect((await shipOrder({ orderId, memberId, ...shipment })).status).toBe(403)
    }
  })

  // Le colis est parti : la commande ne s'annule plus (décision 0003).
  it('refuse d’annuler une commande expédiée, avec 409', async () => {
    const { orderId, customerId, ownerId } = await createPaidOrder()
    await shipOrder({ orderId, memberId: ownerId, ...shipment })
    expect((await cancelOrder({ orderId, actorId: customerId })).status).toBe(409)
  })
})

describe('qui suit une commande', () => {
  it('refuse le suivi et l’abonnement à un tiers et à un autre marchand, avec 403', async () => {
    const { orderId } = await createPaidOrder()
    const intruder = await createPaidOrder()
    for (const viewerId of [await createAccount(), intruder.ownerId]) {
      const tracked = await trackOrder({ orderId, viewerId })
      expect(tracked.status).toBe(403)
      expect(tracked.order).toBeUndefined()
      expect((await listen(orderId, viewerId)).status).toBe(403)
    }
  })
})

describe('la commande en direct', () => {
  it('prévient le client dès l’expédition, avec le numéro de suivi, puis à la livraison', async () => {
    const { orderId, customerId, ownerId } = await createPaidOrder()
    const client = await listen(orderId, customerId)
    expect(client.status).toBe(200)

    await shipOrder({ orderId, memberId: ownerId, ...shipment })
    await markDelivered({ orderId, memberId: ownerId })
    await eventually(() => client.events.length >= 2, 'le client n’a pas reçu deux statuts en 3 s')

    expect(client.events.map((event) => event.status)).toEqual(['SHIPPED', 'DELIVERED'])
    expect(client.events[0]?.trackingNumber).toBe(shipment.trackingNumber)
    expect(client.events[1]?.seq ?? 0, 'les numéros augmentent').toBeGreaterThan(client.events[0]?.seq ?? 0)
  })

  it('prévient aussi le marchand', async () => {
    const { orderId, ownerId } = await createPaidOrder()
    const merchant = await listen(orderId, ownerId)
    await shipOrder({ orderId, memberId: ownerId, ...shipment })
    await eventually(() => merchant.events.some((event) => event.status === 'SHIPPED'), 'le marchand n’a rien reçu en 3 s')
  })
})

describe('le flux de la boutique', () => {
  it('annonce au marchand chaque commande payée, sans rien du client', async () => {
    const { orderId, customerId, ownerId, shopId, total } = await createOrder()
    const board = await watch(shopId, ownerId)
    expect(board.status).toBe(200)

    await capturePayment({ orderId, customerId, amount: total, idempotencyKey: `${orderId}-1`, now: inMinutes(0) })
    await eventually(() => board.events.length > 0, 'aucune commande annoncée en 3 s')

    expect(board.events[0]).toEqual({ type: 'ORDER_PAID', orderId, total })
  })

  it('refuse le flux d’une boutique à un autre marchand et à un client, avec 403', async () => {
    const { shopId } = await createOrder()
    const intruder = await createOrder()
    for (const memberId of [intruder.ownerId, await createAccount()]) {
      expect((await watch(shopId, memberId)).status).toBe(403)
    }
  })

  // Chaque marchand n'entend que sa boutique.
  it('n’annonce pas à une boutique les commandes d’une autre', async () => {
    const mine = await createOrder()
    const theirs = await createOrder()
    const board = await watch(mine.shopId, mine.ownerId)

    await capturePayment({ orderId: theirs.orderId, customerId: theirs.customerId, amount: theirs.total, idempotencyKey: `${theirs.orderId}-1`, now: inMinutes(0) })
    await new Promise((resolveWait) => setTimeout(resolveWait, 400))
    expect(board.events).toEqual([])
  })
})

describe('reprendre après une coupure', () => {
  const start = { seq: 4, status: 'SHIPPED', trackingNumber: 'CE-2030-77841' }

  it('applique un événement plus récent', () => {
    expect(applyEvent(start, { seq: 5, status: 'DELIVERED', trackingNumber: 'CE-2030-77841' })).toEqual({
      seq: 5,
      status: 'DELIVERED',
      trackingNumber: 'CE-2030-77841',
    })
  })

  it('ignore un événement déjà appliqué, ou plus ancien', () => {
    expect(applyEvent(start, { seq: 4, status: 'DELIVERED', trackingNumber: null })).toEqual(start)
    expect(applyEvent(start, { seq: 2, status: 'PAID', trackingNumber: null })).toEqual(start)
  })
})
