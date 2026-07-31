const { prisma } = require("../../config/db");
const { createError } = require("../../middleware/errorHandler");
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── List Media ───
const listMedia = async (query = {}) => {
  try {
    const { folder, search, limit = 50, offset = 0 } = query;
    
    const where = {};
    if (folder) where.folder = folder;
    if (search) {
      where.OR = [
        { originalName: { contains: search, mode: 'insensitive' } },
        { mimeType: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [media, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip: parseInt(offset),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          uploadedBy: {
            select: {
              id: true,
              email: true,
              staff: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        }
      }),
      prisma.document.count({ where })
    ]);

    return {
      data: media,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: offset + limit < total
      }
    };
  } catch (error) {
    console.error('List media error:', error);
    throw error;
  }
};

// ─── Register Upload ───
const registerUpload = async (file) => {
  try {
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'media',
      resource_type: 'auto'
    });

    const document = await prisma.document.create({
      data: {
        url: result.secure_url,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        category: 'media',
        uploadedById: file.uploadedBy || null,
        schoolId: file.schoolId || null
      }
    });

    return {
      id: document.id,
      url: document.url,
      originalName: document.originalName,
      mimeType: document.mimeType,
      size: document.size,
      publicId: result.public_id
    };
  } catch (error) {
    console.error('Register upload error:', error);
    throw error;
  }
};

// ─── Delete Media ───
const deleteMedia = async (publicId) => {
  try {
    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);
    
    // Delete from database
    const document = await prisma.document.findFirst({
      where: { 
        url: { contains: publicId }
      }
    });

    if (document) {
      await prisma.document.delete({
        where: { id: document.id }
      });
    }

    return { success: true, publicId };
  } catch (error) {
    console.error('Delete media error:', error);
    throw error;
  }
};

module.exports = {
  listMedia,
  registerUpload,
  deleteMedia
};