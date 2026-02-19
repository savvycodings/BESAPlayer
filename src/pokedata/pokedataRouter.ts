import express from "express"
import multer from "multer"
import { searchCards } from "./search"
import { getCardPricing } from "./pricing"
import { getCardLookup } from "./cardLookup"
import { recognizeCard } from "./recognize"
import { gradeCard } from "./grade"
import { getSetValueHistory } from "./setValueHistory"
import { getCardPriceHistory } from "./cardPriceHistory"

const router = express.Router()
const upload = multer({ dest: "uploads/temp/" })

// Recognize card from image
router.post("/recognize", upload.single("image") as any, recognizeCard)

// Grade card condition from image
router.post("/grade", upload.single("image") as any, gradeCard)

// Search for cards
router.get("/search", searchCards)

// Get pricing for a card (always hits API - use /card/:id for cached)
router.get("/pricing", getCardPricing)

// Get card price history for product chart (must be before /card/:id so path is matched correctly)
router.get("/card/:id/price-history", getCardPriceHistory)

// Lookup card price: DB first, then API only if cache older than 48h (credit-friendly)
router.get("/card/:id", getCardLookup)

// Get set value history for price trend graph (setName, days=7)
router.get("/set-value", getSetValueHistory)

export default router

