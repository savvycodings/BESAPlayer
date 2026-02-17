# Card module: the two APIs, profile save flow, and card_prices table

This doc explains how the **two APIs** (Pokémon TCG and Pokedata) are used in the card module, how the **profile page** saves and displays cards, how the **card_prices** table is filled, and how everything interacts.

---

## 1. The two APIs

### API 1: Pokémon TCG (set list + card images)

| What | Details |
|------|--------|
| **Purpose** | Set list (names + official set codes) and card artwork URLs. |
| **Set list** | `GET https://api.pokemontcg.io/v2/sets` (paginated). Requires `POKEMON_TCG_BEARER` or `POKEMON_TCG_API_KEY` in `server/.env`. |
| **Script** | `server/scripts/fetch-pokemon-tcg-sets.ts` — fetches all sets, writes `server/src/pokedata/pokemonTcgSets.json` and `app/src/utils/pokemonTcgSets.json`. |
| **JSON shape** | `{ fetchedAt, count, sets: [ { id, name } ], nameToId }`. `id` = official set code (e.g. `zsv10pt5`, `sv8pt5`). `nameToId` = normalized set name → `id`. |
| **Card images** | No API call at runtime. URLs are **built** as: `https://images.pokemontcg.io/{setCode}/{number}_hires.png`. Set code comes only from our JSON (see setCodeMap). |

**Who uses it**

- **Server:** `setCodeMap.ts` loads `pokemonTcgSets.json` and exposes `setToSetCode(setName)` → returns API set code. Used to build image URLs and to store the correct `setId` in `card_prices`.
- **App:** Same JSON for the Set dropdown in Add Card and for `getPokemonTcgImageUrlFromSetNumber(set, cardNumber)` so the preview and saved image URL use the correct code.

**Summary:** Pokémon TCG gives us the **authoritative set list and set codes**. We do **not** use any Pokedata set code for images; we only use our list (`pokemonTcgSets.json`).

---

### API 2: Pokedata (pricing only)

| What | Details |
|------|--------|
| **Purpose** | **Pricing and history only**: market price (e.g. TCGPlayer), eBay last sold, plus metadata used to *look up* our set code. |
| **Endpoint** | Pokedata pricing API (used via `pokedataClient.getCardPricing(id, assetType)` in `server/src/pokedata/client.ts`). |
| **Returns** | Pricing (marketPrice, ebayLastSold), plus `set_name`, `num`/`number` (card number), `card name`, etc. We **do not** use Pokedata’s `set_code` or `set_id` for building URLs or for DB. |

**Who uses it**

- **Server:** `lookup.ts` → `getCardLookupOrFetch(cardId, assetType)`:
  - Calls Pokedata to get **pricing** and **set name** + **card number**.
  - Resolves **set code** only via our list: `setToSetCode(setName)` from `setCodeMap.ts` (which uses `pokemonTcgSets.json`).
  - Builds image URL as `https://images.pokemontcg.io/{resolvedSetCode}/{cardNumber}_hires.png`.
  - Writes/updates the **card_prices** row (see below).

**Summary:** Pokedata = **pricing (and set name + number for our lookups)**. Set code and image URL come only from our set list, not from Pokedata.

---

## 2. How the profile page saves a card

1. **User fills Add Card (profile)**  
   - Type (card/sealed/slab), name, **Set** (dropdown from `pokemonTcgSets.json`), **card number**, optional cardId from “Look up card”, etc.

2. **Image for cards**  
   - Preview: app builds URL with `getPokemonTcgImageUrlFromSetNumber(set, cardNumber)` (using app’s set list).  
   - On submit, for type `card` the app sends **image** = that same TCG URL (e.g. `https://images.pokemontcg.io/zsv10pt5/172_hires.png`). No Pokedata image URL is used here.

3. **POST /api/profile/collections**  
   - Body: `type`, `name`, `set`, `cardNumber`, `image` (TCG URL for cards), `cardId` (if from lookup), etc.  
   - Server inserts into **collections**: `userId`, `type`, `name`, `set`, `cardNumber`, `image`, `cardId`, …

4. **After saving the collection row**  
   - If `cardId` is present, server **primes the price cache**: calls `getCardLookupOrFetch(cardId, 'CARD'|'SEALED')`.  
   - That triggers a Pokedata call (if cache miss or stale), then **fills/updates `card_prices`** (see below). So the next time the profile loads, it already has market price and image URL from `card_prices` for that card.

So on the profile page, **saving** = one row in **collections** (with image from our set list for cards) and, when `cardId` is set, one row (or update) in **card_prices** keyed by that `cardId`.

---

## 3. The card_prices table (what it is and who sets it)

**Table:** `card_prices` (see `server/src/db/schema.ts`).

