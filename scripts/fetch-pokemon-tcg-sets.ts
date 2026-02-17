/**
 * Query the Pokémon TCG API for ALL sets — no guessing, no default list.
 * GET https://api.pokemontcg.io/v2/sets (paginated), then write response to JSON.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const API_BASE = 'https://api.pokemontcg.io/v2'
const PAGE_SIZE = 250

type SetItem = { id: string; name: string }

function normalizeKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Query API for all sets (all pages). Returns list from API only; no fallback. */
async function queryAllSetsFromApi(headers: Record<string, string>): Promise<SetItem[]> {
  const sets: SetItem[] = []
  let page = 1
  while (true) {
    const url = `${API_BASE}/sets?page=${page}&pageSize=${PAGE_SIZE}`
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    const list = (data.data ?? []).filter((s: any) => s.id && s.name).map((s: any) => ({ id: s.id, name: s.name }))
    sets.push(...list)
    const total = data.totalCount ?? data.count ?? 0
    if (list.length < PAGE_SIZE || (total > 0 && sets.length >= total)) break
    page++
  }
  return sets
}

async function main() {
  const bearerToken = (process.env.POKEMON_TCG_BEARER || '').trim()
  const apiKey = (process.env.POKEMON_TCG_API_KEY || process.env.POKEDATA_TCG_API || process.env.POKEDATA_API_KEY || '').trim()

  const authAttempts: Record<string, string>[] = []
  if (bearerToken) {
    authAttempts.push({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${bearerToken}` })
  }
  if (apiKey) {
    authAttempts.push({ 'Content-Type': 'application/json', 'X-Api-Key': apiKey })
    if (!bearerToken) authAttempts.push({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` })
  }
  if (authAttempts.length === 0) {
    throw new Error('Set POKEMON_TCG_BEARER or POKEMON_TCG_API_KEY in server/.env')
  }

  let sets: SetItem[] = []
  for (let i = 0; i < authAttempts.length; i++) {
    const headers = authAttempts[i]
    const label = headers['Authorization'] ? 'Bearer' : headers['X-Api-Key'] ? 'X-Api-Key' : 'no auth'
    console.log('Querying GET', API_BASE + '/sets', `(${label})...`)
    try {
      sets = await queryAllSetsFromApi(headers)
      if (sets.length > 0) {
        console.log('Got', sets.length, 'sets from API.')
        break
      }
    } catch (e: any) {
      if (i === authAttempts.length - 1) throw e
      console.warn('Attempt failed:', e.message)
    }
  }

  if (sets.length === 0) {
    throw new Error('API returned no sets. Add a valid key from https://dev.pokemontcg.io/ as POKEMON_TCG_API_KEY in server/.env')
  }

  const byName: Record<string, string> = {}
  for (const s of sets) {
    const key = normalizeKey(s.name)
    if (!byName[key]) byName[key] = s.id
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    count: sets.length,
    sets,
    nameToId: byName,
  }

  const path = require('path')
  const fs = require('fs')
  const serverPath = path.join(__dirname, '../src/pokedata/pokemonTcgSets.json')
  const appPath = path.join(__dirname, '../../app/src/utils/pokemonTcgSets.json')
  fs.mkdirSync(path.dirname(serverPath), { recursive: true })
  fs.mkdirSync(path.dirname(appPath), { recursive: true })
  fs.writeFileSync(serverPath, JSON.stringify(output, null, 2), 'utf8')
  fs.writeFileSync(appPath, JSON.stringify(output, null, 2), 'utf8')
  console.log('Wrote', serverPath)
  console.log('Wrote', appPath)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
