/**
 * Module 8 : La livraison, par zone et au poids.
 *
 * Chaque boutique fixe ses frais de livraison dans les zones qu'elle dessert,
 * les six anciennes provinces (décision 0008). Un tarif a un prix de base, qui
 * couvre le premier kilogramme, un prix par kilogramme entamé au-delà, et un
 * seuil de livraison offerte, facultatif.
 *
 * Contrat attendu, exporté par `src/academie/module-8.ts` :
 *
 *   export function computeShipping(input: {
 *     weightGrams: number              // le poids total du colis
 *     subtotal: number                 // le sous-total de la commande, en ariary
 *     baseFee: number                  // le prix du premier kilogramme
 *     perKgFee: number                 // le prix de chaque kilogramme entamé au-delà
 *     freeFrom: number | null          // le seuil de livraison offerte, ou null
 *   }): number                         // les frais de livraison, en ariary
 *
 *   export function createShop(input?: {
 *     name?: string
 *     rates?: { zone: string; baseFee: number; perKgFee: number; freeFrom: number | null }[]
 *   }): Promise<{ shopId: string; slug: string; ownerId: string }>
 *                                      // rates absent : 'antananarivo', 3 000 Ar de base,
 *                                      // 1 000 Ar par kilogramme entamé, sans livraison offerte
 *   export function createProduct(input?: { ...ceux du module 7 })
 *
 *   export function setShippingRate(input: {
 *     shopId: string; memberId: string
 *     zone: string; baseFee: number; perKgFee: number; freeFrom: number | null
 *   }): Promise<{ status: number }>    // 200; 400 hors des règles; 403 pour un autre
 *                                      // crée le tarif de la zone, ou remplace celui qui existe
 *
 *   export function shippingRates(shopSlug: string): Promise<
 *     { zone: string; baseFee: number; perKgFee: number; freeFrom: number | null }[]
 *   >                                  // les tarifs de la boutique, rangés par zone
 *
 *   export function quoteShipping(input: {
 *     shopId: string; zone: string
 *     lines: { variantId: string; quantity: number }[]
 *   }): Promise<{
 *     status: number                   // 200, ou 400 avec un motif
 *     weightGrams?: number; subtotal?: number; shippingFee?: number
 *     reason?: string
 *   }>
 *
 * Le premier kilogramme est compris dans le prix de base : 1 000 grammes
 * coûtent le prix de base, 1 001 grammes le prix de base et un kilogramme de
 * plus. Un colis sans poids coûte le prix de base. À partir du seuil, bornes
 * comprises, la livraison est offerte.
 *
 * Les montants sont des entiers positifs ou nuls; le seuil, s'il est donné, un
 * entier strictement positif. La zone est l'un des six slugs de la
 * décision 0008. Le devis de livraison refuse avec 400 une zone que la
 * boutique ne dessert pas, une zone inconnue, une variante d'une autre
 * boutique ou une quantité qui n'est pas un entier de 1 à 20.
 */
import { describe, expect, it } from 'vitest'
import {
  computeShipping,
  createProduct,
  createShop,
  quoteShipping,
  setShippingRate,
  shippingRates,
} from '../../../src/academie/module-8'

const rate = { baseFee: 3_000, perKgFee: 1_000, freeFrom: null }

describe('le calcul des frais', () => {
  const cases: [number, number][] = [
    [0, 3_000],
    [350, 3_000],
    [1_000, 3_000],
    [1_001, 4_000],
    [2_000, 4_000],
    [2_001, 5_000],
    [4_500, 7_000],
  ]

  for (const [weightGrams, expected] of cases) {
    it(`compte ${expected} Ar pour ${weightGrams} grammes`, () => {
      expect(computeShipping({ weightGrams, subtotal: 50_000, ...rate })).toBe(expected)
    })
  }

  it('offre la livraison à partir du seuil, bornes comprises', () => {
    const generous = { ...rate, freeFrom: 100_000 }
    expect(computeShipping({ weightGrams: 2_500, subtotal: 99_999, ...generous })).toBe(5_000)
    expect(computeShipping({ weightGrams: 2_500, subtotal: 100_000, ...generous })).toBe(0)
  })

  it('ne l’offre jamais sans seuil', () => {
    expect(computeShipping({ weightGrams: 500, subtotal: 5_000_000, ...rate })).toBe(3_000)
  })
})

