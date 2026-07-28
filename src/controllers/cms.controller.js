const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get landing page content
exports.getLandingPage = async (req, res) => {
  try {
    // Find the landing page (isHomepage = true)
    let landingPage = await prisma.cmsPage.findFirst({
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

    // If no landing page exists, create one with default content
    if (!landingPage) {
      landingPage = await createDefaultLandingPage();
    }

    // Transform CMS data into the format expected by the landing page
    const content = transformCmsData(landingPage);
    
    res.json({ 
      success: true, 
      content,
      page: {
        id: landingPage.id,
        title: landingPage.title,
        slug: landingPage.slug,
        updatedAt: landingPage.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching landing page:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch landing page' 
    });
  }
};

// Get a specific CMS page by slug
exports.getCmsPageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    
    const page = await prisma.cmsPage.findUnique({
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

    if (!page) {
      return res.status(404).json({ 
        success: false, 
        error: 'Page not found' 
      });
    }

    res.json({ 
      success: true, 
      page 
    });
  } catch (error) {
    console.error('Error fetching CMS page:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch page' 
    });
  }
};

// Get all public pages
exports.getPublicPages = async (req, res) => {
  try {
    const pages = await prisma.cmsPage.findMany({
      where: { 
        status: 'PUBLISHED',
        isHomepage: false
      },
      select: {
        id: true,
        slug: true,
        title: true,
        metaTitle: true,
        metaDescription: true,
        publishedAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ 
      success: true, 
      pages 
    });
  } catch (error) {
    console.error('Error fetching public pages:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch pages' 
    });
  }
};

// Helper: Create default landing page
async function createDefaultLandingPage() {
  const defaultContent = {
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
    schools: ["Accra Academy", "Presec Legon", "Wesley Girls", "Achimota School", "Aburi Girls", "Holy Child"],
    testimonials: [
      { quote: "We used to spend three weeks compiling report cards...", author: "Abena Owusu", role: "Headmistress, Holy Child School", initials: "AO", color: "#4F46E5" }
    ],
    plans: [
      { name: "Basic", price: "Free", period: "/ term", desc: "For small schools getting started.", popular: false, features: ["Up to 150 students"], disabled: ["Analytics dashboard"] }
    ],
    footerTagline: "A school management platform built specifically for schools in Ghana and across West Africa."
  };

  // Create the landing page
  const page = await prisma.cmsPage.create({
    data: {
      title: 'Home',
      slug: 'home',
      isHomepage: true,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sections: {
        create: [
          {
            type: 'HERO',
            title: 'Hero Section',
            order: 1,
            isActive: true,
            content: {
              headline: defaultContent.heroHeadline,
              headlineHighlight: defaultContent.heroHeadlineHighlight,
              subtitle: defaultContent.heroSubtitle,
              primaryBtn: defaultContent.heroPrimaryBtn,
              trustText: defaultContent.heroTrustText
            }
          },
          {
            type: 'STATS',
            title: 'Statistics',
            order: 2,
            isActive: true,
            content: { stats: defaultContent.stats }
          },
          {
            type: 'PRICING',
            title: 'Pricing Plans',
            order: 3,
            isActive: true,
            content: { plans: defaultContent.plans }
          },
          {
            type: 'TESTIMONIALS',
            title: 'Testimonials',
            order: 4,
            isActive: true,
            content: { testimonials: defaultContent.testimonials }
          },
          {
            type: 'FOOTER',
            title: 'Footer',
            order: 5,
            isActive: true,
            content: { tagline: defaultContent.footerTagline }
          }
        ]
      }
    }
  });

  return page;
}

// Helper: Transform CMS data to landing page format
function transformCmsData(page) {
  const content = {};
  
  // Add schools (hardcoded for now, can be moved to CMS later)
  content.schools = ["Accra Academy", "Presec Legon", "Wesley Girls", "Achimota School", "Aburi Girls", "Holy Child"];
  
  page.sections.forEach(section => {
    switch (section.type) {
      case 'HERO':
        content.heroHeadline = section.content?.headline || 'Run your school.';
        content.heroHeadlineHighlight = section.content?.headlineHighlight || 'Not paperwork.';
        content.heroSubtitle = section.content?.subtitle || 'EduPortal gives school administrators...';
        content.heroPrimaryBtn = section.content?.primaryBtn || 'Register your school';
        content.heroTrustText = section.content?.trustText || 'Trusted by 200+ schools...';
        break;
      case 'STATS':
        content.stats = section.content?.stats || [];
        break;
      case 'PRICING':
        content.plans = section.content?.plans || [];
        break;
      case 'TESTIMONIALS':
        content.testimonials = section.content?.testimonials || [];
        break;
      case 'FOOTER':
        content.footerTagline = section.content?.tagline || 'A school management platform...';
        break;
    }
  });
  
  return content;
}