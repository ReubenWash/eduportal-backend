const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSuperAdminDashboardPayload } = require('../src/utils/superAdminDashboard');

test('builds dashboard payload from backend stats', () => {
  const payload = buildSuperAdminDashboardPayload({
    totals: {
      schools: 10,
      activeSchools: 8,
      students: 520,
      staff: 62,
      verifiedUsers: 70,
      pendingApplications: 2,
    },
    registrationTrend: [
      { month: 'Jun', count: 3 },
      { month: 'Jul', count: 5 },
    ],
    recentActivity: [
      {
        id: 'school-1',
        type: 'PENDING',
        text: 'Pending registration: Example School',
        createdAt: '2026-07-19T10:00:00.000Z',
      },
    ],
  });

  assert.equal(payload.totalSchools, 10);
  assert.equal(payload.activeSchools, 8);
  assert.equal(payload.totalStudents, 520);
  assert.equal(payload.totalStaff, 62);
  assert.equal(payload.verifiedUsers, 70);
  assert.equal(payload.pendingApplications, 2);
  assert.equal(payload.registrationTrend[0].month, 'Jun');
  assert.equal(payload.registrationTrend[1].schools, 5);
  assert.equal(payload.recentActivity[0].type, 'pending');
});
