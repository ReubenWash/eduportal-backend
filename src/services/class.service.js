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

// ─── Update section content only ───────────────────────────
const updateSectionContent = async (sectionId, contentData) => {
  const section = await prisma.cmsSection.findUnique({
    where: { id: sectionId }
  });

  if (!section) {
    throw createError('Section not found', 404);
  }

  // Merge existing content with new content
  const existingContent = section.content || {};
  const mergedContent = { ...existingContent, ...contentData };

  const updated = await prisma.cmsSection.update({
    where: { id: sectionId },
    data: { content: mergedContent }
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
        headline: section.content.headline || '',
        headlineHighlight: section.content.headlineHighlight || '',
        subtitle: section.content.subtitle || '',
        primaryBtn: section.content.primaryBtn || '',
        trustText: section.content.trustText || ''
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
    case 'CTA':
      return {
        heading: section.content.heading || '',
        subtitle: section.content.subtitle || '',
        buttonText: section.content.buttonText || '',
        buttonLink: section.content.buttonLink || ''
      };
    case 'FOOTER':
      return {
        tagline: section.content.tagline || '',
        links: section.content.links || [],
        socialLinks: section.content.socialLinks || [],
        copyright: section.content.copyright || ''
      };
    default:
      return section.content || {};
  }
};

// ─────────────────────────────────────────────────────
// LANDING PAGE - GET ALL CONTENT ────────────────────
// ─────────────────────────────────────────────────────

const getLandingContent = async () => {
  const homepage = await prisma.cmsPage.findFirst({
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

  // Default schools list
  const defaultSchools = ["Accra Academy", "Presec Legon", "Wesley Girls", "Achimota School", "Aburi Girls", "Holy Child"];

  if (!homepage) {
    // Return default content if no homepage exists
    return {
      heroHeadline: "Run your school.",
      heroHeadlineHighlight: "Not paperwork.",
      heroSubtitle: "EduPortal gives school administrators, teachers, and parents one place to manage students, scores, attendance, and term reports — without the spreadsheets.",
      heroPrimaryBtn: "Register your school",
      heroTrustText: "Trusted by 200+ schools across Ghana, Nigeria & Kenya",
      stats: [
        { number: "200+", label: "Schools registered" },
        { number: "84K", label: "Students managed" },
        { number: "1.2M", label: "Reports generated" },
        { number: "99.9%", label: "Platform uptime" }
      ],
      schools: defaultSchools,
      testimonials: [
        {
          id: 'testimonial-1',
          quote: "We used to spend three weeks compiling report cards. With EduPortal, the whole process takes two days. Teachers submit scores, I approve, and parents get a PDF. That's it.",
          author: "Abena Owusu",
          role: "Headmistress, Holy Child School",
          initials: "AO",
          color: "#4F46E5"
        }
      ],
      plans: [
        {
          id: 'plan-basic',
          name: "Basic",
          price: "Free",
          period: "/ term",
          desc: "For small schools getting started. Up to 150 students.",
          popular: false,
          features: ["Up to 150 students", "Scores & grading", "Attendance tracking", "PDF report cards"],
          disabled: ["Analytics dashboard", "Email reports to parents"]
        },
        {
          id: 'plan-standard',
          name: "Standard",
          price: "GHS 299",
          period: "/ term",
          desc: "For growing schools. Up to 800 students, full feature set.",
          popular: true,
          features: ["Up to 800 students", "Scores & grading", "Attendance tracking", "PDF report cards", "Analytics dashboard", "Email reports to parents"],
          disabled: []
        },
        {
          id: 'plan-premium',
          name: "Premium",
          price: "GHS 599",
          period: "/ term",
          desc: "For large institutions. Unlimited students, priority support.",
          popular: false,
          features: ["Unlimited students", "Everything in Standard", "Bulk import & export", "Priority email support", "Custom report branding", "Dedicated account manager"],
          disabled: []
        }
      ],
      footerTagline: "A school management platform built specifically for schools in Ghana and across West Africa."
    };
  }

  // Parse sections into structured content
  const content = {
    heroHeadline: "Run your school.",
    heroHeadlineHighlight: "Not paperwork.",
    heroSubtitle: "EduPortal gives school administrators, teachers, and parents one place to manage students, scores, attendance, and term reports — without the spreadsheets.",
    heroPrimaryBtn: "Register your school",
    heroTrustText: "Trusted by 200+ schools across Ghana, Nigeria & Kenya",
    stats: [],
    schools: defaultSchools,
    testimonials: [],
    plans: [],
    footerTagline: "A school management platform built specifically for schools in Ghana and across West Africa."
  };
  
  homepage.sections.forEach(section => {
    const sectionData = getSectionContent(section);
    
    switch (section.type) {
      case 'HERO':
        content.heroHeadline = sectionData.headline || content.heroHeadline;
        content.heroHeadlineHighlight = sectionData.headlineHighlight || content.heroHeadlineHighlight;
        content.heroSubtitle = sectionData.subtitle || content.heroSubtitle;
        content.heroPrimaryBtn = sectionData.primaryBtn || content.heroPrimaryBtn;
        content.heroTrustText = sectionData.trustText || content.heroTrustText;
        break;
      case 'STATS':
        content.stats = sectionData.stats || content.stats;
        break;
      case 'TESTIMONIALS':
        content.testimonials = sectionData.testimonials || content.testimonials;
        break;
      case 'PRICING':
        content.plans = sectionData.plans || content.plans;
        break;
      case 'FAQ':
        content.faqs = sectionData.faqs || [];
        break;
      case 'FOOTER':
        content.footerTagline = sectionData.tagline || content.footerTagline;
        break;
      default:
        break;
    }
  });

  // Ensure schools is always included
  if (!content.schools || content.schools.length === 0) {
    content.schools = defaultSchools;
  }

  return content;
};

// ─────────────────────────────────────────────────────
// SAVE LANDING PAGE CONTENT ──────────────────────────
// ─────────────────────────────────────────────────────

const saveLandingContent = async (contentData, userId = null) => {
  // Find or create homepage
  let homepage = await prisma.cmsPage.findFirst({
    where: { isHomepage: true }
  });

  if (!homepage) {
    homepage = await prisma.cmsPage.create({
      data: {
        title: 'Home',
        slug: 'home',
        isHomepage: true,
        status: 'PUBLISHED',
        publishedAt: new Date()
      }
    });
  }

  // Delete existing sections
  await prisma.cmsSection.deleteMany({
    where: { pageId: homepage.id }
  });

  // Create new sections
  const sections = [];
  let order = 0;

  // Hero section
  if (contentData.heroHeadline || contentData.heroSubtitle) {
    sections.push({
      pageId: homepage.id,
      type: 'HERO',
      title: 'Hero Section',
      order: order++,
      isActive: true,
      content: {
        headline: contentData.heroHeadline || 'Run your school.',
        headlineHighlight: contentData.heroHeadlineHighlight || 'Not paperwork.',
        subtitle: contentData.heroSubtitle || 'EduPortal gives school administrators, teachers, and parents one place to manage students, scores, attendance, and term reports — without the spreadsheets.',
        primaryBtn: contentData.heroPrimaryBtn || 'Register your school',
        trustText: contentData.heroTrustText || 'Trusted by 200+ schools across Ghana, Nigeria & Kenya'
      }
    });
  }

  // Stats section
  if (contentData.stats && contentData.stats.length > 0) {
    sections.push({
      pageId: homepage.id,
      type: 'STATS',
      title: 'Statistics',
      order: order++,
      isActive: true,
      content: { stats: contentData.stats }
    });
  }

  // Pricing section
  if (contentData.plans && contentData.plans.length > 0) {
    sections.push({
      pageId: homepage.id,
      type: 'PRICING',
      title: 'Pricing Plans',
      order: order++,
      isActive: true,
      content: { plans: contentData.plans }
    });
  }

  // Testimonials section
  if (contentData.testimonials && contentData.testimonials.length > 0) {
    sections.push({
      pageId: homepage.id,
      type: 'TESTIMONIALS',
      title: 'Testimonials',
      order: order++,
      isActive: true,
      content: { testimonials: contentData.testimonials }
    });
  }

  // Footer section
  if (contentData.footerTagline) {
    sections.push({
      pageId: homepage.id,
      type: 'FOOTER',
      title: 'Footer',
      order: order++,
      isActive: true,
      content: { tagline: contentData.footerTagline }
    });
  }

  // Create all sections
  if (sections.length > 0) {
    await prisma.cmsSection.createMany({
      data: sections
    });
  }

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: userId || null,
      action: 'CONFIG_UPDATE',
      resource: 'CMS_PAGE',
      resourceId: homepage.id,
      metadata: { 
        action: 'save_landing_content',
        sectionsCreated: sections.length
      }
    }
  });

  // Return updated homepage
  return prisma.cmsPage.findUnique({
    where: { id: homepage.id },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        where: { isActive: true }
      }
    }
  });
};

