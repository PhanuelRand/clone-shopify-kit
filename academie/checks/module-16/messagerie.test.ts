/**
 * Module 16 : La messagerie entre un client et une boutique. Module Platine.
 *
 * « Le lamba existe-t-il en vert ? », « Mon colis part quand ? » : un client
 * écrit à une boutique, et le marchand lui répond au nom de la boutique. Un
 * message envoyé apparaît chez l'autre sans recharger la page. Trois règles :
 *
 * - seuls le client et le propriétaire de la boutique lisent et écrivent, et
 *   le serveur le vérifie à chaque lecture, à chaque envoi et à chaque
 *   abonnement : un autre marchand ne lit jamais les conversations d'une
 *   boutique;
 * - les messages de la boutique sont signés « la boutique », pas du nom du
 *   marchand;
 * - une boutique peut bloquer un client qui l'importune : la conversation se
 *   ferme pour les deux, et le client ne peut plus en ouvrir.
 *
 * Contrat attendu, exporté par `src/academie/module-16.ts` :
 *
 *   export function createAccount(input?: { ...ceux du module 6 }): Promise<string>
 *   export function createShop(input?: { ...ceux du module 8 })
 *
 *   export function startConversation(input: { shopId: string; customerId: string }): Promise<{
 *     status: number               // 201, ou 200 si elle existe déjà;
 *                                  // 400 pour le propriétaire de la boutique; 403 pour un client bloqué
 *     conversationId?: string      // la même pour le même client et la même boutique
 *   }>
 *
 *   export function sendMessage(input: {
 *     conversationId: string; senderId: string; body: string
 *   }): Promise<{ status: number }>   // 201; 400 vide ou de plus de 1 000 caractères; 403 pour un tiers
 *
 *   export function readConversation(input: { conversationId: string; readerId: string }): Promise<{
 *     status: number
 *     messages: { from: 'CUSTOMER' | 'SHOP'; body: string; read: boolean }[]   // dans l'ordre d'envoi
 *   }>                                // read : le destinataire a lu ce message
 *
 *   export function markRead(input: { conversationId: string; readerId: string }):
 *     Promise<{ status: number }>     // 200; 403 pour un tiers; marque lus les messages reçus de l'autre
 *
 *   export function unreadCount(accountId: string): Promise<number>
 *                                     // messages reçus et pas encore lus, dans les conversations ouvertes :
 *                                     // ceux de ses boutiques pour un marchand, les siens pour un client
 *
 *   export function listConversations(accountId: string): Promise<
 *     { conversationId: string; shopId: string; unread: number }[]
 *   >                                 // les conversations ouvertes, comme client ou comme marchand
 *
 *   export function subscribe(input: {
 *     conversationId: string; readerId: string
 *     onMessage: (message: { from: 'CUSTOMER' | 'SHOP'; body: string }) => void
 *   }): Promise<{ status: number; unsubscribe: () => void }>
 *
 *   export function blockCustomer(input: {
 *     shopId: string; memberId: string; customerId: string
 *   }): Promise<{ status: number }>   // 200 ou 201; 403 pour un autre que le propriétaire
 *
 * Un tiers reçoit 403 et aucun message; un abonnement refusé rend quand même
 * une fonction `unsubscribe`, qui ne fait rien. Après un blocage, la lecture et
 * l'envoi répondent 403 aux deux, et la conversation disparaît de leurs
 * listes.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  blockCustomer,
  createAccount,
  createShop,
  listConversations,
  markRead,
  readConversation,
  sendMessage,
  startConversation,
  subscribe,
  unreadCount,
} from '../../../src/academie/module-16'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

/** Une boutique, un client, et la conversation ouverte par le client. */
async function conversation() {
  const { shopId, ownerId } = await createShop()
  const customerId = await createAccount({ name: 'Cliente' })
  const started = await startConversation({ shopId, customerId })
  if (!started.conversationId) throw new Error(`conversation refusée : ${started.status}`)
  return { shopId, ownerId, customerId, conversationId: started.conversationId }
}

