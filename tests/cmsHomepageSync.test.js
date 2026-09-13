const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLandingPageContent } = require('../src/services/cms.service');

test('buildLandingPageContent maps the CMS section payload into the public homepage contract', () => {
  const sections = [
    {
      type: 'HERO',
      content: {
        heading: 'Build brighter learning journeys.',
        highlight: 'Keep every child on track.',
        subtitle: 'Smart school operations for every term.',
        trustBadge: 'Trusted by schools across Africa'
      }
    },
    {
      type: 'STATS',
      content: {
        stats: [
          { number: '250+', label: 'Schools' },
          { number: '18K', label: 'Students' }
        ]
      }
    },
    {
      type: 'TESTIMONIALS',
      content: {
        testimonials: [
          { author: 'Jane Doe', quote: 'Amazing platform.' }
        ]
      }
    },
    {
      type: 'PRICING',
      content: {
        plans: [
          { name: 'Starter', price: 'Free', features: ['Attendance'] }
        ]
      }
    },
    {
      type: 'FOOTER',
      content: {
        tagline: 'A platform built for modern schools.'
      }
    }
  ];

  const content = buildLandingPageContent(sections);

  assert.equal(content.heroHeadline, 'Build brighter learning journeys.');
  assert.equal(content.heroHeadlineHighlight, 'Keep every child on track.');
  assert.equal(content.heroSubtitle, 'Smart school operations for every term.');
  assert.equal(content.heroTrustText, 'Trusted by schools across Africa');
  assert.equal(content.stats[0].label, 'Schools');
  assert.equal(content.testimonials[0].author, 'Jane Doe');
  assert.equal(content.plans[0].name, 'Starter');
  assert.equal(content.footerTagline, 'A platform built for modern schools.');
});
