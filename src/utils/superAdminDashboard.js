const formatActivityType = (type) => {
  switch (type) {
    case 'APPROVED':
    case 'ACTIVE':
      return 'approved';
    case 'PENDING':
      return 'pending';
    case 'REJECTED':
      return 'rejected';
    case 'USER':
    case 'USER_CREATED':
      return 'user';
    default:
      return 'approved';
  }
};

const formatTimeAgo = (createdAt) => {
  if (!createdAt) return 'just now';

  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now - created;
  const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));

  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};

const buildSuperAdminDashboardPayload = ({ totals, registrationTrend, recentActivity }) => {
  const summary = {
    totalSchools: totals?.schools ?? 0,
    activeSchools: totals?.activeSchools ?? 0,
    totalStudents: totals?.students ?? 0,
    totalStaff: totals?.staff ?? 0,
    verifiedUsers: totals?.verifiedUsers ?? 0,
    pendingApplications: totals?.pendingApplications ?? 0,
  };

  return {
    ...summary,
    stats: [
      {
        label: 'Total Schools',
        value: totals?.schools ?? 0,
        change: 'Live platform count',
        icon: 'School',
        color: 'indigo',
        bg: 'bg-indigo-50',
        text: 'text-indigo-600',
      },
      {
        label: 'Active Schools',
        value: totals?.activeSchools ?? 0,
        change: 'Currently active',
        icon: 'Activity',
        color: 'emerald',
        bg: 'bg-emerald-50',
        text: 'text-emerald-600',
      },
      {
        label: 'Total Students',
        value: totals?.students ?? 0,
        change: 'From all schools',
        icon: 'Users',
        color: 'violet',
        bg: 'bg-violet-50',
        text: 'text-violet-600',
      },
      {
        label: 'Total Staff',
        value: totals?.staff ?? 0,
        change: 'Across the platform',
        icon: 'Users',
        color: 'sky',
        bg: 'bg-sky-50',
        text: 'text-sky-600',
      },
      {
        label: 'Verified Users',
        value: totals?.verifiedUsers ?? 0,
        change: 'Verified accounts',
        icon: 'ShieldCheck',
        color: 'emerald',
        bg: 'bg-emerald-50',
        text: 'text-emerald-600',
      },
      {
        label: 'Pending Applications',
        value: totals?.pendingApplications ?? 0,
        change: 'Needs review',
        icon: 'Clock',
        color: 'amber',
        bg: 'bg-amber-50',
        text: 'text-amber-600',
      },
    ],
    registrationTrend: Array.isArray(registrationTrend)
      ? registrationTrend.map((item) => ({ month: item.month, schools: Number(item.schools ?? item.count ?? 0) }))
      : [],
    recentActivity: (Array.isArray(recentActivity) ? recentActivity : []).map((activity) => ({
      id: activity.id,
      type: formatActivityType(activity.type),
      text: activity.text,
      time: formatTimeAgo(activity.createdAt),
    })),
  };
};

module.exports = {
  buildSuperAdminDashboardPayload,
};
