/**
 * Module 2 : Architecture, une journée à Madagascar.
 *
 * Un instant se range en UTC; une journée se compte à l'heure de Madagascar,
 * UTC+3, sans heure d'été (décision 0006). Au module 11, un code de réduction
 * sera valable d'une date à une autre, bornes comprises : du 1er juillet à
 * 0 h 00 au 31 juillet à 23 h 59, heure d'Antananarivo.
 *
 * Contrat attendu, exporté par `src/academie/module-2.ts` :
 *
 *   export function madagascarDate(instant: string): string
 *                     // 'AAAA-MM-JJ' : la date à Madagascar à cet instant ISO 8601
 *
 *   export function isWithinPeriod(input: {
 *     startsOn: string            // 'AAAA-MM-JJ', premier jour compris
 *     endsOn: string | null       // 'AAAA-MM-JJ', dernier jour compris; null : sans fin
 *     at: string                  // un instant ISO 8601
 *   }): boolean
 *
 * Le calcul ne dépend pas du fuseau de la machine qui l'exécute.
 */
import { describe, expect, it } from 'vitest'
import { isWithinPeriod, madagascarDate } from '../../../src/academie/module-2'

describe('la date à Madagascar', () => {
  it('donne la date du jour pour un instant en pleine journée', () => {
    expect(madagascarDate('2030-07-10T06:00:00.000Z')).toBe('2030-07-10')
  })

  // 20 h 59 UTC, c'est 23 h 59 à Antananarivo : encore le 10 juillet.
  it('range 23 h 59, heure de Madagascar, dans le jour même', () => {
    expect(madagascarDate('2030-07-10T20:59:00.000Z')).toBe('2030-07-10')
  })

  // 21 h 00 UTC, c'est minuit à Antananarivo : déjà le 11 juillet.
  it('range minuit, heure de Madagascar, dans le lendemain', () => {
    expect(madagascarDate('2030-07-10T21:00:00.000Z')).toBe('2030-07-11')
  })

  it('lit un instant écrit avec un autre décalage horaire', () => {
    expect(madagascarDate('2030-07-11T01:30:00+03:00')).toBe('2030-07-11')
    expect(madagascarDate('2030-07-10T23:30:00+02:00')).toBe('2030-07-11')
  })

  it('passe d’une année à l’autre', () => {
    expect(madagascarDate('2030-12-31T21:30:00.000Z')).toBe('2031-01-01')
  })
})

describe('une période de validité', () => {
  const july = { startsOn: '2030-07-01', endsOn: '2030-07-31' }

  it('commence à minuit, heure de Madagascar, le premier jour', () => {
    expect(isWithinPeriod({ ...july, at: '2030-06-30T20:59:00.000Z' }), 'le 30 juin à 23 h 59').toBe(false)
    expect(isWithinPeriod({ ...july, at: '2030-06-30T21:00:00.000Z' }), 'le 1er juillet à minuit').toBe(true)
  })

  it('finit à 23 h 59, heure de Madagascar, le dernier jour compris', () => {
    expect(isWithinPeriod({ ...july, at: '2030-07-31T20:59:00.000Z' }), 'le 31 juillet à 23 h 59').toBe(true)
    expect(isWithinPeriod({ ...july, at: '2030-07-31T21:00:00.000Z' }), 'le 1er août à minuit').toBe(false)
  })

  it('vaut pour un seul jour quand il commence et finit le même jour', () => {
    const day = { startsOn: '2030-07-14', endsOn: '2030-07-14' }
    expect(isWithinPeriod({ ...day, at: '2030-07-14T12:00:00.000Z' })).toBe(true)
    expect(isWithinPeriod({ ...day, at: '2030-07-15T12:00:00.000Z' })).toBe(false)
  })

  it('n’a pas de fin quand endsOn est null', () => {
    const open = { startsOn: '2030-07-01', endsOn: null }
    expect(isWithinPeriod({ ...open, at: '2034-01-01T12:00:00.000Z' })).toBe(true)
    expect(isWithinPeriod({ ...open, at: '2030-06-15T12:00:00.000Z' })).toBe(false)
  })
})
