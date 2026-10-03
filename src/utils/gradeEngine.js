/**
 * EduTrack Grade Engine
 *
 * Every number and label this produces comes from the SCHOOL'S OWN
 * gradingConfig (School.gradingConfig, set via Settings > Grading). There
 * is no "default" scale a real school ever actually sees — the constants
 * below exist only as what a school starts with before it configures
 * anything, so the admin's settings are always the live source of truth,
 * not a fallback that silently stays in effect forever.
 */

const DEFAULT_GRADE_SCALE = [
  { min: 90, max: 100, grade: "A1", remark: "Excellent" },
  { min: 80, max: 89,  grade: "B2", remark: "Very Good" },
  { min: 75, max: 79,  grade: "B3", remark: "Good" },
  { min: 70, max: 74,  grade: "C4", remark: "Fair" },
  { min: 65, max: 69,  grade: "C5", remark: "Satisfactory" },
  { min: 60, max: 64,  grade: "C6", remark: "Credit" },
  { min: 55, max: 59,  grade: "D7", remark: "Pass" },
  { min: 50, max: 54,  grade: "E8", remark: "Weak" },
  { min: 0,  max: 49,  grade: "F9", remark: "Fail" },
];

const GRADE_REMARKS = {
  A1: "Excellent", B2: "Very Good", B3: "Good", C4: "Fair",
  C5: "Satisfactory", C6: "Credit", D7: "Pass", E8: "Weak", F9: "Fail",
};

// What a school starts with before visiting Settings > Grading.
const DEFAULT_GRADING_CONFIG = {
  caCount: 3,
  caMaxScore: 10,    // max score per individual CA
  examMaxScore: 70,  // exam's weight out of 100 (CA weight = 100 - this)
  boundaries: { A1: 90, B2: 80, B3: 75, C4: 70, C5: 65, C6: 60, D7: 55, E8: 50 },
};

/**
 * Convert a { A1: 90, B2: 80, ... } boundary map into the internal
 * min/max scale array getGradeAndRemark() uses, sorted descending by
 * threshold. Falls back to the default GES boundaries if the map is
 * missing, empty, or malformed.
 */
const boundariesToScale = (boundaries) => {
  const src = boundaries && typeof boundaries === "object" && Object.keys(boundaries).length
    ? boundaries
    : DEFAULT_GRADING_CONFIG.boundaries;

  const entries = Object.entries(src)
    .map(([grade, min]) => ({ grade, min: Number(min) }))
    .filter((e) => !Number.isNaN(e.min))
    .sort((a, b) => b.min - a.min);

  if (entries.length === 0) return DEFAULT_GRADE_SCALE;

  const scale = entries.map((entry, i) => ({
    grade: entry.grade,
    min: entry.min,
    max: i === 0 ? 100 : entries[i - 1].min - 1,
    remark: GRADE_REMARKS[entry.grade] || entry.grade,
  }));

  const lowest = entries[entries.length - 1];
  scale.push({ min: 0, max: lowest.min - 1, grade: "F9", remark: "Fail" });

  return scale;
};

/**
 * Normalise a school's raw stored gradingConfig (possibly null/undefined/
 * partial) into a complete, safe config with a ready-to-use `scale` and
 * derived `caWeight`. This is the single object every consumer — score
 * computation, the PDF, the teacher's entry page, the student/parent
 * portals — should read caMaxScore/examMaxScore/caWeight/scale from,
 * rather than each inventing its own copy of these numbers.
 */
const resolveGradingConfig = (rawConfig) => {
  const cfg = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
  const boundaries = {
    ...DEFAULT_GRADING_CONFIG.boundaries,
    ...(cfg.boundaries && typeof cfg.boundaries === "object" ? cfg.boundaries : {}),
  };

  const examMaxScore = Number(cfg.examMaxScore) || DEFAULT_GRADING_CONFIG.examMaxScore;

  return {
    caCount:      Number(cfg.caCount)    || DEFAULT_GRADING_CONFIG.caCount,
    caMaxScore:   Number(cfg.caMaxScore) || DEFAULT_GRADING_CONFIG.caMaxScore,
    examMaxScore,
    caWeight:     100 - examMaxScore,
    boundaries,
    scale: boundariesToScale(boundaries),
  };
};

