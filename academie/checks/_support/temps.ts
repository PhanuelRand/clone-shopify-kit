/**
 * Des instants et des noms pour les suites de vérification.
 *
 * Les suites passent des instants fixés en 2030, ou l'instant présent : une
 * commande d'essai ne doit pas expirer parce que la vérification tourne
 * lentement, et un code de réduction ne doit pas dépendre du jour où elle
 * tourne.
 *
 * Ce fichier fait partie du harnais.
 */

/**
 * L'instant, en UTC, qui correspond à cette date et à cette heure à
 * Madagascar. Madagascar a trois heures d'avance sur UTC, sans heure d'été.
 *
 *   inMadagascar('2030-07-15', '12:00')  ->  '2030-07-15T09:00:00.000Z'
 */
export function inMadagascar(date: string, time: string) {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return new Date(Date.UTC(year, month - 1, day, hours - 3, minutes)).toISOString()
}

/** L'instant présent, décalé de `minutes` minutes. */
export function inMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

/**
 * Un slug de boutique qu'aucune autre suite n'emploie : des minuscules, des
 * chiffres et des tirets, 40 caractères au plus (décision 0001).
 */
export function uniqueSlug(label: string) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  return `${label.slice(0, 40 - suffix.length - 1)}-${suffix}`
}
