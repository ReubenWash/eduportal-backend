const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");

// ─────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────

const generateTicketNumber = async () => {
  const count = await prisma.supportTicket.count();
  return `TKT-${String(count + 1).padStart(3, '0')}`;
};

// ─────────────────────────────────────────────────────
// TICKET CRUD
// ─────────────────────────────────────────────────────

const getTickets = async (query) => {
  const { 
    page = 1, 
    limit = 20, 
    status, 
    priority, 
    category,
    assignedTo,
    schoolId,
    userId,
    search 
  } = query;
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (category) where.category = category;
  if (assignedTo) where.assignedTo = assignedTo;
  if (schoolId) where.schoolId = schoolId;
  if (userId) where.userId = userId;
  
  if (search) {
    where.OR = [
      { subject: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { ticketNumber: { contains: search, mode: 'insensitive' } }
    ];
  }

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      skip,
      take,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ],
      include: {
        school: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            region: true
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            staff: {
              select: { firstName: true, lastName: true }
            }
          }
        },
        assignee: {
          select: {
            id: true,
            email: true,
            staff: {
              select: { firstName: true, lastName: true }
            }
          }
        },
        _count: {
          select: {
            messages: true
          }
        }
      }
    }),
    prisma.supportTicket.count({ where })
  ]);

  // Get ticket stats
  const stats = await Promise.all([
    prisma.supportTicket.count({ where: { status: 'OPEN' } }),
    prisma.supportTicket.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.supportTicket.count({ where: { status: 'RESOLVED' } }),
    prisma.supportTicket.count({ where: { status: 'CLOSED' } }),
    prisma.supportTicket.count({ where: { priority: 'URGENT' } }),
    prisma.supportTicket.count({ where: { priority: 'HIGH' } }),
  ]);

  return {
    data: tickets,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    },
    stats: {
      open: stats[0],
      inProgress: stats[1],
      resolved: stats[2],
      closed: stats[3],
      urgent: stats[4],
      high: stats[5]
    }
  };
};

const getTicketById = async (ticketId) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          region: true,
          district: true
        }
      },
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          staff: {
            select: { firstName: true, lastName: true, photoUrl: true }
          },
          studentProfile: {
            select: { firstName: true, lastName: true }
          },
          guardianProfile: {
            select: { firstName: true, lastName: true }
          }
        }
      },
      assignee: {
        select: {
          id: true,
          email: true,
          staff: {
            select: { firstName: true, lastName: true, photoUrl: true }
          }
        }
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              staff: {
                select: { firstName: true, lastName: true, photoUrl: true }
              }
            }
          }
        }
      },
      attachments: {
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!ticket) {
    throw createError('Ticket not found', 404);
  }

  return ticket;
};

const createTicket = async (data) => {
  const { 
    schoolId, 
    userId, 
    subject, 
    description, 
    priority = 'MEDIUM',
    category = 'GENERAL',
    assignedTo = null,
    source = 'portal'
  } = data;

  if (!userId) {
    throw createError('User ID is required', 400);
  }

  const ticketNumber = await generateTicketNumber();

  const ticket = await prisma.supportTicket.create({
    data: {
      ticketNumber,
      schoolId: schoolId || null,
      userId,
      subject,
      description,
      priority,
      category,
      assignedTo,
      source,
      status: 'OPEN'
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true
        }
      },
      school: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId,
      schoolId: schoolId || null,
      action: 'CREATE',
      resource: 'SUPPORT_TICKET',
      resourceId: ticket.id,
      metadata: { ticketNumber, subject, priority }
    }
  });

  return ticket;
};

const updateTicket = async (ticketId, data) => {
  const { status, priority, assignedTo, subject, description } = data;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { user: true }
  });

  if (!ticket) {
    throw createError('Ticket not found', 404);
  }

  const updateData = {};
  if (status) updateData.status = status;
  if (priority) updateData.priority = priority;
  if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
  if (subject) updateData.subject = subject;
  if (description) updateData.description = description;

  if (status === 'RESOLVED' && ticket.status !== 'RESOLVED') {
    updateData.resolvedAt = new Date();
  }

  if (status === 'CLOSED' && ticket.status !== 'CLOSED') {
    updateData.closedAt = new Date();
  }

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: updateData,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true
        }
      },
      school: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: ticket.userId,
      schoolId: ticket.schoolId || null,
      action: 'UPDATE',
      resource: 'SUPPORT_TICKET',
      resourceId: ticketId,
      metadata: { 
        oldStatus: ticket.status,
        newStatus: status || ticket.status,
        oldPriority: ticket.priority,
        newPriority: priority || ticket.priority
      }
    }
  });

  return updated;
};

