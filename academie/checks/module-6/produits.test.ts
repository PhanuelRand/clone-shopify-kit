/**
 * Module 6 : Les produits, leurs variantes et leurs photos.
 *
 * Un marchand ajoute un produit à sa boutique. Le produit a des options, comme
 * la taille et la couleur, et des variantes : chaque combinaison de valeurs,
 * avec son prix, son stock, son poids et sa référence (décision 0001).
 *
 * Contrat attendu, exporté par `src/academie/module-6.ts`, à côté des
 * fonctions de boutiques.test.ts :
 *
 *   export function createProduct(input: {
 *     shopId: string; memberId: string
 *     title: string; description: string
 *     options: { name: string; values: string[] }[]   // de zéro à trois options
 *     variants: {
 *       options: Record<string, string>     // une valeur par option : { Taille: 'M', Couleur: 'Indigo' }
 *       sku: string
 *       price: number; compareAtPrice?: number | null
 *       stock: number; weightGrams: number
 *     }[]
 *   }): Promise<{
 *     status: number                    // 201; 400 hors des règles; 403 pour un autre que le propriétaire;
 *                                       // 409 pour un SKU déjà employé dans la boutique
 *     productId?: string
 *     variantIds?: string[]             // dans l'ordre des variantes données
 *     reason?: string
 *   }>
 *
 *   export function setProductStatus(input: {
 *     productId: string; memberId: string
 *     status: string                    // 'DRAFT', 'ACTIVE' ou 'ARCHIVED'
 *   }): Promise<{ status: number }>     // 200; 400 statut inconnu; 403 pour un autre
 *
 *   export function updateVariant(input: {
 *     variantId: string; memberId: string
 *     price?: number; compareAtPrice?: number | null; stock?: number
 *   }): Promise<{ status: number }>     // 200; 400 hors des règles; 403 pour un autre
 *
 *   export function getProduct(input: {
 *     shopSlug: string; productId: string
 *   }): Promise<null | {
 *     productId: string; title: string; description: string
 *     options: { name: string; values: string[] }[]
 *     variants: {
 *       variantId: string; options: Record<string, string>
 *       price: number; compareAtPrice: number | null
 *       available: boolean              // au moins un en stock
 *     }[]
 *   }>                                  // null si le produit n'est pas publié, ou pas de cette boutique
 *
 *   export function createUploadUrl(input: {
 *     memberId: string; productId: string; contentType: string; sizeBytes: number
 *   }): Promise<
 *     | { url: string; key: string; expiresAt: string }   // ISO 8601
 *     | { refused: string }                               // motif lisible
 *   >
 *   export function attachPhoto(input: { memberId; productId; key }):
 *     Promise<{ attached: boolean; reason?: string }>
 *   export function listPhotos(productId: string):
 *     Promise<{ key: string; position: number; isMain: boolean }[]>
 *   export function setMainPhoto(input: { memberId; productId; key }):
 *     Promise<{ status: number }>       // 200, ou 403 pour un autre
 *
 * Règles imposées par la consigne, que cette suite vérifie :
 *   - un titre fait de 3 à 120 caractères, une description 5 000 au plus;
 *   - de zéro à trois options, aux noms distincts, chacune avec de 1 à 20
 *     valeurs distinctes;
 *   - de 1 à 100 variantes. Chacune donne une valeur, prise dans la liste, à
 *     chaque option, et deux variantes n'ont jamais la même combinaison. Un
 *     produit sans option a exactement une variante, sans valeur;
 *   - le prix, le prix barré, le stock et le poids suivent les règles du
 *     module 2;
 *   - un SKU n'est employé qu'une fois dans une boutique;
 *   - un produit naît en brouillon (DRAFT) : la vitrine ne le montre qu'une
 *     fois publié (ACTIVE), et plus une fois archivé (ARCHIVED);
 *   - seul le propriétaire de la boutique crée, modifie et publie ses
 *     produits, et y ajoute des photos;
 *   - la vitrine dit si une variante est disponible, jamais combien il en
 *     reste;
 *   - seuls `image/jpeg`, `image/png` et `image/webp` sont acceptés, un fichier
 *     de plus de 10 000 000 octets est refusé, et l'URL de téléversement
 *     expire dans les deux heures; un produit a dix photos au plus, dont
 *     exactement une principale.
 *
 * Les photos passent par votre port « stockage » : en local et dans ces
 * vérifications, un stockage simulé qui écrit sur le disque; en production,
 * Supabase Storage. Ces vérifications n'envoient aucun fichier : `attachPhoto`
 * n'a pas à vérifier que le fichier a bien été téléversé.
 */
