const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");

// ─────────────────────────────────────────────────────
// PLAN DEFINITIONS
// ─────────────────────────────────────────────────────

const getDefaultPlans = async () => {
  const plans = await prisma.planDefinition.findMany({
    where: { isActive: true },
    orderBy: { price: 'asc' }
  });

  if (plans.length === 0) {
    // Seed default plans if none exist
    await seedDefaultPlans();
    return prisma.planDefinition.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' }
    });
  }

  return plans;
};

const seedDefaultPlans = async () => {
  const defaultPlans = [
    {
      name: 'BASIC',
      displayName: 'Basic',
      price: 0,
      currency: 'USD',
      billingCycle: 'MONTHLY',
      features: [
        'Up to 200 students',
        '3 staff accounts',
        'Basic reports',
        'Email support'
      ],
      limits: {
        students: 200,
        staff: 3,
        reports: 'basic',
        analytics: false,
        sms: false,
        api: false,
        branding: false
      },
      isActive: true,
      isDefault: true,
      description: 'Perfect for small schools starting out'
    },
    {
      name: 'STANDARD',
      displayName: 'Standard',
      price: 199,
      currency: 'USD',
      billingCycle: 'MONTHLY',
      features: [
        'Up to 800 students',
        '15 staff accounts',
        'Advanced reports',
        'SMS notifications',
        'Priority support'
      ],
      limits: {
        students: 800,
        staff: 15,
        reports: 'advanced',
        analytics: true,
        sms: true,
        api: false,
        branding: false
      },
      isActive: true,
      isDefault: false,
      description: 'Most popular choice for growing schools'
    },
    {
      name: 'PREMIUM',
      displayName: 'Premium',
      price: 499,
      currency: 'USD',
      billingCycle: 'MONTHLY',
      features: [
        'Unlimited students',
        'Unlimited staff',
        'Full analytics',
        'API access',
        'Custom branding',
        '24/7 support'
      ],
      limits: {
        students: -1, // Unlimited
        staff: -1,    // Unlimited
        reports: 'full',
        analytics: true,
        sms: true,
        api: true,
        branding: true
      },
      isActive: true,
      isDefault: false,
      description: 'Everything you need for maximum impact'
    }
  ];

  for (const plan of defaultPlans) {
    await prisma.planDefinition.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan
    });
  }
};

// ─────────────────────────────────────────────────────
// PLAN CRUD (SUPER_ADMIN)
// ─────────────────────────────────────────────────────

const createPlan = async (data) => {
  const { name, displayName, price, currency, billingCycle, features, limits, description, isDefault } = data;

  if (!name || !displayName) {
    throw createError("Plan name and displayName are required", 400);
  }

  const existing = await prisma.planDefinition.findUnique({ where: { name } });
  if (existing) {
    throw createError(`A plan named "${name}" already exists`, 409);
  }

  return prisma.planDefinition.create({
    data: {
      name,
      displayName,
      price: price ?? 0,
      currency: currency || 'USD',
      billingCycle: billingCycle || 'MONTHLY',
      features: features || [],
      limits: limits || {},
      description: description || null,
      isActive: true,
      isDefault: !!isDefault,
    }
  });
};

const updatePlan = async (planId, data) => {
  const plan = await prisma.planDefinition.findUnique({ where: { id: planId } });
  if (!plan) throw createError("Plan not found", 404);

  const { displayName, price, currency, billingCycle, features, limits, description, isActive, isDefault } = data;
  const updateData = {
    ...(displayName  !== undefined && { displayName }),
    ...(price        !== undefined && { price }),
    ...(currency     !== undefined && { currency }),
    ...(billingCycle !== undefined && { billingCycle }),
    ...(features      !== undefined && { features }),
    ...(limits       !== undefined && { limits }),
    ...(description  !== undefined && { description }),
    ...(isActive      !== undefined && { isActive }),
    ...(isDefault      !== undefined && { isDefault }),
  };

  return prisma.planDefinition.update({ where: { id: planId }, data: updateData });
};

const deletePlan = async (planId) => {
  const plan = await prisma.planDefinition.findUnique({ where: { id: planId } });
  if (!plan) throw createError("Plan not found", 404);

  const inUse = await prisma.subscription.count({ where: { plan: plan.name, status: 'ACTIVE' } });
  if (inUse > 0) {
    // Don't hard-delete a plan schools are actively subscribed to — deactivate instead.
    return prisma.planDefinition.update({ where: { id: planId }, data: { isActive: false } });
  }

  await prisma.planDefinition.delete({ where: { id: planId } });
  return { id: planId, deleted: true };
};

// ─────────────────────────────────────────────────────
// SUBSCRIPTION CRUD
// ─────────────────────────────────────────────────────