const computeCATotal = (ca1, ca2, ca3, config = DEFAULT_GRADING_CONFIG) => {
  const scores = [ca1, ca2, ca3].filter((s) => s !== null && s !== undefined);
  if (scores.length === 0) return 0;

  const caWeight = config.caWeight ?? (100 - (config.examMaxScore ?? DEFAULT_GRADING_CONFIG.examMaxScore));
  const maxPerCA = config.caMaxScore ?? DEFAULT_GRADING_CONFIG.caMaxScore;
  const avg      = scores.reduce((sum, s) => sum + s, 0) / scores.length;

  return parseFloat(((avg / maxPerCA) * caWeight).toFixed(2));
};

// Exam is always entered/stored as a raw score out of 100, then scaled to
// the school's configured exam weight — never "out of examMaxScore" directly.
const computeExamContribution = (examScore, config = DEFAULT_GRADING_CONFIG) => {
  if (examScore === null || examScore === undefined) return 0;
  const examWeight = config.examMaxScore ?? DEFAULT_GRADING_CONFIG.examMaxScore;
  return parseFloat(((examScore / 100) * examWeight).toFixed(2));
};

const computeTotal = (caTotal, examContrib) => {
  return parseFloat((caTotal + examContrib).toFixed(2));
};

const getGradeAndRemark = (total, scale = DEFAULT_GRADE_SCALE) => {
  for (const entry of scale) {
    if (total >= entry.min && total <= entry.max) {
      return { grade: entry.grade, remark: entry.remark };
    }
  }
  return { grade: "F9", remark: "Fail" };
};

/**
 * Full score computation for one student-subject-term record.
 * @param {{ ca1, ca2, ca3, examScore }} scoreData
 * @param {Object|null} rawGradingConfig - School.gradingConfig as stored (raw JSON, may be null)
 */
const computeScore = (scoreData, rawGradingConfig) => {
  const config = resolveGradingConfig(rawGradingConfig);
  const { ca1, ca2, ca3, examScore } = scoreData;

  const caTotal           = computeCATotal(ca1, ca2, ca3, config);
  const examContribution  = computeExamContribution(examScore, config);
  const total             = computeTotal(caTotal, examContribution);
  const { grade, remark } = getGradeAndRemark(total, config.scale);

  return { caTotal, examContribution, total, grade, remark };
};

const computePositions = (scores) => {
  const sorted = [...scores].sort((a, b) => b.total - a.total);
  let position = 1;
  return sorted.map((entry, index) => {
    if (index > 0 && entry.total < sorted[index - 1].total) {
      position = index + 1;
    }
    return { ...entry, position };
  });
};

const gradeToRank = (grade) => {
  if (grade === null || grade === undefined || grade === '') return null;
  if (typeof grade === 'number') return grade;
  const normalized = String(grade).trim().toUpperCase();
  const mapping = {
    A1: 1, B2: 2, B3: 3, C4: 4, C5: 5, C6: 6, D7: 7, E8: 8, F9: 9,
    1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  };
  return mapping[normalized] ?? null;
};

const computeAggregate = (grades, best = 6) => {
  const numeric = grades
    .map((g) => gradeToRank(g))
    .filter((n) => n !== null && n !== undefined)
    .sort((a, b) => a - b);
  return numeric.slice(0, best).reduce((sum, g) => sum + g, 0);
};

const isValidScore = (score, max = 100) => {
  return score !== null && score !== undefined && score >= 0 && score <= max;
};

module.exports = {
  DEFAULT_GRADE_SCALE,
  DEFAULT_GRADING_CONFIG,
  GRADE_REMARKS,
  boundariesToScale,
  resolveGradingConfig,
  computeCATotal,
  computeExamContribution,
  computeTotal,
  getGradeAndRemark,
  computeScore,
  computePositions,
  computeAggregate,
  isValidScore,
};