/**
 * Module 2 : Architecture, le schéma.
 *
 * Ces vérifications lisent votre dépôt sans exécuter de code : présence d'une
 * migration versionnée, contraintes déclarées, types des colonnes d'argent, de
 * stock et d'instant.
 *
 * Contrat attendu, exporté par `src/academie/module-2.ts` :
 *
 *   export const schema: {
 *     migrationsDir: string          // ex. 'migrations', relatif à la racine
 *     tables: {
 *       account: string              // le nom RÉEL de vos tables,
 *       shop: string                 // quel qu'il soit
 *       product: string
 *       variant: string
 *       order: string
 *       orderLine: string
 *     }
 *     shopSlugColumn: string         // ex. 'boutiques.slug'
 *     moneyColumns: string[]         // ex. ['variantes.prix', 'commandes.total']
 *     lineUnitPriceColumn: string    // ex. 'lignes_de_commande.prix_unitaire'
 *     stockColumn: string            // ex. 'variantes.stock'
 *     weightColumn: string           // ex. 'variantes.poids_grammes'
 *     instantColumns: string[]       // ex. ['commandes.passee_le', 'comptes.cree_le']
 *   }
 *
 * Vous nommez vos tables et vos colonnes comme vous voulez : la suite lit ce
 * que vous déclarez ici. Elle vérifie que ces objets existent vraiment dans vos
 * migrations et qu'ils ont le bon type.
 *
 * Tout ce qu'une boutique possède désigne sa boutique (décision 0001) : la
 * boutique désigne son propriétaire, le produit sa boutique, la variante son
 * produit, la commande sa boutique et son client. Le slug d'une boutique est
 * unique sur toute la plateforme, et c'est la base qui le garantit.
 *
 * Une ligne de commande désigne sa commande et sa variante, et garde **son
 * propre prix unitaire** : le prix au moment de la commande (décision 0002).
 *
 * Un montant, un stock et un poids sont des entiers, `integer` ou `bigint`. Le
 * stock porte une contrainte `check` qui le garde positif ou nul : c'est la
 * base elle-même qui refusera de vendre un article qu'elle n'a plus, au
 * module 12. Un instant, comme le moment d'une commande, est un `timestamptz` :
 * il garde un point précis dans le temps, quel que soit le fuseau horaire du
 * serveur.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { schema } from '../../../src/academie/module-2'

function migrationsSql(): string {
  const dir = join(process.cwd(), schema.migrationsDir)
  expect(existsSync(dir), `dossier de migrations introuvable : ${schema.migrationsDir}`).toBe(
    true,
  )

  const files = readdirSync(dir).filter((name) => name.endsWith('.sql'))
  expect(files.length, `aucune migration .sql dans ${schema.migrationsDir}/`).toBeGreaterThan(
    0,
  )

  return files
    .sort()
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n')
    .toLowerCase()
}

/** Les mots qui suivent le type d'une colonne dans sa déclaration. */
const AFTER_TYPE =
  /\s+(?:not|null|default|references|check|primary|unique|generated|constraint|collate)\b|\s*$/

