const { prisma } = require("../config/db");

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monthLabel = (d) => d.toLocaleString("en-US", { month: "short" });

// ── KPI cards ────────────────────────────────────────────────
const getKpis = async () => {
  const now = new Date();
  const monthAgo = addDays(now, -30);

  const [totalSchools, totalUsers, totalStudents, schoolsLastMonth, usersLastMonth, studentsLastMonth, attendanceAgg] =
    await Promise.all([
      prisma.school.count(),
      prisma.user.count(),
      prisma.student.count(),
      prisma.school.count({ where: { createdAt: { lt: monthAgo } } }),
      prisma.user.count({ where: { createdAt: { lt: monthAgo } } }),
      prisma.student.count({ where: { createdAt: { lt: monthAgo } } }),
      prisma.attendance.groupBy({ by: ["status"], _count: true, where: { date: { gte: monthAgo } } }),
    ]);

  const attendanceTotal = attendanceAgg.reduce((s, a) => s + a._count, 0);
  const attendancePresent = attendanceAgg.find((a) => a.status === "PRESENT")?._count || 0;
  const avgAttendance = attendanceTotal > 0 ? (attendancePresent / attendanceTotal) * 100 : 0;

  const pctChange = (current, previous) =>
    previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(1)) : 0;

  return {
    totalSchools:  { value: totalSchools,  deltaPct: pctChange(totalSchools, schoolsLastMonth) },
    totalUsers:    { value: totalUsers,    deltaPct: pctChange(totalUsers, usersLastMonth) },
    totalStudents: { value: totalStudents, deltaPct: pctChange(totalStudents, studentsLastMonth) },
    avgAttendance: { value: Number(avgAttendance.toFixed(1)), deltaPct: null },
  };
};

// ── School growth: cumulative school count, last 6 months ────
const getSchoolGrowth = async () => {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d);
  }
  const results = [];
  for (const monthStart of months) {
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    const count = await prisma.school.count({ where: { createdAt: { lt: monthEnd } } });
    results.push({ month: monthLabel(monthStart), schools: count });
  }
  return results;
};

// ── Daily user activity (logins + audit actions), last 7 days ─
const getUserActivity = async () => {
  const today = startOfDay(new Date());
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(today, -i));

  const results = [];
  for (const day of days) {
    const nextDay = addDays(day, 1);
    const [logins, actions] = await Promise.all([
      prisma.auditLog.count({ where: { action: "LOGIN", createdAt: { gte: day, lt: nextDay } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: day, lt: nextDay } } }),
    ]);
    results.push({ day: day.toLocaleString("en-US", { weekday: "short" }), logins, actions });
  }
  return results;
};

// ── Plan distribution across schools ──────────────────────────
const getPlanDistribution = async () => {
  const counts = await prisma.school.groupBy({ by: ["plan"], _count: true });
  return counts.map((c) => ({ name: c.plan, value: c._count }));
};

// ── Platform-wide attendance trend, last 6 months ─────────────
const getAttendanceTrend = async () => {
  const now = new Date();
  const results = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const agg = await prisma.attendance.groupBy({
      by: ["status"],
      _count: true,
      where: { date: { gte: monthStart, lt: monthEnd } },
    });
    const total = agg.reduce((s, a) => s + a._count, 0);
    const present = agg.find((a) => a.status === "PRESENT")?._count || 0;
    results.push({ month: monthLabel(monthStart), rate: total > 0 ? Number(((present / total) * 100).toFixed(1)) : 0 });
  }
  return results;
};

const getFullDashboard = async () => {
  const [kpis, schoolGrowth, userActivity, planDistribution, attendanceTrend] = await Promise.all([
    getKpis(),
    getSchoolGrowth(),
    getUserActivity(),
    getPlanDistribution(),
    getAttendanceTrend(),
  ]);
  return { kpis, schoolGrowth, userActivity, planDistribution, attendanceTrend };
};

module.exports = { getFullDashboard, getKpis, getSchoolGrowth, getUserActivity, getPlanDistribution, getAttendanceTrend };
