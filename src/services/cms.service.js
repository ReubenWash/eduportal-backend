const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");

// ─────────────────────────────────────────────────────
// CMS PAGES
// ─────────────────────────────────────────────────────

const getPages = async (query) => {
  const { page = 1, limit = 20, status, search } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } }
    ];
  }

  const [pages, total] = await Promise.all([
    prisma.cmsPage.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          where: { isActive: true }
        }
      }
    }),
    prisma.cmsPage.count({ where })
  ]);

  return {
    data: pages,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    }
  };
};

const getPageById = async (pageId) => {
  const page = await prisma.cmsPage.findUnique({
    where: { id: pageId },
    include: {
      sections: {
        orderBy: { order: 'asc' }
      }
    }
  });

  if (!page) {
    throw createError('Page not found', 404);
  }

  return page;
};

const getPageBySlug = async (slug) => {
  const page = await prisma.cmsPage.findFirst({
    where: { 
      slug,
      status: 'PUBLISHED'
    },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        where: { isActive: true }
      }
    }
  });

  return page;
};

const getHomepage = async () => {
  const page = await prisma.cmsPage.findFirst({
    where: { 
      isHomepage: true,
      status: 'PUBLISHED'
    },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        where: { isActive: true }
      }
    }
  });

  return page;
};

const createPage = async (data) => {
  const { title, slug, content, metaTitle, metaDescription, ogImage, isHomepage = false } = data;

  if (!title || !slug) {
    throw createError('Title and slug are required', 400);
  }

  // Check for duplicate slug
  const existing = await prisma.cmsPage.findUnique({
    where: { slug }
  });

  if (existing) {
    throw createError('Page with this slug already exists', 409);
  }

  // If this is homepage, unset any existing homepage
  if (isHomepage) {
    await prisma.cmsPage.updateMany({
      where: { isHomepage: true },
      data: { isHomepage: false }
    });
  }

  const page = await prisma.cmsPage.create({
    data: {
      title,
      slug,
      content: content || null,
      metaTitle: metaTitle || title,
      metaDescription: metaDescription || null,
      ogImage: ogImage || null,
      isHomepage,
      status: 'DRAFT'
    }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: data.userId || null,
      action: 'CREATE',
      resource: 'CMS_PAGE',
      resourceId: page.id,
      metadata: { title, slug, isHomepage }
    }
  });

  return page;
};

const updatePage = async (pageId, data) => {
  const { title, slug, content, metaTitle, metaDescription, ogImage, status, isHomepage } = data;

  const page = await prisma.cmsPage.findUnique({
    where: { id: pageId }
  });

  if (!page) {
    throw createError('Page not found', 404);
  }

  // Check for duplicate slug if changing
  if (slug && slug !== page.slug) {
    const existing = await prisma.cmsPage.findUnique({
      where: { slug }
    });
    if (existing) {
      throw createError('Page with this slug already exists', 409);
    }
  }

  // If this is homepage, unset any existing homepage
  if (isHomepage) {
    await prisma.cmsPage.updateMany({
      where: { 
        isHomepage: true,
        id: { not: pageId }
      },
      data: { isHomepage: false }
    });
  }

  const updateData = {};
  if (title) updateData.title = title;
  if (slug) updateData.slug = slug;
  if (content !== undefined) updateData.content = content;
  if (metaTitle !== undefined) updateData.metaTitle = metaTitle;
  if (metaDescription !== undefined) updateData.metaDescription = metaDescription;
  if (ogImage !== undefined) updateData.ogImage = ogImage;
  if (status) {
    updateData.status = status;
    if (status === 'PUBLISHED' && page.status !== 'PUBLISHED') {
      updateData.publishedAt = new Date();
    }
  }
  if (isHomepage !== undefined) updateData.isHomepage = isHomepage;

  const updated = await prisma.cmsPage.update({
    where: { id: pageId },
    data: updateData,
    include: {
      sections: {
        orderBy: { order: 'asc' }
      }
    }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: data.userId || null,
      action: 'UPDATE',
      resource: 'CMS_PAGE',
      resourceId: pageId,
      metadata: { 
        oldStatus: page.status,
        newStatus: status || page.status,
        title: title || page.title
      }
    }
  });

  return updated;
};

const publishPage = async (pageId, userId = null) => {
  const page = await prisma.cmsPage.findUnique({
    where: { id: pageId }
  });

  if (!page) {
    throw createError('Page not found', 404);
  }

  const updated = await prisma.cmsPage.update({
    where: { id: pageId },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date()
    }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'UPDATE',
      resource: 'CMS_PAGE',
      resourceId: pageId,
      metadata: { action: 'publish', title: page.title }
    }
  });

  return updated;
};

const unpublishPage = async (pageId, userId = null) => {
  const page = await prisma.cmsPage.findUnique({
    where: { id: pageId }
  });

  if (!page) {
    throw createError('Page not found', 404);
  }

  if (page.isHomepage) {
    throw createError('Cannot unpublish the homepage', 400);
  }

  const updated = await prisma.cmsPage.update({
    where: { id: pageId },
    data: {
      status: 'DRAFT',
      publishedAt: null
    }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'UPDATE',
      resource: 'CMS_PAGE',
      resourceId: pageId,
      metadata: { action: 'unpublish', title: page.title }
    }
  });

  return updated;
};

