/**
 * Module 4 : Mots de passe, comptes et droits.
 *
 * Deux sortes de personnes se servent de la plateforme : le client qui achète,
 * et le marchand qui tient une boutique. Tout compte est client; ouvrir une
 * boutique lui donne en plus le rôle de marchand. Mais être marchand ne donne
 * aucun droit sur la boutique d'un autre : c'est la règle qui fait tenir une
 * plateforme à plusieurs boutiques (décision 0001).
 *
 * Contrat attendu, exporté par `src/academie/module-4.ts`, à côté de
 * `normalizePhone` :
 *
 *   export class Account {
 *     static register(input: {
 *       email: string; name: string
 *       phone?: string           // facultatif; tel que la personne l'a tapé
 *     }): Account                // lève si le numéro est donné mais invalide
 *     readonly roles: Role[]     // ['CUSTOMER'] à l'inscription
 *     readonly phone: string | null   // la forme unique, '+261…', ou null
 *     readonly status: 'ACTIVE' | 'SUSPENDED'
 *     readonly suspensionReason: string | null
 *     suspend(reason: string): void      // lève si le motif est vide
 *     reinstate(): void
 *     becomeMerchant(): void             // ajoute le rôle MERCHANT, une seule fois
 *     canOrder(): boolean                // compte actif, avec le rôle CUSTOMER
 *   }
 *
 *   export function hashPassword(plain: string): Promise<string>
 *   export function verifyPassword(plain: string, hash: string): Promise<boolean>
 *
 *   export type Role = 'CUSTOMER' | 'MERCHANT'
 *   export type Action =
 *     'PLACE_ORDER' | 'OPEN_SHOP' | 'MANAGE_SHOP' | 'SEND_MESSAGE' | 'EDIT_PROFILE'
 *
 *   export function authorize(input: {
 *     roles: Role[]                                 // [] pour un visiteur non connecté
 *     accountStatus?: 'ACTIVE' | 'SUSPENDED'        // absent : ACTIVE
 *     action: Action
 *     isShopOwner?: boolean                         // pour MANAGE_SHOP : la boutique est à lui
 *   }): { allowed: boolean; status: number }
 *
 * Commander, écrire et ouvrir une boutique demandent le rôle CUSTOMER. Gérer
 * une boutique, ses produits, ses tarifs, ses codes et ses commandes, demande
 * le rôle MERCHANT **et** d'en être le propriétaire. Un compte suspendu peut
 * encore se connecter et corriger son profil (`EDIT_PROFILE`), rien d'autre.
 *
 * `authorize` est la décision d'autorisation de votre serveur, isolée pour être
 * testable. Vos routes doivent l'appeler : masquer un bouton dans l'interface
 * n'est pas une autorisation.
 */
import { describe, expect, it } from 'vitest'
import { Account, authorize, hashPassword, verifyPassword } from '../../../src/academie/module-4'

const CUSTOMER_ACTIONS = ['PLACE_ORDER', 'OPEN_SHOP', 'SEND_MESSAGE', 'EDIT_PROFILE'] as const
const ALL_ACTIONS = [...CUSTOMER_ACTIONS, 'MANAGE_SHOP'] as const

function registered() {
  return Account.register({ email: 'voahangy@example.org', name: 'Voahangy' })
}

describe('l’inscription d’un compte', () => {
  it('crée un client actif, qui peut commander', () => {
    const account = registered()
    expect(account.roles).toEqual(['CUSTOMER'])
    expect(account.status).toBe('ACTIVE')
    expect(account.canOrder()).toBe(true)
  })

  it('range le numéro sous sa forme unique', () => {
    const account = Account.register({ email: 'tojo@example.org', name: 'Tojo', phone: '034 12 345 67' })
    expect(account.phone).toBe('+261341234567')
  })

  it('accepte un compte sans numéro', () => {
    expect(registered().phone).toBeNull()
  })

  it('refuse un numéro qui n’est pas valide', () => {
    expect(() => Account.register({ email: 'x@example.org', name: 'X', phone: '12345' })).toThrow()
  })
})

describe('devenir marchand', () => {
  it('ajoute le rôle de marchand, sans retirer celui de client', () => {
    const account = registered()
    account.becomeMerchant()
    expect([...account.roles].sort()).toEqual(['CUSTOMER', 'MERCHANT'])
    expect(account.canOrder(), 'un marchand achète aussi').toBe(true)
  })

  it('n’ajoute le rôle qu’une fois', () => {
    const account = registered()
    account.becomeMerchant()
    account.becomeMerchant()
    expect(account.roles.filter((role) => role === 'MERCHANT')).toHaveLength(1)
  })
})

