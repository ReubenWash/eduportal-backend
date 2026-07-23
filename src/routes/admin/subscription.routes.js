const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/subscription.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

router.use(authenticate, isSuperAdmin);

// Plans
router.get('/plans', controller.getPlans);
router.post('/plans', controller.createPlan);
router.patch('/plans/:id', controller.updatePlan);
router.delete('/plans/:id', controller.deletePlan);

// Subscriptions
router.get('/subscriptions', controller.getSubscriptions);
router.get('/subscriptions/school/:schoolId', controller.getSchoolSubscription);
router.get('/subscriptions/:id', controller.getSubscriptionById);
router.post('/subscriptions', controller.createSubscription);
router.patch('/subscriptions/:id', controller.updateSubscription);
router.post('/subscriptions/:id/cancel', controller.cancelSubscription);

// Payments
router.get('/payments', controller.getPayments);
router.post('/payments', controller.createPayment);

// Invoices
router.post('/invoices', controller.createInvoice);

// Revenue Analytics
router.get('/revenue', controller.getRevenueAnalytics);

module.exports = router;