const deletePage = async (pageId, userId = null) => {
  const page = await prisma.cmsPage.findUnique({
    where: { id: pageId }
  });

  if (!page) {
    throw createError('Page not found', 404);
  }

  if (page.isHomepage) {
    throw createError('Cannot delete the homepage', 400);
  }

  // Delete sections first (cascade will handle)
  await prisma.cmsPage.delete({
    where: { id: pageId }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'DELETE',
      resource: 'CMS_PAGE',
      resourceId: pageId,
      metadata: { title: page.title }
    }
  });

  return { message: 'Page deleted successfully' };
};

// ─────────────────────────────────────────────────────
// CMS SECTIONS
// ─────────────────────────────────────────────────────

const getSections = async (query) => {
  const { pageId, type, isActive } = query;
  
  const where = {};
  if (pageId) where.pageId = pageId;
  if (type) where.type = type;
  if (isActive !== undefined) where.isActive = isActive === 'true';

  const sections = await prisma.cmsSection.findMany({
    where,
    orderBy: { order: 'asc' },
    include: {
      page: {
        select: {
          id: true,
          title: true,
          slug: true
        }
      }
    }
  });

  return sections;
};

const getSectionById = async (sectionId) => {
  const section = await prisma.cmsSection.findUnique({
    where: { id: sectionId },
    include: {
      page: {
        select: {
          id: true,
          title: true,
          slug: true
        }
      }
    }
  });

  if (!section) {
    throw createError('Section not found', 404);
  }

  return section;
};

const createSection = async (data) => {
  const { pageId, type, title, subtitle, content, order, isActive = true, settings } = data;

  if (!pageId || !type) {
    throw createError('Page ID and type are required', 400);
  }

  const page = await prisma.cmsPage.findUnique({
    where: { id: pageId }
  });

  if (!page) {
    throw createError('Page not found', 404);
  }

  // Get max order if not specified
  let sectionOrder = order;
  if (sectionOrder === undefined) {
    const maxOrder = await prisma.cmsSection.aggregate({
      where: { pageId },
      _max: { order: true }
    });
    sectionOrder = (maxOrder._max.order || 0) + 1;
  }

  const section = await prisma.cmsSection.create({
    data: {
      pageId,
      type,
      title: title || null,
      subtitle: subtitle || null,
      content: content || {},
      order: sectionOrder,
      isActive: isActive !== undefined ? isActive : true,
      settings: settings || {}
    }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: data.userId || null,
      action: 'CREATE',
      resource: 'CMS_PAGE',
      resourceId: pageId,
      metadata: { 
        sectionType: type,
        sectionId: section.id,
        title: title || 'Untitled section'
      }
    }
  });

  return section;
};

const updateSection = async (sectionId, data) => {
  const { title, subtitle, content, order, isActive, settings } = data;

  const section = await prisma.cmsSection.findUnique({
    where: { id: sectionId }
  });

  if (!section) {
    throw createError('Section not found', 404);
  }

  const updateData = {};
  if (title !== undefined) updateData.title = title;
  if (subtitle !== undefined) updateData.subtitle = subtitle;
  if (content !== undefined) updateData.content = content;
  if (order !== undefined) updateData.order = order;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (settings !== undefined) updateData.settings = settings;

  const updated = await prisma.cmsSection.update({
    where: { id: sectionId },
    data: updateData
  });

  return updated;
};

const deleteSection = async (sectionId) => {
  const section = await prisma.cmsSection.findUnique({
    where: { id: sectionId }
  });

  if (!section) {
    throw createError('Section not found', 404);
  }

  await prisma.cmsSection.delete({
    where: { id: sectionId }
  });

  return { message: 'Section deleted successfully' };
};

const reorderSections = async (pageId, sectionOrders) => {
  // sectionOrders: [{id: '...', order: 0}, {id: '...', order: 1}]
  
  const page = await prisma.cmsPage.findUnique({
    where: { id: pageId }
  });

  if (!page) {
    throw createError('Page not found', 404);
  }

  const updates = sectionOrders.map(({ id, order }) => {
    return prisma.cmsSection.update({
      where: { id },
      data: { order }
    });
  });

  await prisma.$transaction(updates);

  return { message: 'Sections reordered successfully' };
};

// ─────────────────────────────────────────────────────
// SECTION CONTENT BUILDERS
// ─────────────────────────────────────────────────────

// Helper to get section content by type
const getSectionContent = (section) => {
  switch (section.type) {
    case 'HERO':
      return {
        heading: section.content.heading || '',
        subtitle: section.content.subtitle || '',
        ctaText: section.content.ctaText || '',
        ctaLink: section.content.ctaLink || '',
        image: section.content.image || null,
        trustBadge: section.content.trustBadge || null
      };
    case 'STATS':
      return {
        stats: section.content.stats || [
          { number: '247', label: 'Total Schools' },
          { number: '12,481', label: 'Total Users' },
          { number: '94,320', label: 'Total Students' },
          { number: '90.3%', label: 'Avg. Attendance' }
        ]
      };
    case 'FEATURES':
      return {
        features: section.content.features || []
      };
    case 'PRICING':
      return {
        plans: section.content.plans || []
      };
    case 'TESTIMONIALS':
      return {
        testimonials: section.content.testimonials || []
      };
    case 'FAQ':
      return {
        faqs: section.content.faqs || []
      };
    default:
      return section.content || {};
  }
};

// ─────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────

module.exports = {
  // Pages
  getPages,
  getPageById,
  getPageBySlug,
  getHomepage,
  createPage,
  updatePage,
  publishPage,
  unpublishPage,
  deletePage,
  
  // Sections
  getSections,
  getSectionById,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  
  // Helpers
  getSectionContent
};