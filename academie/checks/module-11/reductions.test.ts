/**
 * Module 11 : Les codes de réduction.
 *
 * Un marchand crée un code, « SOLDES-JUILLET » : un pourcentage ou un montant
 * fixe, valable entre deux dates comptées à Madagascar (décision 0006), avec un
 * minimum d'achat, un nombre d'utilisations limité, et parfois une seule
 * utilisation par client. Le client le tape dans son panier, et le serveur
 * recalcule la réduction.
 *
 * Contrat attendu, exporté par `src/academie/module-11.ts` :
 *
 *   export function createAccount(input?: { ...ceux du module 6 }): Promise<string>
 *   export function createShop(input?: { ...ceux du module 8 })
 *   export function createProduct(input?: { ...ceux du module 7 })
 *   export function cancelOrder(input: { ...ceux du module 10 })
 *
 *   export function createDiscount(input: {
 *     shopId: string; memberId: string
 *     code: string                    // 3 à 20 lettres, chiffres ou tirets; rangé en majuscules
 *     kind: 'PERCENT' | 'FIXED'
 *     value: number                   // PERCENT : un entier de 1 à 100; FIXED : des ariary, entier positif
 *     minSubtotal?: number            // le sous-total minimum; par défaut 0
 *     startsOn: string                // 'AAAA-MM-JJ', premier jour compris
 *     endsOn?: string | null          // 'AAAA-MM-JJ', dernier jour compris; null : sans fin
 *     usageLimit?: number | null      // le nombre de commandes au plus; null : sans limite
 *     oncePerCustomer?: boolean       // par défaut false
 *   }): Promise<{ status: number; discountId?: string; reason?: string }>
 *                                     // 201; 400 hors des règles; 403 pour un autre;
 *                                     // 409 code déjà employé dans la boutique
 *
 *   export function quote(input: {
 *     ...ceux du module 9
 *     discountCode?: string           // tel que le client l'a tapé
 *     now: string                     // un instant ISO 8601
 *   }): Promise<{ status; subtotal?; discount?: number; shippingFee?; total?; reason? }>
 *
 *   export function placeOrder(input: {
 *     ...ceux du module 9
 *     discountCode?: string
 *   }): Promise<{ status; orderId?; discount?: number; total?; reason? }>
 *
 *   export function discountUsage(discountId: string): Promise<number>
 *
 * Le calcul :
 *
 *   PERCENT    la réduction vaut sous-total × valeur / 100, arrondie à l'ariary inférieur
 *   FIXED      la réduction vaut la valeur, sans dépasser le sous-total
 *   total      sous-total − réduction + frais de livraison
 *
 * Les frais de livraison ne sont jamais réduits. Le seuil de livraison offerte
 * (module 8) se compare au sous-total **après** réduction.
 *
 * Le code se tape sans tenir compte des majuscules. Il est refusé :
 *   - avec 400 : un code inconnu dans cette boutique, y compris celui d'une
 *     autre boutique;
 *   - avec 409 et un motif : hors de sa période à l'instant `now`, son nombre
 *     d'utilisations atteint, déjà employé par ce client quand il ne sert
 *     qu'une fois par client, ou un sous-total sous le minimum.
 *
 * Une utilisation est une commande passée avec le code, qui n'est ni annulée
 * ni expirée : annuler une commande rend son utilisation.
 */
import { describe, expect, it } from 'vitest'
import {
  cancelOrder,
  createAccount,
  createDiscount,
  createProduct,
  createShop,
  discountUsage,
  placeOrder,
  quote,
} from '../../../src/academie/module-11'
import { inMadagascar, inMinutes } from '../_support/temps'

const address = 'Lot IVG 45, Behoririka, Antananarivo'
const july = { startsOn: '2030-07-01', endsOn: '2030-07-31' }
const midJuly = inMadagascar('2030-07-15', '10:00')

type DiscountInput = Parameters<typeof createDiscount>[0]

