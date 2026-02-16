import express from "express"
import multer from "multer"
import { searchCards } from "./search"
import { getCardPricing } from "./pricing"
import { getCardLookup } from "./cardLookup"
import { recognizeCard } from "./recognize"
import { gradeCard } from "./grade"

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

// Lookup card price: DB first, then API only if cache older than 48h (credit-friendly)
router.get("/card/:id", getCardLookup)

export default router

