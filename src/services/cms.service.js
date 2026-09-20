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

// ─── NEW: Update section content only ───────────────────────────
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
        heading: section.content.heading || section.content.headline || '',
        highlight: section.content.highlight || section.content.headlineHighlight || '',
        subtitle: section.content.subtitle || '',
        ctaText: section.content.ctaText || section.content.primaryBtn || '',
        ctaLink: section.content.ctaLink || '',
        image: section.content.image || null,
        trustBadge: section.content.trustBadge || section.content.trustText || null
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

const buildLandingPageContent = (sections = [], fallback = getDefaultLandingContent()) => {
  const content = { ...fallback };

  for (const section of sections || []) {
    const sectionData = getSectionContent(section);

    switch (section.type) {
      case 'HERO': {
        content.heroHeadline = sectionData.heading || sectionData.headline || fallback.heroHeadline;
        content.heroHeadlineHighlight = sectionData.highlight || sectionData.headlineHighlight || fallback.heroHeadlineHighlight;
        content.heroSubtitle = sectionData.subtitle || fallback.heroSubtitle;
        content.heroTrustText = sectionData.trustBadge || sectionData.trustText || fallback.heroTrustText;
        content.heroPrimaryBtn = sectionData.ctaText || sectionData.primaryBtn || fallback.heroPrimaryBtn || 'Register your school';
        break;
      }
      case 'STATS':
        content.stats = Array.isArray(sectionData.stats) && sectionData.stats.length ? sectionData.stats : fallback.stats;
        break;
      case 'TESTIMONIALS':
        content.testimonials = Array.isArray(sectionData.testimonials) && sectionData.testimonials.length ? sectionData.testimonials : fallback.testimonials;
        break;
      case 'PRICING':
        content.plans = Array.isArray(sectionData.plans) && sectionData.plans.length ? sectionData.plans : fallback.plans;
        break;
      case 'FAQ':
        content.faqs = Array.isArray(sectionData.faqs) ? sectionData.faqs : fallback.faqs || [];
        break;
      case 'FOOTER':
        content.footerTagline = sectionData.tagline || sectionData.footerTagline || fallback.footerTagline;
        content.footerLinks = Array.isArray(sectionData.links) && sectionData.links.length ? sectionData.links : fallback.footerLinks || [
          { label: 'Features', url: '#features' },
          { label: 'Pricing', url: '#plans' },
          { label: 'Roadmap', url: '/roadmap' },
          { label: 'Team', url: '/team' }
        ];
        content.socialLinks = Array.isArray(sectionData.socialLinks) ? sectionData.socialLinks : fallback.socialLinks || [];
        content.footerCopyright = sectionData.copyright || fallback.footerCopyright || '© 2025 EduPortal. All rights reserved.';
        break;
      default:
        break;
    }
  }

  return content;
};