/** Une boutique qui livre Antananarivo à 3 000 Ar, avec une chemise à 45 000 Ar. */
async function shop(rates?: Parameters<typeof createShop>[0]) {
  const created = await createShop(rates)
  const shirt = await createProduct({ shopId: created.shopId, title: 'Chemise en lin', prices: [45_000], stocks: [50], weightGrams: 400 })
  return { ...created, shirt: shirt.variantIds[0] ?? '' }
}

function code(label: string) {
  return `${label}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase()
}

async function discount(shopId: string, memberId: string, extra: Partial<DiscountInput> = {}) {
  const input: DiscountInput = { shopId, memberId, code: code('SOLDES'), kind: 'PERCENT', value: 15, ...july, ...extra }
  const created = await createDiscount(input)
  if (!created.discountId) throw new Error(`code refusé : ${created.reason ?? created.status}`)
  return { discountId: created.discountId, code: input.code }
}

function order(shopId: string, variantId: string, customerId: string, discountCode: string, quantity = 1, now = midJuly) {
  return placeOrder({
    customerId,
    shopId,
    zone: 'antananarivo',
    lines: [{ variantId, quantity }],
    address,
    idempotencyKey: `cle-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    now,
    discountCode,
  })
}

describe('créer un code', () => {
  it('crée un code, rangé en majuscules', async () => {
    const { shopId, ownerId, shirt } = await shop()
    const created = await createDiscount({ shopId, memberId: ownerId, code: 'bienvenue-30', kind: 'FIXED', value: 5_000, ...july })
    expect(created.status).toBe(201)
    expect(created.discountId).toBeTruthy()

    const result = await quote({ customerId: await createAccount(), shopId, zone: 'antananarivo', lines: [{ variantId: shirt, quantity: 1 }], discountCode: 'BIENVENUE-30', now: midJuly })
    expect(result.discount).toBe(5_000)
  })

  it('refuse un code, une valeur ou des dates hors des règles, avec 400 et un motif', async () => {
    const { shopId, ownerId } = await shop()
    const base: DiscountInput = { shopId, memberId: ownerId, code: code('OK'), kind: 'PERCENT', value: 10, ...july }
    for (const wrong of [
      { code: 'AB' },
      { code: 'NOËL' },
      { code: 'SOLDES 2030' },
      { code: 'A'.repeat(21) },
      { value: 0 },
      { value: 101 },
      { value: 12.5 },
      { kind: 'FIXED' as const, value: -5_000 },
      { kind: 'GRATUIT' as never },
      { endsOn: '2030-06-30' },
      { usageLimit: 0 },
      { minSubtotal: -1 },
    ]) {
      const result = await createDiscount({ ...base, ...wrong })
      expect(result.status, JSON.stringify(wrong)).toBe(400)
      expect(result.reason, 'le refus doit porter un motif lisible').toBeTruthy()
    }
  })

  it('refuse un code déjà employé dans la boutique avec 409, quelle que soit la casse, et l’accepte dans une autre', async () => {
    const first = await shop()
    const second = await shop()
    const name = code('FETE')
    await discount(first.shopId, first.ownerId, { code: name })

    expect((await createDiscount({ shopId: first.shopId, memberId: first.ownerId, code: name.toLowerCase(), kind: 'FIXED', value: 1_000, ...july })).status).toBe(409)
    expect((await createDiscount({ shopId: second.shopId, memberId: second.ownerId, code: name, kind: 'FIXED', value: 1_000, ...july })).status).toBe(201)
  })

  it('refuse à un autre marchand de créer un code dans la boutique, avec 403', async () => {
    const { shopId } = await shop()
    const intruder = await shop()
    expect((await createDiscount({ shopId, memberId: intruder.ownerId, code: code('PIRATE'), kind: 'PERCENT', value: 90, ...july })).status).toBe(403)
  })
})

