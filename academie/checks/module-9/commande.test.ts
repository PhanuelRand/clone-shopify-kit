/**
 * Module 9 : Le panier, le devis et la commande.
 *
 * Le client remplit son panier dans une boutique, choisit sa zone, voit le
 * devis, puis passe commande. Le serveur recalcule tout : il ne croit jamais
 * un prix envoyé par le navigateur (décision 0002). La commande **réserve le
 * stock** : les articles sortent du stock au moment de la commande, et le
 * client a trente minutes pour payer (module 10).
 *
 * Contrat attendu, exporté par `src/academie/module-9.ts` :
 *
 *   export function createAccount(input?: { ...ceux du module 6 }): Promise<string>
 *   export function createShop(input?: { ...ceux du module 8 })
 *   export function createProduct(input?: { ...ceux du module 7 })
 *   export function updateVariant(input: { ...ceux du module 6 })
 *
 *   export function quote(input: {
 *     customerId: string; shopId: string
 *     zone: string                         // la zone de livraison (décision 0008)
 *     lines: { variantId: string; quantity: number }[]
 *   }): Promise<{
 *     status: number                       // 200, 400 ou 409
 *     subtotal?: number; shippingFee?: number; total?: number
 *     reason?: string                      // présent quand status n'est pas 200
 *   }>
 *
 *   export function placeOrder(input: {
 *     ...ceux de quote
 *     address: string                      // l'adresse lisible : « Lot IVG 45, Behoririka, Antananarivo »
 *     idempotencyKey: string               // choisie par l'interface, une par validation du panier
 *     now: string                          // un instant ISO 8601
 *   }): Promise<{
 *     status: number                       // 201; 200 pour une clé déjà vue; 400 ou 409
 *     orderId?: string; total?: number
 *     expiresAt?: string                   // l'instant où la réservation tombe : now + 30 minutes
 *     reason?: string
 *   }>
 *
 *   export function getOrder(input: { orderId: string; viewerId: string }): Promise<{
 *     status: number                       // 200 pour le client et pour le propriétaire de la boutique;
 *                                          // 403 pour tout autre compte
 *     order?: {
 *       orderId: string; status: string; shopId: string
 *       lines: { variantId: string; title: string; unitPrice: number; quantity: number }[]
 *       subtotal: number; shippingFee: number; total: number
 *       address: string
 *     }
 *   }>
 *
 *   export function ordersOf(customerId: string): Promise<{ orderId: string; status: string; total: number }[]>
 *   export function shopOrders(input: { shopId: string; memberId: string }): Promise<{
 *     status: number                       // 200, ou 403 pour un autre que le propriétaire
 *     items: { orderId: string; status: string; total: number }[]
 *   }>
 *   export function variantStock(variantId: string): Promise<number>
 *
 * Le devis suit les règles du module 2 pour les montants, et celles du
 * module 8 pour les frais de livraison. Il est refusé :
 *   - avec 400 : sans ligne, pour deux lignes de la même variante, une
 *     quantité qui n'est pas un entier de 1 à 20, une variante inconnue, d'une
 *     autre boutique ou d'un produit qui n'est pas publié, une zone que la
 *     boutique ne dessert pas, ou un client qui est le propriétaire de la
 *     boutique;
 *   - avec 409 : quand une quantité dépasse le stock, avec un motif qui nomme
 *     le produit.
 *
 * Une commande passée est en attente de paiement (PENDING_PAYMENT) et retire
 * ses quantités du stock. Elle garde le prix et le titre du moment. Son adresse
 * fait de 5 à 300 caractères. La même clé d'idempotence, rejouée avec le même
 * panier, rend la même commande avec 200 sans toucher au stock une seconde
 * fois; rejouée avec un autre panier, elle est refusée avec 409.
 */
import { describe, expect, it } from 'vitest'
import {
  createAccount,
  createProduct,
  createShop,
  getOrder,
  ordersOf,
  placeOrder,
  quote,
  shopOrders,
  updateVariant,
  variantStock,
} from '../../../src/academie/module-9'
import { inMinutes } from '../_support/temps'

const address = 'Lot IVG 45, Behoririka, Antananarivo'

/** Une boutique qui livre Antananarivo, avec un pagne et une nappe. */
async function shop() {
  const created = await createShop()
  const lamba = await createProduct({ shopId: created.shopId, title: 'Lamba en soie sauvage', prices: [15_000], stocks: [5], weightGrams: 500 })
  const tablecloth = await createProduct({ shopId: created.shopId, title: 'Nappe brodée', prices: [80_000], stocks: [2], weightGrams: 1_200 })
  return {
    ...created,
    lamba: lamba.variantIds[0] ?? '',
    tablecloth: tablecloth.variantIds[0] ?? '',
  }
}