describe('la suspension', () => {
  it('empêche un compte suspendu de commander, avec un motif lisible', () => {
    const account = registered()
    account.suspend('Paiements contestés à répétition')
    expect(account.status).toBe('SUSPENDED')
    expect(account.canOrder()).toBe(false)
    expect(account.suspensionReason).toContain('contestés')
  })

  it('refuse une suspension sans motif', () => {
    expect(() => registered().suspend('  ')).toThrow()
  })

  it('rend ses droits à un compte réintégré', () => {
    const account = registered()
    account.suspend('Signalé par erreur')
    account.reinstate()
    expect(account.status).toBe('ACTIVE')
    expect(account.canOrder()).toBe(true)
  })
})

describe('stockage des mots de passe', () => {
  it('ne conserve jamais le mot de passe en clair', async () => {
    const hash = await hashPassword('mot-de-passe-de-test-1')
    expect(hash).not.toContain('mot-de-passe-de-test-1')
    expect(hash.length).toBeGreaterThan(20)
  })

  // Un hachage sans sel se casse avec une table pré-calculée.
  it('sale le hachage : deux hachages du même mot de passe diffèrent', async () => {
    const [first, second] = await Promise.all([
      hashPassword('mot-de-passe-de-test-1'),
      hashPassword('mot-de-passe-de-test-1'),
    ])
    expect(first).not.toBe(second)
  })

  it('reconnaît le bon mot de passe et rejette le mauvais', async () => {
    const hash = await hashPassword('mot-de-passe-de-test-1')
    expect(await verifyPassword('mot-de-passe-de-test-1', hash)).toBe(true)
    expect(await verifyPassword('mot-de-passe-de-test-2', hash)).toBe(false)
  })
})

describe('autorisation côté serveur', () => {
  it('refuse un visiteur anonyme avec 401', () => {
    for (const action of ALL_ACTIONS) {
      const decision = authorize({ roles: [], action, isShopOwner: true })
      expect(decision.allowed, `un visiteur ne doit pas pouvoir ${action}`).toBe(false)
      expect(decision.status).toBe(401)
    }
  })

  it('laisse un client actif commander, écrire, ouvrir une boutique et modifier son profil', () => {
    for (const action of CUSTOMER_ACTIONS) {
      const decision = authorize({ roles: ['CUSTOMER'], accountStatus: 'ACTIVE', action })
      expect(decision.allowed, `un client actif doit pouvoir ${action}`).toBe(true)
    }
  })

  it('refuse la gestion d’une boutique à un simple client, avec 403', () => {
    const decision = authorize({ roles: ['CUSTOMER'], action: 'MANAGE_SHOP', isShopOwner: true })
    expect(decision.allowed, 'sans le rôle MERCHANT, pas de gestion').toBe(false)
    expect(decision.status).toBe(403)
  })

  // Le cœur du module : être marchand ne suffit pas, il faut être le propriétaire.
  it('laisse un marchand gérer sa boutique, et refuse celle d’un autre avec 403', () => {
    const merchant = ['CUSTOMER', 'MERCHANT'] as const
    expect(authorize({ roles: [...merchant], action: 'MANAGE_SHOP', isShopOwner: true }).allowed).toBe(true)

    const other = authorize({ roles: [...merchant], action: 'MANAGE_SHOP', isShopOwner: false })
    expect(other.allowed).toBe(false)
    expect(other.status).toBe(403)

    const unknown = authorize({ roles: [...merchant], action: 'MANAGE_SHOP' })
    expect(unknown.allowed, 'sans isShopOwner, la boutique n’est pas à lui').toBe(false)
    expect(unknown.status).toBe(403)
  })

  it('refuse à un compte marchand sans rôle client de commander', () => {
    const decision = authorize({ roles: ['MERCHANT'], action: 'PLACE_ORDER' })
    expect(decision.allowed).toBe(false)
    expect(decision.status).toBe(403)
  })

  it('refuse tout sauf le profil à un compte suspendu, avec 403', () => {
    for (const action of ['PLACE_ORDER', 'OPEN_SHOP', 'SEND_MESSAGE'] as const) {
      const decision = authorize({ roles: ['CUSTOMER', 'MERCHANT'], accountStatus: 'SUSPENDED', action })
      expect(decision.allowed, `un compte suspendu ne doit pas pouvoir ${action}`).toBe(false)
      expect(decision.status).toBe(403)
    }
    const own = authorize({
      roles: ['CUSTOMER', 'MERCHANT'],
      accountStatus: 'SUSPENDED',
      action: 'MANAGE_SHOP',
      isShopOwner: true,
    })
    expect(own.allowed, 'un marchand suspendu ne gère plus sa boutique').toBe(false)
    expect(own.status).toBe(403)
  })

  it('laisse un compte suspendu corriger son profil', () => {
    const decision = authorize({ roles: ['CUSTOMER'], accountStatus: 'SUSPENDED', action: 'EDIT_PROFILE' })
    expect(decision.allowed).toBe(true)
  })
})
