/**
 * IMAGE SET CODES (server) — pokemonTcgSets.json only (no fallbacks).
 *
 * Card image URL format: https://images.pokemontcg.io/{setId}/{number}_hires.png
 * Set id matches the official Pokémon TCG API: https://docs.pokemontcg.io/api-reference/sets/set-object
 *
 * Run server/scripts/fetch-pokemon-tcg-sets.ts to refresh.
 */

import fs from 'fs'
import path from 'path'

type TcgSetsJson = {
  sets?: { id: string; name: string }[]
  nameToId?: Record<string, string>
}

function loadTcgSetsJson(): TcgSetsJson {
  const candidates = [
    path.join(__dirname, 'pokemonTcgSets.json'),
    path.join(__dirname, '../../src/pokedata/pokemonTcgSets.json'),
  ]
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as TcgSetsJson
    } catch {
      // try next path
    }
  }
  console.warn('[setCodeMap] pokemonTcgSets.json not found — card image URLs will be empty')
  return {}
}

let NAME_TO_ID: Record<string, string> = {}
const VALID_IDS = new Set<string>()

const data = loadTcgSetsJson()
if (data.nameToId && typeof data.nameToId === 'object') {
  NAME_TO_ID = data.nameToId
}
if (Array.isArray(data.sets)) {
  for (const s of data.sets) {
    if (s?.id) VALID_IDS.add(s.id)
  }
}

/** Set codes not on images.pokemontcg.io (empty — JSON is source of truth). */
export const SET_CODES_NOT_ON_CDN = new Set<string>([])

function normalizeKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Resolve set name or set ID to the official API set code (for images.pokemontcg.io).
 * Uses only pokemonTcgSets.json (nameToId + sets[].id).
 */
export function setToSetCode(set: string | number | null | undefined): string | null {
  if (set == null || set === '') return null
  const str = String(set).trim()
  if (!str) return null

  const key = normalizeKey(str)
  if (NAME_TO_ID[key]) return NAME_TO_ID[key]
  if (VALID_IDS.has(str)) return str
  if (VALID_IDS.has(key)) return key

  return null
}
