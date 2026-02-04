import express from 'express'
import multer from 'multer'
import { falAI } from './fal'
import { uploadToCloudinary, uploadFromBase64 } from './cloudinary'

const upload = multer()
const router = express.Router()

router.post('/fal', upload.single('file'), falAI)

// POST /images/upload - Upload image to Cloudinary
// Accepts either multipart/form-data (file) or JSON (base64)
router.post('/upload', async (req, res) => {
  try {
    let imageUrl: string
    let publicId: string
    let secureUrl: string

    // Check if it's a multipart file upload
    if (req.body.file || (req as any).file) {
      const file = (req as any).file || req.body.file
      const buffer = Buffer.from(file.data || file.buffer)
      
      const folder = req.body.folder || 'gradeit'
      const result = await uploadToCloudinary(buffer, { folder })
      imageUrl = result.url
      publicId = result.publicId
      secureUrl = result.secureUrl
    } 
    // Check if it's a base64 string (from React Native)
    else if (req.body.image || req.body.base64) {
      const base64String = req.body.image || req.body.base64
      const folder = req.body.folder || 'gradeit'
      
      const result = await uploadFromBase64(base64String, { folder })
      imageUrl = result.url
      publicId = result.publicId
      secureUrl = result.secureUrl
    } 
    // Check if it's a URL (already uploaded, just return it)
    else if (req.body.url) {
      return res.json({
        success: true,
        url: req.body.url,
        secureUrl: req.body.url,
        publicId: null,
      })
    }
    else {
      return res.status(400).json({ 
        success: false,
        message: 'No image data provided. Send either a file, base64 string, or URL.' 
      })
    }

    res.json({
      success: true,
      url: secureUrl, // Use secure URL (HTTPS)
      secureUrl,
      publicId,
    })
  } catch (error: any) {
    console.error('Image upload error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message,
    })
  }
})

// POST /images/upload-base64 - Explicit endpoint for base64 uploads (for React Native)
router.post('/upload-base64', async (req, res) => {
  try {
    const { image, folder } = req.body

    if (!image) {
      return res.status(400).json({
        success: false,
        message: 'No image data provided. Send base64 string in "image" field.',
      })
    }

    const result = await uploadFromBase64(image, { folder: folder || 'gradeit' })

    res.json({
      success: true,
      url: result.secureUrl,
      secureUrl: result.secureUrl,
      publicId: result.publicId,
    })
  } catch (error: any) {
    console.error('Base64 upload error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message,
    })
  }
})

export default router
