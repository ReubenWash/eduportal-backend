const getTermStatusForDate = (term, now = new Date()) => {
  if (term.status === "COMPLETED") return "COMPLETED";

  const startDate = new Date(term.startDate);
  const endDate = new Date(term.endDate);
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setUTCDate(endOfToday.getUTCDate() + 1);
  endOfToday.setUTCMilliseconds(-1);

  if (endDate < startOfToday) return "COMPLETED";
  if (startDate <= endOfToday) return "ACTIVE";
  return "UPCOMING";
};

module.exports = { getTermStatusForDate };
