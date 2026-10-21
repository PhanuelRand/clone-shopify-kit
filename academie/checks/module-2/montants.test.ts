/**
 * Module 2 : Architecture, les montants d'une commande et d'une variante.
 *
 * Un montant est un entier en ariary, qui n'a pas de centimes, et un poids un
 * entier en grammes (décision 0002). Une commande additionne ses lignes, puis
 * ajoute les frais de livraison.
 *
 *   sous-total   la somme des lignes : prix unitaire × quantité
 *   total        sous-total + frais de livraison
 *
 * Contrat attendu, exporté par `src/academie/module-2.ts` : la classe `Order`
 * décrite dans commande.test.ts, et :
 *
 *   export function validateVariant(input: {
 *     price: number                    // en ariary
 *     compareAtPrice: number | null    // le prix barré, ou null
 *     stock: number                    // en unités
 *     weightGrams: number              // en grammes
 *   }): { valid: boolean; reason?: string }   // reason : un motif lisible si invalide
 *
 * `Order.place` lève une erreur quand :
 *   - la commande n'a aucune ligne;
 *   - deux lignes portent la même variante (on augmente la quantité);
 *   - une quantité n'est pas un entier de 1 à 20;
 *   - un prix unitaire n'est pas un entier strictement positif;
 *   - les frais de livraison ne sont pas un entier positif ou nul.
 *
 * Une variante est valide quand son prix est un entier strictement positif,
 * son prix barré absent (null) ou un entier strictement plus grand que le prix,
 * son stock et son poids des entiers positifs ou nuls.
 */
import { describe, expect, it } from 'vitest'
import { Order, validateVariant } from '../../../src/academie/module-2'

const base = {
  customerId: '11111111-1111-4111-8111-111111111111',
  shopId: '22222222-2222-4222-8222-222222222222',
}

function place(lines: { variantId: string; unitPrice: number; quantity: number }[], shippingFee = 3_000) {
  return Order.place({ ...base, lines, shippingFee })
}

describe('le calcul d’une commande', () => {
  it('additionne les lignes, puis les frais de livraison', () => {
    const order = place(
      [
        { variantId: 'lamba-m-indigo', unitPrice: 45_000, quantity: 2 },
        { variantId: 'savon-vanille', unitPrice: 6_500, quantity: 3 },
      ],
      4_000,
    )
    expect(order.subtotal).toBe(109_500)
    expect(order.shippingFee).toBe(4_000)
    expect(order.total).toBe(113_500)
  })

  it('accepte une livraison offerte', () => {
    expect(place([{ variantId: 'v', unitPrice: 10_000, quantity: 1 }], 0).total).toBe(10_000)
  })

  it('accepte vingt fois la même variante', () => {
    expect(place([{ variantId: 'v', unitPrice: 1_000, quantity: 20 }]).subtotal).toBe(20_000)
  })

  it('rend des montants entiers', () => {
    const order = place([{ variantId: 'v', unitPrice: 9_999, quantity: 3 }], 3_000)
    for (const amount of [order.subtotal, order.shippingFee, order.total]) {
      expect(Number.isInteger(amount), `${amount} doit être un entier`).toBe(true)
    }
  })
})

describe('les commandes refusées', () => {
  it('refuse une commande sans ligne', () => {
    expect(() => place([])).toThrow()
  })

  it('refuse deux lignes pour la même variante', () => {
    expect(() =>
      place([
        { variantId: 'v', unitPrice: 10_000, quantity: 1 },
        { variantId: 'v', unitPrice: 10_000, quantity: 2 },
      ]),
    ).toThrow()
  })

  it('refuse une quantité nulle, négative, à virgule ou supérieure à 20', () => {
    for (const quantity of [0, -1, 1.5, 21]) {
      expect(() => place([{ variantId: 'v', unitPrice: 10_000, quantity }]), `quantité ${quantity}`).toThrow()
    }
  })

  it('refuse un prix unitaire nul, négatif ou à virgule', () => {
    for (const unitPrice of [0, -500, 1_500.5]) {
      expect(() => place([{ variantId: 'v', unitPrice, quantity: 1 }]), `prix ${unitPrice}`).toThrow()
    }
  })

  it('refuse des frais de livraison négatifs ou à virgule', () => {
    expect(() => place([{ variantId: 'v', unitPrice: 10_000, quantity: 1 }], -1)).toThrow()
    expect(() => place([{ variantId: 'v', unitPrice: 10_000, quantity: 1 }], 1_000.5)).toThrow()
  })
})

describe('une variante', () => {
  const valid = { price: 45_000, compareAtPrice: null, stock: 12, weightGrams: 350 }

  it('accepte un prix, un stock et un poids entiers', () => {
    expect(validateVariant(valid).valid).toBe(true)
    expect(validateVariant({ ...valid, stock: 0, weightGrams: 0 }).valid, 'un stock épuisé et un poids nul').toBe(true)
  })

  it('accepte un prix barré plus grand que le prix', () => {
    expect(validateVariant({ ...valid, compareAtPrice: 60_000 }).valid).toBe(true)
  })

  it('refuse un prix nul, négatif ou à virgule, avec un motif', () => {
    for (const price of [0, -1_000, 45_000.5]) {
      const result = validateVariant({ ...valid, price })
      expect(result.valid, `prix ${price}`).toBe(false)
      expect(result.reason, 'le refus doit porter un motif lisible').toBeTruthy()
    }
  })

  // Un prix barré qui ne baisse rien trompe le client.
  it('refuse un prix barré égal ou inférieur au prix', () => {
    expect(validateVariant({ ...valid, compareAtPrice: 45_000 }).valid).toBe(false)
    expect(validateVariant({ ...valid, compareAtPrice: 30_000 }).valid).toBe(false)
    expect(validateVariant({ ...valid, compareAtPrice: 60_000.5 }).valid).toBe(false)
  })

  it('refuse un stock ou un poids négatif ou à virgule', () => {
    for (const stock of [-1, 2.5]) expect(validateVariant({ ...valid, stock }).valid, `stock ${stock}`).toBe(false)
    for (const weightGrams of [-10, 350.5]) {
      expect(validateVariant({ ...valid, weightGrams }).valid, `poids ${weightGrams}`).toBe(false)
    }
  })
})
