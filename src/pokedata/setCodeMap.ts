/**
 * Map Pokedata set names / set IDs to images.pokemontcg.io set codes.
 * Must stay in sync with app/src/utils/pokemonTcgSetCodes.ts for consistency.
 */

const SET_NAME_TO_CODE: Record<string, string> = {
  'prismatic evolutions': 'sv8pt5',
  'surging sparks': 'sv8',
  'stellar crown': 'sv7',
  'twilight masquerade': 'sv6',
  'temporal forces': 'sv5',
  'paldean fates': 'sv4pt5',
  'paradox rift': 'sv4',
  'obsidian flames': 'sv3',
  'paldea evolved': 'sv2',
  'scarlet & violet': 'sv1',
  'scarlet and violet': 'sv1',
  '151': 'mew',
  'scarlet & violet—151': 'mew',
  'crown zenith': 'swsh12pt5',
  'silver tempest': 'swsh12',
  'lost origin': 'swsh11',
  'pokémon go': 'swsh11pt5',
  'astral radiance': 'swsh10',
  'brilliant stars': 'swsh9',
  'fusion strike': 'swsh8',
  'celebrations': 'swsh7',
  'evolving skies': 'swsh7pt5',
  'chilling reign': 'swsh6',
  'battle styles': 'swsh5',
  'shining fates': 'swsh4',
  'vivid voltage': 'swsh3',
  "champion's path": 'swsh3pt5',
  'darkness ablaze': 'swsh2',
  'rebel clash': 'swsh2pt5',
  'sword & shield': 'swsh1',
  'sword and shield': 'swsh1',
  'cosmic eclipse': 'sm12',
  'hidden fates': 'sm11',
  'unified minds': 'sm10',
  'unbroken bonds': 'sm9',
  'team up': 'sm8',
  'lost thunder': 'sm7',
  'dragon majesty': 'sm6',
  'celestial storm': 'sm5',
  'forbidden light': 'sm4',
  'ultra prism': 'sm3',
  'crimson invasion': 'sm2',
  'shining legends': 'sm2pt5',
  'burning shadows': 'sm2pt6',
  'guardians rising': 'sm1pt5',
  'sun & moon': 'sm1',
  'sun and moon': 'sm1',
}

const SET_ID_TO_CODE: Record<number, string> = {
  557: 'sv8pt5', // Prismatic Evolutions
}

// Pokedata short set codes -> images.pokemontcg.io set code (when API returns e.g. "PRE" not set name)
const POKEDATA_SET_CODE_TO_TCG: Record<string, string> = {
  pre: 'sv8pt5', // Prismatic Evolutions
}

function normalizeKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Resolve set name or numeric set ID to images.pokemontcg.io set code.
 */
export function setToSetCode(set: string | number | null | undefined): string | null {
  if (set == null || set === '') return null
  const str = String(set).trim()
  if (!str) return null

  const num = parseInt(str, 10)
  if (!Number.isNaN(num) && SET_ID_TO_CODE[num]) {
    return SET_ID_TO_CODE[num]
  }

  const byName = SET_NAME_TO_CODE[normalizeKey(str)]
  if (byName) return byName

  const pokedataCode = POKEDATA_SET_CODE_TO_TCG[str.toLowerCase()]
  if (pokedataCode) return pokedataCode

  if (/^[a-z0-9]+$/i.test(str) && str.length <= 12) {
    return str.toLowerCase()
  }

  return null
}
