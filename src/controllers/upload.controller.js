const cloudinary = require('cloudinary').v2;
const { createError } = require("../middleware/errorHandler");
const { sendSuccess } = require("../utils/apiResponse");

// Configure Cloudinary
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

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path || req.file.buffer, {
      folder: 'students',
      transformation: [
        { width: 400, height: 400, crop: 'fill' }
      ]
    });

    return sendSuccess(res, 200, 'Photo uploaded successfully', {
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (error) {
    console.error('Upload error:', error);
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