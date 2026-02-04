import { Request, Response } from "express"
import asyncHandler from "express-async-handler"
import { GoogleGenerativeAI } from "@google/generative-ai"
import * as fs from "fs"

/**
 * Recognize Pokémon card from image using Google Gemini Vision API
 * Returns card name, set, and number for searching in Pokedata
 */
export const recognizeCard = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: "No image file provided" })
    return
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not set in environment variables. Please add it to server/.env file.")
    }
    
    const genAI = new GoogleGenerativeAI(apiKey)
    const modelName = "gemini-2.0-flash-001"
    const model = genAI.getGenerativeModel({ model: modelName })
    
    // Log model name to verify it's correct (remove after debugging)
    console.log(`[RECOGNIZE] Using model: ${modelName}`)

    const fileBuffer = fs.readFileSync(file.path)
    const base64Image = fileBuffer.toString("base64")
    const mimeType = file.mimetype || "image/jpeg"
    fs.unlinkSync(file.path)

    const prompt = `Analyze this Pokémon Trading Card Game card image and identify the following information:

1. Card Name (the Pokémon name or trainer name at the top)
2. Set Name (the set symbol or set name, if visible)
3. Card Number (the number like "123/185" or "123" at the bottom right, if visible)

Return ONLY a valid JSON object with this exact structure:
{
  "name": "exact card name here",
  "set": "set name or empty string if not visible",
  "number": "card number like 123/185 or empty string if not visible"
}

Important:
- Extract the EXACT card name as it appears on the card
- If set name or number is not clearly visible, use empty string ""
- Return ONLY valid JSON, no other text or explanation
- Be as precise as possible with the card name`

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType,
        },
      },
      { text: prompt },
    ])

    const response = await result.response
    const text = response.text()

    let cardInfo
    try {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/)
      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text
      cardInfo = JSON.parse(jsonText.trim())
    } catch (parseError) {
      throw new Error("Failed to parse card recognition response. Please ensure the card is clearly visible.")
    }

    if (!cardInfo.name) {
      throw new Error("Could not identify card name from image. Please try again with a clearer image.")
    }

    res.json({
      success: true,
      card: {
        name: cardInfo.name.trim(),
        set: (cardInfo.set || "").trim(),
        number: (cardInfo.number || "").trim(),
      },
    })
  } catch (error: any) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path)
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    let errorMessage = error.message || "Failed to recognize card from image"
    
    if (error.message?.includes("fetch failed") || error.message?.includes("ECONNREFUSED")) {
      errorMessage = "Network error connecting to Google AI. Please check your internet connection and try again."
    } else if (error.message?.includes("API key")) {
      errorMessage = "Invalid or missing GEMINI_API_KEY. Please check your server/.env file."
    }

    res.status(500).json({
      error: errorMessage,
      success: false,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    })
  }
})