function key() {
  return `panier-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

describe('le devis', () => {
  it('additionne les lignes, puis les frais de livraison au poids', async () => {
    const { shopId, lamba, tablecloth } = await shop()
    const result = await quote({
      customerId: await createAccount(),
      shopId,
      zone: 'antananarivo',
      lines: [
        { variantId: lamba, quantity: 2 },
        { variantId: tablecloth, quantity: 1 },
      ],
    })
    // 2 200 grammes : le prix de base et deux kilogrammes entamés.
    expect(result).toMatchObject({ status: 200, subtotal: 110_000, shippingFee: 5_000, total: 115_000 })
  })

  it('refuse un panier vide, une quantité hors de 1 à 20, ou deux lignes de la même variante, avec 400', async () => {
    const { shopId, lamba } = await shop()
    const customerId = await createAccount()
    const cases = [
      [],
      [{ variantId: lamba, quantity: 0 }],
      [{ variantId: lamba, quantity: 2.5 }],
      [{ variantId: lamba, quantity: 21 }],
      [
        { variantId: lamba, quantity: 1 },
        { variantId: lamba, quantity: 1 },
      ],
    ]
    for (const lines of cases) {
      const result = await quote({ customerId, shopId, zone: 'antananarivo', lines })
      expect(result.status, JSON.stringify(lines)).toBe(400)
      expect(result.reason, 'le refus doit porter un motif lisible').toBeTruthy()
    }
  })

  it('refuse une variante inconnue, d’une autre boutique ou d’un produit non publié, avec 400', async () => {
    const { shopId } = await shop()
    const other = await shop()
    const draft = await createProduct({ shopId, status: 'DRAFT' })
    const customerId = await createAccount()
    for (const variantId of [other.lamba, draft.variantIds[0] ?? '', '00000000-0000-4000-8000-000000000000', 'pas-un-identifiant']) {
      const result = await quote({ customerId, shopId, zone: 'antananarivo', lines: [{ variantId, quantity: 1 }] })
      expect(result.status, variantId).toBe(400)
    }
  })

  it('refuse une zone que la boutique ne dessert pas, avec 400 et un motif', async () => {
    const { shopId, lamba } = await shop()
    const result = await quote({ customerId: await createAccount(), shopId, zone: 'toliara', lines: [{ variantId: lamba, quantity: 1 }] })
    expect(result.status).toBe(400)
    expect(result.reason).toBeTruthy()
  })

  it('refuse au marchand de commander dans sa propre boutique, avec 400', async () => {
    const { shopId, ownerId, lamba } = await shop()
    expect((await quote({ customerId: ownerId, shopId, zone: 'antananarivo', lines: [{ variantId: lamba, quantity: 1 }] })).status).toBe(400)
  })

  it('refuse une quantité qui dépasse le stock, avec 409 et un motif qui nomme le produit', async () => {
    const { shopId, tablecloth } = await shop()
    const result = await quote({ customerId: await createAccount(), shopId, zone: 'antananarivo', lines: [{ variantId: tablecloth, quantity: 3 }] })
    expect(result.status).toBe(409)
    expect(result.reason ?? '', 'le motif dit quel produit manque').toMatch(/nappe/i)
  })
})

describe('passer commande', () => {
  async function ordered(quantity = 2) {
    const store = await shop()
    const customerId = await createAccount()
    const now = inMinutes(0)
    const result = await placeOrder({
      customerId,
      shopId: store.shopId,
      zone: 'antananarivo',
      lines: [{ variantId: store.lamba, quantity }],
      address,
      idempotencyKey: key(),
      now,
    })
    if (!result.orderId) throw new Error(`commande refusée : ${result.reason ?? result.status}`)
    return { ...store, customerId, now, orderId: result.orderId, result }
  }

  it('crée une commande en attente de paiement, au total du devis, qui expire trente minutes plus tard', async () => {
    const { customerId, orderId, result, shopId, lamba, now } = await ordered()
    expect(result.status).toBe(201)
    expect(result.total).toBe(33_000)
    expect(new Date(result.expiresAt ?? '').getTime()).toBe(new Date(now).getTime() + 30 * 60_000)

    const read = await getOrder({ orderId, viewerId: customerId })
    expect(read.status).toBe(200)
    expect(read.order).toMatchObject({
      orderId,
      status: 'PENDING_PAYMENT',
      shopId,
      lines: [{ variantId: lamba, title: 'Lamba en soie sauvage', unitPrice: 15_000, quantity: 2 }],
      subtotal: 30_000,
      shippingFee: 3_000,
      total: 33_000,
      address,
    })
  })

  // La réservation : ce que le client attend de payer n'est plus à vendre.
  it('retire les quantités du stock dès la commande', async () => {
    const { lamba } = await ordered(2)
    expect(await variantStock(lamba)).toBe(3)
  })

  // Le prix figé : ce que le client a accepté, pas ce que la boutique affiche aujourd'hui.
  it('garde le prix du moment, même si le marchand le change ensuite', async () => {
    const { customerId, orderId, ownerId, lamba } = await ordered()
    await updateVariant({ variantId: lamba, memberId: ownerId, price: 19_000 })

    const read = await getOrder({ orderId, viewerId: customerId })
    expect(read.order?.lines[0]?.unitPrice).toBe(15_000)
    expect(read.order?.total).toBe(33_000)
  })

  it('refuse une commande sans adresse lisible avec 400, sans toucher au stock', async () => {
    const { shopId, lamba } = await shop()
    const result = await placeOrder({
      customerId: await createAccount(),
      shopId,
      zone: 'antananarivo',
      lines: [{ variantId: lamba, quantity: 1 }],
      address: '   ',
      idempotencyKey: key(),
      now: inMinutes(0),
    })
    expect(result.status).toBe(400)
    expect(await variantStock(lamba)).toBe(5)
  })

  it('refuse une commande qui dépasse le stock avec 409, sans toucher au stock', async () => {
    const { shopId, tablecloth } = await shop()
    const result = await placeOrder({
      customerId: await createAccount(),
      shopId,
      zone: 'antananarivo',
      lines: [{ variantId: tablecloth, quantity: 3 }],
      address,
      idempotencyKey: key(),
      now: inMinutes(0),
    })
    expect(result.status).toBe(409)
    expect(await variantStock(tablecloth)).toBe(2)
  })
})

describe('qui lit une commande', () => {
  async function ordered() {
    const store = await shop()
    const customerId = await createAccount()
    const result = await placeOrder({
      customerId,
      shopId: store.shopId,
      zone: 'antananarivo',
      lines: [{ variantId: store.lamba, quantity: 1 }],
      address,
      idempotencyKey: key(),
      now: inMinutes(0),
    })
    return { ...store, customerId, orderId: result.orderId ?? '' }
  }

  it('ouvre la commande au client et au propriétaire de la boutique', async () => {
    const { orderId, customerId, ownerId } = await ordered()
    expect((await getOrder({ orderId, viewerId: customerId })).status).toBe(200)
    expect((await getOrder({ orderId, viewerId: ownerId })).status, 'le marchand prépare le colis').toBe(200)
  })

  // Le cœur du parcours : un autre marchand ne lit pas les commandes d'une boutique.
  it('refuse la commande à un autre client et à un autre marchand, avec 403', async () => {
    const { orderId } = await ordered()
    const otherMerchant = await createShop()
    for (const viewerId of [await createAccount(), otherMerchant.ownerId]) {
      const read = await getOrder({ orderId, viewerId })
      expect(read.status).toBe(403)
      expect(read.order, 'un tiers ne voit rien de la commande').toBeUndefined()
    }
  })

  it('range la commande dans « Mes commandes » et dans les commandes de la boutique, pas d’une autre', async () => {
    const { orderId, customerId, shopId, ownerId } = await ordered()
    expect(await ordersOf(customerId)).toEqual([{ orderId, status: 'PENDING_PAYMENT', total: 18_000 }])

    const own = await shopOrders({ shopId, memberId: ownerId })
    expect(own.status).toBe(200)
    expect(own.items).toEqual([{ orderId, status: 'PENDING_PAYMENT', total: 18_000 }])

    const intruder = await createShop()
    const stolen = await shopOrders({ shopId, memberId: intruder.ownerId })
    expect(stolen.status).toBe(403)
    expect(stolen.items).toEqual([])
  })
})

describe('la clé d’idempotence', () => {
  it('rend la même commande quand la même validation est rejouée, sans réserver deux fois', async () => {
    const { shopId, lamba } = await shop()
    const customerId = await createAccount()
    const input = {
      customerId,
      shopId,
      zone: 'antananarivo',
      lines: [{ variantId: lamba, quantity: 2 }],
      address,
      idempotencyKey: key(),
      now: inMinutes(0),
    }
    const first = await placeOrder(input)
    const replay = await placeOrder(input)

    expect(first.status).toBe(201)
    expect(replay.status).toBe(200)
    expect(replay.orderId).toBe(first.orderId)
    expect(await ordersOf(customerId), 'un double clic ne commande pas deux fois').toHaveLength(1)
    expect(await variantStock(lamba), 'le stock n’est réservé qu’une fois').toBe(3)
  })

  it('refuse la même clé pour un autre panier, avec 409', async () => {
    const { shopId, lamba, tablecloth } = await shop()
    const customerId = await createAccount()
    const base = { customerId, shopId, zone: 'antananarivo', address, idempotencyKey: key(), now: inMinutes(0) }
    await placeOrder({ ...base, lines: [{ variantId: lamba, quantity: 1 }] })

    const other = await placeOrder({ ...base, lines: [{ variantId: tablecloth, quantity: 1 }] })
    expect(other.status).toBe(409)
    expect(other.reason).toBeTruthy()
    expect(await ordersOf(customerId)).toHaveLength(1)
  })
})
