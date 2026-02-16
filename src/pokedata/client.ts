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
   * @returns Array of matching cards
   */
  async searchCards(
    query: string,
    assetType: AssetType = "CARD",
    language?: Language
  ): Promise<PokedataCard[]> {
    const params = new URLSearchParams({
      query,
      asset_type: assetType,
      ...(language && { language }),
    })

    console.log(`🔍 Searching Pokedata for: "${query}" (${assetType})`)
    const results = await this.request<PokedataCard[]>(`/search?${params}`)
    console.log(`✅ Found ${results.length} cards`)
    
    return results
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

    console.log("[Pokedata API] Response (USD only, we convert to ZAR):", {
      id: pricing.id,
      name: pricing.name,
      num: (pricing as any).num ?? null,
      set_name: (pricing as any).set_name ?? null,
      sample: {
        TCGPlayer: pricing.pricing?.["TCGPlayer"],
        "eBay Raw": pricing.pricing?.["eBay Raw"],
        "Pokedata Raw": pricing.pricing?.["Pokedata Raw"],
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