describe('les tarifs d’une boutique', () => {
  it('enregistre un tarif par zone, rangés par zone', async () => {
    const { shopId, slug, ownerId } = await createShop({ rates: [] })
    expect((await setShippingRate({ shopId, memberId: ownerId, zone: 'toamasina', baseFee: 8_000, perKgFee: 2_500, freeFrom: null })).status).toBe(200)
    expect((await setShippingRate({ shopId, memberId: ownerId, zone: 'antananarivo', baseFee: 3_000, perKgFee: 1_000, freeFrom: 150_000 })).status).toBe(200)

    expect(await shippingRates(slug)).toEqual([
      { zone: 'antananarivo', baseFee: 3_000, perKgFee: 1_000, freeFrom: 150_000 },
      { zone: 'toamasina', baseFee: 8_000, perKgFee: 2_500, freeFrom: null },
    ])
  })

  it('remplace le tarif d’une zone déjà fixée', async () => {
    const { shopId, slug, ownerId } = await createShop({ rates: [] })
    await setShippingRate({ shopId, memberId: ownerId, zone: 'mahajanga', baseFee: 9_000, perKgFee: 2_000, freeFrom: null })
    await setShippingRate({ shopId, memberId: ownerId, zone: 'mahajanga', baseFee: 7_500, perKgFee: 2_000, freeFrom: null })
    expect(await shippingRates(slug)).toEqual([{ zone: 'mahajanga', baseFee: 7_500, perKgFee: 2_000, freeFrom: null }])
  })

  it('refuse une zone inconnue, un montant négatif ou à virgule, ou un seuil nul, avec 400', async () => {
    const { shopId, ownerId } = await createShop({ rates: [] })
    for (const wrong of [
      { zone: 'tana' },
      { zone: 'Antananarivo' },
      { baseFee: -1 },
      { perKgFee: 1_000.5 },
      { freeFrom: 0 },
    ]) {
      const result = await setShippingRate({ shopId, memberId: ownerId, zone: 'antananarivo', ...rate, ...wrong })
      expect(result.status, JSON.stringify(wrong)).toBe(400)
    }
  })

  it('refuse à un autre marchand de fixer les tarifs de la boutique, avec 403', async () => {
    const { shopId, slug } = await createShop({ rates: [] })
    const intruder = await createShop()
    expect((await setShippingRate({ shopId, memberId: intruder.ownerId, zone: 'toliara', ...rate })).status).toBe(403)
    expect(await shippingRates(slug)).toEqual([])
  })

  it('donne par défaut un tarif pour Antananarivo aux boutiques d’essai', async () => {
    const { slug } = await createShop()
    expect(await shippingRates(slug)).toEqual([{ zone: 'antananarivo', baseFee: 3_000, perKgFee: 1_000, freeFrom: null }])
  })
})

describe('le devis de livraison', () => {
  async function stock() {
    const shop = await createShop({
      rates: [
        { zone: 'antananarivo', baseFee: 3_000, perKgFee: 1_000, freeFrom: 200_000 },
        { zone: 'toliara', baseFee: 12_000, perKgFee: 4_000, freeFrom: null },
      ],
    })
    const light = await createProduct({ shopId: shop.shopId, prices: [15_000], weightGrams: 500 })
    const heavy = await createProduct({ shopId: shop.shopId, prices: [80_000], weightGrams: 1_200 })
    return { ...shop, light: light.variantIds[0] ?? '', heavy: heavy.variantIds[0] ?? '' }
  }

  it('additionne les poids et les prix, puis applique le tarif de la zone', async () => {
    const { shopId, light, heavy } = await stock()
    const lines = [
      { variantId: light, quantity: 3 },
      { variantId: heavy, quantity: 1 },
    ]
    expect(await quoteShipping({ shopId, zone: 'antananarivo', lines })).toMatchObject({
      status: 200,
      weightGrams: 2_700,
      subtotal: 125_000,
      shippingFee: 5_000,
    })
    expect((await quoteShipping({ shopId, zone: 'toliara', lines })).shippingFee).toBe(20_000)
  })

  it('offre la livraison dans la zone où le seuil est atteint', async () => {
    const { shopId, heavy } = await stock()
    const result = await quoteShipping({ shopId, zone: 'antananarivo', lines: [{ variantId: heavy, quantity: 3 }] })
    expect(result).toMatchObject({ status: 200, subtotal: 240_000, shippingFee: 0 })
  })

  it('refuse une zone que la boutique ne dessert pas, ou une zone inconnue, avec 400 et un motif', async () => {
    const { shopId, light } = await stock()
    for (const zone of ['fianarantsoa', 'tana']) {
      const result = await quoteShipping({ shopId, zone, lines: [{ variantId: light, quantity: 1 }] })
      expect(result.status, zone).toBe(400)
      expect(result.reason, 'le refus doit porter un motif lisible').toBeTruthy()
    }
  })

  it('refuse une variante d’une autre boutique, ou une quantité hors de 1 à 20, avec 400', async () => {
    const { shopId, light } = await stock()
    const other = await stock()
    expect((await quoteShipping({ shopId, zone: 'antananarivo', lines: [{ variantId: other.light, quantity: 1 }] })).status).toBe(400)
    for (const quantity of [0, 2.5, 21]) {
      expect((await quoteShipping({ shopId, zone: 'antananarivo', lines: [{ variantId: light, quantity }] })).status, `quantité ${quantity}`).toBe(400)
    }
  })

  // Les tarifs d'une boutique ne valent que pour elle.
  it('n’applique pas le tarif d’une autre boutique', async () => {
    const cheap = await createShop({ rates: [{ zone: 'antsiranana', baseFee: 1_000, perKgFee: 500, freeFrom: null }] })
    const pricey = await createShop({ rates: [{ zone: 'antsiranana', baseFee: 15_000, perKgFee: 5_000, freeFrom: null }] })
    const item = await createProduct({ shopId: pricey.shopId, weightGrams: 800 })

    const result = await quoteShipping({ shopId: pricey.shopId, zone: 'antsiranana', lines: [{ variantId: item.variantIds[0] ?? '', quantity: 1 }] })
    expect(result.shippingFee).toBe(15_000)
    expect(cheap.shopId).not.toBe(pricey.shopId)
  })
})
