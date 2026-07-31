const cloudinary = require('cloudinary').v2;
const { createError } = require("../middleware/errorHandler");
const { sendSuccess } = require("../utils/apiResponse");
const streamifier = require('streamifier');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// POST /api/v1/upload/photo
const uploadPhoto = async (req, res) => {
  try {
    console.log('[Upload] Photo upload request received');
    
    if (!req.file) {
      console.log('[Upload] No file in request');
      throw createError('No file uploaded', 400);
    }

    console.log('[Upload] File details:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // Use streamifier to upload from buffer
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'students',
          transformation: [
            { width: 400, height: 400, crop: 'fill' }
          ]
        },
        (error, result) => {
          if (error) {
            console.error('[Upload] Cloudinary error:', error);
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      
      // Create a readable stream from the buffer and pipe to Cloudinary
      const bufferStream = streamifier.createReadStream(req.file.buffer);
      bufferStream.pipe(uploadStream);
    });

    console.log('[Upload] Cloudinary upload successful:', result.public_id);

    return sendSuccess(res, 200, 'Photo uploaded successfully', {
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload photo'
    });
  }
};

module.exports = { uploadPhoto };