const getLandingContent = async () => {
  try {
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

    if (!homepage) {
      const newHomepage = await prisma.cmsPage.create({
        data: {
          title: 'Homepage',
          slug: 'home',
          content: 'Default homepage content',
          isHomepage: true,
          status: 'PUBLISHED',
          publishedAt: new Date()
        }
      });

      const defaultSections = [
        {
          pageId: newHomepage.id,
          type: 'HERO',
          title: 'Hero Section',
          order: 1,
          isActive: true,
          content: {
            heading: 'Run your school.',
            highlight: 'Not paperwork.',
            subtitle: 'EduPortal gives school administrators, teachers, and parents one place to manage students, scores, attendance, and term reports — without the spreadsheets.',
            trustBadge: 'Trusted by 200+ schools across Ghana, Nigeria & Kenya'
          }
        },
        {
          pageId: newHomepage.id,
          type: 'STATS',
          title: 'Statistics',
          order: 2,
          isActive: true,
          content: {
            stats: [
              { number: '200+', label: 'Schools registered' },
              { number: '84K', label: 'Students managed' },
              { number: '1.2M', label: 'Reports generated' },
              { number: '99.9%', label: 'Platform uptime' }
            ]
          }
        },
        {
          pageId: newHomepage.id,
          type: 'TESTIMONIALS',
          title: 'Testimonials',
          order: 3,
          isActive: true,
          content: {
            testimonials: [
              {
                quote: "We used to spend three weeks compiling report cards. With EduPortal, the whole process takes two days.",
                author: "Abena Owusu",
                role: "Headmistress, Holy Child School",
                initials: "AO",
                color: "#4F46E5"
              },
              {
                quote: "The attendance analytics alone are worth it. I can see which classes have the worst absenteeism and act on it before the term ends.",
                author: "Kwame Darko",
                role: "Deputy Head, Presec Legon",
                initials: "KD",
                color: "#10B981"
              },
              {
                quote: "As a parent, I used to wait weeks to find out how my daughter was doing. Now I get her report on my phone the same day results are released.",
                author: "Efua Boateng",
                role: "Parent, Achimota School",
                initials: "EB",
                color: "#F59E0B"
              }
            ]
          }
        },
        {
          pageId: newHomepage.id,
          type: 'PRICING',
          title: 'Pricing Plans',
          order: 4,
          isActive: true,
          content: {
            plans: [
              {
                name: "Basic",
                price: "Free",
                period: "/ term",
                desc: "For small schools getting started. Up to 150 students.",
                popular: false,
                features: ["Up to 150 students", "Scores & grading", "Attendance tracking", "PDF report cards"],
                disabled: ["Analytics dashboard", "Email reports to parents"]
              },
              {
                name: "Standard",
                price: "GHS 299",
                period: "/ term",
                desc: "For growing schools. Up to 800 students, full feature set.",
                popular: true,
                features: ["Up to 800 students", "Scores & grading", "Attendance tracking", "PDF report cards", "Analytics dashboard", "Email reports to parents"],
                disabled: []
              },
              {
                name: "Premium",
                price: "GHS 599",
                period: "/ term",
                desc: "For large institutions. Unlimited students, priority support.",
                popular: false,
                features: ["Unlimited students", "Everything in Standard", "Bulk import & export", "Priority email support", "Custom report branding", "Dedicated account manager"],
                disabled: []
              }
            ]
          }
        },
        {
          pageId: newHomepage.id,
          type: 'FOOTER',
          title: 'Footer',
          order: 5,
          isActive: true,
          content: {
            tagline: 'A school management platform built specifically for schools in Ghana and across West Africa.'
          }
        }
      ];

      for (const section of defaultSections) {
        await prisma.cmsSection.create({ data: section });
      }

      return getDefaultLandingContent();
    }

    return buildLandingPageContent(homepage.sections, getDefaultLandingContent());
  } catch (error) {
    console.error('Error fetching landing content:', error);
    return getDefaultLandingContent();
  }
};

const saveLandingContent = async (content, userId = null) => {
  let homepage = await prisma.cmsPage.findFirst({
    where: { isHomepage: true },
    include: { sections: true }
  });

  if (!homepage) {
    homepage = await prisma.cmsPage.create({
      data: {
        title: 'Homepage',
        slug: 'home',
        content: 'Landing page content',
        isHomepage: true,
        status: 'PUBLISHED',
        publishedAt: new Date()
      }
    });
  }

  const sectionTypes = ['HERO', 'STATS', 'TESTIMONIALS', 'PRICING', 'FAQ', 'FOOTER'];

  for (const type of sectionTypes) {
    let section = homepage.sections.find((item) => item.type === type);
    const payload = content[type === 'HERO' ? 'hero' : type.toLowerCase()];

    if (!section) {
      section = await prisma.cmsSection.create({
        data: {
          pageId: homepage.id,
          type,
          title: type,
          order: 1,
          isActive: true,
          content: payload || {}
        }
      });
    } else {
      await prisma.cmsSection.update({
        where: { id: section.id },
        data: { content: { ...(section.content || {}), ...(payload || {}) } }
      });
    }
  }

  const updatedHomepage = await prisma.cmsPage.findUnique({
    where: { id: homepage.id },
    include: { sections: { orderBy: { order: 'asc' }, where: { isActive: true } } }
  });

  return buildLandingPageContent(updatedHomepage.sections, getDefaultLandingContent());
};