const getSubscriptions = async (query) => {
  const { page = 1, limit = 20, status, plan, search } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (status) where.status = status;
  if (plan) where.plan = plan;
  if (search) {
    where.school = {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    };
  }

  const [subscriptions, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            region: true,
            district: true
          }
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: {
          select: {
            payments: true
          }
        }
      }
    }),
    prisma.subscription.count({ where })
  ]);

  return {
    data: subscriptions,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    }
  };
};

const getSubscriptionById = async (subscriptionId) => {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          region: true,
          district: true,
          address: true,
          status: true,
          logoUrl: true
        }
      },
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 10
      },
      invoices: {
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    }
  });

  if (!subscription) {
    throw createError('Subscription not found', 404);
  }

  return subscription;
};

const getSchoolSubscription = async (schoolId) => {
  const subscription = await prisma.subscription.findUnique({
    where: { schoolId },
    include: {
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 5
      },
      invoices: {
        orderBy: { createdAt: 'desc' },
        take: 5
      }
    }
  });

  if (!subscription) {
    // Create default subscription for school
    return createSubscription(schoolId, { plan: 'BASIC' });
  }

  return subscription;
};

const createSubscription = async (schoolId, data) => {
  const { plan = 'BASIC', autoRenew = true, trialEndDate } = data;

  // Check if school exists
  const school = await prisma.school.findUnique({
    where: { id: schoolId }
  });

  if (!school) {
    throw createError('School not found', 404);
  }

  // Check if subscription already exists
  const existing = await prisma.subscription.findUnique({
    where: { schoolId }
  });

  if (existing) {
    return existing;
  }

  // Get plan definition for pricing
  const planDef = await prisma.planDefinition.findUnique({
    where: { name: plan }
  });

  const subscription = await prisma.subscription.create({
    data: {
      schoolId,
      plan,
      status: 'ACTIVE',
      autoRenew,
      price: planDef?.price || 0,
      currency: planDef?.currency || 'USD',
      startDate: new Date(),
      trialEndDate: trialEndDate ? new Date(trialEndDate) : null,
      endDate: trialEndDate ? new Date(trialEndDate) : null
    }
  });

  // Update school plan
  await prisma.school.update({
    where: { id: schoolId },
    data: { plan }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      schoolId,
      action: 'CREATE',
      resource: 'SUBSCRIPTION',
      resourceId: subscription.id,
      metadata: { plan, autoRenew }
    }
  });

  return subscription;
};

const updateSubscription = async (subscriptionId, data) => {
  const { plan, status, autoRenew, price } = data;

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { school: true }
  });

  if (!subscription) {
    throw createError('Subscription not found', 404);
  }

  const oldPlan = subscription.plan;
  const updateData = {};

  if (plan) {
    updateData.plan = plan;
    // Update school plan too
    await prisma.school.update({
      where: { id: subscription.schoolId },
      data: { plan }
    });
  }

  if (status) updateData.status = status;
  if (autoRenew !== undefined) updateData.autoRenew = autoRenew;
  if (price !== undefined) updateData.price = price;

  if (status === 'CANCELED') {
    updateData.canceledAt = new Date();
  }

  if (status === 'ACTIVE' && subscription.status === 'CANCELED') {
    updateData.canceledAt = null;
  }

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: updateData,
    include: {
      school: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      schoolId: subscription.schoolId,
      userId: subscription.schoolId, // Will be updated with actual user
      action: 'UPDATE',
      resource: 'SUBSCRIPTION',
      resourceId: subscriptionId,
      metadata: {
        oldPlan,
        newPlan: plan || oldPlan,
        oldStatus: subscription.status,
        newStatus: status || subscription.status
      }
    }
  });

  return updated;
};

const cancelSubscription = async (subscriptionId) => {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { school: true }
  });

  if (!subscription) {
    throw createError('Subscription not found', 404);
  }

  if (subscription.status === 'CANCELED') {
    throw createError('Subscription is already canceled', 400);
  }

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'CANCELED',
      autoRenew: false,
      canceledAt: new Date()
    }
  });

  return updated;
};

// ─────────────────────────────────────────────────────
// PAYMENTS
// ─────────────────────────────────────────────────────

const getPayments = async (query) => {
  const { page = 1, limit = 20, status, schoolId } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (status) where.status = status;
  if (schoolId) where.schoolId = schoolId;

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
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
        subscription: {
          select: {
            id: true,
            plan: true,
            status: true
          }
        }
      }
    }),
    prisma.payment.count({ where })
  ]);

  return {
    data: payments,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    }
  };
};

