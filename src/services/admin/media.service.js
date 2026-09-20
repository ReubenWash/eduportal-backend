const { prisma } = require("../../config/db");
const { createError } = require("../../middleware/errorHandler");
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const resolveDocumentPublicId = (url) => {
  if (!url) return null;
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

const listMedia = async (query = {}) => {
  try {
    const { folder, search, category, limit = 50, offset = 0 } = query;

    const where = {};
    if (folder) where.category = folder;
    if (category && category !== 'all') where.category = category;
    if (search) {
      where.OR = [
        { originalName: { contains: search, mode: 'insensitive' } },
        { mimeType: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } }
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

const registerUpload = async (file, user = {}, body = {}) => {
  try {
    if (!file || !file.buffer) {
      throw createError('Uploaded file data is unavailable.', 400);
    }

    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'media', resource_type: 'auto' },
        (error, result) => (error ? reject(error) : resolve(result))
      );
      Readable.from(file.buffer).pipe(uploadStream);
    });

    const chosenCategory = body.category || 'media';
    const document = await prisma.document.create({
      data: {
        schoolId: user.schoolId || body.schoolId || null,
        uploadedById: user.userId || null,
        category: chosenCategory,
        url: uploadResult.secure_url,
        originalName: file.originalname,
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size || Buffer.byteLength(file.buffer),
      }
    });

    return {
      id: document.id,
      url: document.url,
      originalName: document.originalName,
      mimeType: document.mimeType,
      size: document.size,
      category: document.category,
      publicId: uploadResult.public_id,
    };
  } catch (error) {
    console.error('Register upload error:', error);
    throw error;
  }
};

const deleteMedia = async (publicId, documentId) => {
  try {
    let document = null;

    if (documentId) {
      document = await prisma.document.findUnique({ where: { id: documentId } });
    } else if (publicId) {
      document = await prisma.document.findFirst({
        where: { OR: [{ url: { contains: publicId } }, { originalName: { contains: publicId } }] }
      });
    }

    if (!document && publicId) {
      return { success: true, publicId, deleted: false };
    }

    if (document && document.url && document.url.includes('cloudinary')) {
      const cloudinaryPublicId = publicId || resolveDocumentPublicId(document.url);
      if (cloudinaryPublicId) {
        await cloudinary.uploader.destroy(cloudinaryPublicId).catch(() => undefined);
      }
    }

    if (document) {
      await prisma.document.delete({ where: { id: document.id } });
    }

    return { success: true, publicId: publicId || document?.id, deleted: !!document };
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