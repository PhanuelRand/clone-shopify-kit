/**
 * Module 7 : La vitrine, sa recherche et ses collections.
 *
 * La vitrine d'une boutique montre ses produits publiés, les plus récents
 * d'abord, page par page. Le client y cherche par mots, par collection, par
 * prix, et peut ne garder que ce qui est en stock. Elle est publique : un
 * visiteur non connecté la parcourt aussi. Elle ne montre jamais rien d'une
 * autre boutique.
 *
 * Contrat attendu, exporté par `src/academie/module-7.ts` :
 *
 *   export function createShop(input?: { name?: string }): Promise<{
 *     shopId: string; slug: string; ownerId: string
 *   }>                                   // une boutique neuve, avec un propriétaire neuf
 *
 *   export function createProduct(input?: {
 *     shopId?: string                    // par défaut une boutique neuve
 *     title?: string                     // par défaut 'Produit de vérification'
 *     description?: string               // par défaut ''
 *     prices?: number[]                  // une variante par prix; par défaut [10000]
 *     stocks?: number[]                  // le stock de chaque variante; par défaut 5 chacune
 *     weightGrams?: number               // le poids de chaque variante; par défaut 500
 *     publishedAt?: string               // un instant ISO 8601; par défaut maintenant
 *     status?: string                    // par défaut 'ACTIVE'
 *   }): Promise<{
 *     productId: string; variantIds: string[]
 *     shopId: string; slug: string; ownerId: string
 *   }>
 *
 *   export function createCollection(input: {
 *     shopId: string; memberId: string; title: string; slug: string
 *   }): Promise<{ status: number; collectionId?: string }>
 *                                        // 201; 400 slug mal formé; 403 pour un autre; 409 slug pris dans la boutique
 *
 *   export function addToCollection(input: {
 *     collectionId: string; productId: string; memberId: string
 *   }): Promise<{ status: number }>      // 200; 400 produit d'une autre boutique; 403 pour un autre
 *
 *   export function search(input: {
 *     shopSlug: string
 *     query?: string                     // des mots, cherchés dans le titre et la description
 *     collection?: string                // le slug d'une collection de cette boutique
 *     minPrice?: number; maxPrice?: number   // en ariary, bornes comprises
 *     inStock?: boolean                  // true : seulement ce qui est disponible
 *     cursor?: string | null; limit?: number
 *   }): Promise<{
 *     items: { productId: string; title: string; priceFrom: number; available: boolean }[]
 *     nextCursor: string | null
 *   }>
 *
 * Un produit apparaît quand :
 *   - il est publié (ACTIVE) et appartient à la boutique de ce slug;
 *   - chaque mot de la recherche figure dans son titre ou sa description,
 *     sans tenir compte des majuscules ni des accents : « eponge » trouve
 *     « Éponge »;
 *   - il est dans la collection demandée;
 *   - son prix « à partir de », `priceFrom`, le plus bas de ses variantes,
 *     est entre les bornes demandées;
 *   - avec `inStock`, au moins une de ses variantes est en stock.
 *
 * `available` dit si au moins une variante est en stock. Les produits les plus
 * récemment publiés viennent d'abord. Un résultat ne contient ni stock ni
 * référence. La pagination est par curseur, jamais par OFFSET : un produit
 * publié pendant qu'on feuillette ne doit ni décaler ni dupliquer les
 * résultats déjà vus.
 */
import { describe, expect, it } from 'vitest'
import {
  addToCollection,
  createCollection,
  createProduct,
  createShop,
  search,
} from '../../../src/academie/module-7'
import { uniqueSlug } from '../_support/temps'

/** Un instant d'il y a `minutes` minutes, pour ordonner les produits. */
function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

async function idsFound(input: Parameters<typeof search>[0]) {
  return (await search(input)).items.map((item) => item.productId)
}

async function product(shopId: string, extra: Omit<NonNullable<Parameters<typeof createProduct>[0]>, 'shopId'> = {}) {
  return (await createProduct({ shopId, ...extra })).productId
}

describe('les mots de la recherche', () => {
  it('trouve un mot dans le titre ou dans la description', async () => {
    const { shopId, slug } = await createShop()
    const inTitle = await product(shopId, { title: 'Panier en raphia tressé' })
    const inDescription = await product(shopId, { title: 'Sac de marché', description: 'Tressé à la main, en raphia naturel.' })
    await product(shopId, { title: 'Nappe brodée' })

    expect((await idsFound({ shopSlug: slug, query: 'raphia' })).sort()).toEqual([inTitle, inDescription].sort())
  })

  it('ne tient compte ni des majuscules ni des accents', async () => {
    const { shopId, slug } = await createShop()
    const sponge = await product(shopId, { title: 'ÉPONGE végétale' })
    expect(await idsFound({ shopSlug: slug, query: 'eponge' })).toEqual([sponge])
    expect(await idsFound({ shopSlug: slug, query: 'Vegetale' })).toEqual([sponge])
  })

  it('exige chaque mot quand la recherche en contient plusieurs', async () => {
    const { shopId, slug } = await createShop()
    const both = await product(shopId, { title: 'Huile essentielle de ravintsara' })
    await product(shopId, { title: 'Huile de coco' })
    expect(await idsFound({ shopSlug: slug, query: 'huile ravintsara' })).toEqual([both])
  })
})