describe('le calcul de la réduction', () => {
  it('retire un pourcentage du sous-total, puis ajoute la livraison', async () => {
    const { shopId, ownerId, shirt } = await shop()
    const { code: entered } = await discount(shopId, ownerId, { kind: 'PERCENT', value: 15 })
    const result = await quote({ customerId: await createAccount(), shopId, zone: 'antananarivo', lines: [{ variantId: shirt, quantity: 1 }], discountCode: entered, now: midJuly })
    expect(result).toMatchObject({ status: 200, subtotal: 45_000, discount: 6_750, shippingFee: 3_000, total: 41_250 })
  })

  // 15 % de 12 345, c'est 1 851,75 : l'ariary n'a pas de centimes.
  it('arrondit un pourcentage à l’ariary inférieur', async () => {
    const created = await createShop()
    const item = await createProduct({ shopId: created.shopId, prices: [12_345], weightGrams: 100 })
    const { code: entered } = await discount(created.shopId, created.ownerId, { kind: 'PERCENT', value: 15 })
    const result = await quote({ customerId: await createAccount(), shopId: created.shopId, zone: 'antananarivo', lines: [{ variantId: item.variantIds[0] ?? '', quantity: 1 }], discountCode: entered, now: midJuly })
    expect(result.discount).toBe(1_851)
    expect(result.total).toBe(13_494)
  })

  it('retire un montant fixe, sans jamais dépasser le sous-total ni toucher à la livraison', async () => {
    const { shopId, ownerId, shirt } = await shop()
    const customerId = await createAccount()
    const small = await discount(shopId, ownerId, { kind: 'FIXED', value: 5_000 })
    const huge = await discount(shopId, ownerId, { kind: 'FIXED', value: 60_000 })
    const lines = [{ variantId: shirt, quantity: 1 }]

    expect(await quote({ customerId, shopId, zone: 'antananarivo', lines, discountCode: small.code, now: midJuly })).toMatchObject({ discount: 5_000, total: 43_000 })
    expect(await quote({ customerId, shopId, zone: 'antananarivo', lines, discountCode: huge.code, now: midJuly })).toMatchObject({ discount: 45_000, shippingFee: 3_000, total: 3_000 })
  })

  it('compare le seuil de livraison offerte au sous-total après réduction', async () => {
    const { shopId, ownerId, shirt } = await shop({ rates: [{ zone: 'antananarivo', baseFee: 3_000, perKgFee: 1_000, freeFrom: 80_000 }] })
    const { code: entered } = await discount(shopId, ownerId, { kind: 'PERCENT', value: 15 })
    const lines = [{ variantId: shirt, quantity: 2 }]
    const customerId = await createAccount()

    expect((await quote({ customerId, shopId, zone: 'antananarivo', lines, now: midJuly })).shippingFee, 'sans code : 90 000 Ar, livraison offerte').toBe(0)
    expect(await quote({ customerId, shopId, zone: 'antananarivo', lines, discountCode: entered, now: midJuly })).toMatchObject({
      subtotal: 90_000,
      discount: 13_500,
      shippingFee: 3_000,
      total: 79_500,
    })
  })

  it('enregistre la réduction dans la commande, au total du devis', async () => {
    const { shopId, ownerId, shirt } = await shop()
    const { code: entered } = await discount(shopId, ownerId, { kind: 'FIXED', value: 5_000 })
    const result = await order(shopId, shirt, await createAccount(), entered.toLowerCase())
    expect(result).toMatchObject({ status: 201, discount: 5_000, total: 43_000 })
  })
})

