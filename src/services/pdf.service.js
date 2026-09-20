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
const buildSubjectRows = async ({ scores, report }, theme) => {
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

// ─────────────────────────────────────────────────────────────
// ─── Build Report PDF (returns a Buffer) ───────────────────
// ─────────────────────────────────────────────────────────────

const buildReportPDF = async (reportId) => {
  logger.info(`Building PDF for report ${reportId} using pdfkit`);

  const data = await fetchReportData(reportId);
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

  // bottom margin 0 so pdfkit never adds an accidental blank page near the bottom edge
  const doc = new PDFDocument({ size: 'A4', margins: { top: 30, bottom: 0, left: 30, right: 30 } });
  doc.registerFont(REGULAR, fontFile('LiberationSans-Regular.ttf', 'Helvetica'));
  doc.registerFont(BOLD, fontFile('LiberationSans-Bold.ttf', 'Helvetica-Bold'));

  // Collect output safely: the promise exists before any drawing happens.
  const buffers = [];
  const pdfDone = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });

  const M = 30, W = 535, R = M + W;
  const NAVY = theme.primaryColor || '#1E2A78';
  const BLACK = '#000000';
  const PAGE_H = doc.page.height;

  const hline = (x1, x2, y, color = BLACK) => {
    doc.strokeColor(color).lineWidth(0.6).moveTo(x1, y).lineTo(x2, y).stroke();
  };
  const vline = (x, y1, y2, color = BLACK) => {
    doc.strokeColor(color).lineWidth(0.6).moveTo(x, y1).lineTo(x, y2).stroke();
  };

  // ── Header: student photo | school details | school logo ──
  const PHOTO_W = 70, PHOTO_H = 82;

  const studentPhoto = theme.showStudentPhoto !== false && student?.photoUrl
    ? await loadRemoteImage(student.photoUrl) : null;
  const logoUrl = theme.logoUrl || school?.logoUrl;
  const logo = theme.showLogo !== false && logoUrl
    ? await loadRemoteImage(logoUrl, { cache: true }) : null;

  doc.strokeColor(BLACK).lineWidth(0.6).rect(M, M, PHOTO_W, PHOTO_H).stroke();
  if (studentPhoto && studentPhoto.length > 0) {
    try {
      doc.image(studentPhoto, M + 1, M + 1, { fit: [PHOTO_W - 2, PHOTO_H - 2], align: 'center', valign: 'center' });
    } catch (error) {
      logger.warn(`Could not embed student photo in PDF: ${error.message}`);
    }
  }

  if (logo && logo.length > 0) {
    try {
      doc.image(logo, R - PHOTO_W, M, { fit: [PHOTO_W, PHOTO_H], align: 'center', valign: 'center' });
    } catch (error) {
      logger.warn(`Could not embed school logo in PDF: ${error.message}`);
    }
  }

  const centerX = M + PHOTO_W + 12;
  const centerW = W - 2 * (PHOTO_W + 12);
  let cy = M + 2;

  if (theme.showSchoolName !== false) {
    const schoolName = String(school?.name || 'SCHOOL NAME').toUpperCase();
    let nameSize = 22;
    doc.font(BOLD);
    while (nameSize > 11 && doc.fontSize(nameSize).widthOfString(schoolName) > centerW) nameSize -= 1;
    doc.fillColor(NAVY).fontSize(nameSize).text(schoolName, centerX, cy, { width: centerW, align: 'center' });
    cy += doc.heightOfString(schoolName, { width: centerW }) + 4;
  }

  const address = String(theme.postalAddress || school?.address || '').toUpperCase();
  const contactValue = theme.contact || school?.phone;
  const contact = contactValue ? `CONTACT: ${contactValue}` : '';
  const mottoValue = school?.motto || theme.motto;
  const motto = mottoValue ? `MOTTO: ${String(mottoValue).toUpperCase()}` : '';

  [address, contact, motto].filter(Boolean).forEach((line, i) => {
    doc.font(BOLD).fontSize(i === 0 ? 10 : 9).fillColor(NAVY)
       .text(line, centerX, cy, { width: centerW, align: 'center' });
    cy += doc.heightOfString(line, { width: centerW }) + 3;
  });

  // ── Banner ──
  const bannerY = Math.max(cy, M + PHOTO_H) + 8;
  doc.roundedRect(centerX + 10, bannerY, centerW - 20, 24, 4).fill(NAVY);
  doc.fillColor('#FFFFFF').font(BOLD).fontSize(11)
     .text(String(theme.title).toUpperCase(), centerX + 10, bannerY + 7, { width: centerW - 20, align: 'center' });

  // ── Learner details ──
  let y = bannerY + 24 + 14;
  const COL_W = 262;
  const LEFT_X = M;
  const RIGHT_X = R - COL_W;

  const infoField = (label, value, x, fy) => {
    const labelW = 112;
    doc.font(BOLD).fontSize(9).fillColor(BLACK).text(label, x, fy, { width: labelW });
    doc.text(String(value ?? ''), x + labelW, fy, { width: COL_W - labelW, align: 'center', height: 11, ellipsis: true });
    hline(x + labelW, x + COL_W, fy + 12);
  };

  const fullName = `${student.lastName || ''} ${student.firstName || ''}${student.otherNames ? ' ' + student.otherNames : ''}`
    .trim().toUpperCase();
  const className = report.enrollment?.class
    ? `${String(report.enrollment.class.level).replace(/^JHS(\d)$/, 'JHS $1')} ${report.enrollment.class.section}`.trim().toUpperCase()
    : '';
  const termWord = TERM_WORDS[term.termNumber] || String(term.termNumber || '').replace('TERM', '');

  infoField('NAME:', fullName, LEFT_X, y);
  infoField('CLASS:', className, RIGHT_X, y);
  y += 22;
  infoField('NUMBER ON ROLL:', report.numberOnRoll ?? '', LEFT_X, y);
  infoField('POSITION IN CLASS:', report.classPosition ? ordinal(report.classPosition) : '', RIGHT_X, y);
  y += 22;
  infoField('ACADEMIC YEAR:', term.academicYear, LEFT_X, y);
  infoField('TERM:', termWord, RIGHT_X, y);
  y += 22;
  infoField('NEXT TERM BEGINS:', fmtDate(term.nextTermDate), LEFT_X, y);
  infoField('VACATION DATE:', fmtDate(term.endDate), RIGHT_X, y);
  y += 22;

  // ── Subject table ──
  const HEAD_H = 34;
  const cols = [
    { w: 150, label: 'SUBJECT', align: 'left' },
    { w: 55,  label: `CLASS\nSCORE\n(${theme.classScoreWeight}%)`, align: 'center' },
    { w: 55,  label: `EXAM\nSCORE\n(${theme.examScoreWeight}%)`, align: 'center' },
    { w: 60,  label: 'TOTAL\nSCORE\n(100%)', align: 'center' },
    { w: 65,  label: 'POSITION', align: 'center' },
    { w: 150, label: 'REMARKS', align: 'center' },
  ];

  const tableTop = y + 6;
  doc.rect(M, tableTop, W, HEAD_H).fill(NAVY);
  doc.font(BOLD).fontSize(7.5).fillColor('#FFFFFF');
  let cx = M;
  cols.forEach((c, i) => {
    const h = doc.heightOfString(c.label, { width: c.w - 8 });
    doc.text(c.label, cx + 4, tableTop + (HEAD_H - h) / 2, { width: c.w - 8, align: c.align === 'left' ? 'left' : 'center' });
    cx += c.w;
    if (i < cols.length - 1) vline(cx, tableTop, tableTop + HEAD_H, '#FFFFFF');
  });

  const bodyTop = tableTop + HEAD_H;
  const BOTTOM_BLOCK_H = 178;
  const room = PAGE_H - M - BOTTOM_BLOCK_H - bodyTop;
  const rowH = Math.max(16, Math.min(26, Math.floor(room / Math.max(rows.length, 1))));

  rows.forEach((row, i) => {
    const rowY = bodyTop + i * rowH;
    const values = [row.name ? String(row.name).toUpperCase() : '', row.ca, row.exam, row.total, row.position, row.remark];
    doc.font(BOLD).fontSize(9).fillColor(BLACK);
    let x = M;
    cols.forEach((c, j) => {
      doc.text(String(values[j] ?? ''), x + 4, rowY + (rowH - 10) / 2, {
        width: c.w - 8, align: c.align, height: 11, ellipsis: true,
      });
      x += c.w;
    });
    hline(M, R, rowY + rowH);
  });

  const bodyEnd = bodyTop + rows.length * rowH;
  let vx = M;
  cols.forEach((c, i) => {
    vx += c.w;
    if (i < cols.length - 1) vline(vx, bodyTop, bodyEnd);
  });
  doc.strokeColor(BLACK).lineWidth(0.6).rect(M, tableTop, W, bodyEnd - tableTop).stroke();

  // ── Bottom block (attendance, attitude, conduct, interest, remarks, signature) ──
  let blockTop = bodyEnd + 14;
  if (blockTop + BOTTOM_BLOCK_H > PAGE_H - M) {
    doc.addPage();
    blockTop = M + 10;
  }

  const headSignature = theme.showPrincipalSignature !== false && theme.principalSignatureUrl
    ? await loadRemoteImage(theme.principalSignatureUrl, { cache: true }) : null;
  const teacherSignature = theme.showClassTeacherSignature !== false && theme.classTeacherSignatureUrl
    ? await loadRemoteImage(theme.classTeacherSignatureUrl, { cache: true }) : null;

  const lineValue = (value, x, ly, w) => {
    doc.font(BOLD).fontSize(9).fillColor(BLACK)
       .text(String(value ?? ''), x, ly, { width: w, align: 'center', height: 11, ellipsis: true });
    hline(x, x + w, ly + 12);
  };
  const label = (text, x, ly) => {
    doc.font(BOLD).fontSize(9).fillColor(BLACK).text(text, x, ly);
  };

  let by = blockTop + 10;

  label('ATTENDANCE:', M + 10, by);
  lineValue(hasVal(report.daysPresent) ? report.daysPresent : '', M + 84, by, 50);
  label('OUT OF', M + 142, by);
  lineValue(report.totalSchoolDays || '', M + 182, by, 50);
  label('PROMOTED TO:', M + 250, by);
  lineValue(String(report.promotedTo || '').toUpperCase(), M + 330, by, R - 10 - (M + 330));
  by += 26;

  const shortX = M + 84;
  [['ATTITUDE:', report.attitude], ['CONDUCT:', report.conduct], ['INTEREST:', report.interest]].forEach(([l, v]) => {
    label(l, M + 10, by);
    lineValue(v || '', shortX, by, R - 10 - shortX);
    by += 26;
  });

  doc.font(BOLD).fontSize(9);
  const longX = M + 10 + Math.max(
    doc.widthOfString("CLASS TEACHER'S REMARKS:"),
    doc.widthOfString("HEADTEACHER'S SIGNATURE:")
  ) + 8;

  // Class teacher's remarks (up to two lines), teacher name + optional signature on the right
  const teacher = report.enrollment?.class?.classTeacher;
  const teacherName = teacher ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() : '';
  const sigW = teacherSignature ? 80 : 0;

  label("CLASS TEACHER'S REMARKS:", M + 10, by);
  doc.font(REGULAR).fontSize(9).fillColor(BLACK)
     .text(String(report.teacherRemark || ''), longX, by, { width: R - 10 - longX - sigW, height: 22, ellipsis: true });
  if (teacherSignature && teacherSignature.length > 0) {
    try {
      doc.image(teacherSignature, R - 10 - 74, by - 6, { fit: [74, 26] });
    } catch (error) {
      logger.warn(`Could not embed class teacher signature in PDF: ${error.message}`);
    }
  }
  hline(longX, R - 10, by + 24);
  if (teacherName) {
    doc.font(REGULAR).fontSize(7.5).fillColor('#374151')
       .text(`Class Teacher: ${teacherName}`, longX, by + 27, { width: R - 10 - longX, align: 'right' });
  }
  by += 38;

  // Headteacher's signature
  label("HEADTEACHER'S SIGNATURE:", M + 10, by + 8);
  if (headSignature && headSignature.length > 0) {
    try {
      doc.image(headSignature, longX + 10, by - 4, { fit: [110, 28] });
    } catch (error) {
      logger.warn(`Could not embed headteacher signature in PDF: ${error.message}`);
    }
  }
  hline(longX, R - 10, by + 24);
  by += 34;

  doc.strokeColor(BLACK).lineWidth(0.6).rect(M, blockTop, W, by - blockTop).stroke();

  if (theme.footerText) {
    doc.font(REGULAR).fontSize(7.5).fillColor('#374151')
       .text(String(theme.footerText), M, Math.min(by + 10, PAGE_H - 28), { width: W, align: 'center' });
  }

  doc.end();
  const pdfBuffer = await pdfDone;

  return { pdfBuffer, student, term, report };
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

  const publicId = `report_${student.studentNumber}_${term.academicYear.replace("/", "-")}_${term.termNumber}`;
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
// Builds every PDF in memory and zips them. No Cloudinary download involved.
const generateClassZIP = async (schoolId, classId, termId) => {
  const archiver = require("archiver");

  const enrollments = await prisma.enrollment.findMany({
    where: { classId, termId, student: { schoolId } },
    select: { studentId: true },
  });

  const studentIds = enrollments.map((e) => e.studentId);
  if (studentIds.length === 0) throw createError("No students enrolled in this class.", 400);

  const reports = await prisma.report.findMany({
    where: { studentId: { in: studentIds }, termId, status: "RELEASED" },
    include: { student: { select: { firstName: true, lastName: true, studentNumber: true } } },
  });

  if (reports.length === 0) throw createError("No released reports found for this class.", 400);

  const zipPath = path.join(os.tmpdir(), `edutrack_class_reports_${classId}_${termId}_${Date.now()}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 6 } });

  const closed = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(output);

  const safe = (v) => String(v || "").replace(/[^a-zA-Z0-9-_]/g, "_");

  for (const report of reports) {
    const base = `${safe(report.student.studentNumber)}_${safe(report.student.lastName)}_${safe(report.student.firstName)}`;
    try {
      const { pdfBuffer } = await buildReportPDF(report.id);
      archive.append(pdfBuffer, { name: `${base}.pdf` });
    } catch (error) {
      logger.error(`ZIP: failed to build PDF for ${report.student.studentNumber}:`, error.message);
      archive.append(Buffer.from(`PDF not available: ${error.message}`), { name: `${base}_ERROR.txt` });
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
  generateReportPDF,
  generateBulkPDFs,
  generateClassZIP,
  previewReportHTML,
};