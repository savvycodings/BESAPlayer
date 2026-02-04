import { v2 as cloudinary } from 'cloudinary'
import { Readable } from 'stream'

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'djzmvrst5',
  api_key: process.env.CLOUDINARY_API_KEY || '746518765857429',
  api_secret: process.env.CLOUDINARY_API_SECRET || '_hW6znRNWgBkPSH4O9qZBytaODw',
})

export interface UploadOptions {
  folder?: string
  publicId?: string
  resourceType?: 'image' | 'video' | 'raw' | 'auto'
  transformation?: any[]
}

/**
 * Upload a file buffer to Cloudinary
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  options: UploadOptions = {}
): Promise<{ url: string; publicId: string; secureUrl: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || 'gradeit',
        resource_type: options.resourceType || 'image',
        transformation: options.transformation,
        ...(options.publicId && { public_id: options.publicId }),
      },
      (error, result) => {
        if (error) {
          reject(error)
        } else if (result) {
          resolve({
            url: result.url,
            secureUrl: result.secure_url,
            publicId: result.public_id,
          })
        } else {
          reject(new Error('Upload failed: No result returned'))
        }
      }
    )

    // Convert buffer to stream
    const bufferStream = new Readable()
    bufferStream.push(buffer)
    bufferStream.push(null)
    bufferStream.pipe(uploadStream)
  })
}

/**
 * Upload from a base64 string (useful for React Native)
 */
export async function uploadFromBase64(
  base64String: string,
  options: UploadOptions = {}
): Promise<{ url: string; publicId: string; secureUrl: string }> {
  // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
  const base64Data = base64String.includes(',') 
    ? base64String.split(',')[1] 
    : base64String

  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      `data:image/jpeg;base64,${base64Data}`,
      {
        folder: options.folder || 'gradeit',
        resource_type: options.resourceType || 'image',
        transformation: options.transformation,
        ...(options.publicId && { public_id: options.publicId }),
      },
      (error, result) => {
        if (error) {
          reject(error)
        } else if (result) {
          resolve({
            url: result.url,
            secureUrl: result.secure_url,
            publicId: result.public_id,
          })
        } else {
          reject(new Error('Upload failed: No result returned'))
        }
      }
    )
  })
}

/**
 * Delete an image from Cloudinary
 */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}
