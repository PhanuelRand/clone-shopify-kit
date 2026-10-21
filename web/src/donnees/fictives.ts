/**
 * Des données fictives, pour construire vos écrans avant que l'API existe.
 *
 * Au module 3, vos pages lisent ce fichier. Dans les modules suivants, chaque
 * page le remplace par un appel à votre API, une page à la fois. Quand plus
 * aucun écran ne l'importe, supprimez-le.
 *
 * Les boutiques, leurs produits, les clients et les commandes sont inventés.
 */

/** Les zones de livraison du parcours : une liste fixe (décision 0008). */
export type ZoneFictive = { slug: string; nom: string }

export const zonesFictives: ZoneFictive[] = [
  { slug: 'antananarivo', nom: 'Antananarivo' },
  { slug: 'antsiranana', nom: 'Antsiranana' },
  { slug: 'fianarantsoa', nom: 'Fianarantsoa' },
  { slug: 'mahajanga', nom: 'Mahajanga' },
  { slug: 'toamasina', nom: 'Toamasina' },
  { slug: 'toliara', nom: 'Toliara' },
]

/** Un prix en ariary, écrit comme on le lit : « 45 000 Ar ». */
export function prixLisible(ariary: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(ariary)} Ar`
}

export type OptionFictive = { nom: string; valeurs: string[] } // « Taille » : S, M, L

export type VarianteFictive = {
  id: string
  options: Record<string, string> // { Taille: 'M', Couleur: 'Indigo' }; {} sans option
  prix: number // en ariary
  prixBarre: number | null // l'ancien prix, affiché barré
  disponible: boolean // la vitrine ne dit jamais combien il en reste
  stock: number // pour l'espace du marchand seulement
}

export type StatutProduit = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

export type ProduitFictif = {
  id: string
  titre: string
  description: string
  statut: StatutProduit
  collections: string[] // des slugs de collections de la boutique
  options: OptionFictive[]
  variantes: VarianteFictive[]
}

export type TarifFictif = {
  zone: string // le slug d'une zone
  base: number // le premier kilogramme, en ariary
  parKilo: number // chaque kilogramme entamé au-delà
  offerteDes: number | null // le seuil de livraison offerte
}

export type BoutiqueFictive = {
  id: string
  slug: string // l'adresse de la vitrine : /boutiques/atelier-lamba
  nom: string
  accroche: string
  ville: string
  collections: { slug: string; titre: string }[]
  tarifs: TarifFictif[]
  note: number | null // sur 5; null sous trois avis (module 17)
  produits: ProduitFictif[]
}

/** Le prix « à partir de » d'un produit : le plus bas de ses variantes. */
export function prixAPartirDe(produit: ProduitFictif): number {
  return Math.min(...produit.variantes.map((variante) => variante.prix))
}

/** Le nom d'une variante, pour l'afficher : « M / Indigo ». */
export function nomVariante(variante: VarianteFictive): string {
  return Object.values(variante.options).join(' / ')
}

export const boutiquesFictives: BoutiqueFictive[] = [
  {
    id: 'b1',
    slug: 'atelier-lamba',
    nom: 'Atelier Lamba',
    accroche: 'Vêtements et étoffes tissés à Antananarivo',
    ville: 'Antananarivo',
    collections: [
      { slug: 'nouveautes', titre: 'Nouveautés' },
      { slug: 'soie', titre: 'Soie sauvage' },
    ],
    tarifs: [
      { zone: 'antananarivo', base: 3_000, parKilo: 1_000, offerteDes: 150_000 },
      { zone: 'toamasina', base: 8_000, parKilo: 2_500, offerteDes: null },
      { zone: 'fianarantsoa', base: 9_000, parKilo: 2_500, offerteDes: null },
    ],
    note: 4.7,
    produits: [
      {
        id: 'p1',
        titre: 'T-shirt en coton, motif lamba',
        description: 'Coton épais, imprimé à la main. Coupe droite, taille normalement.',
        statut: 'ACTIVE',
        collections: ['nouveautes'],
        options: [
          { nom: 'Taille', valeurs: ['S', 'M', 'L'] },
          { nom: 'Couleur', valeurs: ['Blanc', 'Indigo'] },
        ],
        variantes: [
          { id: 'v1', options: { Taille: 'S', Couleur: 'Blanc' }, prix: 45_000, prixBarre: null, disponible: true, stock: 4 },
          { id: 'v2', options: { Taille: 'S', Couleur: 'Indigo' }, prix: 45_000, prixBarre: null, disponible: false, stock: 0 },
          { id: 'v3', options: { Taille: 'M', Couleur: 'Blanc' }, prix: 45_000, prixBarre: null, disponible: true, stock: 7 },
          { id: 'v4', options: { Taille: 'M', Couleur: 'Indigo' }, prix: 45_000, prixBarre: null, disponible: true, stock: 2 },
          { id: 'v5', options: { Taille: 'L', Couleur: 'Blanc' }, prix: 48_000, prixBarre: null, disponible: true, stock: 5 },
          { id: 'v6', options: { Taille: 'L', Couleur: 'Indigo' }, prix: 48_000, prixBarre: null, disponible: true, stock: 3 },
        ],
      },
      {
        id: 'p2',
        titre: 'Lamba en soie sauvage',
        description: 'Tissé sur métier traditionnel, teint aux écorces. Chaque pièce est unique.',
        statut: 'ACTIVE',
        collections: ['soie'],
        options: [{ nom: 'Couleur', valeurs: ['Ocre', 'Bordeaux'] }],
        variantes: [
          { id: 'v7', options: { Couleur: 'Ocre' }, prix: 120_000, prixBarre: 150_000, disponible: true, stock: 1 },
          { id: 'v8', options: { Couleur: 'Bordeaux' }, prix: 120_000, prixBarre: 150_000, disponible: true, stock: 2 },
        ],
      },
      {
        id: 'p7',
        titre: 'Lamba hoany imprimé',
        description: 'Coton léger imprimé, avec son ohabolana. 1,70 m sur 1,10 m.',
        statut: 'ACTIVE',
        collections: ['nouveautes'],
        options: [],
        variantes: [{ id: 'v16', options: {}, prix: 30_000, prixBarre: null, disponible: false, stock: 0 }],
      },
      {
        id: 'p8',
        titre: 'Chemise en lin, col officier',
        description: 'Lin lavé, boutons en corne. Coupe ample.',
        statut: 'ACTIVE',
        collections: ['nouveautes'],
        options: [{ nom: 'Taille', valeurs: ['M', 'L'] }],
        variantes: [
          { id: 'v17', options: { Taille: 'M' }, prix: 58_000, prixBarre: 65_000, disponible: true, stock: 3 },
          { id: 'v18', options: { Taille: 'L' }, prix: 58_000, prixBarre: 65_000, disponible: true, stock: 2 },
        ],
      },
      {
        id: 'p9',
        titre: 'Nappe brodée au point de croix',
        description: 'Coton écru, brodée à la main à Arivonimamo. 150 cm sur 220 cm.',
        statut: 'ACTIVE',
        collections: [],
        options: [],
        variantes: [{ id: 'v19', options: {}, prix: 80_000, prixBarre: null, disponible: true, stock: 2 }],
      },
      {
        id: 'p10',
        titre: 'Housse de coussin brodée',
        description: 'Soie et coton, 45 cm sur 45 cm. Coussin non fourni.',
        statut: 'ACTIVE',
        collections: [],
        options: [{ nom: 'Couleur', valeurs: ['Écru', 'Bordeaux'] }],
        variantes: [
          { id: 'v20', options: { Couleur: 'Écru' }, prix: 25_000, prixBarre: null, disponible: true, stock: 6 },
          { id: 'v21', options: { Couleur: 'Bordeaux' }, prix: 25_000, prixBarre: null, disponible: true, stock: 4 },
        ],
      },
      {
        id: 'p3',
        titre: 'Foulard en soie, petit format',
        description: 'Soie sauvage, 50 cm sur 50 cm.',
        statut: 'DRAFT',
        collections: [],
        options: [],
        variantes: [{ id: 'v9', options: {}, prix: 35_000, prixBarre: null, disponible: true, stock: 10 }],
      },
    ],
  },
  {
    id: 'b2',
    slug: 'vanille-de-sava',
    nom: 'Vanille de Sava',
    accroche: 'Épices et vanille, en direct des producteurs',
    ville: 'Sambava',
    collections: [{ slug: 'epices', titre: 'Épices' }],
    tarifs: [
      { zone: 'antananarivo', base: 5_000, parKilo: 1_500, offerteDes: 100_000 },
      { zone: 'antsiranana', base: 4_000, parKilo: 1_000, offerteDes: 80_000 },
      { zone: 'mahajanga', base: 7_000, parKilo: 2_000, offerteDes: null },
      { zone: 'toliara', base: 12_000, parKilo: 4_000, offerteDes: null },
    ],
    note: null,
    produits: [
      {
        id: 'p4',
        titre: 'Vanille Bourbon, gousses',
        description: 'Gousses noires et souples, récolte de l’année. Sachet sous vide.',
        statut: 'ACTIVE',
        collections: ['epices'],
        options: [{ nom: 'Poids', valeurs: ['50 g', '100 g', '250 g'] }],
        variantes: [
          { id: 'v10', options: { Poids: '50 g' }, prix: 38_000, prixBarre: null, disponible: true, stock: 40 },
          { id: 'v11', options: { Poids: '100 g' }, prix: 72_000, prixBarre: null, disponible: true, stock: 25 },
          { id: 'v12', options: { Poids: '250 g' }, prix: 170_000, prixBarre: 190_000, disponible: true, stock: 6 },
        ],
      },
      {
        id: 'p5',
        titre: 'Poivre sauvage voatsiperifery',
        description: 'Cueilli en forêt, séché au soleil. Pot de 40 g.',
        statut: 'ACTIVE',
        collections: ['epices'],
        options: [],
        variantes: [{ id: 'v13', options: {}, prix: 22_000, prixBarre: null, disponible: false, stock: 0 }],
      },
    ],
  },
  {
    id: 'b3',
    slug: 'raphia-et-cie',
    nom: 'Raphia et Cie',
    accroche: 'Paniers, sacs et chapeaux tressés à la main',
    ville: 'Antsirabe',
    collections: [],
    tarifs: [{ zone: 'antananarivo', base: 4_000, parKilo: 1_000, offerteDes: null }],
    note: 4.2,
    produits: [
      {
        id: 'p6',
        titre: 'Panier de marché en raphia',
        description: 'Anses en cuir, fond renforcé. Environ 40 cm de large.',
        statut: 'ACTIVE',
        collections: [],
        options: [{ nom: 'Couleur', valeurs: ['Naturel', 'Rayé'] }],
        variantes: [
          { id: 'v14', options: { Couleur: 'Naturel' }, prix: 32_000, prixBarre: null, disponible: true, stock: 8 },
          { id: 'v15', options: { Couleur: 'Rayé' }, prix: 35_000, prixBarre: null, disponible: true, stock: 3 },
        ],
      },
    ],
  },
]

/** Un panier, tel que l'interface le garde : des variantes et des quantités, jamais de prix. */
export const panierFictif: { boutique: string; lignes: { varianteId: string; quantite: number }[] } = {
  boutique: 'atelier-lamba',
  lignes: [
    { varianteId: 'v3', quantite: 2 },
    { varianteId: 'v7', quantite: 1 },
  ],
}

export type StatutCommande = 'PENDING_PAYMENT' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'EXPIRED'

/** Le libellé d'un statut, le même partout dans l'application. */
export const libellesStatut: Record<StatutCommande, string> = {
  PENDING_PAYMENT: 'En attente de paiement',
  PAID: 'Payée',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  EXPIRED: 'Expirée',
}

export type CommandeFictive = {
  id: string
  boutique: string
  statut: StatutCommande
  passeeLe: string // un instant ISO 8601
  client: string // le prénom seulement
  adresse: string
  zone: string
  lignes: { titre: string; variante: string; prixUnitaire: number; quantite: number }[]
  sousTotal: number
  reduction: number
  fraisLivraison: number
  total: number
  transporteur: string | null
  numeroDeSuivi: string | null
}

export const commandesFictives: CommandeFictive[] = [
  {
    id: 'c1',
    boutique: 'atelier-lamba',
    statut: 'SHIPPED',
    passeeLe: '2030-07-14T07:42:00.000Z',
    client: 'Fara',
    adresse: 'Lot IVG 45, Behoririka, Antananarivo',
    zone: 'antananarivo',
    lignes: [
      { titre: 'T-shirt en coton, motif lamba', variante: 'M / Blanc', prixUnitaire: 45_000, quantite: 2 },
      { titre: 'Lamba en soie sauvage', variante: 'Ocre', prixUnitaire: 120_000, quantite: 1 },
    ],
    sousTotal: 210_000,
    reduction: 21_000,
    fraisLivraison: 0,
    total: 189_000,
    transporteur: 'Colis Express',
    numeroDeSuivi: 'CE-2030-77841',
  },
  {
    id: 'c2',
    boutique: 'atelier-lamba',
    statut: 'PAID',
    passeeLe: '2030-07-15T05:10:00.000Z',
    client: 'Njaka',
    adresse: 'Rue Pasteur 12, Toamasina',
    zone: 'toamasina',
    lignes: [{ titre: 'T-shirt en coton, motif lamba', variante: 'L / Indigo', prixUnitaire: 48_000, quantite: 1 }],
    sousTotal: 48_000,
    reduction: 0,
    fraisLivraison: 8_000,
    total: 56_000,
    transporteur: null,
    numeroDeSuivi: null,
  },
]