| Column | Meaning | Who sets it |
|--------|--------|-------------|
| `id` | Pokedata card ID (primary key). | Set when we insert/update from `getCardLookupOrFetch(id, …)`. |
| `card_name` | Card name. | From Pokedata response. |
| `set_name` | Set name (e.g. "Black Bolt"). | From Pokedata response (`set_name` / `setName`). |
| `set_id` | **Our** API set code (e.g. `zsv10pt5`). For images only. | **Only** from our list: `setToSetCode(setName)` in `lookup.ts`. Not from Pokedata. |
| `card_number` | Card number in set (e.g. 172). | From Pokedata (`num` / `number`). |
| `image_url` | Full card image URL. | Built as `https://images.pokemontcg.io/{set_id}/{card_number}_hires.png` using **our** `set_id` (and optional Pokedata `image_url` if we ever use it). |
| `market_price` | Market price (e.g. TCGPlayer). | From Pokedata. |
| `ebay_last_sold` | eBay last sold. | From Pokedata. |
| `currency` | e.g. USD. | From our side (USD). |
| `last_fetched_at` | When we last called Pokedata for this id. | Set on insert/update in `getCardLookupOrFetch`. |

**Only writer:** `getCardLookupOrFetch()` in `server/src/pokedata/lookup.ts`:

- Called when:
  - Profile “Add Card” includes a `cardId` (prime cache after save), or
  - Any code needs price/card info by Pokedata id (e.g. GET /pokedata/card/:id).
- Uses **Pokedata** for: pricing, `set_name`, card number, card name.
- Uses **our list** (`pokemonTcgSets.json` via `setToSetCode(setName)`) for: `set_id` and `image_url`.
- Inserts or updates the row (upsert by `id`). Cache TTL 48h so we don’t hit Pokedata every time.

So: **Pokedata** holds pricing (and set name + number); **we** hold set codes and image URLs; **card_prices** stores both, with set code and image coming from our list only.

---

## 4. How the profile page shows cards (GET collections)

1. **GET /api/profile/collections**  
   - Loads user’s **collections** (name, set, cardNumber, image, cardId, …).

2. **Enrichment from card_prices**  
   - For each collection that has a `cardId`, the server looks up **card_prices** by that `cardId`.  
   - It adds to the response:
     - `marketPrice`, `ebayLastSold` from `card_prices`.
     - `cardImageUrl`: prefers `card_prices.imageUrl`; if missing, builds URL with `buildImageUrl(setForImage, cardNumForImage)` using `setToSetCode(collection.set || prices.setId)` so the image always uses our set list.

3. **What the profile shows**  
   - For each card: name, set, image (`cardImageUrl`), market price, eBay last sold.  
   - Image comes from either:
     - **collections.image** (what we saved on Add Card: TCG URL from our list), or  
     - **card_prices.image_url** (built when we filled card_prices from Pokedata + our set list), or  
     - A URL built on the fly from collection set + number using our set list.

So on the profile, **display** uses **collections** plus **card_prices**; both image sources ultimately use **our** set codes from `pokemonTcgSets.json`, never Pokedata set codes.

---

## 5. How the two APIs and the table interact (summary)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  POKÉMON TCG (api.pokemontcg.io + images.pokemontcg.io)                      │
│  • Set list → pokemonTcgSets.json (id + name, nameToId).                      │
│  • Set codes and image URLs come ONLY from this list (setCodeMap / app).      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  POKEDATA API                                                                │
│  • Pricing (marketPrice, ebayLastSold).                                      │
│  • Set name + card number (+ card name) → we use these to look up our code.  │
│  • We do NOT use Pokedata set_code/set_id for DB or images.                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
┌──────────────────────────────┐     ┌──────────────────────────────────────┐
│  collections (profile)        │     │  card_prices (cache by Pokedata id)  │
│  • userId, type, name,       │     │  • id = Pokedata card id              │
│  • set, cardNumber, image,   │     │  • set_name, card_number from Pokedata│
│  • cardId (links to prices)  │     │  • set_id, image_url from OUR list   │
│  • image = TCG URL from our  │     │  • market_price, ebay_last_sold from │
│    list (for cards)          │     │    Pokedata                           │
└──────────────────────────────┘     └──────────────────────────────────────┘
                    │                                   │
                    └─────────────────┬─────────────────┘
                                      ▼
                    GET /api/profile/collections merges both:
                    • Market price / eBay from card_prices.
                    • cardImageUrl from card_prices.image_url or built from our list.
```

- **Pokémon TCG** = set list + set codes; we use it to build and store correct image URLs and `set_id`.  
- **Pokedata** = pricing (and set name + number we use only to resolve to our set code).  
- **card_prices** = per–Pokedata-card-id cache: Pokedata provides pricing and set name/number; we provide set code and image URL from our list.  
- **Profile** = saves to **collections** (with TCG image from our list) and primes **card_prices** when `cardId` is set; when loading, it enriches collections from **card_prices** so prices and images stay in sync with our set list.