const CREATE_TABLE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:[\w"]+\.)?"?(\w+)"?\s*\(/g

/** Le nom d'une table, sans schéma ni guillemets. */
function bare(name: string) {
  return name.toLowerCase().replace(/"/g, '').split('.').at(-1) ?? ''
}

/** Le contenu des parenthèses de chaque `create table … (…)`, par nom de table. */
function tableBodies(sql: string) {
  const bodies: { table: string; body: string }[] = []
  for (const start of sql.matchAll(CREATE_TABLE)) {
    let depth = 1
    let index = (start.index ?? 0) + start[0].length
    const from = index
    for (; index < sql.length && depth > 0; index += 1) {
      if (sql[index] === '(') depth += 1
      if (sql[index] === ')') depth -= 1
    }
    bodies.push({ table: start[1] ?? '', body: sql.slice(from, index - 1) })
  }
  return bodies
}

function bodyOf(sql: string, table: string) {
  return tableBodies(sql)
    .filter((entry) => entry.table === bare(table))
    .map((entry) => entry.body)
    .join('\n')
}

/** Les définitions séparées par des virgules, hors des parenthèses. */
function definitions(body: string) {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const character of body) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (character === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += character
  }
  parts.push(current)
  return parts.map((part) => part.replace(/--[^\n]*/g, '').trim())
}

/** Le type déclaré d'une colonne, par exemple « integer » ou « timestamp with time zone ». */
function declaredType(sql: string, reference: string) {
  const [table, column] = reference.includes('.')
    ? (reference.toLowerCase().replace(/"/g, '').split('.').slice(-2) as [string, string])
    : [undefined, reference.toLowerCase().replace(/"/g, '')]
  expect(column.length, `référence de colonne invalide : ${reference}`).toBeGreaterThan(0)

  const bodies = tableBodies(sql)
    .filter((entry) => !table || entry.table === table)
    .map((entry) => entry.body)
  const candidates = [
    ...bodies.flatMap(definitions),
    // Une colonne ajoutée plus tard par une migration `alter table … add column`.
    ...[...sql.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([^;,]+)/g)].map((match) => match[1] ?? ''),
  ]

  for (const definition of candidates) {
    const match = new RegExp(`^"?${column}"?\\s+([\\s\\S]+)$`).exec(definition.trim())
    if (!match?.[1]) continue
    const rest = match[1].trim()
    const end = AFTER_TYPE.exec(rest)
    return rest.slice(0, end?.index ?? rest.length).trim().replace(/\s+/g, ' ')
  }
  return undefined
}

describe('migration initiale', () => {
  it('déclare les six tables du domaine', () => {
    const sql = migrationsSql()
    for (const [role, table] of Object.entries(schema.tables)) {
      expect(
        sql,
        `table « ${table} » (${role}) absente des migrations`,
      ).toMatch(new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?[\\w."]*${bare(table)}\\b`))
    }
  })

  it('déclare des clés primaires et des clés étrangères', () => {
    const sql = migrationsSql()
    expect(sql).toContain('primary key')
    expect(sql).toMatch(/references|foreign key/)
  })

  it('déclare des colonnes obligatoires', () => {
    expect(migrationsSql()).toContain('not null')
  })
})

describe('chaque chose désigne sa boutique', () => {
  const links: [keyof typeof schema.tables, (keyof typeof schema.tables)[]][] = [
    ['shop', ['account']],
    ['product', ['shop']],
    ['variant', ['product']],
    ['order', ['shop', 'account']],
    ['orderLine', ['order', 'variant']],
  ]

  for (const [from, targets] of links) {
    it(`rattache « ${from} » à ${targets.join(' et à ')} par une clé étrangère`, () => {
      const table = schema.tables[from]
      const body = bodyOf(migrationsSql(), table)
      expect(body, `table « ${table} » introuvable dans les migrations`).not.toBe('')
      for (const target of targets) {
        expect(
          body,
          `la table « ${table} » doit désigner « ${schema.tables[target]} » par une clé étrangère`,
        ).toMatch(new RegExp(`references\\s+(?:[\\w"]+\\.)?"?${bare(schema.tables[target])}"?\\b`))
      }
    })
  }

  // Deux boutiques ne partagent jamais une adresse : la base le garantit, pas le code.
  it('rend le slug d’une boutique unique, par une contrainte de la base', () => {
    const sql = migrationsSql()
    const [table = '', column = ''] = schema.shopSlugColumn.toLowerCase().replace(/"/g, '').split('.').slice(-2)
    expect(table, 'shopSlugColumn s’écrit table.colonne, dans la table des boutiques').toBe(bare(schema.tables.shop))
    expect(declaredType(sql, schema.shopSlugColumn), `colonne « ${schema.shopSlugColumn} » introuvable`).toBeDefined()

    const inline = definitions(bodyOf(sql, table)).some((definition) =>
      new RegExp(`^"?${column}"?\\s[^]*\\bunique\\b`).test(definition),
    )
    const tableConstraint = new RegExp(`unique\\s*\\(\\s*"?${column}"?\\s*\\)`).test(bodyOf(sql, table))
    const index = new RegExp(
      `create\\s+unique\\s+index[^;]*\\son\\s+(?:[\\w"]+\\.)?"?${table}"?\\s*(?:using\\s+\\w+\\s*)?\\(\\s*(?:lower\\s*\\(\\s*)?"?${column}"?`,
    ).test(sql)
    expect(inline || tableConstraint || index, `« ${schema.shopSlugColumn} » doit porter une contrainte unique`).toBe(true)
  })
})

describe('l’argent, le stock et le poids', () => {
  it('déclare au moins deux colonnes de montant', () => {
    expect(schema.moneyColumns.length, 'le prix d’une variante et le total d’une commande, au moins').toBeGreaterThanOrEqual(2)
  })

  it('range chaque montant, le stock et le poids dans une colonne entière', () => {
    const sql = migrationsSql()
    for (const reference of [...schema.moneyColumns, schema.lineUnitPriceColumn, schema.stockColumn, schema.weightColumn]) {
      const type = declaredType(sql, reference)
      expect(type, `colonne « ${reference} » introuvable dans les migrations`).toBeDefined()
      expect(
        /^(integer|int|int4|bigint|int8)$/.test(type ?? ''),
        `« ${reference} » doit être un integer ou un bigint, pas ${type} : l’ariary n’a pas de centimes, et un stock se compte en unités`,
      ).toBe(true)
    }
  })

  // Le prix figé : copié dans la ligne au moment de la commande.
  it('garde le prix unitaire dans la ligne de commande elle-même', () => {
    const [table = ''] = schema.lineUnitPriceColumn.toLowerCase().replace(/"/g, '').split('.').slice(-2)
    expect(
      table,
      'lineUnitPriceColumn doit être une colonne de la table des lignes de commande, sous la forme table.colonne',
    ).toBe(bare(schema.tables.orderLine))
  })

  // Le garde-fou du module 12 : la base refuse un stock négatif.
  it('empêche le stock de descendre sous zéro, par une contrainte check', () => {
    const sql = migrationsSql()
    const [table = '', column = ''] = schema.stockColumn.toLowerCase().replace(/"/g, '').split('.').slice(-2)
    expect(table, 'stockColumn s’écrit table.colonne, dans la table des variantes').toBe(bare(schema.tables.variant))
    expect(
      sql,
      `ajoutez check (${column} >= 0) à la colonne « ${schema.stockColumn} »`,
    ).toMatch(new RegExp(`check\\s*\\(\\s*\\(?\\s*"?${column}"?\\s*>=\\s*0\\s*\\)?\\s*\\)`))
  })
})

describe('les instants', () => {
  it('déclare au moins une colonne d’instant', () => {
    expect(
      schema.instantColumns.length,
      'déclarez vos colonnes d’instant dans schema.instantColumns',
    ).toBeGreaterThan(0)
  })

  it('range les instants en timestamptz, jamais sans fuseau', () => {
    const sql = migrationsSql()
    for (const reference of schema.instantColumns) {
      const type = declaredType(sql, reference)
      expect(
        type,
        `colonne « ${reference} » introuvable dans les migrations`,
      ).toBeDefined()
      expect(
        /^(timestamptz|timestamp with time zone)$/.test(type ?? ''),
        `la colonne « ${reference} » doit être un timestamptz, pas ${type}`,
      ).toBe(true)
    }
  })
})
