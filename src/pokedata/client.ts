type AssetType = "CARD" | "SEALED"
type Language = "en" | "es" | "fr" | "de" | "it" | "pt" | "ja" | "ko" | "zh"

interface PokedataCard {
  id: string
  name: string
  set: string
  number?: string
  rarity?: string
  imageUrl?: string
  // Add other fields as needed
}

interface PokedataCardPricing {
  id: string
  name: string
  pricing: {
    [marketplace: string]: {
      value: number
      currency: string
      lastUpdated?: string
    }
  }
}

interface PokedataSetValue {
  date: string
  value: number
  currency: string
}

const POKEDATA_BASE_URL = "https://www.pokedata.io/v0"

export class PokedataClient {
  private apiKey: string
  private baseUrl: string

  constructor() {
    this.apiKey = process.env.POKEDATA_API_KEY || ""
    this.baseUrl = POKEDATA_BASE_URL

    if (!this.apiKey) {
      console.warn("⚠️  POKEDATA_API_KEY not set in environment variables")
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
      ...options.headers,
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.log("[Pokedata API] Response (error):", { status: response.status, body: errorText })
        throw new Error(`Pokedata API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error("[Pokedata API] Request failed:", endpoint, error)
      throw error
    }
  }

  /**
   * Search for cards by query
   * @param query Search query (card name, set name, etc.)
   * @param assetType Type of asset to search (default: "CARD")
   * @param language Language code (optional)
   * @param limit Max results to return (default 3); we usually use the first one (after sort by card number). Extra 1–2 let user tap a different set if needed.
   * @returns Array of matching cards (at most limit)
   */
  async searchCards(
    query: string,
    assetType: AssetType = "CARD",
    language?: Language,
    limit: number = 3
  ): Promise<PokedataCard[]> {
    const params = new URLSearchParams({
      query,
      asset_type: assetType,
      ...(language && { language }),
    })
    params.set("limit", String(Math.min(limit, 20)))

    console.log(`[Pokedata search] Request: query="${query}" | limit=${limit} (eco: only request what we need)`)
    let results: PokedataCard[]
    try {
      results = await this.request<PokedataCard[]>(`/search?${params}`)
    } catch (err) {
      params.delete("limit")
      console.log(`[Pokedata search] Retry without limit param (API may not support it)`)
      results = await this.request<PokedataCard[]>(`/search?${params}`)
    }
    const use = results.slice(0, limit)
    const wasted = results.length - use.length
    if (wasted > 0) {
      console.log(`[Pokedata search] Eco: API returned ${results.length}, we use first ${use.length} (${wasted} unused — not cached)`)
    } else {
      console.log(`[Pokedata search] Eco: API returned ${results.length}, using all (caching ${use.length})`)
    }
    return use
  }

  /**
   * Get pricing data for a specific card
   * @param id Card ID from Pokedata
   * @param assetType Type of asset (default: "CARD")
   * @returns Pricing data from multiple marketplaces
   */
  async getCardPricing(
    id: string,
    assetType: AssetType = "CARD"
  ): Promise<PokedataCardPricing> {
    const params = new URLSearchParams({
      id,
      asset_type: assetType,
    })
    const path = `/pricing?${params}`
    const fullUrl = `${this.baseUrl}${path}`

    console.log("[Pokedata API] Request:", {
      method: "GET",
      url: fullUrl,
      params: { id, asset_type: assetType },
      note: "API Cost: 10 Credits",
    })

    const pricing = await this.request<PokedataCardPricing>(path)
    const raw = pricing as any
    console.log("[Pokedata API] Response (USD + image fields):", {
      id: pricing.id,
      name: pricing.name,
      num: raw.num ?? null,
      number: raw.number ?? null,
      set_code: raw.set_code ?? null,
      set_name: raw.set_name ?? null,
      set_id: raw.set_id ?? null,
      set: raw.set ?? null,
      setId: raw.setId ?? null,
      allKeys: Object.keys(raw),
      sample: {
        TCGPlayer: pricing.pricing?.["TCGPlayer"],
        "eBay Raw": pricing.pricing?.["eBay Raw"],
      },
    })

    return pricing
  }

  /**
   * Get all cards in a specific set
   * @param setName Name of the set
   * @returns Array of cards in the set
   */
  async getCardsInSet(setName: string): Promise<PokedataCard[]> {
    const params = new URLSearchParams({ setName })
    return this.request<PokedataCard[]>(`/set?${params}`)
  }

  /**
   * Get list of all Pokémon TCG sets
   * @returns Array of set information
   */
  async getAllSets(): Promise<any[]> {
    return this.request<any[]>("/sets")
  }

  /**
   * Get PSA population/grading data for a card
   * @param id Card ID
   * @returns Population data
   */
  async getCardPopulation(id: string): Promise<any> {
    const params = new URLSearchParams({ id })
    return this.request<any>(`/population?${params}`)
  }

  /**
   * Get value history for a set over a number of days
   * @param setName Name of the set
   * @param days Number of days (default: 7)
   * @returns Array of value data points
   */
  async getSetValueHistory(setName: string, days: number = 7): Promise<PokedataSetValue[]> {
    const params = new URLSearchParams({
      setName,
      days: days.toString(),
    })
    return this.request<PokedataSetValue[]>(`/set-value?${params}`)
  }

  /**
   * Get account status and credit balance
   * @returns Account information
   */
  async getAccountStatus(): Promise<any> {
    return this.request<any>("/account")
  }
}

export const pokedataClient = new PokedataClient()