describe('les codes refusés', () => {
  it('refuse un code inconnu, ou celui d’une autre boutique, avec 400 et un motif', async () => {
    const { shopId, shirt } = await shop()
    const other = await shop()
    const foreign = await discount(other.shopId, other.ownerId)
    for (const entered of ['INCONNU-42', foreign.code]) {
      const result = await quote({ customerId: await createAccount(), shopId, zone: 'antananarivo', lines: [{ variantId: shirt, quantity: 1 }], discountCode: entered, now: midJuly })
      expect(result.status, entered).toBe(400)
      expect(result.reason).toBeTruthy()
    }
  })

  // La période se compte à Madagascar : le 31 juillet finit à 23 h 59, heure d'Antananarivo.
  it('accepte le code jusqu’au dernier jour à 23 h 59, heure de Madagascar, et le refuse ensuite avec 409', async () => {
    const { shopId, ownerId, shirt } = await shop()
    const { code: entered } = await discount(shopId, ownerId)
    const lines = [{ variantId: shirt, quantity: 1 }]
    const customerId = await createAccount()

    expect((await quote({ customerId, shopId, zone: 'antananarivo', lines, discountCode: entered, now: inMadagascar('2030-07-31', '23:59') })).status).toBe(200)
    const late = await quote({ customerId, shopId, zone: 'antananarivo', lines, discountCode: entered, now: inMadagascar('2030-08-01', '00:00') })
    expect(late.status).toBe(409)
    expect(late.reason).toBeTruthy()
    expect((await quote({ customerId, shopId, zone: 'antananarivo', lines, discountCode: entered, now: inMadagascar('2030-06-30', '23:59') })).status, 'pas avant le premier jour').toBe(409)
  })

  it('refuse un sous-total sous le minimum, avec 409 et un motif', async () => {
    const { shopId, ownerId, shirt } = await shop()
    const { code: entered } = await discount(shopId, ownerId, { minSubtotal: 90_000 })
    const customerId = await createAccount()
    const below = await quote({ customerId, shopId, zone: 'antananarivo', lines: [{ variantId: shirt, quantity: 1 }], discountCode: entered, now: midJuly })
    expect(below.status).toBe(409)
    expect(below.reason).toBeTruthy()
    expect((await quote({ customerId, shopId, zone: 'antananarivo', lines: [{ variantId: shirt, quantity: 2 }], discountCode: entered, now: midJuly })).status, '90 000 Ar tout juste suffisent').toBe(200)
  })
})

describe('les utilisations', () => {
  it('refuse le code une fois son nombre d’utilisations atteint, et le rend quand une commande est annulée', async () => {
    const { shopId, ownerId, shirt } = await shop()
    const { discountId, code: entered } = await discount(shopId, ownerId, { usageLimit: 2 })
    const first = await order(shopId, shirt, await createAccount(), entered)
    await order(shopId, shirt, await createAccount(), entered)
    expect(await discountUsage(discountId)).toBe(2)

    const third = await order(shopId, shirt, await createAccount(), entered)
    expect(third.status).toBe(409)
    expect(third.reason).toBeTruthy()

    expect((await cancelOrder({ orderId: first.orderId ?? '', actorId: ownerId })).status).toBe(200)
    expect(await discountUsage(discountId)).toBe(1)
    expect((await order(shopId, shirt, await createAccount(), entered)).status).toBe(201)
  })

  it('ne laisse servir qu’une fois par client un code prévu pour cela', async () => {
    const { shopId, ownerId, shirt } = await shop()
    const { code: entered } = await discount(shopId, ownerId, { oncePerCustomer: true })
    const customerId = await createAccount()
    expect((await order(shopId, shirt, customerId, entered)).status).toBe(201)

    const again = await order(shopId, shirt, customerId, entered)
    expect(again.status).toBe(409)
    expect(again.reason).toBeTruthy()
    expect((await order(shopId, shirt, await createAccount(), entered)).status, 'un autre client en profite').toBe(201)
  })

  it('laisse un code sans limite ni fin servir aussi souvent qu’on veut', async () => {
    const { shopId, ownerId, shirt } = await shop()
    const { discountId, code: entered } = await discount(shopId, ownerId, { startsOn: '2026-01-01', endsOn: null })
    const customerId = await createAccount()
    for (let index = 0; index < 3; index += 1) {
      expect((await order(shopId, shirt, customerId, entered, 1, inMinutes(0))).status).toBe(201)
    }
    expect(await discountUsage(discountId)).toBe(3)
  })
})
