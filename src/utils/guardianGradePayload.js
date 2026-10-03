const { resolveGradingConfig, computeCATotal, computeExamContribution } = require('./gradeEngine');

/**
 * Shared by both the student self-view (getMyGrades) and the guardian/
 * parent view (getChildGrades) — one fix here covers both.
 *
 * @param {Array} scores - Raw Score rows with .term and .subject included
 * @param {Object|null} rawGradingConfig - The school's School.gradingConfig (raw, may be null)
 */
function normalizeGuardianGradePayload(scores = [], rawGradingConfig = null) {
  const config = resolveGradingConfig(rawGradingConfig);
  const groups = {};

  scores.forEach((score) => {
    const term = score?.term || {};
    const key = `${term.academicYear || 'unknown'}-${term.termNumber || 'unknown'}`;

    if (!groups[key]) {
      groups[key] = {
        term: {
          id: term.id || null,
          academicYear: term.academicYear || '',
          termNumber: term.termNumber || '',
          termLabel: term.termLabel || `${term.academicYear || ''} - ${String(term.termNumber || '').replace('TERM', 'Term ')}`.trim(),
        },
        scores: [],
      };
    }

    groups[key].scores.push(score);
  });

  return Object.values(groups).map((group) => {
    const subjects = group.scores.map((s) => {
      // Prefer the already-computed, already-correct values stored on the
      // Score row (set by score.service.js using this same school's
      // config). Only fall back to recomputing here for old/incomplete
      // rows — and when we do, use the REAL config, not a hardcoded split.
      const caTotal = s.caTotal ?? computeCATotal(s.ca1, s.ca2, s.ca3, config);
      const examScore = s.examScore ?? 0;
      const total = s.total ?? (caTotal + computeExamContribution(examScore, config));

      return {
        id: s.id,
        subjectId: s.subjectId,
        subjectName: s.subject?.name || s.subjectName || 'Subject',
        subjectCode: s.subject?.code || s.subjectCode || '',
        subjectType: s.subject?.type || s.subjectType || '',
        ca1: s.ca1,
        ca2: s.ca2,
        ca3: s.ca3,
        caTotal: Number(caTotal.toFixed(2)),
        examScore,
        total: Number(total.toFixed(2)),
        grade: s.grade || '—',
        remark: s.remark || '',
        position: s.position ?? null,
      };
    });

    const average = group.scores.length > 0
      ? Math.round(group.scores.reduce((sum, s) => sum + Number(s.total ?? 0), 0) / group.scores.length)
      : 0;

    return {
      term: {
        id: group.term.id,
        academicYear: group.term.academicYear,
        termNumber: group.term.termNumber,
        termLabel: group.term.termLabel || `${group.term.academicYear} - ${String(group.term.termNumber || '').replace('TERM', 'Term ')}`,
      },
      subjects,
      average,
      // The school's real CA/exam structure, so the student/parent portals
      // can render accurate "/X" labels instead of assuming 10/30/70.
      // Attached per term-group (not wrapped) so this stays a plain array —
      // the shape every existing frontend consumer already expects.
      gradingConfig: {
        caCount: config.caCount,
        caMaxScore: config.caMaxScore,
        examMaxScore: config.examMaxScore,
        caWeight: config.caWeight,
      },
    };
  });
}

module.exports = {
  normalizeGuardianGradePayload,
};