const addTicketMessage = async (ticketId, data) => {
  const { userId, message, isInternal = false, attachments = [] } = data;

  if (!userId || !message) {
    throw createError('User ID and message are required', 400);
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId }
  });

  if (!ticket) {
    throw createError('Ticket not found', 404);
  }

  // If ticket is closed, reopen it
  if (ticket.status === 'CLOSED') {
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'OPEN' }
    });
  }

  const ticketMessage = await prisma.ticketMessage.create({
    data: {
      ticketId,
      userId,
      message,
      isInternal,
      attachments: attachments.length > 0 ? attachments : null
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          staff: {
            select: { firstName: true, lastName: true }
          }
        }
      }
    }
  });

  // Update ticket status if not internal
  if (!isInternal && ticket.status === 'OPEN') {
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'IN_PROGRESS' }
    });
  }

  return ticketMessage;
};

const assignTicket = async (ticketId, assigneeId) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId }
  });

  if (!ticket) {
    throw createError('Ticket not found', 404);
  }

  const assignee = await prisma.user.findUnique({
    where: { id: assigneeId }
  });

  if (!assignee) {
    throw createError('Assignee not found', 404);
  }

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { 
      assignedTo: assigneeId,
      status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true
        }
      },
      assignee: {
        select: {
          id: true,
          email: true,
          staff: {
            select: { firstName: true, lastName: true }
          }
        }
      }
    }
  });

  return updated;
};

const resolveTicket = async (ticketId, rating = null, ratingComment = null) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId }
  });

  if (!ticket) {
    throw createError('Ticket not found', 404);
  }

  if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
    throw createError('Ticket is already resolved or closed', 400);
  }

  const updateData = {
    status: 'RESOLVED',
    resolvedAt: new Date()
  };

  if (rating !== null) {
    updateData.rating = rating;
    if (ratingComment) updateData.ratingComment = ratingComment;
  }

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: updateData,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true
        }
      },
      assignee: {
        select: {
          id: true,
          email: true,
          staff: {
            select: { firstName: true, lastName: true }
          }
        }
      }
    }
  });

  return updated;
};

const closeTicket = async (ticketId) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId }
  });

  if (!ticket) {
    throw createError('Ticket not found', 404);
  }

  if (ticket.status === 'CLOSED') {
    throw createError('Ticket is already closed', 400);
  }

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { 
      status: 'CLOSED',
      closedAt: new Date()
    }
  });

  return updated;
};

// ─────────────────────────────────────────────────────
// FEEDBACK & RATINGS
// ─────────────────────────────────────────────────────

const getFeedback = async (query) => {
  const { page = 1, limit = 20, rating, category, schoolId } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (rating) where.rating = parseInt(rating);
  if (category) where.category = category;
  if (schoolId) where.schoolId = schoolId;

  const [feedback, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            staff: {
              select: { firstName: true, lastName: true }
            }
          }
        },
        replies: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                staff: {
                  select: { firstName: true, lastName: true }
                }
              }
            }
          }
        }
      }
    }),
    prisma.feedback.count({ where })
  ]);

  // Get rating statistics
  const ratingStats = await prisma.feedback.groupBy({
    by: ['rating'],
    _count: { id: true }
  });

  return {
    data: feedback,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    },
    ratingStats: ratingStats.map(r => ({
      rating: r.rating,
      count: r._count.id
    }))
  };
};

const createFeedback = async (data) => {
  const { schoolId, userId, rating, comment, category = 'General', isPublic = true } = data;

  if (!schoolId || rating === undefined) {
    throw createError('School ID and rating are required', 400);
  }

  const feedback = await prisma.feedback.create({
    data: {
      schoolId,
      userId: userId || null,
      rating: parseInt(rating),
      comment: comment || null,
      category,
      isPublic
    },
    include: {
      school: {
        select: {
          id: true,
          name: true
        }
      },
      user: {
        select: {
          id: true,
          email: true
        }
      }
    }
  });

  return feedback;
};

