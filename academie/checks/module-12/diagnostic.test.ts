/**
 * Module 12 : Diagnostic, le dernier article vendu deux fois.
 *
 * Aux modules 9 et 11, vos commandes et vos codes de réduction ont passé
 * toutes leurs vérifications. Elles envoyaient les demandes une par une.
 * Celles-ci les envoient en même temps.
 *
 * Une implémentation qui lit puis écrit laisse une fenêtre entre les deux :
 *
 * - deux clients qui touchent « Commander » à la même seconde sur le dernier
 *   pagne voient les deux demandes lire « il en reste un », et le marchand a
 *   vendu un article qu'il n'a plus. Si la base refuse le stock négatif, le
 *   second client reçoit une erreur 500 au lieu d'un refus clair;
 * - la même validation du panier envoyée cinq fois, par un double clic ou un
 *   réseau qui réessaie, peut créer plusieurs commandes;
 * - un code limité à trois utilisations, tapé par six clients au même
 *   instant, peut servir six fois : chaque demande a compté « moins de trois »
 *   avant que les autres n'écrivent.
 *
 * Aucun test séquentiel ne voit ces défauts. La garantie doit venir de la base :
 * une mise à jour conditionnelle du stock, une contrainte d'unicité sur la clé
 * d'idempotence, et un verrou sur le code pendant la transaction de commande.
 * Un client refusé reçoit 409 et un motif, jamais une erreur 500.
 *
 * Contrat attendu, exporté par `src/academie/module-12.ts` : les fonctions des
 * modules 9 et 11, que vous réexportez.
 *
 *   export function createAccount(input?: { ...ceux du module 6 }): Promise<string>
 *   export function createShop(input?: { ...ceux du module 8 })
 *   export function createProduct(input?: { ...ceux du module 7 })
 *   export function placeOrder(input: { ...ceux du module 11 })                 // avec discountCode
 *   export function ordersOf(customerId: string)                              // module 9
 *   export function variantStock(variantId: string): Promise<number>          // module 9
 *   export function createDiscount(input: { ...ceux du module 11 })
 *   export function discountUsage(discountId: string): Promise<number>        // module 11
 */
import { describe, expect, it } from 'vitest'
import {
  createAccount,
  createDiscount,
  createProduct,
  createShop,
  discountUsage,
  ordersOf,
  placeOrder,
  variantStock,
} from '../../../src/academie/module-12'
import { inMadagascar } from '../_support/temps'

const address = 'Lot IVG 45, Behoririka, Antananarivo'
const now = inMadagascar('2030-07-15', '10:00')

function key() {
  return `cle-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function order(shopId: string, variantId: string, customerId: string, extra: Partial<Parameters<typeof placeOrder>[0]> = {}) {
  return placeOrder({
    customerId,
    shopId,
    zone: 'antananarivo',
    lines: [{ variantId, quantity: 1 }],
    address,
    idempotencyKey: key(),
    now,
    ...extra,
  })
}

describe('demandes simultanées', { timeout: 60_000 }, () => {
  // Le test que seule une garantie de la base fait passer de façon fiable.
  it('ne vend le dernier article qu’une fois quand deux clients le commandent au même instant', async () => {
    const races = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const { shopId } = await createShop()
        const { variantIds } = await createProduct({ shopId, title: 'Dernier lamba', stocks: [1] })
        return { shopId, variantId: variantIds[0] ?? '', customers: [await createAccount(), await createAccount()] }
      }),
    )

    const responses = await Promise.all(
      races.flatMap(({ shopId, variantId, customers }) =>
        customers.map(async (customerId) => ({ variantId, ...(await order(shopId, variantId, customerId)) })),
      ),
    )

    expect(
      responses.filter((response) => response.status === 201),
      'une commande réussie par article, pas deux',
    ).toHaveLength(races.length)
    expect(
      responses.filter((response) => response.status !== 201).map((response) => response.status),
      'le client refusé reçoit 409 et un motif, jamais une erreur 500',
    ).toEqual(races.map(() => 409))
    for (const { variantId } of races) {
      expect(await variantStock(variantId), 'le stock tombe à zéro, jamais en dessous').toBe(0)
    }
  })

  it('ne crée qu’une commande, et ne réserve qu’une fois, quand la même validation arrive cinq fois', async () => {
    const { shopId } = await createShop()
    const { variantIds } = await createProduct({ shopId, stocks: [5] })
    const variantId = variantIds[0] ?? ''
    const customerId = await createAccount()
    const idempotencyKey = key()

    const results = await Promise.all(Array.from({ length: 5 }, () => order(shopId, variantId, customerId, { idempotencyKey })))

    expect(results.map((result) => result.status).every((status) => status === 200 || status === 201), 'ni 409 ni 500').toBe(true)
    expect(new Set(results.map((result) => result.orderId)).size, 'les cinq réponses désignent la même commande').toBe(1)
    expect(await ordersOf(customerId), 'une seule commande enregistrée').toHaveLength(1)
    expect(await variantStock(variantId), 'le stock n’est réservé qu’une fois').toBe(4)
  })

  it('ne laisse servir un code limité à trois utilisations que trois fois sur six commandes simultanées', async () => {
    const { shopId, ownerId } = await createShop()
    const { variantIds } = await createProduct({ shopId, stocks: [50] })
    const variantId = variantIds[0] ?? ''
    const code = `FLASH-${Math.random().toString(36).slice(2, 7)}`.toUpperCase()
    const created = await createDiscount({
      shopId,
      memberId: ownerId,
      code,
      kind: 'PERCENT',
      value: 20,
      startsOn: '2030-07-01',
      endsOn: '2030-07-31',
      usageLimit: 3,
    })
    const customers = await Promise.all(Array.from({ length: 6 }, () => createAccount()))

    const results = await Promise.all(customers.map((customerId) => order(shopId, variantId, customerId, { discountCode: code })))

    expect(results.filter((result) => result.status === 201), 'trois commandes avec le code').toHaveLength(3)
    expect(results.filter((result) => result.status === 409), 'les trois autres reçoivent 409, jamais 500').toHaveLength(3)
    expect(await discountUsage(created.discountId ?? '')).toBe(3)
  })
})
