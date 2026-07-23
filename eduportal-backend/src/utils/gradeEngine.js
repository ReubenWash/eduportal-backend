/**
 * EduTrack Grade Engine
 * Implements Ghana Education Service (GES) grading standards for JHS
 */

// Default GES grading scale — can be overridden per school via DB config
const DEFAULT_GRADE_SCALE = [
  { min: 80, max: 100, grade: "1", remark: "Excellent"      },
  { min: 70, max: 79,  grade: "2", remark: "Very Good"      },
  { min: 60, max: 69,  grade: "3", remark: "Good"           },
  { min: 50, max: 59,  grade: "4", remark: "Average"        },
  { min: 40, max: 49,  grade: "5", remark: "Below Average"  },
  { min: 0,  max: 39,  grade: "6", remark: "Fail"           },
];

/**
 * Compute the CA total (normalised to 30)
 * Takes up to 3 CA scores (each max 10), averages them, scales to 30
 * @param {number|null} ca1
 * @param {number|null} ca2
 * @param {number|null} ca3
 * @returns {number} CA total out of 30
 */
const computeCATotal = (ca1, ca2, ca3) => {
  const scores = [ca1, ca2, ca3].filter((s) => s !== null && s !== undefined);
  if (scores.length === 0) return 0;

  const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  // Each CA is out of 10, average normalised to 30
  return parseFloat(((avg / 10) * 30).toFixed(2));
};

/**
 * Compute the exam score normalised to 70
 * Raw exam score is out of 100, scaled to 70
 * @param {number|null} examScore
 * @returns {number} Exam contribution out of 70
 */
const computeExamContribution = (examScore) => {
  if (examScore === null || examScore === undefined) return 0;
  return parseFloat(((examScore / 100) * 70).toFixed(2));
};

/**
 * Compute the total score out of 100
 * @param {number} caTotal      - CA contribution (out of 30)
 * @param {number} examContrib  - Exam contribution (out of 70)
 * @returns {number} Total score out of 100
 */
const computeTotal = (caTotal, examContrib) => {
  return parseFloat((caTotal + examContrib).toFixed(2));
};

/**
 * Get grade and remark from total score
 * @param {number} total - Total score (0–100)
 * @param {Array}  scale - Optional custom grade scale
 * @returns {{ grade: string, remark: string }}
 */
const getGradeAndRemark = (total, scale = DEFAULT_GRADE_SCALE) => {
  for (const entry of scale) {
    if (total >= entry.min && total <= entry.max) {
      return { grade: entry.grade, remark: entry.remark };
    }
  }
  return { grade: "6", remark: "Fail" };
};

/**
 * Full score computation for one student-subject-term record
 * @param {{ ca1, ca2, ca3, examScore }} scoreData
 * @param {Array} gradeScale - Optional custom scale
 * @returns {{ caTotal, examContribution, total, grade, remark }}
 */
const computeScore = (scoreData, gradeScale = DEFAULT_GRADE_SCALE) => {
  const { ca1, ca2, ca3, examScore } = scoreData;

  const caTotal          = computeCATotal(ca1, ca2, ca3);
  const examContribution = computeExamContribution(examScore);
  const total            = computeTotal(caTotal, examContribution);
  const { grade, remark } = getGradeAndRemark(total, gradeScale);

  return { caTotal, examContribution, total, grade, remark };
};

/**
 * Compute class positions for an array of student score totals
 * Students with equal totals share the same position (dense rank)
 * @param {Array<{ studentId: string, total: number }>} scores
 * @returns {Array<{ studentId: string, total: number, position: number }>}
 */
const computePositions = (scores) => {
  // Sort descending by total
  const sorted = [...scores].sort((a, b) => b.total - a.total);

  let position = 1;
  return sorted.map((entry, index) => {
    if (index > 0 && entry.total < sorted[index - 1].total) {
      position = index + 1;
    }
    return { ...entry, position };
  });
};

/**
 * Compute aggregate score (sum of best N subject grades)
 * Used for JHS 3 BECE-prep tracking — lower aggregate is better
 * @param {Array<string>} grades - Array of grade strings (e.g. ["1","2","3",...])
 * @param {number} best - Number of best subjects to sum (default 6)
 * @returns {number} Aggregate score
 */
const computeAggregate = (grades, best = 6) => {
  const numeric = grades
    .map((g) => parseInt(g))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b); // sort ascending (lower grade = better)

  return numeric.slice(0, best).reduce((sum, g) => sum + g, 0);
};

/**
 * Validate a score value is within allowed range
 * @param {number} score
 * @param {number} max
 * @returns {boolean}
 */
const isValidScore = (score, max = 100) => {
  return score !== null && score !== undefined && score >= 0 && score <= max;
};

module.exports = {
  DEFAULT_GRADE_SCALE,
  computeCATotal,
  computeExamContribution,
  computeTotal,
  getGradeAndRemark,
  computeScore,
  computePositions,
  computeAggregate,
  isValidScore,
};