describe('ouvrir une conversation', () => {
  it('ouvre une seule conversation par client et par boutique', async () => {
    const { shopId } = await createShop()
    const customerId = await createAccount()
    const first = await startConversation({ shopId, customerId })
    const again = await startConversation({ shopId, customerId })

    expect(first.status).toBe(201)
    expect(again.status).toBe(200)
    expect(again.conversationId).toBe(first.conversationId)
  })

  it('refuse au marchand d’écrire à sa propre boutique, avec 400', async () => {
    const { shopId, ownerId } = await createShop()
    expect((await startConversation({ shopId, customerId: ownerId })).status).toBe(400)
  })
})

describe('entre le client et la boutique', () => {
  it('rend les messages aux deux, dans l’ordre d’envoi, signés du client ou de la boutique', async () => {
    const { conversationId, customerId, ownerId } = await conversation()
    expect((await sendMessage({ conversationId, senderId: customerId, body: 'Le lamba existe-t-il en vert ?' })).status).toBe(201)
    await sendMessage({ conversationId, senderId: ownerId, body: 'Oui, il arrive vendredi.' })

    for (const readerId of [customerId, ownerId]) {
      const result = await readConversation({ conversationId, readerId })
      expect(result.status).toBe(200)
      expect(result.messages.map(({ from, body }) => ({ from, body }))).toEqual([
        { from: 'CUSTOMER', body: 'Le lamba existe-t-il en vert ?' },
        { from: 'SHOP', body: 'Oui, il arrive vendredi.' },
      ])
    }
  })

  it('refuse un message vide, ou de plus de 1 000 caractères, avec 400', async () => {
    const { conversationId, customerId } = await conversation()
    expect((await sendMessage({ conversationId, senderId: customerId, body: '   ' })).status).toBe(400)
    expect((await sendMessage({ conversationId, senderId: customerId, body: 'a'.repeat(1_001) })).status).toBe(400)
    expect((await readConversation({ conversationId, readerId: customerId })).messages).toEqual([])
  })

  it('range la conversation dans la liste du client et dans celle du marchand', async () => {
    const { conversationId, shopId, customerId, ownerId } = await conversation()
    await sendMessage({ conversationId, senderId: customerId, body: 'Bonjour' })

    expect(await listConversations(ownerId)).toEqual([{ conversationId, shopId, unread: 1 }])
    expect(await listConversations(customerId)).toEqual([{ conversationId, shopId, unread: 0 }])
  })

  it('diffuse un message à l’autre dès son envoi', async () => {
    const { conversationId, customerId, ownerId } = await conversation()
    const received = new Promise<{ from: string; body: string }>((resolveMessage, reject) => {
      const timer = setTimeout(() => reject(new Error('aucun message reçu en 3 s')), 3_000)
      void subscribe({
        conversationId,
        readerId: customerId,
        onMessage: (message) => {
          clearTimeout(timer)
          resolveMessage(message)
        },
      }).then((subscription) => cleanups.push(subscription.unsubscribe))
    })
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))

    await sendMessage({ conversationId, senderId: ownerId, body: 'Votre colis part demain.' })
    expect(await received).toEqual({ from: 'SHOP', body: 'Votre colis part demain.' })
  })
})

describe('fermée aux tiers', () => {
  // Le cœur du parcours, une fois de plus : un autre marchand ne lit pas les clients d'une boutique.
  it('refuse la lecture, l’envoi et l’abonnement à un tiers et à un autre marchand, avec 403', async () => {
    const { conversationId, customerId } = await conversation()
    await sendMessage({ conversationId, senderId: customerId, body: 'Mon adresse est…' })
    const otherShop = await createShop()

    for (const intruder of [await createAccount(), otherShop.ownerId]) {
      const read = await readConversation({ conversationId, readerId: intruder })
      expect(read.status).toBe(403)
      expect(read.messages).toEqual([])
      expect((await sendMessage({ conversationId, senderId: intruder, body: 'Intrus' })).status).toBe(403)
      const subscription = await subscribe({ conversationId, readerId: intruder, onMessage: () => undefined })
      cleanups.push(subscription.unsubscribe)
      expect(subscription.status).toBe(403)
    }
  })
})