describe('une vitrine par boutique', () => {
  // Le cœur du module : deux boutiques vendent la même chose, chacune ne voit que la sienne.
  it('ne montre que les produits de la boutique demandée', async () => {
    const first = await createShop()
    const second = await createShop()
    const mine = await product(first.shopId, { title: 'Vanille Bourbon, gousses' })
    await product(second.shopId, { title: 'Vanille Bourbon, gousses' })

    expect(await idsFound({ shopSlug: first.slug })).toEqual([mine])
    expect(await idsFound({ shopSlug: first.slug, query: 'vanille' })).toEqual([mine])
  })

  it('ne montre ni les brouillons ni les produits archivés', async () => {
    const { shopId, slug } = await createShop()
    const active = await product(shopId)
    await product(shopId, { status: 'DRAFT' })
    await product(shopId, { status: 'ARCHIVED' })
    expect(await idsFound({ shopSlug: slug })).toEqual([active])
  })

  it('rend une vitrine vide pour un slug inconnu', async () => {
    expect((await search({ shopSlug: uniqueSlug('inconnue') })).items).toEqual([])
  })
})

describe('les collections', () => {
  it('ne montre que les produits de la collection demandée', async () => {
    const { shopId, slug, ownerId } = await createShop()
    const created = await createCollection({ shopId, memberId: ownerId, title: 'Fêtes de fin d’année', slug: 'fetes' })
    expect(created.status).toBe(201)
    const collectionId = created.collectionId ?? ''
    const inside = await product(shopId, { title: 'Coffret cadeau' })
    await product(shopId, { title: 'Torchon' })
    expect((await addToCollection({ collectionId, productId: inside, memberId: ownerId })).status).toBe(200)

    expect(await idsFound({ shopSlug: slug, collection: 'fetes' })).toEqual([inside])
  })

  it('refuse un slug de collection déjà pris dans la boutique avec 409, et l’accepte dans une autre', async () => {
    const first = await createShop()
    const second = await createShop()
    await createCollection({ shopId: first.shopId, memberId: first.ownerId, title: 'Nouveautés', slug: 'nouveautes' })

    expect((await createCollection({ shopId: first.shopId, memberId: first.ownerId, title: 'Autres', slug: 'nouveautes' })).status).toBe(409)
    expect((await createCollection({ shopId: second.shopId, memberId: second.ownerId, title: 'Nouveautés', slug: 'nouveautes' })).status).toBe(201)
  })

  it('refuse un slug mal formé avec 400, et la collection d’un autre marchand avec 403', async () => {
    const first = await createShop()
    const intruder = await createShop()
    expect((await createCollection({ shopId: first.shopId, memberId: first.ownerId, title: 'Soldes', slug: 'Les Soldes' })).status).toBe(400)
    expect((await createCollection({ shopId: first.shopId, memberId: intruder.ownerId, title: 'Soldes', slug: 'soldes' })).status).toBe(403)
  })

  it('refuse d’ajouter le produit d’une autre boutique avec 400, ou par un autre marchand avec 403', async () => {
    const first = await createShop()
    const second = await createShop()
    const { collectionId = '' } = await createCollection({ shopId: first.shopId, memberId: first.ownerId, title: 'Sélection', slug: 'selection' })
    const foreign = await product(second.shopId)
    const own = await product(first.shopId)

    expect((await addToCollection({ collectionId, productId: foreign, memberId: first.ownerId })).status).toBe(400)
    expect((await addToCollection({ collectionId, productId: own, memberId: second.ownerId })).status).toBe(403)
    expect(await idsFound({ shopSlug: first.slug, collection: 'selection' })).toEqual([])
  })
})

