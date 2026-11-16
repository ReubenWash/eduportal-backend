const test = require("node:test");
const assert = require("node:assert/strict");
const { getTermStatusForDate } = require("../src/utils/termStatus");

const makeTerm = (startDate, endDate, status = "ACTIVE") => ({ startDate, endDate, status });

test("an active term ending before today is completed", () => {
  const term = makeTerm("2026-09-01T00:00:00.000Z", "2026-10-22T00:00:00.000Z");
  assert.equal(getTermStatusForDate(term, new Date("2026-11-15T12:00:00.000Z")), "COMPLETED");
});

test("a term remains active throughout its end date", () => {
  const term = makeTerm("2026-10-01T00:00:00.000Z", "2026-11-15T00:00:00.000Z");
  assert.equal(getTermStatusForDate(term, new Date("2026-11-15T12:00:00.000Z")), "ACTIVE");
});

test("a term starting tomorrow remains upcoming", () => {
  const term = makeTerm("2026-11-16T00:00:00.000Z", "2027-02-01T00:00:00.000Z", "UPCOMING");
  assert.equal(getTermStatusForDate(term, new Date("2026-11-15T12:00:00.000Z")), "UPCOMING");
});

test("a manually completed term remains completed", () => {
  const term = makeTerm("2026-11-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z", "COMPLETED");
  assert.equal(getTermStatusForDate(term, new Date("2026-11-15T12:00:00.000Z")), "COMPLETED");
});