describe('les messages non lus', () => {
  it('compte les messages non lus du destinataire, pas ceux de l’auteur', async () => {
    const { conversationId, customerId, ownerId } = await conversation()
    await sendMessage({ conversationId, senderId: customerId, body: 'Bonjour' })
    await sendMessage({ conversationId, senderId: customerId, body: 'Vous êtes là ?' })

    expect(await unreadCount(ownerId)).toBe(2)
    expect(await unreadCount(customerId)).toBe(0)
  })

  it('remet le compteur à zéro quand le destinataire lit, et le montre à l’auteur', async () => {
    const { conversationId, customerId, ownerId } = await conversation()
    await sendMessage({ conversationId, senderId: customerId, body: 'Bonjour' })
    expect((await readConversation({ conversationId, readerId: customerId })).messages[0]?.read).toBe(false)

    expect((await markRead({ conversationId, readerId: ownerId })).status).toBe(200)
    expect(await unreadCount(ownerId)).toBe(0)
    expect(
      (await readConversation({ conversationId, readerId: customerId })).messages[0]?.read,
      'le client voit que la boutique a lu son message',
    ).toBe(true)
  })

  it('refuse à un tiers de marquer une conversation comme lue, avec 403', async () => {
    const { conversationId } = await conversation()
    expect((await markRead({ conversationId, readerId: await createAccount() })).status).toBe(403)
  })
})

describe('le blocage', () => {
  it('ferme la conversation pour les deux, et la retire de leurs listes', async () => {
    const { conversationId, shopId, customerId, ownerId } = await conversation()
    await sendMessage({ conversationId, senderId: customerId, body: 'Dernier prix ?' })
    expect([200, 201]).toContain((await blockCustomer({ shopId, memberId: ownerId, customerId })).status)

    for (const accountId of [customerId, ownerId]) {
      expect((await sendMessage({ conversationId, senderId: accountId, body: 'Encore là ?' })).status).toBe(403)
      const read = await readConversation({ conversationId, readerId: accountId })
      expect(read.status).toBe(403)
      expect(read.messages).toEqual([])
      expect(await listConversations(accountId)).toEqual([])
    }
    expect(await unreadCount(ownerId)).toBe(0)
  })

  it('empêche le client bloqué d’ouvrir une nouvelle conversation, avec 403', async () => {
    const { shopId, ownerId } = await createShop()
    const customerId = await createAccount()
    await blockCustomer({ shopId, memberId: ownerId, customerId })
    expect((await startConversation({ shopId, customerId })).status).toBe(403)
  })

  it('refuse le blocage à un autre que le propriétaire avec 403, et accepte un second blocage sans erreur', async () => {
    const { shopId, ownerId } = await createShop()
    const intruder = await createShop()
    const customerId = await createAccount()
    expect((await blockCustomer({ shopId, memberId: intruder.ownerId, customerId })).status).toBe(403)
    await blockCustomer({ shopId, memberId: ownerId, customerId })
    expect([200, 201]).toContain((await blockCustomer({ shopId, memberId: ownerId, customerId })).status)
  })

  it('ne ferme que la boutique qui bloque', async () => {
    const blocking = await createShop()
    const other = await createShop()
    const customerId = await createAccount()
    await blockCustomer({ shopId: blocking.shopId, memberId: blocking.ownerId, customerId })
    expect((await startConversation({ shopId: other.shopId, customerId })).status).toBe(201)
  })
})
