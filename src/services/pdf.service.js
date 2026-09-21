/**
 * EduTrack JHS — PDF Service (pdfkit)
 *
 * Report card layout follows the "Learner's Terminal Report" template:
 *   header (student photo | school name, address, contact, motto | school logo)
 *   banner, learner details, subject table (class score, exam score, total,
 *   position, remarks), attendance / promoted to, attitude / conduct / interest,
 *   class teacher's remarks, headteacher's signature.
 *
 * Data sources (nothing is hard-coded to one school):
 *   School profile  -> name, logoUrl, address, phone (CONTACT), motto
 *   school.reportConfig (Settings > Report Card design) -> primaryColor, title,
 *       principalSignatureUrl, classTeacherSignatureUrl, footerText, show* flags
 *   Score           -> caTotal (out of 30), examScore (scaled to 70), total, remark, position
 *   Term            -> academicYear, termNumber, nextTermDate (NEXT TERM BEGINS), endDate (VACATION DATE)
 *   Report          -> classPosition, daysPresent/totalSchoolDays, teacherRemark,
 *                      attitude, conduct, interest, promotedTo
 *   Class           -> level/section, class teacher name, number on roll (enrollment count)
 *
 * Optional reportConfig keys (no UI needed, they fall back to the school profile):
 *   postalAddress, contact, motto, logoUrl,
 *   classScoreWeight (default 30), examScoreWeight (default 70)  -> header labels only,
 *   showAllSubjects (default true: list every subject of the class, blank if not scored yet)
 *
 * buildReportPDF(reportId)      -> renders and returns the PDF Buffer (no request to Cloudinary)
 * generateReportPDF(reportId)   -> buildReportPDF + upload to Cloudinary + save pdfUrl (email links)
 */

const PDFDocument = require('pdfkit');
const axios = require('axios');
const { prisma } = require("../config/db");
const cloudinary = require("../config/cloudinary");
const { createError } = require("../middleware/errorHandler");
const logger = require("../config/logger");
const { computeCATotal, computeExamContribution, computeTotal } = require("../utils/gradeEngine");
const { cleanFileName, studentFullName, studentResultsFileName, storedResultsPublicId } = require("../utils/fileNames");
const crypto = require("crypto");
const { pdfImageUrl } = require("../utils/imageUrl");
const path = require("path");
const fs = require("fs");
const os = require("os");

// ─────────────────────────────────────────────────────────────
// ─── Fonts ─────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// The built-in PDF fonts (Helvetica) cannot draw Ghanaian letters such as Ɛ ɛ Ɔ ɔ
// (e.g. "YƐYƐ ADEHYƐ" in a school motto). Liberation Sans has the same metrics as
// Helvetica and includes them. The two .ttf files live in src/assets/fonts/.
// If they are missing, the service falls back to Helvetica.
const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");
const BOLD = 'RC-Bold';
const REGULAR = 'RC-Regular';
const fontFile = (file, fallback) => {
  const p = path.join(FONT_DIR, file);
  return fs.existsSync(p) ? p : fallback;
};

// Registers the two report fonts. pdfkit only parses a font file the first time it is used,
// so each font is opened here straight away. If a file is missing, empty or damaged (for
// example a binary file that was copy-pasted as text), the PDF still builds with Helvetica
// instead of crashing, and a warning is logged.
const registerReportFonts = (doc) => {
  [
    [REGULAR, 'LiberationSans-Regular.ttf', 'Helvetica'],
    [BOLD, 'LiberationSans-Bold.ttf', 'Helvetica-Bold'],
  ].forEach(([name, file, fallback]) => {
    try {
      doc.registerFont(name, fontFile(file, fallback));
      doc.font(name);
    } catch (error) {
      logger.warn(`Report font ${file} could not be loaded (${error.message}). Using ${fallback} instead.`);
      doc.registerFont(name, fallback);
      doc.font(name);
    }
  });
};

// ─────────────────────────────────────────────────────────────
// ─── Small helpers ─────────────────────────────────────────
// ─────────────────────────────────────────────────────────────

const TERM_WORDS = { TERM1: 'ONE', TERM2: 'TWO', TERM3: 'THREE' };

const hasVal = (v) => v !== null && v !== undefined;

