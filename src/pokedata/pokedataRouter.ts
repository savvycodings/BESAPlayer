import express from "express"
import multer from "multer"
import { searchCards } from "./search"
import { getCardPricing } from "./pricing"
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

// Get pricing for a card
router.get("/pricing", getCardPricing)

export default router