const replyToFeedback = async (feedbackId, data) => {
  const { userId, reply, isPublic = true } = data;

  if (!userId || !reply) {
    throw createError('User ID and reply are required', 400);
  }

  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId }
  });

  if (!feedback) {
    throw createError('Feedback not found', 404);
  }

  const feedbackReply = await prisma.feedbackReply.create({
    data: {
      feedbackId,
      userId,
      reply,
      isPublic
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          staff: {
            select: { firstName: true, lastName: true }
          }
        }
      }
    }
  });

  // Update feedback responded status
  await prisma.feedback.update({
    where: { id: feedbackId },
    data: { respondedAt: new Date() }
  });

  return feedbackReply;
};

const markFeedbackHelpful = async (feedbackId, isHelpful) => {
  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId }
  });

  if (!feedback) {
    throw createError('Feedback not found', 404);
  }

  const updateData = {};
  if (isHelpful) {
    updateData.helpfulCount = { increment: 1 };
  } else {
    updateData.notHelpfulCount = { increment: 1 };
  }

  const updated = await prisma.feedback.update({
    where: { id: feedbackId },
    data: updateData
  });

  return updated;
};

// ─────────────────────────────────────────────────────
// KNOWLEDGE BASE / FAQ
// ─────────────────────────────────────────────────────

const getKnowledgeArticles = async (query) => {
  const { page = 1, limit = 20, category, search, published = 'true' } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (category) where.category = category;
  if (published === 'true') where.isPublished = true;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { content: { contains: search, mode: 'insensitive' } },
      { tags: { has: search } }
    ];
  }

  const [articles, total] = await Promise.all([
    prisma.knowledgeArticle.findMany({
      where,
      skip,
      take,
      orderBy: { viewCount: 'desc' }
    }),
    prisma.knowledgeArticle.count({ where })
  ]);

  return {
    data: articles,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    }
  };
};

const getKnowledgeArticle = async (slug) => {
  const article = await prisma.knowledgeArticle.findUnique({
    where: { slug }
  });

  if (!article) {
    throw createError('Article not found', 404);
  }

  // Increment view count
  await prisma.knowledgeArticle.update({
    where: { id: article.id },
    data: { viewCount: { increment: 1 } }
  });

  return article;
};

const createKnowledgeArticle = async (data) => {
  const { title, content, category, tags, isPublished = false } = data;

  if (!title || !content) {
    throw createError('Title and content are required', 400);
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  const article = await prisma.knowledgeArticle.create({
    data: {
      slug,
      title,
      content,
      category: category || null,
      tags: tags || [],
      isPublished,
      publishedAt: isPublished ? new Date() : null
    }
  });

  return article;
};

const updateKnowledgeArticle = async (id, data) => {
  const article = await prisma.knowledgeArticle.findUnique({
    where: { id }
  });

  if (!article) {
    throw createError('Article not found', 404);
  }

  const updateData = {};
  if (data.title) {
    updateData.title = data.title;
    updateData.slug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }
  if (data.content) updateData.content = data.content;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.tags) updateData.tags = data.tags;
  
  if (data.isPublished !== undefined) {
    updateData.isPublished = data.isPublished;
    if (data.isPublished && !article.isPublished) {
      updateData.publishedAt = new Date();
    }
  }

  const updated = await prisma.knowledgeArticle.update({
    where: { id },
    data: updateData
  });

  return updated;
};

const deleteKnowledgeArticle = async (id) => {
  const article = await prisma.knowledgeArticle.findUnique({
    where: { id }
  });

  if (!article) {
    throw createError('Article not found', 404);
  }

  await prisma.knowledgeArticle.delete({
    where: { id }
  });

  return { message: 'Article deleted successfully' };
};

const markArticleHelpful = async (id, isHelpful) => {
  const article = await prisma.knowledgeArticle.findUnique({
    where: { id }
  });

  if (!article) {
    throw createError('Article not found', 404);
  }

  const updateData = {};
  if (isHelpful) {
    updateData.helpfulCount = { increment: 1 };
  } else {
    updateData.notHelpfulCount = { increment: 1 };
  }

  const updated = await prisma.knowledgeArticle.update({
    where: { id },
    data: updateData
  });

  return updated;
};

// ─────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────

module.exports = {
  // Tickets
  getTickets,
  getTicketById,
  createTicket,
  updateTicket,
  addTicketMessage,
  assignTicket,
  resolveTicket,
  closeTicket,
  
  // Feedback
  getFeedback,
  createFeedback,
  replyToFeedback,
  markFeedbackHelpful,
  
  // Knowledge Base
  getKnowledgeArticles,
  getKnowledgeArticle,
  createKnowledgeArticle,
  updateKnowledgeArticle,
  deleteKnowledgeArticle,
  markArticleHelpful
};