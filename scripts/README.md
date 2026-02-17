# Scripts

## fetch-pokemon-tcg-sets.ts

Fetches the **official set list** from the Pokémon TCG API (v2) so card image URLs use the correct set ids for `images.pokemontcg.io`.

- **Docs:** [Search sets](https://docs.pokemontcg.io/api-reference/sets/search-sets), [Set object](https://docs.pokemontcg.io/api-reference/sets/set-object)
- **Image URL format:** `https://images.pokemontcg.io/{setId}/{number}_hires.png` — `setId` must match the API’s set `id`.

**Run from repo root:**

```bash
cd server
pnpm run fetch-tcg-sets
# or: npx tsx scripts/fetch-pokemon-tcg-sets.ts
```

If you get **404**, get an API key from [dev.pokemontcg.io](https://dev.pokemontcg.io/) and run:

```bash
POKEMON_TCG_API_KEY=yourkey pnpm run fetch-tcg-sets
```

The script writes:

- `server/src/pokedata/pokemonTcgSets.json`
- `app/src/utils/pokemonTcgSets.json`

Both app and server use `nameToId` from that file when present, so set names resolve to the official API set id. Sets not yet in the API (e.g. Ascended Heroes, Phantasmal Flames) stay in the static maps in `setCodeMap.ts` / `pokemonTcgSetCodes.ts` and in `SET_CODES_NOT_ON_CDN` so we use the Pokedata API image or a placeholder instead of a 404.