const num = (n) => (Number.isInteger(n) ? String(n) : String(Number(Number(n).toFixed(1))));

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`.toUpperCase();
};

const fmtDate = (v) => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-GB');
};

// ─────────────────────────────────────────────────────────────
// ─── Data loading ──────────────────────────────────────────
// ─────────────────────────────────────────────────────────────

const fetchReportData = async (reportId) => {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      student: true,
      term: {
        include: {
          school: {
            select: {
              id: true, name: true, logoUrl: true, motto: true,
              address: true, phone: true, reportConfig: true,
            },
          },
        },
      },
    },
  });

  if (!report) throw createError("Report not found.", 404);

  const scores = await prisma.score.findMany({
    where: { studentId: report.studentId, termId: report.termId },
    include: { subject: { select: { id: true, name: true, code: true, type: true } } },
    orderBy: [{ subject: { type: "asc" } }, { subject: { name: "asc" } }],
  });

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: report.studentId, termId: report.termId },
    include: {
      class: {
        select: {
          level: true,
          section: true,
          classTeacher: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  const numberOnRoll = enrollment?.classId
    ? await prisma.enrollment.count({ where: { classId: enrollment.classId, termId: report.termId } })
    : null;

  return {
    school: report.term.school,
    student: report.student,
    term: report.term,
    scores,
    report: { ...report, enrollment, numberOnRoll },
  };
};

// One row per subject of the class. Subjects with no score yet stay as blank rows,
// like the paper template. Values come from the stored Score record so the PDF always
// matches the Scores page (same grade engine, same subject positions).
const buildSubjectRows = async ({ school, scores, report }, theme) => {
  const scoreBySubject = new Map(scores.map((s) => [s.subject?.id, s]));

  let listed = [];
  const classId = report.enrollment?.classId;
  if (theme.showAllSubjects !== false && classId) {
    try {
      const classSubjects = await prisma.classSubject.findMany({
        where: { classId },
        include: { subject: { select: { id: true, name: true, type: true } } },
      });
      listed = classSubjects
        .map((cs) => cs.subject)
        .sort((a, b) => String(a.type).localeCompare(String(b.type)) || a.name.localeCompare(b.name));
    } catch (error) {
      logger.warn(`Could not load class subjects for report card: ${error.message}`);
    }
  }

  // Nothing assigned to the class and nothing scored yet: list the school's subjects as blank
  // rows so the card still looks like the paper template instead of an empty table.
  if (listed.length === 0 && scores.length === 0 && theme.showAllSubjects !== false && school?.id) {
    try {
      listed = await prisma.subject.findMany({
        where: { schoolId: school.id },
        select: { id: true, name: true, type: true },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      });
    } catch (error) {
      logger.warn(`Could not load school subjects for report card: ${error.message}`);
    }
  }

  const ordered = listed.map((s) => ({ id: s.id, name: s.name }));
  for (const s of scores) {
    if (!ordered.some((o) => o.id === s.subject?.id)) {
      ordered.push({ id: s.subject?.id, name: s.subject?.name });
    }
  }

  return ordered.map((subj) => {
    const s = scoreBySubject.get(subj.id);
    const scored = s && ([s.ca1, s.ca2, s.ca3, s.examScore, s.total].some(hasVal));
    if (!scored) {
      return { name: subj.name, ca: '', exam: '', total: '', position: '', remark: '' };
    }
    const ca = hasVal(s.caTotal) ? s.caTotal : computeCATotal(s.ca1, s.ca2, s.ca3);
    const exam = computeExamContribution(s.examScore);
    const total = hasVal(s.total) ? s.total : computeTotal(ca, exam);
    return {
      name: subj.name,
      ca: num(ca),
      exam: num(exam),
      total: num(total),
      position: s.position ? ordinal(s.position) : '',
      remark: s.remark ? String(s.remark).toUpperCase() : '',
    };
  });
};

// Logos and signatures are the same for every report of a school, so they are cached
// briefly (a class ZIP would otherwise download the same logo dozens of times).
const imageCache = new Map();
const IMAGE_TTL_MS = 10 * 60 * 1000;

// Images (logo, photos, signatures) are "image" resources on Cloudinary, which are
// delivered normally, so this is not affected by the PDF/ZIP delivery restriction.
const loadRemoteImage = async (url, { cache = false } = {}) => {
  if (!url) return null;

  if (cache) {
    const hit = imageCache.get(url);
    if (hit && Date.now() - hit.at < IMAGE_TTL_MS) return hit.buf;
  }

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const buf = Buffer.from(response.data);
    if (cache) imageCache.set(url, { buf, at: Date.now() });
    return buf;
  } catch (error) {
    logger.warn(`Failed to fetch remote image ${url}: ${error.message}`);
    return null;
  }
};

// Loads a photo / logo / signature for the PDF as JPEG or PNG (the only formats pdfkit can draw).
// Cloudinary images are converted on the fly. If Cloudinary refuses the converted URL (for example
// when "strict transformations" is switched on for the account), the original URL is tried instead.
const loadPdfImage = async (url, kind, options = {}) => {
  if (!url) return null;
  const converted = pdfImageUrl(url, kind);
  const buf = await loadRemoteImage(converted, options);
  if (buf || converted === url) return buf;
  return loadRemoteImage(url, options);
};

// ─────────────────────────────────────────────────────────────
// ─── Build Report PDF (returns a Buffer) ───────────────────
// ─────────────────────────────────────────────────────────────

// Draws ONE report card on the current page of `doc`. Used for a single student and, page
// after page, for a whole class in one PDF.
const drawReportCard = async (doc, data) => {
  const { school, student, term, report } = data;

  const theme = {
    primaryColor: '#1E2A78',
    title: "LEARNER'S TERMINAL REPORT",
    postalAddress: null,
    contact: null,
    motto: null,
    logoUrl: null,
    classScoreWeight: 30,
    examScoreWeight: 70,
    showAllSubjects: true,
    showLogo: true,
    showSchoolName: true,
    showStudentPhoto: true,
    showPrincipalSignature: true,
    showClassTeacherSignature: true,
    principalSignatureUrl: null,
    classTeacherSignatureUrl: null,
    footerText: '',
    ...(school?.reportConfig || {}),
  };

  const rows = await buildSubjectRows(data, theme);

  // The whole card sits inside ONE bordered block, like the paper template: header,
  // learner details, subject table and sign-off are packed together with no loose gaps.
  // CARD WIDTH: the one number to change if the card should be narrower or wider.
  // A4 is 595pt wide; 495 leaves about 50pt of white margin on each side.
  const CARD_W = Math.min(547, Math.max(440, Number(theme.cardWidth) || 495));
  const W = CARD_W;
  const M = Math.round((doc.page.width - W) / 2);   // centred horizontally
  const R = M + W;
  const T = 24;                                     // top margin
  const P = 10;                                     // inner padding for text
  const NAVY = theme.primaryColor || '#1E2A78';
  const BLACK = '#000000';
  const PAGE_H = doc.page.height;
  const BOTTOM_LIMIT = PAGE_H - T;

  const hline = (x1, x2, y, color = BLACK, width = 0.6) => {
    doc.strokeColor(color).lineWidth(width).moveTo(x1, y).lineTo(x2, y).stroke();
  };
  const vline = (x, y1, y2, color = BLACK, width = 0.6) => {
    doc.strokeColor(color).lineWidth(width).moveTo(x, y1).lineTo(x, y2).stroke();
  };
  const labelW = (text) => {
    doc.font(BOLD).fontSize(9);
    return doc.widthOfString(text) + 6;
  };
  const label = (text, x, ly) => {
    doc.font(BOLD).fontSize(9).fillColor(BLACK).text(text, x, ly);
  };
  const image = (buf, x, y, w, h, what, valign = 'bottom') => {
    if (!buf || buf.length === 0) return;
    try {
      doc.image(buf, x, y, { fit: [w, h], align: 'center', valign });
    } catch (error) {
      logger.warn(`Could not embed ${what} in PDF: ${error.message}`);
    }
  };

  // ── Header: school name across the top; photo | school details + banner | logo below ──
  const studentPhoto = theme.showStudentPhoto !== false && student?.photoUrl
    ? await loadPdfImage(student.photoUrl, 'photo') : null;
  const logoUrl = theme.logoUrl || school?.logoUrl;
  const logo = theme.showLogo !== false && logoUrl
    ? await loadPdfImage(logoUrl, 'logo', { cache: true }) : null;

  let headTop = T + 6;
  if (theme.showSchoolName !== false) {
    const schoolName = String(school?.name || 'SCHOOL NAME').toUpperCase();
    let nameSize = 22;
    doc.font(BOLD);
    while (nameSize > 11 && doc.fontSize(nameSize).widthOfString(schoolName) > W - 2 * P) nameSize -= 1;
    doc.fillColor(NAVY).fontSize(nameSize).text(schoolName, M + P, T + 8, { width: W - 2 * P, align: 'center' });
    headTop = T + 8 + doc.heightOfString(schoolName, { width: W - 2 * P }) + 6;
  }

  const PHOTO_W = 70, PHOTO_H = 84, LOGO_W = 84;
  doc.strokeColor(BLACK).lineWidth(0.6).rect(M + P, headTop, PHOTO_W, PHOTO_H).stroke();
  image(studentPhoto, M + P + 1, headTop + 1, PHOTO_W - 2, PHOTO_H - 2, 'student photo', 'center');
  image(logo, R - P - LOGO_W, headTop, LOGO_W, PHOTO_H, 'school logo', 'center');

  const centerX = M + P + PHOTO_W + 12;
  const centerW = (R - P - LOGO_W - 12) - centerX;
  let cy = headTop + 2;

  const address = String(theme.postalAddress || school?.address || '').toUpperCase();
  const contactValue = theme.contact || school?.phone;
  const contact = contactValue ? `CONTACT: ${contactValue}` : '';
  const mottoValue = school?.motto || theme.motto;
  const motto = mottoValue ? `MOTTO: ${String(mottoValue).toUpperCase()}` : '';

  [address, contact, motto].filter(Boolean).forEach((line, i) => {
    doc.font(BOLD).fontSize(i === 0 ? 10.5 : 9.5).fillColor(NAVY)
       .text(line, centerX, cy, { width: centerW, align: 'center' });
    cy += doc.heightOfString(line, { width: centerW }) + 3;
  });

  const BANNER_H = 22;
  const bannerY = Math.max(cy + 2, headTop + PHOTO_H - BANNER_H);
  doc.rect(centerX, bannerY, centerW, BANNER_H).fill(NAVY);
  doc.fillColor('#FFFFFF').font(BOLD).fontSize(11.5)
     .text(String(theme.title).toUpperCase(), centerX, bannerY + 6, { width: centerW, align: 'center' });

  // ── Learner details (label + value on a rule, two columns) ──
  let y = Math.max(headTop + PHOTO_H, bannerY + BANNER_H) + 10;
  const COL_W = Math.floor(W / 2) - P - 4;
  const LEFT_X = M + P;
  const RIGHT_X = M + Math.floor(W / 2) + 4;

  const infoField = (text, value, x, fy) => {
    const lw = 112;
    doc.font(BOLD).fontSize(9).fillColor(BLACK).text(text, x, fy, { width: lw });
    doc.text(String(value ?? ''), x + lw, fy, { width: COL_W - lw, align: 'center', height: 11, ellipsis: true });
    hline(x + lw, x + COL_W, fy + 12);
  };

  const fullName = `${student.lastName || ''} ${student.firstName || ''}${student.otherNames ? ' ' + student.otherNames : ''}`
    .trim().toUpperCase();
  const className = report.enrollment?.class
    ? `${String(report.enrollment.class.level).replace(/^JHS(\d)$/, 'JHS $1')} ${report.enrollment.class.section}`.trim().toUpperCase()
    : '';
  const termWord = TERM_WORDS[term.termNumber] || String(term.termNumber || '').replace('TERM', '');

  const INFO_STEP = 21;
  infoField('NAME:', fullName, LEFT_X, y);
  infoField('CLASS:', className, RIGHT_X, y);
  y += INFO_STEP;
  infoField('NUMBER ON ROLL:', report.numberOnRoll ?? '', LEFT_X, y);
  infoField('POSITION IN CLASS:', report.classPosition ? ordinal(report.classPosition) : '', RIGHT_X, y);
  y += INFO_STEP;
  infoField('ACADEMIC YEAR:', term.academicYear, LEFT_X, y);
  infoField('TERM:', termWord, RIGHT_X, y);
  y += INFO_STEP;
  infoField('NEXT TERM BEGINS:', fmtDate(term.nextTermDate), LEFT_X, y);
  infoField('VACATION DATE:', fmtDate(term.endDate), RIGHT_X, y);
  y += INFO_STEP;

  // full-width rule closing the details section; the table starts right under it
  const infoEnd = y + 1;
  hline(M, R, infoEnd);

  // ── Bottom block sizing: the class teacher's remark is written on ruled lines, so we need
  //    to know how many lines it takes before deciding how tall the subject rows can be. ──
  const INNER_X = M + P;
  const INNER_W = W - 2 * P;
  const REMARK_LABEL = "CLASS TEACHER'S REMARKS:";
  const RULE_GAP = 17;
  const remarkLabelW = labelW(REMARK_LABEL);
  doc.font(REGULAR).fontSize(9);
  const remarkLines = (() => {
    const words = String(report.teacherRemark || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines = [];
    let cur = '';
    const widthFor = () => (lines.length === 0 ? INNER_W - remarkLabelW : INNER_W);
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (doc.widthOfString(test) <= widthFor()) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    const MAX_LINES = 5;
    if (lines.length > MAX_LINES) {
      lines.length = MAX_LINES;
      let last = lines[MAX_LINES - 1];
      while (last.length > 1 && doc.widthOfString(`${last}…`) > INNER_W) last = last.slice(0, -1);
      lines[MAX_LINES - 1] = `${last.trimEnd()}…`;
    }
    return lines;
  })();
  const remarkRuleCount = Math.max(2, remarkLines.length);
  const FIELD_STEP = 25;
  const SIGN_STEP = 32;
  // pad 6 + 3 field rows + gap 4 + remark rules + gap 6 + 2 sign-off rows + pad 4
  const BOTTOM_BLOCK_H = 6 + 3 * FIELD_STEP + 4 + remarkRuleCount * RULE_GAP + 6 + 2 * SIGN_STEP + 4;

  // ── Subject table (full width, touching the outer border) ──
  const HEAD_H = 36;
  // column widths are proportions of the card width (they add up to 547 at full width)
  const baseCols = [
    { w: 170, label: 'SUBJECT', align: 'left' },
    { w: 62,  label: `CLASS\nSCORE\n(${theme.classScoreWeight}%)`, align: 'center' },
    { w: 62,  label: `EXAM\nSCORE\n(${theme.examScoreWeight}%)`, align: 'center' },
    { w: 66,  label: 'TOTAL\nSCORE\n(100%)', align: 'center' },
    { w: 72,  label: 'POSITION', align: 'center' },
    { w: 115, label: 'REMARKS', align: 'center' },
  ];
  let usedW = 0;
  const cols = baseCols.map((c, i) => {
    const w = i === baseCols.length - 1 ? W - usedW : Math.round((c.w * W) / 547);
    usedW += w;
    return { ...c, w };
  });

  const tableTop = infoEnd;
  doc.rect(M, tableTop, W, HEAD_H).fill(NAVY);
  doc.font(BOLD).fontSize(8).fillColor('#FFFFFF');
  let cx = M;
  cols.forEach((c, i) => {
    const h = doc.heightOfString(c.label, { width: c.w - 8 });
    doc.text(c.label, cx + 4, tableTop + (HEAD_H - h) / 2, { width: c.w - 8, align: c.align === 'left' ? 'left' : 'center' });
    cx += c.w;
    if (i < cols.length - 1) vline(cx, tableTop, tableTop + HEAD_H, '#FFFFFF');
  });

  // Like the paper form, always show at least 9 ruled rows (blank ones stay writable)
  const MIN_ROWS = 9;
  const tableRows = [...rows];
  while (tableRows.length < MIN_ROWS) {
    tableRows.push({ name: '', ca: '', exam: '', total: '', position: '', remark: '' });
  }

  const bodyTop = tableTop + HEAD_H;
  const room = BOTTOM_LIMIT - BOTTOM_BLOCK_H - bodyTop;
  const rowH = Math.max(16, Math.min(40, Math.floor(room / tableRows.length)));

  tableRows.forEach((row, i) => {
    const rowY = bodyTop + i * rowH;
    const values = [row.name ? String(row.name).toUpperCase() : '', row.ca, row.exam, row.total, row.position, row.remark];
    let x = M;
    cols.forEach((c, j) => {
      doc.font(BOLD).fontSize(j === 0 ? 10 : 10.5).fillColor(BLACK)
         .text(String(values[j] ?? ''), x + 5, rowY + (rowH - 12) / 2, {
           width: c.w - 10, align: c.align, height: 14, ellipsis: true,
         });
      x += c.w;
    });
    hline(M, R, rowY + rowH);
  });

  const bodyEnd = bodyTop + tableRows.length * rowH;
  let vx = M;
  cols.forEach((c, i) => {
    vx += c.w;
    if (i < cols.length - 1) vline(vx, bodyTop, bodyEnd);
  });

  // ── Bottom block: attendance / promotion, attitude / conduct, interest, remarks, sign-off ──
  let borderTop = T;
  let blockTop = bodyEnd;
  if (bodyEnd + BOTTOM_BLOCK_H > BOTTOM_LIMIT) {
    // very long subject lists: close this page's box and continue the sign-off on a new page
    doc.strokeColor(BLACK).lineWidth(1.6).rect(M, T, W, BOTTOM_LIMIT - T).stroke();
    doc.addPage();
    borderTop = T;
    blockTop = T;
  }

  const headSignature = theme.showPrincipalSignature !== false && theme.principalSignatureUrl
    ? await loadPdfImage(theme.principalSignatureUrl, 'logo', { cache: true }) : null;
  const teacherSignature = theme.showClassTeacherSignature !== false && theme.classTeacherSignatureUrl
    ? await loadPdfImage(theme.classTeacherSignatureUrl, 'logo', { cache: true }) : null;

  const GAP = 15;
  const HALF_W = Math.floor((INNER_W - GAP) / 2);
  const LEFT = INNER_X;
  const RIGHT = INNER_X + HALF_W + GAP;

  // value sits on a rule; the rule starts right after the label and ends at x + totalW
  const field = (text, value, x, ly, totalW) => {
    const lw = labelW(text);
    label(text, x, ly);
    doc.font(BOLD).fontSize(9).fillColor(BLACK)
       .text(String(value ?? ''), x + lw, ly, { width: totalW - lw, align: 'center', height: 11, ellipsis: true });
    hline(x + lw, x + totalW, ly + 12);
  };

  let by = blockTop + 6 + 4;

  // Row 1: attendance | promoted to
  label('ATTENDANCE:', LEFT, by);
  const attLw = labelW('ATTENDANCE:');
  const attBox = 44;
  // If attendance was never recorded (0 school days), leave both boxes blank instead of "0 out of"
  const att = (v, x) => {
    doc.font(BOLD).fontSize(9).fillColor(BLACK).text(String(v ?? ''), x, by, { width: attBox, align: 'center' });
    hline(x, x + attBox, by + 12);
  };
  att(report.totalSchoolDays ? report.daysPresent : '', LEFT + attLw);
  label('OUT OF', LEFT + attLw + attBox + 8, by);
  att(report.totalSchoolDays || '', LEFT + attLw + attBox + 8 + labelW('OUT OF'));
  field('PROMOTED TO:', String(report.promotedTo || '').toUpperCase(), RIGHT, by, HALF_W);
  by += FIELD_STEP;

  // Row 2: attitude | conduct
  field('ATTITUDE:', report.attitude || '', LEFT, by, HALF_W);
  field('CONDUCT:', report.conduct || '', RIGHT, by, HALF_W);
  by += FIELD_STEP;

  // Row 3: interest (full width, it is the one that can be long)
  field('INTEREST:', report.interest || '', LEFT, by, INNER_W);
  by += FIELD_STEP;

  // Class teacher's remarks: written ON the ruled lines (first line starts after the label)
  by += 4;
  label(REMARK_LABEL, LEFT, by);
  for (let i = 0; i < remarkRuleCount; i += 1) {
    const ruleY = by + 12 + i * RULE_GAP;
    const x1 = i === 0 ? LEFT + remarkLabelW : LEFT;
    hline(x1, LEFT + INNER_W, ruleY);
    if (remarkLines[i]) {
      doc.font(REGULAR).fontSize(9).fillColor(BLACK).text(remarkLines[i], x1 + 2, ruleY - 11.5, { lineBreak: false });
    }
  }
  by += remarkRuleCount * RULE_GAP + 6;

  // Sign-off. Both rows share the same columns so the lines line up.
  const signLabelW = Math.max(labelW('CLASS TEACHER:'), labelW("HEADTEACHER'S SIGNATURE:"));
  const SIGN_LINE_W = 190;
  const rightX = LEFT + signLabelW + SIGN_LINE_W + 14;
  const rightW = INNER_X + INNER_W - rightX;
  const teacher = report.enrollment?.class?.classTeacher;
  const teacherName = teacher ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() : '';

  // row S1: class teacher's name | signature
  let lineY = by + 24;
  label('CLASS TEACHER:', LEFT, lineY - 12);
  doc.font(BOLD).fontSize(9).fillColor(BLACK)
     .text(teacherName.toUpperCase(), LEFT + signLabelW, lineY - 12, { width: SIGN_LINE_W, align: 'center', height: 11, ellipsis: true });
  hline(LEFT + signLabelW, LEFT + signLabelW + SIGN_LINE_W, lineY);
  label('SIGNATURE:', rightX, lineY - 12);
  const sigLw = labelW('SIGNATURE:');
  image(teacherSignature, rightX + sigLw, lineY - 28, rightW - sigLw, 26, 'class teacher signature');
  hline(rightX + sigLw, rightX + rightW, lineY);
  by += SIGN_STEP;

  // row S2: headteacher's signature | date
  lineY = by + 24;
  label("HEADTEACHER'S SIGNATURE:", LEFT, lineY - 12);
  image(headSignature, LEFT + signLabelW + 20, lineY - 28, SIGN_LINE_W - 40, 26, 'headteacher signature');
  hline(LEFT + signLabelW, LEFT + signLabelW + SIGN_LINE_W, lineY);
  label('DATE:', rightX, lineY - 12);
  hline(rightX + labelW('DATE:'), rightX + rightW, lineY);
  by += SIGN_STEP;

  // the single outer border that holds the whole card
  const endY = by + 4;
  doc.strokeColor(BLACK).lineWidth(1.6).rect(M, borderTop, W, endY - borderTop).stroke();

  if (theme.footerText) {
    doc.font(REGULAR).fontSize(7.5).fillColor('#374151')
       .text(String(theme.footerText), M, Math.min(endY + 6, PAGE_H - 18), { width: W, align: 'center' });
  }

};

// A new A4 document with the report fonts. `done` resolves with the finished PDF as a Buffer.
// The promise is created before any drawing so the 'end' event can never be missed.
const createReportDoc = () => {
  // bottom margin 0 so pdfkit never adds an accidental blank page near the bottom edge
  const doc = new PDFDocument({ size: 'A4', margins: { top: 24, bottom: 0, left: 40, right: 40 } });
  registerReportFonts(doc);

  const buffers = [];
  const done = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });

  return { doc, done };
};

// One student's report card as a PDF Buffer.
const buildReportPDF = async (reportId) => {
  logger.info(`Building PDF for report ${reportId} using pdfkit`);

  const data = await fetchReportData(reportId);
  const { doc, done } = createReportDoc();

  await drawReportCard(doc, data);
  doc.end();
  const pdfBuffer = await done;

  return { pdfBuffer, student: data.student, term: data.term, report: data.report };
};

// A whole class in ONE PDF: one report card per page, in the order of `reportIds`.
// A card that cannot be built is skipped (and listed in `failed`) instead of losing the whole file.
const buildClassPDF = async (reportIds) => {
  logger.info(`Building combined class PDF for ${reportIds.length} reports`);

  const { doc, done } = createReportDoc();
  const failed = [];
  let drawn = 0;
  let pageUsed = false;

  for (const reportId of reportIds) {
    let data;
    try {
      data = await fetchReportData(reportId);
    } catch (error) {
      logger.error(`Class PDF: could not load report ${reportId}: ${error.message}`);
      failed.push({ reportId, error: error.message });
      continue;
    }

    if (pageUsed) doc.addPage();
    pageUsed = true;
    try {
      await drawReportCard(doc, data);
      drawn += 1;
    } catch (error) {
      logger.error(`Class PDF: could not draw report ${reportId}: ${error.message}`);
      failed.push({ reportId, error: error.message });
    }
  }

  doc.end();
  const pdfBuffer = await done;

  if (drawn === 0) {
    throw createError("No report cards could be built for this class.", 500);
  }

  return { pdfBuffer, count: drawn, failed };
};

// ─────────────────────────────────────────────────────────────
// ─── Generate + upload (used for stored link / emails) ─────
// ─────────────────────────────────────────────────────────────

const uploadPDFToCloudinary = (buffer, publicId) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: "edutrack/reports",
        public_id: publicId,
        format: "pdf",
        overwrite: true,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};

const generateReportPDF = async (reportId) => {
  const { pdfBuffer, student, term } = await buildReportPDF(reportId);

  // e.g. .../edutrack/reports/acquah-frederick-term-3-2024-2025-results-6f2f45acb2.pdf
  const publicId = storedResultsPublicId(student, term, reportId);
  const pdfUrl = await uploadPDFToCloudinary(pdfBuffer, publicId);

  await prisma.report.update({
    where: { id: reportId },
    data: { pdfUrl },
  });

  logger.info(`PDF generated and uploaded for report ${reportId}: ${pdfUrl}`);
  return pdfUrl;
};

// ─── Bulk PDF Generation ───
const generateBulkPDFs = async (reportIds) => {
  let success = 0, failed = 0;
  const results = [];

  for (const reportId of reportIds) {
    try {
      const pdfUrl = await generateReportPDF(reportId);
      results.push({ reportId, pdfUrl, status: "success", success: true });
      success++;
    } catch (error) {
      logger.error(`PDF generation failed for report ${reportId}:`, error.message);
      results.push({ reportId, error: error.message, status: "failed", success: false });
      failed++;
    }
  }

  return { success, failed, results };
};

// ─── Class ZIP Generation ───
// `reports` = [{ id, student }] already checked/filtered by report.service.getClassReportSet.
// Builds every PDF in memory and zips them, one file per student:
//   "Acquah Frederick - Term 3 2024-2025 Results.pdf". No Cloudinary download involved.
const generateClassZIP = async (reports) => {
  const archiver = require("archiver");

  if (!reports || reports.length === 0) throw createError("No report cards to download.", 400);

  const zipPath = path.join(os.tmpdir(), `edutrack_class_reports_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 6 } });

  const closed = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(output);

  const usedNames = new Map();
  const uniqueName = (name, studentNumber) => {
    const key = name.toLowerCase();
    const n = (usedNames.get(key) || 0) + 1;
    usedNames.set(key, n);
    return n === 1 ? name : name.replace(/(\.[^.]+)$/, ` (${studentNumber || n})$1`);
  };

  for (const report of reports) {
    try {
      const { pdfBuffer, student, term } = await buildReportPDF(report.id);
      archive.append(pdfBuffer, { name: uniqueName(studentResultsFileName(student, term), student.studentNumber) });
    } catch (error) {
      const who = cleanFileName(studentFullName(report.student) || report.id);
      logger.error(`ZIP: failed to build PDF for ${who}:`, error.message);
      archive.append(Buffer.from(`PDF not available: ${error.message}`), { name: `${who} - ERROR.txt` });
    }
  }

  await archive.finalize();
  await closed;

  return zipPath;
};