// ─────────────────────────────────────────────────────
// UPDATE LANDING SECTION ─────────────────────────────
// ─────────────────────────────────────────────────────

const updateLandingSection = async (sectionType, contentData, userId = null) => {
  // Find homepage
  let homepage = await prisma.cmsPage.findFirst({
    where: { isHomepage: true }
  });

  if (!homepage) {
    homepage = await prisma.cmsPage.create({
      data: {
        title: 'Home',
        slug: 'home',
        isHomepage: true,
        status: 'PUBLISHED',
        publishedAt: new Date()
      }
    });
  }

  // Find or create section
  let section = await prisma.cmsSection.findFirst({
    where: {
      pageId: homepage.id,
      type: sectionType
    }
  });

  if (section) {
    // Update existing section
    section = await prisma.cmsSection.update({
      where: { id: section.id },
      data: {
        content: contentData,
        updatedAt: new Date()
      }
    });
  } else {
    // Create new section
    const maxOrder = await prisma.cmsSection.aggregate({
      where: { pageId: homepage.id },
      _max: { order: true }
    });

    section = await prisma.cmsSection.create({
      data: {
        pageId: homepage.id,
        type: sectionType,
        title: `${sectionType} Section`,
        content: contentData,
        order: (maxOrder._max.order || 0) + 1,
        isActive: true
      }
    });
  }

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: userId || null,
      action: 'CONFIG_UPDATE',
      resource: 'CMS_PAGE',
      resourceId: homepage.id,
      metadata: { 
        action: 'update_landing_section',
        sectionType: sectionType,
        sectionId: section.id
      }
    }
  });

  return section;
};