const updateLandingSection = async (type, contentData, userId = null) => {
  const homepage = await prisma.cmsPage.findFirst({
    where: { isHomepage: true, status: 'PUBLISHED' },
    include: { sections: true }
  });

  if (!homepage) {
    throw createError('Homepage not found', 404);
  }

  const sectionType = type.toUpperCase();
  let section = homepage.sections.find((item) => item.type === sectionType);
  const normalized = { ...(section?.content || {}) };

  if (sectionType === 'HERO') {
    normalized.heading = contentData.heading ?? contentData.headline ?? normalized.heading ?? '';
    normalized.highlight = contentData.highlight ?? contentData.headlineHighlight ?? normalized.highlight ?? '';
    normalized.subtitle = contentData.subtitle ?? normalized.subtitle ?? '';
    normalized.trustBadge = contentData.trustBadge ?? contentData.trustText ?? normalized.trustBadge ?? '';
    normalized.ctaText = contentData.ctaText ?? contentData.primaryBtn ?? normalized.ctaText ?? '';
  } else {
    Object.assign(normalized, contentData);
  }

  if (!section) {
    section = await prisma.cmsSection.create({
      data: {
        pageId: homepage.id,
        type: sectionType,
        title: sectionType,
        order: homepage.sections.length + 1,
        isActive: true,
        content: normalized
      }
    });
  } else {
    section = await prisma.cmsSection.update({
      where: { id: section.id },
      data: { content: normalized }
    });
  }

  return section;
};

const getFooter = async () => {
  const homepage = await prisma.cmsPage.findFirst({
    where: { isHomepage: true, status: 'PUBLISHED' },
    include: { sections: { where: { type: 'FOOTER', isActive: true }, orderBy: { order: 'asc' } } }
  });

  const footerSection = homepage?.sections?.[0];
  const footerContent = footerSection?.content || {};

  return {
    tagline: footerContent.tagline || footerContent.footerTagline || 'A school management platform built specifically for schools in Ghana and across West Africa.',
    links: footerContent.links || [
      { label: 'Features', url: '#features' },
      { label: 'Pricing', url: '#plans' }
    ],
    socialLinks: footerContent.socialLinks || [],
    copyright: footerContent.copyright || `© ${new Date().getFullYear()} EduPortal. All rights reserved.`
  };
};

const getTheme = async () => {
  const theme = await prisma.systemSetting.findUnique({
    where: { key: 'theme_config' }
  });

  return theme?.value || {
    primaryColor: '#4F46E5',
    secondaryColor: '#1A3C5E',
    accentColor: '#F59E0B',
    fontFamily: 'Inter',
    borderRadius: '8px',
    buttonStyle: 'rounded',
    logoUrl: null,
    faviconUrl: null,
    customCss: ''
  };
};

// ─── Default Landing Content ────────────────────────────────────
const getDefaultLandingContent = () => ({
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
  testimonials: [
    {
      quote: "We used to spend three weeks compiling report cards. With EduPortal, the whole process takes two days.",
      author: "Abena Owusu",
      role: "Headmistress, Holy Child School",
      initials: "AO",
      color: "#4F46E5"
    }
  ],
  plans: [
    {
      name: "Basic",
      price: "Free",
      period: "/ term",
      desc: "For small schools getting started. Up to 150 students.",
      popular: false,
      features: ["Up to 150 students", "Scores & grading", "Attendance tracking", "PDF report cards"],
      disabled: ["Analytics dashboard", "Email reports to parents"]
    },
    {
      name: "Standard",
      price: "GHS 299",
      period: "/ term",
      desc: "For growing schools. Up to 800 students, full feature set.",
      popular: true,
      features: ["Up to 800 students", "Scores & grading", "Attendance tracking", "PDF report cards", "Analytics dashboard", "Email reports to parents"],
      disabled: []
    },
    {
      name: "Premium",
      price: "GHS 599",
      period: "/ term",
      desc: "For large institutions. Unlimited students, priority support.",
      popular: false,
      features: ["Unlimited students", "Everything in Standard", "Bulk import & export", "Priority email support", "Custom report branding", "Dedicated account manager"],
      disabled: []
    }
  ],
  footerTagline: "A school management platform built specifically for schools in Ghana and across West Africa.",
  footerLinks: [
    { label: 'Features', url: '#features' },
    { label: 'Pricing', url: '#plans' },
    { label: 'Changelog', url: '/changelog' },
    { label: 'Roadmap', url: '/roadmap' },
    { label: 'Team', url: '/team' }
  ],
  socialLinks: [],
  footerCopyright: '© 2025 EduPortal. All rights reserved.',
  theme: {
    primaryColor: '#4F46E5',
    secondaryColor: '#1A3C5E',
    accentColor: '#F59E0B',
    fontFamily: 'Inter',
    borderRadius: '8px',
    buttonStyle: 'rounded',
    logoUrl: null,
    faviconUrl: null,
    customCss: ''
  }
});

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
  getFooter,
  getTheme,
  buildLandingPageContent,
  
  // Helpers
  getSectionContent,
  getDefaultLandingContent
};