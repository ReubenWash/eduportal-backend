const { prisma } = require("../../config/db");

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); d.setDate(1); d.setHours(0, 0, 0, 0); return d; };
const monthLabel = (d) => d.toLocaleString("en-US", { month: "short" });
const dayLabel = (d) => d.toLocaleString("en-US", { weekday: "short" });

const pctDelta = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

const getKpis = async () => {
  const now = new Date();
  const last30 = daysAgo(30);
  const prev30 = daysAgo(60);

  const [totalSchools, schoolsLast30, schoolsPrev30] = await Promise.all([
    prisma.school.count(),
    prisma.school.count({ where: { createdAt: { gte: last30 } } }),
    prisma.school.count({ where: { createdAt: { gte: prev30, lt: last30 } } }),
  ]);

  const [totalUsers, usersLast30, usersPrev30] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: last30 } } }),
    prisma.user.count({ where: { createdAt: { gte: prev30, lt: last30 } } }),
  ]);

  const [totalStudents, studentsLast30, studentsPrev30] = await Promise.all([
    prisma.student.count(),
    prisma.student.count({ where: { createdAt: { gte: last30 } } }),
    prisma.student.count({ where: { createdAt: { gte: prev30, lt: last30 } } }),
  ]);

  const [presentCount, totalAttendance] = await Promise.all([
    prisma.attendance.count({ where: { date: { gte: last30 }, status: "PRESENT" } }),
    prisma.attendance.count({ where: { date: { gte: last30 } } }),
  ]);
  const avgAttendance = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 1000) / 10 : 0;

  return {
    totalSchools:  { value: totalSchools,  deltaPct: pctDelta(schoolsLast30, schoolsPrev30) },
    totalUsers:    { value: totalUsers,    deltaPct: pctDelta(usersLast30, usersPrev30) },
    totalStudents: { value: totalStudents, deltaPct: pctDelta(studentsLast30, studentsPrev30) },
    avgAttendance: { value: avgAttendance },
  };
};

const getSchoolGrowth = async () => {
  const since = monthsAgo(5); // last 6 months including current
  const schools = await prisma.school.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const baseline = await prisma.school.count({ where: { createdAt: { lt: since } } });

  const months = [];
  for (let i = 5; i >= 0; i--) months.push(monthsAgo(i));

  let cumulative = baseline;
  return months.map((monthStart, idx) => {
    const monthEnd = idx < months.length - 1 ? months[idx + 1] : new Date();
    const countInMonth = schools.filter((s) => s.createdAt >= monthStart && s.createdAt < monthEnd).length;
    cumulative += countInMonth;
    return { month: monthLabel(monthStart), schools: cumulative };
  });
};

const getUserActivity = async () => {
  const since = startOfDay(daysAgo(6));
  const logs = await prisma.auditLog.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, action: true },
  });

  const days = [];
  for (let i = 6; i >= 0; i--) days.push(startOfDay(daysAgo(i)));

  return days.map((dayStart, idx) => {
    const dayEnd = idx < days.length - 1 ? days[idx + 1] : new Date();
    const dayLogs = logs.filter((l) => l.createdAt >= dayStart && l.createdAt < dayEnd);
    const logins = dayLogs.filter((l) => l.action === "LOGIN").length;
    const actions = dayLogs.length - logins;
    return { day: dayLabel(dayStart), logins, actions };
  });
};

const getPlanDistribution = async () => {
  const grouped = await prisma.school.groupBy({ by: ["plan"], _count: { plan: true } });
  return grouped.map((g) => ({ name: g.plan, value: g._count.plan }));
};

const getAttendanceTrend = async () => {
  const since = monthsAgo(5);
  const records = await prisma.attendance.findMany({
    where: { date: { gte: since } },
    select: { date: true, status: true },
  });

  const months = [];
  for (let i = 5; i >= 0; i--) months.push(monthsAgo(i));

  return months.map((monthStart, idx) => {
    const monthEnd = idx < months.length - 1 ? months[idx + 1] : new Date();
    const inMonth = records.filter((r) => r.date >= monthStart && r.date < monthEnd);
    const present = inMonth.filter((r) => r.status === "PRESENT").length;
    const rate = inMonth.length > 0 ? Math.round((present / inMonth.length) * 1000) / 10 : 0;
    return { month: monthLabel(monthStart), rate };
  });
};

const getPlatformAnalytics = async () => {
  const [kpis, schoolGrowth, userActivity, planDistribution, attendanceTrend] = await Promise.all([
    getKpis(),
    getSchoolGrowth(),
    getUserActivity(),
    getPlanDistribution(),
    getAttendanceTrend(),
  ]);

  return { kpis, schoolGrowth, userActivity, planDistribution, attendanceTrend };
};

module.exports = { getPlatformAnalytics };
