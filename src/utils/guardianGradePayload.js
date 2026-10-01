function normalizeGuardianGradePayload(scores = []) {
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
      const caTotal = s.caTotal ?? (([s.ca1, s.ca2, s.ca3].filter((v) => v !== null && v !== undefined && v !== '').reduce((sum, value) => sum + Number(value), 0) / Math.max([s.ca1, s.ca2, s.ca3].filter((v) => v !== null && v !== undefined && v !== '').length, 1)) / 10 * 30);
      const examScore = s.examScore ?? 0;
      const total = s.total ?? (caTotal + ((examScore / 100) * 70));

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
    };
  });
}

module.exports = {
  normalizeGuardianGradePayload,
};
