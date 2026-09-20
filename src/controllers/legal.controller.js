const { prisma } = require("../config/db");

const DEFAULT_LEGAL_DOCUMENTS = {
  PRIVACY: {
    id: 'default-privacy',
    type: 'PRIVACY',
    title: 'Privacy Policy',
    version: '1.0',
    isActive: true,
    isPublished: true,
    content: `
      <h2>Privacy Policy</h2>
      <p>EduPortal respects the privacy of students, parents, schools, and staff.</p>
      <p>We collect only the data necessary to deliver school management, reporting, and communication services.</p>
      <ul>
        <li>Student and staff profile information required for school operations.</li>
        <li>Attendance, performance, and communication records used in academic reporting.</li>
        <li>Security and audit data used to protect the platform and investigate incidents.</li>
      </ul>
      <p>We do not sell personal data. Information is shared only with authorized school administrators and the internal services required to run the platform.</p>
      <p>Users may request access, correction, or deletion of personal data through the school administrator or support team.</p>
    `,
    updatedAt: new Date().toISOString(),
  },
  TERMS: {
    id: 'default-terms',
    type: 'TERMS',
    title: 'Terms & Conditions',
    version: '1.0',
    isActive: true,
    isPublished: true,
    content: `
      <h2>Terms & Conditions</h2>
      <p>By using EduPortal, you agree to maintain accurate school, staff, student, and guardian records.</p>
      <p>School administrators are responsible for the accuracy of data entered, the security of user accounts, and compliance with local education policies.</p>
      <p>EduPortal provides infrastructure for school administration and academic processes. The platform must not be used for unlawful activity, impersonation, or abuse.</p>
      <p>We may suspend or restrict accounts that violate these terms or jeopardize the integrity of school data.</p>
    `,
    updatedAt: new Date().toISOString(),
  },
  COOKIE: {
    id: 'default-cookie',
    type: 'COOKIE',
    title: 'Cookie Policy',
    version: '1.0',
    isActive: true,
    isPublished: true,
    content: `
      <h2>Cookie Policy</h2>
      <p>EduPortal uses cookies to remember login sessions, maintain application state, and improve functionality across the platform.</p>
      <p>We use essential cookies for authentication and session continuity. Optional analytics cookies may be used where enabled by the school or administrator.</p>
      <p>Users may configure cookie preferences in their browser settings. Disabling cookies may impact access to some features.</p>
    `,
    updatedAt: new Date().toISOString(),
  },
  GDPR: {
    id: 'default-gdpr',
    type: 'GDPR',
    title: 'GDPR Compliance',
    version: '1.0',
    isActive: true,
    isPublished: true,
    content: `
      <h2>GDPR Compliance</h2>
      <p>EduPortal is designed to help schools process personal data lawfully, transparently, and securely.</p>
      <p>We support role-based access, audit logging, consent tracking, and data minimization as part of our school management workflows.</p>
      <p>Data subjects may request disclosure, correction, or deletion of personal data through approved school processes and support channels.</p>
    `,
    updatedAt: new Date().toISOString(),
  },
};

const getDefaultDocument = (type) => {
  const key = String(type || '').toUpperCase();
  return DEFAULT_LEGAL_DOCUMENTS[key] || DEFAULT_LEGAL_DOCUMENTS.PRIVACY;
};

// Get all published legal documents
exports.getLegalDocuments = async (req, res) => {
  try {
    const documents = await prisma.legalDocument.findMany({
      where: {
        isPublished: true,
        isActive: true
      },
      select: {
        id: true,
        type: true,
        title: true,
        version: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    const safeDocuments = documents.length ? documents : Object.values(DEFAULT_LEGAL_DOCUMENTS).map(doc => ({
      id: doc.id,
      type: doc.type,
      title: doc.title,
      version: doc.version,
      updatedAt: doc.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      data: safeDocuments
    });
  } catch (error) {
    console.error('Error fetching legal documents:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch legal documents'
    });
  }
};

// Get a specific legal document by type
exports.getLegalDocumentByType = async (req, res) => {
  try {
    const { type } = req.params;

    const typeMap = {
      'privacy': 'PRIVACY',
      'privacy-policy': 'PRIVACY',
      'terms': 'TERMS',
      'terms-of-service': 'TERMS',
      'cookie': 'COOKIE',
      'cookie-policy': 'COOKIE',
      'gdpr': 'GDPR',
      'gdpr-compliance': 'GDPR',
      'dpa': 'DPA',
      'data-processing': 'DPA',
      'acceptable-use': 'ACCEPTABLE_USE',
      'refund': 'REFUND',
      'refund-policy': 'REFUND'
    };

    const documentType = typeMap[String(type).toLowerCase()] || String(type).toUpperCase();

    const document = await prisma.legalDocument.findFirst({
      where: {
        type: documentType,
        isPublished: true,
        isActive: true
      },
      orderBy: { version: 'desc' }
    });

    if (!document) {
      return res.status(200).json({
        success: true,
        data: getDefaultDocument(documentType)
      });
    }

    return res.status(200).json({
      success: true,
      data: document
    });
  } catch (error) {
    console.error('Error fetching legal document:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch legal document'
    });
  }
};