const createPayment = async (data) => {
  const { subscriptionId, schoolId, amount, currency = 'USD', method, description, metadata } = data;

  // Validate subscription exists
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId }
  });

  if (!subscription) {
    throw createError('Subscription not found', 404);
  }

  // Generate invoice number
  const invoiceNumber = `INV-${String(Date.now()).slice(-6)}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;

  const payment = await prisma.payment.create({
    data: {
      subscriptionId,
      schoolId,
      invoiceNumber,
      amount,
      currency,
      method,
      status: 'SUCCEEDED',
      description,
      metadata,
      paidAt: new Date()
    }
  });

  // Create invoice
  await prisma.invoice.create({
    data: {
      invoiceNumber,
      subscriptionId,
      schoolId,
      amount,
      currency,
      status: 'PAID',
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      paidDate: new Date(),
      lineItems: [
        {
          description: `Subscription: ${subscription.plan}`,
          amount,
          quantity: 1
        }
      ]
    }
  });

  // Update subscription if needed
  if (subscription.status === 'PAST_DUE') {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'ACTIVE' }
    });
  }

  return payment;
};

const createInvoice = async (subscriptionId, data) => {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId }
  });

  if (!subscription) {
    throw createError('Subscription not found', 404);
  }

  const invoiceNumber = `INV-${String(Date.now()).slice(-6)}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      subscriptionId,
      schoolId: subscription.schoolId,
      amount: data.amount || subscription.price || 0,
      currency: data.currency || subscription.currency || 'USD',
      status: 'SENT',
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lineItems: data.lineItems || [
        {
          description: `Subscription: ${subscription.plan}`,
          amount: data.amount || subscription.price || 0,
          quantity: 1
        }
      ],
      tax: data.tax || 0,
      discount: data.discount || 0,
      notes: data.notes || null
    }
  });

  return invoice;
};

// ─────────────────────────────────────────────────────
// REVENUE ANALYTICS
// ─────────────────────────────────────────────────────

const getRevenueAnalytics = async (query) => {
  const { period = 'monthly', months = 6 } = query;

  // Get MRR (Monthly Recurring Revenue)
  const activeSubscriptions = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      price: { not: null }
    },
    select: {
      price: true,
      currency: true
    }
  });

  const mrr = activeSubscriptions.reduce((sum, sub) => sum + (sub.price || 0), 0);

  // Get paying schools count
  const payingSchools = await prisma.subscription.count({
    where: {
      status: 'ACTIVE',
      plan: { not: 'BASIC' }
    }
  });

  // Get total schools
  const totalSchools = await prisma.school.count();

  // Get revenue growth (compare last month vs previous month)
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

  const [lastMonthRevenue, previousMonthRevenue] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        status: 'SUCCEEDED',
        paidAt: {
          gte: lastMonth,
          lt: now
        }
      },
      _sum: { amount: true }
    }),
    prisma.payment.aggregate({
      where: {
        status: 'SUCCEEDED',
        paidAt: {
          gte: twoMonthsAgo,
          lt: lastMonth
        }
      },
      _sum: { amount: true }
    })
  ]);

  const currentMonth = lastMonthRevenue._sum.amount || 0;
  const previousMonth = previousMonthRevenue._sum.amount || 0;
  const growth = previousMonth > 0 ? ((currentMonth - previousMonth) / previousMonth) * 100 : 0;

  // Get revenue trend (last N months)
  const trend = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    
    const revenue = await prisma.payment.aggregate({
      where: {
        status: 'SUCCEEDED',
        paidAt: {
          gte: monthStart,
          lt: monthEnd
        }
      },
      _sum: { amount: true }
    });

    trend.push({
      month: monthStart.toLocaleString('default', { month: 'short' }),
      revenue: revenue._sum.amount || 0
    });
  }

  // Get plan distribution
  const planDistribution = await prisma.subscription.groupBy({
    by: ['plan'],
    _count: { id: true },
    where: { status: 'ACTIVE' }
  });

  // Get recent payments
  const recentPayments = await prisma.payment.findMany({
    where: { status: 'SUCCEEDED' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      school: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      subscription: {
        select: {
          id: true,
          plan: true
        }
      }
    }
  });

  // Get total revenue
  const totalRevenue = await prisma.payment.aggregate({
    where: { status: 'SUCCEEDED' },
    _sum: { amount: true }
  });

  return {
    mrr,
    payingSchools,
    totalSchools,
    growth: parseFloat(growth.toFixed(1)),
    totalRevenue: totalRevenue._sum.amount || 0,
    trend,
    planDistribution: planDistribution.map(p => ({
      plan: p.plan,
      count: p._count.id
    })),
    recentPayments
  };
};

// ─────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────

module.exports = {
  getDefaultPlans,
  seedDefaultPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getSubscriptions,
  getSubscriptionById,
  getSchoolSubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  getPayments,
  createPayment,
  createInvoice,
  getRevenueAnalytics
};