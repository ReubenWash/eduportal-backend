const subscriptionService = require("../../services/subscription.service");
const { sendSuccess } = require("../../utils/apiResponse");
const { createError } = require("../../middleware/errorHandler");

// ─────────────────────────────────────────────────────
// GET /api/v1/admin/subscriptions
// ─────────────────────────────────────────────────────
const getSubscriptions = async (req, res) => {
  const result = await subscriptionService.getSubscriptions(req.query);
  return sendSuccess(res, 200, "Subscriptions fetched", result);
};

// ─────────────────────────────────────────────────────
// GET /api/v1/admin/subscriptions/:id
// ─────────────────────────────────────────────────────
const getSubscriptionById = async (req, res) => {
  const subscription = await subscriptionService.getSubscriptionById(req.params.id);
  return sendSuccess(res, 200, "Subscription fetched", subscription);
};

// ─────────────────────────────────────────────────────
// GET /api/v1/admin/subscriptions/school/:schoolId
// ─────────────────────────────────────────────────────
const getSchoolSubscription = async (req, res) => {
  const subscription = await subscriptionService.getSchoolSubscription(req.params.schoolId);
  return sendSuccess(res, 200, "School subscription fetched", subscription);
};

// ─────────────────────────────────────────────────────
// POST /api/v1/admin/subscriptions
// ─────────────────────────────────────────────────────
const createSubscription = async (req, res) => {
  const { schoolId, plan, autoRenew, trialEndDate } = req.body;
  
  if (!schoolId) {
    throw createError("School ID is required", 400);
  }

  const subscription = await subscriptionService.createSubscription(schoolId, {
    plan,
    autoRenew,
    trialEndDate
  });

  return sendSuccess(res, 201, "Subscription created", subscription);
};

// ─────────────────────────────────────────────────────
// PATCH /api/v1/admin/subscriptions/:id
// ─────────────────────────────────────────────────────
const updateSubscription = async (req, res) => {
  const { plan, status, autoRenew, price } = req.body;
  
  const subscription = await subscriptionService.updateSubscription(req.params.id, {
    plan,
    status,
    autoRenew,
    price
  });

  return sendSuccess(res, 200, "Subscription updated", subscription);
};

// ─────────────────────────────────────────────────────
// POST /api/v1/admin/subscriptions/:id/cancel
// ─────────────────────────────────────────────────────
const cancelSubscription = async (req, res) => {
  const subscription = await subscriptionService.cancelSubscription(req.params.id);
  return sendSuccess(res, 200, "Subscription canceled", subscription);
};

// ─────────────────────────────────────────────────────
// GET /api/v1/admin/payments
// ─────────────────────────────────────────────────────
const getPayments = async (req, res) => {
  const result = await subscriptionService.getPayments(req.query);
  return sendSuccess(res, 200, "Payments fetched", result);
};

// ─────────────────────────────────────────────────────
// POST /api/v1/admin/payments
// ─────────────────────────────────────────────────────
const createPayment = async (req, res) => {
  const { subscriptionId, schoolId, amount, method, description, metadata } = req.body;

  if (!subscriptionId || !schoolId || !amount) {
    throw createError("Subscription ID, school ID, and amount are required", 400);
  }

  const payment = await subscriptionService.createPayment({
    subscriptionId,
    schoolId,
    amount,
    method,
    description,
    metadata
  });

  return sendSuccess(res, 201, "Payment created", payment);
};

// ─────────────────────────────────────────────────────
// POST /api/v1/admin/invoices
// ─────────────────────────────────────────────────────
const createInvoice = async (req, res) => {
  const { subscriptionId, amount, currency, lineItems, tax, discount, notes } = req.body;

  if (!subscriptionId) {
    throw createError("Subscription ID is required", 400);
  }

  const invoice = await subscriptionService.createInvoice(subscriptionId, {
    amount,
    currency,
    lineItems,
    tax,
    discount,
    notes
  });

  return sendSuccess(res, 201, "Invoice created", invoice);
};

// ─────────────────────────────────────────────────────
// GET /api/v1/admin/subscriptions/revenue
// ─────────────────────────────────────────────────────
const getRevenueAnalytics = async (req, res) => {
  const analytics = await subscriptionService.getRevenueAnalytics(req.query);
  return sendSuccess(res, 200, "Revenue analytics fetched", analytics);
};

// ─────────────────────────────────────────────────────
// GET /api/v1/admin/subscriptions/plans
// ─────────────────────────────────────────────────────
const getPlans = async (req, res) => {
  const plans = await subscriptionService.getDefaultPlans();
  return sendSuccess(res, 200, "Plans fetched", plans);
};

// ─────────────────────────────────────────────────────
// POST /api/v1/admin/subscriptions/plans
// ─────────────────────────────────────────────────────
const createPlan = async (req, res) => {
  const plan = await subscriptionService.createPlan(req.body);
  return sendSuccess(res, 201, "Plan created", plan);
};

// ─────────────────────────────────────────────────────
// PATCH /api/v1/admin/subscriptions/plans/:id
// ─────────────────────────────────────────────────────
const updatePlan = async (req, res) => {
  const plan = await subscriptionService.updatePlan(req.params.id, req.body);
  return sendSuccess(res, 200, "Plan updated", plan);
};

// ─────────────────────────────────────────────────────
// DELETE /api/v1/admin/subscriptions/plans/:id
// ─────────────────────────────────────────────────────
const deletePlan = async (req, res) => {
  const result = await subscriptionService.deletePlan(req.params.id);
  return sendSuccess(res, 200, "Plan deleted", result);
};

module.exports = {
  getSubscriptions,
  getSubscriptionById,
  getSchoolSubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  getPayments,
  createPayment,
  createInvoice,
  getRevenueAnalytics,
  getPlans,
  createPlan,
  updatePlan,
  deletePlan
};