// ─── Preview Report HTML (simple fallback, not used by the PDF routes) ───
const previewReportHTML = async (reportId) => {
  const data = await fetchReportData(reportId);
  const { school, student, term, report } = data;
  const rows = await buildSubjectRows(data, { ...(school?.reportConfig || {}) });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Report Card Preview</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { text-align: center; margin-bottom: 30px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #333; padding: 8px; text-align: center; }
        td:first-child, th:first-child { text-align: left; }
        th { background-color: #1E2A78; color: #fff; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${school?.name || "School"}</h1>
        <h2>Learner's Terminal Report</h2>
        <p><strong>${term.academicYear} — ${term.termNumber.replace("TERM", "Term ")}</strong></p>
      </div>
      <p><strong>Name:</strong> ${student.lastName} ${student.firstName}</p>
      <p><strong>Class:</strong> ${report.enrollment?.class ? `${report.enrollment.class.level} ${report.enrollment.class.section}` : 'N/A'}</p>
      <table>
        <thead><tr><th>Subject</th><th>Class Score</th><th>Exam Score</th><th>Total</th><th>Position</th><th>Remarks</th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr><td>${r.name}</td><td>${r.ca}</td><td>${r.exam}</td><td>${r.total}</td><td>${r.position}</td><td>${r.remark}</td></tr>`).join('')}
        </tbody>
      </table>
      <p><strong>Attendance:</strong> ${report.daysPresent || 0} out of ${report.totalSchoolDays || 0}</p>
      ${report.teacherRemark ? `<p><strong>Class Teacher's Remarks:</strong> ${report.teacherRemark}</p>` : ''}
    </body>
    </html>
  `;
};

module.exports = {
  buildReportPDF,
  buildClassPDF,
  generateReportPDF,
  generateBulkPDFs,
  generateClassZIP,
  previewReportHTML,
};