describe('le prix et le stock', () => {
  it('donne le prix « à partir de », le plus bas des variantes', async () => {
    const { shopId, slug } = await createShop()
    await product(shopId, { title: 'Chemise en lin', prices: [65_000, 58_000, 72_000] })
    const [item] = (await search({ shopSlug: slug })).items
    expect(item).toMatchObject({ title: 'Chemise en lin', priceFrom: 58_000, available: true })
  })

  it('respecte les bornes de prix, bornes comprises, sur le prix « à partir de »', async () => {
    const { shopId, slug } = await createShop()
    const cheap = await product(shopId, { prices: [20_000] })
    const edge = await product(shopId, { prices: [50_000, 90_000] })
    const spread = await product(shopId, { prices: [80_000, 30_000] })
    await product(shopId, { prices: [50_001] })

    expect((await idsFound({ shopSlug: slug, maxPrice: 50_000 })).sort()).toEqual([cheap, edge, spread].sort())
    expect((await idsFound({ shopSlug: slug, minPrice: 30_000, maxPrice: 50_000 })).sort()).toEqual([edge, spread].sort())
  })

  it('ne garde que les produits disponibles avec inStock, et dit lesquels le sont', async () => {
    const { shopId, slug } = await createShop()
    const partly = await product(shopId, { prices: [10_000, 12_000], stocks: [0, 3] })
    const soldOut = await product(shopId, { prices: [10_000, 12_000], stocks: [0, 0] })

    expect(await idsFound({ shopSlug: slug, inStock: true })).toEqual([partly])
    const all = (await search({ shopSlug: slug })).items
    expect(all.find((item) => item.productId === soldOut)?.available).toBe(false)
    expect(all.find((item) => item.productId === partly)?.available).toBe(true)
  })

  it('ne rend ni stock ni référence dans un résultat', async () => {
    const { shopId, slug } = await createShop()
    await product(shopId, { stocks: [37] })
    const [item] = (await search({ shopSlug: slug })).items
    expect(Object.keys(item ?? {}).join(' '), 'la vitrine ne dit pas combien il en reste').not.toMatch(/stock|quantit|inventor|sku/i)
  })

  it('combine les mots, la collection, le prix et le stock', async () => {
    const { shopId, slug, ownerId } = await createShop()
    const { collectionId = '' } = await createCollection({ shopId, memberId: ownerId, title: 'Maison', slug: 'maison' })
    const match = await product(shopId, { title: 'Coussin brodé', prices: [25_000] })
    const tooExpensive = await product(shopId, { title: 'Coussin en soie', prices: [90_000] })
    const soldOut = await product(shopId, { title: 'Coussin rayé', prices: [25_000], stocks: [0] })
    const outside = await product(shopId, { title: 'Coussin de sol', prices: [25_000] })
    for (const productId of [match, tooExpensive, soldOut]) await addToCollection({ collectionId, productId, memberId: ownerId })

    expect(await idsFound({ shopSlug: slug, query: 'coussin', collection: 'maison', maxPrice: 30_000, inStock: true })).toEqual([match])
    expect(outside).toBeTruthy()
  })
})

describe('l’ordre et la pagination', () => {
  it('range les produits les plus récemment publiés d’abord', async () => {
    const { shopId, slug } = await createShop()
    const old = await product(shopId, { publishedAt: minutesAgo(30) })
    const recent = await product(shopId, { publishedAt: minutesAgo(1) })
    const middle = await product(shopId, { publishedAt: minutesAgo(10) })
    expect(await idsFound({ shopSlug: slug })).toEqual([recent, middle, old])
  })

  it('parcourt tous les produits sans doublon ni oubli', async () => {
    const { shopId, slug } = await createShop()
    const created = []
    for (let index = 0; index < 7; index += 1) created.push(await product(shopId))

    const seen: string[] = []
    let cursor: string | null = null
    for (let page = 0; page < 20; page += 1) {
      const result: Awaited<ReturnType<typeof search>> = await search({ shopSlug: slug, cursor, limit: 3 })
      seen.push(...result.items.map((item) => item.productId))
      cursor = result.nextCursor
      if (!cursor) break
    }
    expect(seen).toHaveLength(created.length)
    expect([...seen].sort()).toEqual([...created].sort())
  })

  // Deux produits publiés au même instant : le curseur doit savoir les départager.
  it('départage les produits publiés au même instant', async () => {
    const { shopId, slug } = await createShop()
    const instant = minutesAgo(5)
    const created = []
    for (let index = 0; index < 5; index += 1) created.push(await product(shopId, { publishedAt: instant }))

    const first = await search({ shopSlug: slug, limit: 2 })
    const second = await search({ shopSlug: slug, cursor: first.nextCursor, limit: 2 })
    const third = await search({ shopSlug: slug, cursor: second.nextCursor, limit: 2 })
    const seen = [...first.items, ...second.items, ...third.items].map((item) => item.productId)
    expect([...seen].sort()).toEqual([...created].sort())
  })

  // Le test que OFFSET ne passe pas : une publication décale toutes les pages.
  it('ne décale pas les pages déjà vues quand un produit arrive entre deux', async () => {
    const { shopId, slug } = await createShop()
    for (let index = 0; index < 6; index += 1) await product(shopId, { publishedAt: minutesAgo(60 - index) })

    const first = await search({ shopSlug: slug, limit: 3 })
    expect(first.nextCursor, 'six produits par pages de trois : il reste une page').toBeTruthy()

    await product(shopId)

    const second = await search({ shopSlug: slug, cursor: first.nextCursor, limit: 3 })
    const overlap = second.items
      .map((item) => item.productId)
      .filter((id) => first.items.some((item) => item.productId === id))
    expect(overlap, 'aucun produit de la page 1 ne doit réapparaître page 2').toEqual([])
    expect(second.items).toHaveLength(3)
  })
})
