const express = require('express');
const router = express.Router();
const { 
  getLandingPage,
  getCmsPageBySlug,
  getPublicPages
} = require('../controllers/cms.controller');

// Public CMS routes (no authentication required)
router.get('/landing', getLandingPage);
router.get('/pages', getPublicPages);
router.get('/pages/:slug', getCmsPageBySlug);

module.exports = router;