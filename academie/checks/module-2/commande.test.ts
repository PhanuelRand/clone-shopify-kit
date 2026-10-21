/**
 * Module 2 : Architecture, le cycle de vie d'une commande.
 *
 * Suite de conformité écrite par l'Académie. Elle appelle VOTRE code à travers
 * le fichier traducteur du module. Ces fichiers font partie du harnais : les
 * modifier confie votre remise à un mentor.
 *
 * Contrat attendu, exporté par `src/academie/module-2.ts` :
 *
 *   export type OrderStatus =
 *     'PENDING_PAYMENT' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'EXPIRED'
 *
 *   export class Order {
 *     static place(input: {
 *       customerId: string
 *       shopId: string
 *       lines: { variantId: string; unitPrice: number; quantity: number }[]
 *       shippingFee: number
 *     }): Order                    // lève si la commande n'est pas valide (voir montants.test.ts)
 *     readonly status: OrderStatus
 *     readonly subtotal: number
 *     readonly shippingFee: number
 *     readonly total: number
 *     transitionTo(next: OrderStatus): void   // lève si le passage est interdit
 *   }
 *
 * Une commande naît en attente de paiement (PENDING_PAYMENT). Payée (PAID), le
 * marchand l'expédie (SHIPPED), puis elle est livrée (DELIVERED). Le client ou
 * le marchand peut l'annuler (CANCELLED) tant qu'elle n'est pas expédiée. Une
 * commande qui n'est pas payée à temps expire (EXPIRED).
 *
 *   PENDING_PAYMENT -> PAID, CANCELLED, EXPIRED
 *   PAID            -> SHIPPED, CANCELLED
 *   SHIPPED         -> DELIVERED
 *   DELIVERED, CANCELLED, EXPIRED -> rien
 *
 * Tout autre passage lève une erreur, y compris rester dans le même statut.
 */
import { describe, expect, it } from 'vitest'
import { Order } from '../../../src/academie/module-2'

const customer = '11111111-1111-4111-8111-111111111111'
const shop = '22222222-2222-4222-8222-222222222222'

function placed() {
  return Order.place({
    customerId: customer,
    shopId: shop,
    lines: [{ variantId: 'lamba-m-indigo', unitPrice: 45_000, quantity: 2 }],
    shippingFee: 3_000,
  })
}

function advanceTo(order: Order, steps: string[]) {
  for (const step of steps) order.transitionTo(step as never)
  return order
}

const ALLOWED: Record<string, string[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED', 'EXPIRED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  EXPIRED: [],
}

/** Le chemin le plus court pour amener une commande neuve à ce statut. */
const PATH_TO: Record<string, string[]> = {
  PENDING_PAYMENT: [],
  PAID: ['PAID'],
  SHIPPED: ['PAID', 'SHIPPED'],
  DELIVERED: ['PAID', 'SHIPPED', 'DELIVERED'],
  CANCELLED: ['CANCELLED'],
  EXPIRED: ['EXPIRED'],
}

const STATUSES = Object.keys(ALLOWED)

describe('cycle de vie d’une commande', () => {
  it('naît en attente de paiement', () => {
    expect(placed().status).toBe('PENDING_PAYMENT')
  })

  it('va du paiement jusqu’à la livraison', () => {
    expect(advanceTo(placed(), ['PAID', 'SHIPPED', 'DELIVERED']).status).toBe('DELIVERED')
  })

  it('se laisse annuler avant le paiement, et après le paiement tant qu’elle n’est pas expédiée', () => {
    expect(advanceTo(placed(), ['CANCELLED']).status).toBe('CANCELLED')
    expect(advanceTo(placed(), ['PAID', 'CANCELLED']).status).toBe('CANCELLED')
  })

  // Le colis est parti : on ne l'annule plus, on le retourne.
  it('refuse d’annuler une commande expédiée', () => {
    const order = advanceTo(placed(), ['PAID', 'SHIPPED'])
    expect(() => order.transitionTo('CANCELLED' as never)).toThrow()
  })

  it('refuse d’expédier une commande impayée', () => {
    expect(() => placed().transitionTo('SHIPPED' as never)).toThrow()
  })

  // Un paiement qui arrive après l'expiration ne réveille pas la commande.
  it('refuse de payer une commande expirée', () => {
    const order = advanceTo(placed(), ['EXPIRED'])
    expect(() => order.transitionTo('PAID' as never)).toThrow()
  })

  it('ne laisse rien sortir d’une commande livrée', () => {
    for (const next of STATUSES) {
      const order = advanceTo(placed(), PATH_TO.DELIVERED ?? [])
      expect(() => order.transitionTo(next as never), `DELIVERED vers ${next}`).toThrow()
    }
  })
})

describe('le tableau complet des passages', () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const allowed = ALLOWED[from]?.includes(to) ?? false
      it(`${allowed ? 'permet' : 'refuse'} ${from} vers ${to}`, () => {
        const order = advanceTo(placed(), PATH_TO[from] ?? [])
        if (allowed) {
          order.transitionTo(to as never)
          expect(order.status).toBe(to)
        } else {
          expect(() => order.transitionTo(to as never)).toThrow()
          expect(order.status, 'un passage refusé ne change pas le statut').toBe(from)
        }
      })
    }
  }
})
