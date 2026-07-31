const cloudinary = require('cloudinary').v2;
const { createError } = require("../middleware/errorHandler");
const { sendSuccess } = require("../utils/apiResponse");
const streamifier = require('streamifier');

// Configure Cloudinary with credentials from .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// POST /api/v1/upload/photo
const uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      throw createError('No file uploaded', 400);
    }

    console.log('[Upload] Uploading:', req.file.originalname);

    // Upload from buffer using stream
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'students',
          transformation: [
            { width: 400, height: 400, crop: 'fill' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      
      const bufferStream = streamifier.createReadStream(req.file.buffer);
      bufferStream.pipe(uploadStream);
    });

    console.log('[Upload] Success:', result.public_id);

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

// POST /api/v1/upload/document
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      throw createError('No file uploaded', 400);
    }

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'documents',
          resource_type: 'auto'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      
      const bufferStream = streamifier.createReadStream(req.file.buffer);
      bufferStream.pipe(uploadStream);
    });

    return sendSuccess(res, 200, 'Document uploaded successfully', {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format
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
      message: error.message || 'Failed to upload document'
    });
  }
};

module.exports = { uploadPhoto, uploadDocument };