import { describe, expect, it } from 'vitest'
import {
  attachPhoto,
  createAccount,
  createProduct,
  createUploadUrl,
  getProduct,
  listPhotos,
  openShop,
  setMainPhoto,
  setProductStatus,
  updateVariant,
} from '../../../src/academie/module-6'
import { uniqueSlug } from '../_support/temps'

const maxBytes = 10_000_000

type ProductInput = Parameters<typeof createProduct>[0]

async function shop(label = 'boutique') {
  const ownerId = await createAccount({ name: 'Marchand' })
  const slug = uniqueSlug(label)
  const opened = await openShop({ ownerId, name: 'Atelier Lamba', slug })
  if (!opened.shopId) throw new Error(`boutique refusée : ${opened.reason ?? opened.status}`)
  return { ownerId, slug, shopId: opened.shopId }
}

function sku(label: string) {
  return `${label}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
}

/** Un t-shirt en deux tailles et deux couleurs : quatre variantes. */
function tshirt(shopId: string, memberId: string): ProductInput {
  return {
    shopId,
    memberId,
    title: 'T-shirt en coton, motif lamba',
    description: 'Coton épais, imprimé à Antananarivo.',
    options: [
      { name: 'Taille', values: ['S', 'M'] },
      { name: 'Couleur', values: ['Blanc', 'Indigo'] },
    ],
    variants: [
      { options: { Taille: 'S', Couleur: 'Blanc' }, sku: sku('TS-S-BL'), price: 45_000, stock: 4, weightGrams: 250 },
      { options: { Taille: 'S', Couleur: 'Indigo' }, sku: sku('TS-S-IN'), price: 45_000, stock: 0, weightGrams: 250 },
      { options: { Taille: 'M', Couleur: 'Blanc' }, sku: sku('TS-M-BL'), price: 48_000, compareAtPrice: 55_000, stock: 7, weightGrams: 270 },
      { options: { Taille: 'M', Couleur: 'Indigo' }, sku: sku('TS-M-IN'), price: 48_000, stock: 2, weightGrams: 270 },
    ],
  }
}

/** Un savon, sans option : une seule variante. */
function soap(shopId: string, memberId: string): ProductInput {
  return {
    shopId,
    memberId,
    title: 'Savon à la vanille',
    description: '',
    options: [],
    variants: [{ options: {}, sku: sku('SAVON'), price: 6_500, stock: 30, weightGrams: 120 }],
  }
}

async function published(input: ProductInput) {
  const created = await createProduct(input)
  if (!created.productId) throw new Error(`produit refusé : ${created.reason ?? created.status}`)
  await setProductStatus({ productId: created.productId, memberId: input.memberId, status: 'ACTIVE' })
  return { productId: created.productId, variantIds: created.variantIds ?? [] }
}

describe('créer un produit', () => {
  it('crée un brouillon, que la vitrine ne montre qu’une fois publié', async () => {
    const { ownerId, shopId, slug } = await shop()
    const created = await createProduct(tshirt(shopId, ownerId))
    expect(created.status).toBe(201)
    expect(created.productId, 'un produit créé porte un identifiant').toBeTruthy()
    expect(created.variantIds, 'une variante créée par combinaison').toHaveLength(4)

    const productId = created.productId ?? ''
    expect(await getProduct({ shopSlug: slug, productId }), 'un brouillon n’est pas dans la vitrine').toBeNull()
    expect((await setProductStatus({ productId, memberId: ownerId, status: 'ACTIVE' })).status).toBe(200)
    expect((await getProduct({ shopSlug: slug, productId }))?.title).toBe('T-shirt en coton, motif lamba')
  })

  it('montre les options et les variantes, dans l’ordre donné', async () => {
    const { ownerId, shopId, slug } = await shop()
    const { productId, variantIds } = await published(tshirt(shopId, ownerId))

    const product = await getProduct({ shopSlug: slug, productId })
    expect(product?.options).toEqual([
      { name: 'Taille', values: ['S', 'M'] },
      { name: 'Couleur', values: ['Blanc', 'Indigo'] },
    ])
    expect(product?.variants).toEqual([
      { variantId: variantIds[0], options: { Taille: 'S', Couleur: 'Blanc' }, price: 45_000, compareAtPrice: null, available: true },
      { variantId: variantIds[1], options: { Taille: 'S', Couleur: 'Indigo' }, price: 45_000, compareAtPrice: null, available: false },
      { variantId: variantIds[2], options: { Taille: 'M', Couleur: 'Blanc' }, price: 48_000, compareAtPrice: 55_000, available: true },
      { variantId: variantIds[3], options: { Taille: 'M', Couleur: 'Indigo' }, price: 48_000, compareAtPrice: null, available: true },
    ])
  })

  it('crée un produit sans option, avec une seule variante', async () => {
    const { ownerId, shopId, slug } = await shop()
    const { productId } = await published(soap(shopId, ownerId))
    const product = await getProduct({ shopSlug: slug, productId })
    expect(product?.options).toEqual([])
    expect(product?.variants).toHaveLength(1)
    expect(product?.variants[0]).toMatchObject({ options: {}, price: 6_500, available: true })
  })

  // Le stock exact intéresse les concurrents, pas les clients.
  it('dit si une variante est disponible, jamais combien il en reste', async () => {
    const { ownerId, shopId, slug } = await shop()
    const { productId } = await published(tshirt(shopId, ownerId))
    const product = await getProduct({ shopSlug: slug, productId })
    for (const variant of product?.variants ?? []) {
      expect(Object.keys(variant).join(' '), 'aucun stock dans la vitrine').not.toMatch(/stock|quantit|inventor|sku/i)
    }
  })
})

describe('les règles d’un produit', () => {
  it('refuse un titre trop court ou trop long, et une description trop longue, avec 400', async () => {
    const { ownerId, shopId } = await shop()
    for (const extra of [{ title: 'TS' }, { title: 'a'.repeat(121) }, { description: 'a'.repeat(5_001) }]) {
      const result = await createProduct({ ...soap(shopId, ownerId), ...extra })
      expect(result.status, JSON.stringify(extra).slice(0, 40)).toBe(400)
      expect(result.reason, 'le refus doit porter un motif lisible').toBeTruthy()
    }
  })

  it('refuse plus de trois options, une option sans valeur, ou deux valeurs identiques, avec 400', async () => {
    const { ownerId, shopId } = await shop()
    const base = soap(shopId, ownerId)
    const four = ['Taille', 'Couleur', 'Matière', 'Coupe'].map((name) => ({ name, values: ['A'] }))
    const cases: ProductInput[] = [
      { ...base, options: four, variants: [{ ...base.variants[0]!, options: { Taille: 'A', Couleur: 'A', Matière: 'A', Coupe: 'A' } }] },
      { ...base, options: [{ name: 'Taille', values: [] }], variants: [{ ...base.variants[0]!, options: { Taille: '' } }] },
      { ...base, options: [{ name: 'Taille', values: ['M', 'M'] }], variants: [{ ...base.variants[0]!, options: { Taille: 'M' } }] },
      {
        ...base,
        options: [
          { name: 'Taille', values: ['M'] },
          { name: 'Taille', values: ['L'] },
        ],
        variants: [{ ...base.variants[0]!, options: { Taille: 'M' } }],
      },
    ]
    for (const input of cases) {
      expect((await createProduct(input)).status, JSON.stringify(input.options).slice(0, 60)).toBe(400)
    }
  })

  it('refuse une variante qui oublie une option, ou prend une valeur hors de la liste, avec 400', async () => {
    const { ownerId, shopId } = await shop()
    const input = tshirt(shopId, ownerId)
    const missing = { ...input, variants: [{ ...input.variants[0]!, options: { Taille: 'S' } }] }
    const outside = { ...input, variants: [{ ...input.variants[0]!, options: { Taille: 'XL', Couleur: 'Blanc' } }] }
    expect((await createProduct(missing)).status).toBe(400)
    expect((await createProduct(outside)).status).toBe(400)
  })

  it('refuse deux variantes de même combinaison, un produit sans variante, ou deux variantes sans option, avec 400', async () => {
    const { ownerId, shopId } = await shop()
    const input = tshirt(shopId, ownerId)
    const twin = { ...input, variants: [input.variants[0]!, { ...input.variants[0]!, sku: sku('JUMEAU') }] }
    const none = { ...input, variants: [] }
    const base = soap(shopId, ownerId)
    const twoPlain = { ...base, variants: [base.variants[0]!, { ...base.variants[0]!, sku: sku('AUTRE') }] }
    for (const candidate of [twin, none, twoPlain]) {
      expect((await createProduct(candidate)).status).toBe(400)
    }
  })

  it('refuse un prix, un prix barré, un stock ou un poids hors des règles, avec 400', async () => {
    const { ownerId, shopId } = await shop()
    const base = soap(shopId, ownerId)
    const variant = base.variants[0]!
    for (const wrong of [
      { price: 0 },
      { price: 6_500.5 },
      { compareAtPrice: 6_500 },
      { stock: -1 },
      { weightGrams: 12.5 },
    ]) {
      const result = await createProduct({ ...base, variants: [{ ...variant, ...wrong }] })
      expect(result.status, JSON.stringify(wrong)).toBe(400)
    }
  })

  it('refuse deux fois le même SKU dans une boutique, avec 409, mais l’accepte dans une autre', async () => {
    const first = await shop()
    const reference = sku('UNIQUE')
    const input = soap(first.shopId, first.ownerId)
    expect((await createProduct({ ...input, variants: [{ ...input.variants[0]!, sku: reference }] })).status).toBe(201)

    const again = await createProduct({ ...input, title: 'Savon au citron', variants: [{ ...input.variants[0]!, sku: reference }] })
    expect(again.status).toBe(409)
    expect(again.reason).toBeTruthy()

    const other = await shop()
    const elsewhere = soap(other.shopId, other.ownerId)
    expect((await createProduct({ ...elsewhere, variants: [{ ...elsewhere.variants[0]!, sku: reference }] })).status).toBe(201)
  })

  it('refuse deux fois le même SKU dans un même produit, avec 400', async () => {
    const { ownerId, shopId } = await shop()
    const input = tshirt(shopId, ownerId)
    const same = sku('MEME')
    const result = await createProduct({ ...input, variants: input.variants.map((variant) => ({ ...variant, sku: same })) })
    expect(result.status).toBe(400)
  })
})

describe('une boutique ne touche pas à une autre', () => {
  // Le cœur du module : connaître l'identifiant d'une boutique ne suffit pas à y écrire.
  it('refuse à un autre marchand d’ajouter un produit dans la boutique, avec 403', async () => {
    const victim = await shop('victime')
    const intruder = await shop('intrus')
    const result = await createProduct(soap(victim.shopId, intruder.ownerId))
    expect(result.status).toBe(403)
  })

  it('refuse à un autre marchand de modifier une variante ou de publier un produit, avec 403', async () => {
    const victim = await shop('victime')
    const intruder = await shop('intrus')
    const created = await createProduct(soap(victim.shopId, victim.ownerId))
    const productId = created.productId ?? ''
    const [variantId = ''] = created.variantIds ?? []

    expect((await updateVariant({ variantId, memberId: intruder.ownerId, price: 1_000 })).status).toBe(403)
    expect((await setProductStatus({ productId, memberId: intruder.ownerId, status: 'ACTIVE' })).status).toBe(403)
    expect(await getProduct({ shopSlug: victim.slug, productId }), 'le produit est resté en brouillon').toBeNull()
  })

  it('ne montre pas le produit d’une boutique dans la vitrine d’une autre', async () => {
    const owner = await shop('proprietaire')
    const other = await shop('voisine')
    const { productId } = await published(soap(owner.shopId, owner.ownerId))

    expect(await getProduct({ shopSlug: owner.slug, productId })).not.toBeNull()
    expect(await getProduct({ shopSlug: other.slug, productId })).toBeNull()
  })
})

describe('modifier, archiver', () => {
  it('laisse le marchand changer le prix et le stock d’une variante', async () => {
    const { ownerId, shopId, slug } = await shop()
    const { productId, variantIds } = await published(soap(shopId, ownerId))
    const [variantId = ''] = variantIds

    expect((await updateVariant({ variantId, memberId: ownerId, price: 5_900, compareAtPrice: 6_500, stock: 0 })).status).toBe(200)
    expect((await getProduct({ shopSlug: slug, productId }))?.variants[0]).toMatchObject({
      price: 5_900,
      compareAtPrice: 6_500,
      available: false,
    })
  })

  it('refuse une modification hors des règles, avec 400', async () => {
    const { ownerId, shopId, slug } = await shop()
    const { productId, variantIds } = await published(soap(shopId, ownerId))
    const [variantId = ''] = variantIds
    expect((await updateVariant({ variantId, memberId: ownerId, compareAtPrice: 1_000 })).status).toBe(400)
    expect((await updateVariant({ variantId, memberId: ownerId, stock: -3 })).status).toBe(400)
    expect((await getProduct({ shopSlug: slug, productId }))?.variants[0]?.price).toBe(6_500)
  })

  it('retire de la vitrine un produit archivé, et refuse un statut inconnu', async () => {
    const { ownerId, shopId, slug } = await shop()
    const { productId } = await published(soap(shopId, ownerId))
    expect((await setProductStatus({ productId, memberId: ownerId, status: 'SUPPRIME' })).status).toBe(400)
    expect((await setProductStatus({ productId, memberId: ownerId, status: 'ARCHIVED' })).status).toBe(200)
    expect(await getProduct({ shopSlug: slug, productId })).toBeNull()
  })
})

describe('les photos d’un produit', () => {
  async function withPhotos(count: number) {
    const { ownerId, shopId } = await shop()
    const created = await createProduct(soap(shopId, ownerId))
    const productId = created.productId ?? ''
    for (let index = 0; index < count; index += 1) {
      const grant = await createUploadUrl({ memberId: ownerId, productId, contentType: 'image/jpeg', sizeBytes: 250_000 })
      if (!('key' in grant)) throw new Error(`téléversement refusé : ${grant.refused}`)
      const result = await attachPhoto({ memberId: ownerId, productId, key: grant.key })
      if (!result.attached) throw new Error(`photo refusée : ${result.reason}`)
    }
    return { ownerId, productId }
  }

  it('accorde une URL signée au marchand, qui expire dans les deux heures', async () => {
    const { ownerId, productId } = await withPhotos(0)
    const grant = await createUploadUrl({ memberId: ownerId, productId, contentType: 'image/webp', sizeBytes: 250_000 })

    expect('key' in grant, 'une image valide doit être acceptée').toBe(true)
    if (!('key' in grant)) return
    expect(grant.url).toMatch(/^https?:\/\/.+/)
    const expiresAt = new Date(grant.expiresAt).getTime()
    expect(Number.isNaN(expiresAt), 'expiresAt doit être une date ISO 8601').toBe(false)
    expect(expiresAt).toBeGreaterThan(Date.now())
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 7_200_000)
  })

  // Le type est décidé côté serveur : un client peut annoncer ce qu'il veut.
  it('refuse un fichier qui n’est pas une image, ou trop volumineux, et un autre marchand', async () => {
    const { ownerId, productId } = await withPhotos(0)
    for (const contentType of ['application/pdf', 'text/html', 'video/mp4']) {
      const grant = await createUploadUrl({ memberId: ownerId, productId, contentType, sizeBytes: 100_000 })
      expect('refused' in grant, `${contentType} doit être refusé`).toBe(true)
    }
    const big = await createUploadUrl({ memberId: ownerId, productId, contentType: 'image/jpeg', sizeBytes: maxBytes + 1 })
    expect('refused' in big, 'un fichier de plus de 10 Mo doit être refusé').toBe(true)

    const intruder = await shop('intrus')
    const stranger = await createUploadUrl({ memberId: intruder.ownerId, productId, contentType: 'image/jpeg', sizeBytes: 100_000 })
    expect('refused' in stranger, 'seul le marchand ajoute des photos à son produit').toBe(true)
  })

  it('conserve les photos à des positions distinctes, avec exactement une principale', async () => {
    const { productId } = await withPhotos(3)
    const photos = await listPhotos(productId)
    expect(photos).toHaveLength(3)
    expect(new Set(photos.map((photo) => photo.position)).size).toBe(3)
    expect(photos.filter((photo) => photo.isMain)).toHaveLength(1)
  })

  it('change de photo principale, et refuse ce changement à un autre marchand avec 403', async () => {
    const { ownerId, productId } = await withPhotos(3)
    const target = (await listPhotos(productId)).find((photo) => !photo.isMain)
    expect(target, 'il faut au moins une photo secondaire').toBeDefined()
    if (!target) return

    const intruder = await shop('intrus')
    expect((await setMainPhoto({ memberId: intruder.ownerId, productId, key: target.key })).status).toBe(403)
    expect((await setMainPhoto({ memberId: ownerId, productId, key: target.key })).status).toBe(200)
    const after = await listPhotos(productId)
    expect(after.filter((photo) => photo.isMain)).toHaveLength(1)
    expect(after.find((photo) => photo.isMain)?.key).toBe(target.key)
  })

  it('refuse une onzième photo, avec un motif', { timeout: 30_000 }, async () => {
    const { ownerId, productId } = await withPhotos(10)
    const grant = await createUploadUrl({ memberId: ownerId, productId, contentType: 'image/jpeg', sizeBytes: 250_000 })
    const result =
      'key' in grant ? await attachPhoto({ memberId: ownerId, productId, key: grant.key }) : { attached: false, reason: grant.refused }

    expect(result.attached, 'dix photos au plus').toBe(false)
    expect(result.reason, 'le refus doit porter un motif lisible').toBeTruthy()
    expect(await listPhotos(productId)).toHaveLength(10)
  })

  it('refuse de reprendre la photo d’un autre produit', async () => {
    const owner = await withPhotos(1)
    const thief = await withPhotos(0)
    const [photo] = await listPhotos(owner.productId)
    expect(photo).toBeDefined()

    const result = await attachPhoto({ memberId: thief.ownerId, productId: thief.productId, key: photo?.key ?? '' })
    expect(result.attached, 'une photo déjà rattachée ne doit pas être reprise').toBe(false)
  })
})