// ─────────────────────────────────────────────────────
// GET FOOTER ──────────────────────────────────────────
// ─────────────────────────────────────────────────────

const getFooter = async () => {
  const homepage = await prisma.cmsPage.findFirst({
    where: { isHomepage: true },
    include: {
      sections: {
        where: { type: 'FOOTER' },
        orderBy: { order: 'asc' }
      }
    }
  });

  const defaultFooter = {
    tagline: 'A school management platform built specifically for schools in Ghana and across West Africa.',
    links: {
      product: ['Features', 'Pricing', 'Changelog', 'Roadmap', 'Team'],
      support: ['Documentation', 'Contact us', 'Status', 'Community'],
      legal: ['Privacy policy', 'Terms of service', 'Data processing']
    },
    social: {
      facebook: 'https://facebook.com/eduportal',
      twitter: 'https://twitter.com/eduportal',
      linkedin: 'https://linkedin.com/company/eduportal',
      instagram: 'https://instagram.com/eduportal'
    }
  };

  if (homepage && homepage.sections.length > 0) {
    const section = homepage.sections[0];
    if (section.content) {
      return {
        ...defaultFooter,
        ...section.content
      };
    }
  }

  return defaultFooter;
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
  updateSectionContent,
  deleteSection,
  reorderSections,
  
  // Landing Page
  getLandingContent,
  saveLandingContent,
  updateLandingSection,
  
  // Footer
  getFooter,
  
  // Helpers
  getSectionContent
};