import { Request, Response } from "express"
import asyncHandler from "express-async-handler"
import { GoogleGenerativeAI } from "@google/generative-ai"
import * as fs from "fs"

/**
 * Grade Pokémon card condition using Google Gemini Vision API
 * Analyzes card condition and returns a grade from 1-10
 */
export const gradeCard = asyncHandler(async (req: Request, res: Response) => {
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" })

    const fileBuffer = fs.readFileSync(file.path)
    const base64Image = fileBuffer.toString("base64")
    const mimeType = file.mimetype || "image/jpeg"
    fs.unlinkSync(file.path)

    const prompt = `Analyze this Pokémon Trading Card Game card image and grade its condition based on professional card grading standards (similar to PSA/BGS grading).

Evaluate the following aspects:
1. Centering (how well-centered the image is on the card)
2. Corners (sharpness and wear on the four corners)
3. Edges (condition of the card edges)
4. Surface (scratches, scuffs, printing defects, holo foil condition)

Return ONLY a valid JSON object with this exact structure:
{
  "grade": 9.5,
  "centering": "excellent",
  "corners": "excellent",
  "edges": "excellent",
  "surface": "excellent",
  "notes": "brief description of condition"
}

Grading scale (use decimal values like 1.0, 1.5, 2.0, etc.):
- 10 (Pristine): Perfect condition, no flaws visible
- 9.5 (Mint+): Near perfect, minimal flaws
- 9.0 (Mint): Excellent condition, minor flaws
- 8.5 (Near Mint+): Very good condition, slight wear
- 8.0 (Near Mint): Good condition, some wear visible
- 7.5 and below: Various levels of wear and damage

Important:
- Be strict but fair in your assessment
- Consider that cards are rarely perfect (10 is extremely rare)
- Return ONLY valid JSON, no other text or explanation
- Use realistic grades based on visible condition
- The "grade" field should be a number (e.g., 9.5, not "9.5")
- Condition fields should be: "pristine", "excellent", "very good", "good", "fair", or "poor"`

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

    let gradeInfo
    try {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/)
      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text
      gradeInfo = JSON.parse(jsonText.trim())
    } catch (parseError) {
      throw new Error("Failed to parse card grading response. Please ensure the card is clearly visible.")
    }

    if (typeof gradeInfo.grade !== 'number' || gradeInfo.grade < 1 || gradeInfo.grade > 10) {
      throw new Error("Invalid grade returned from AI. Please try again.")
    }

    res.json({
      success: true,
      grade: gradeInfo.grade,
      details: {
        centering: gradeInfo.centering || "unknown",
        corners: gradeInfo.corners || "unknown",
        edges: gradeInfo.edges || "unknown",
        surface: gradeInfo.surface || "unknown",
        notes: gradeInfo.notes || "",
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

    let errorMessage = error.message || "Failed to grade card from image"
    
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

