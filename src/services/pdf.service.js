/**
 * EduTrack JHS — PDF Service (Using pdfkit)
 * Generates report card PDFs without Puppeteer
 */

const PDFDocument = require('pdfkit');
const axios = require('axios');
const { prisma } = require("../config/db");
const cloudinary = require("../config/cloudinary");
const { createError } = require("../middleware/errorHandler");
const logger = require("../config/logger");
const path = require("path");
const fs = require("fs");
const os = require("os");

// ─────────────────────────────────────────────────────────────
// ─── Generate Report PDF using pdfkit ──────────────────────
// ─────────────────────────────────────────────────────────────

const generateReportPDF = async (reportId) => {
  logger.info(`Generating PDF for report ${reportId} using pdfkit`);

  const data = await fetchReportData(reportId);
  const { school, student, term, scores, report } = data;
  const theme = {
    primaryColor: '#4F46E5',
    secondaryColor: '#0F172A',
    accentColor: '#E2E8F0',
    headerTextColor: '#FFFFFF',
    title: 'End of Term Report Card',
    footerText: 'This is a computer-generated report card. No signature is required.',
    motto: 'Excellence in Learning',
    principalName: 'Head Teacher',
    classTeacherName: 'Class Teacher',
    principalSignatureUrl: null,
    classTeacherSignatureUrl: null,
    showLogo: true,
    showSchoolName: true,
    showStudentPhoto: true,
    showPrincipalSignature: true,
    showClassTeacherSignature: true,
    ...(school?.reportConfig || {})
  };

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const buffers = [];

  doc.on('data', buffers.push.bind(buffers));
  doc.on('end', () => {
    const pdfBuffer = Buffer.concat(buffers);
    doc._pdfBuffer = pdfBuffer;
  });

  const headerHeight = 100;
  doc.rect(0, 0, doc.page.width, headerHeight).fill(theme.primaryColor || '#4F46E5');

  let headerLogoBuffer = null;
  if (theme.showLogo !== false && school?.logoUrl) {
    try {
      headerLogoBuffer = await loadRemoteImage(school.logoUrl);
    } catch (error) {
      logger.warn(`Could not load report logo for school ${school?.id}: ${error.message}`);
    }
  }

  if (headerLogoBuffer && headerLogoBuffer.length > 0) {
    try {
      doc.image(headerLogoBuffer, 50, 24, { fit: [52, 52] });
    } catch (error) {
      logger.warn(`Could not embed school logo in PDF: ${error.message}`);
    }
  }

  const displayName = theme.showSchoolName === false ? (theme.title || 'Report Card') : (school.name || 'EduPortal');
  doc.fillColor(theme.headerTextColor || '#FFFFFF')
     .fontSize(24)
     .font('Helvetica-Bold')
     .text(displayName, 118, 25);

  doc.fontSize(11)
     .font('Helvetica')
     .text(school.motto || 'Excellence in Learning', 118, 58, { width: 260 });

  const termLabel = `${term.academicYear} — ${term.termNumber.replace('TERM', 'Term ')}`;
  doc.roundedRect(430, 25, 115, 30, 8).fill(theme.secondaryColor || '#0F172A');
  doc.fillColor('#FFFFFF')
     .fontSize(9)
     .font('Helvetica-Bold')
     .text(termLabel, 438, 34, { width: 100, align: 'center' });

  let yPos = 120;

  const studentPhotoBuffer = theme.showStudentPhoto !== false && student?.photoUrl ? await loadRemoteImage(student.photoUrl) : null;
  doc.roundedRect(50, yPos, 495, 130, 18).fillAndStroke('#FFFFFF', '#E5E7EB');

  if (studentPhotoBuffer && studentPhotoBuffer.length > 0) {
    try {
      doc.image(studentPhotoBuffer, 68, yPos + 18, { fit: [74, 74], align: 'left' });
    } catch (error) {
      logger.warn(`Could not embed student photo in PDF: ${error.message}`);
    }
  }

  doc.fillColor('#111827')
     .fontSize(18)
     .font('Helvetica-Bold')
     .text(`${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student', 158, yPos + 18);

  doc.fillColor('#4B5563')
     .fontSize(10)
     .font('Helvetica')
     .text('Student ID', 158, yPos + 50)
     .text('Class', 158, yPos + 66)
     .text('Age', 158, yPos + 82)
     .text('Gender', 158, yPos + 98);

  doc.fillColor('#111827')
     .fontSize(10)
     .font('Helvetica-Bold')
     .text(student.studentNumber || 'N/A', 230, yPos + 50)
     .text(report.enrollment?.class ? `${report.enrollment.class.level} ${report.enrollment.class.section}` : 'N/A', 230, yPos + 66)
     .text(student.dateOfBirth ? `${Math.floor((Date.now() - new Date(student.dateOfBirth).getTime()) / 31557600000)} yrs` : 'N/A', 230, yPos + 82)
     .text(student.gender || 'N/A', 230, yPos + 98);

  const summaryCards = [
    { label: 'Average', value: `${report.aggregate || 0}%` },
    { label: 'Pass Rate', value: `${scores.length ? Math.round((scores.filter(s => (s.total || 0) >= 50).length / scores.length) * 100) : 0}%` },
    { label: 'Present', value: String(report.daysPresent || 0) },
    { label: 'Absent', value: String(report.daysAbsent || 0) },
  ];

  summaryCards.forEach((item, index) => {
    const cardX = 370 + (index % 2) * 80;
    const cardY = yPos + 18 + Math.floor(index / 2) * 36;
    doc.roundedRect(cardX, cardY, 72, 26, 8).fill('#F3F4F6');
    doc.fillColor('#6B7280').fontSize(8).font('Helvetica').text(item.label, cardX + 8, cardY + 6);
    doc.fillColor(theme.primaryColor || '#4F46E5').fontSize(11).font('Helvetica-Bold').text(item.value, cardX + 8, cardY + 14);
  });

  yPos += 150;

  doc.fillColor('#111827').fontSize(15).font('Helvetica-Bold').text('Academic Performance', 50, yPos);
  yPos += 18;

  const headers = ['Subject', 'CA1', 'CA2', 'CA3', 'Exam', 'Total', 'Grade'];
  const colWidths = [92, 44, 44, 44, 46, 46, 46];
  let xPos = 50;

  doc.roundedRect(50, yPos, 495, 22, 8).fill(theme.primaryColor || '#4F46E5');
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold');
  headers.forEach((header, i) => {
    const width = colWidths[i];
    doc.text(header, xPos + 4, yPos + 6, { width, align: 'center' });
    xPos += width;
  });

  yPos += 26;

  scores.forEach((score, index) => {
    const total = (score.ca1 || 0) + (score.ca2 || 0) + (score.ca3 || 0) + (score.examScore || 0);
    const grade = calculateGrade(total);

    if (index % 2 === 0) {
      doc.roundedRect(50, yPos, 495, 22, 6).fill('#F9FAFB');
    }

    doc.fillColor('#111827').fontSize(8).font('Helvetica');
    xPos = 50;
    const values = [
      score.subject?.name || 'Subject',
      score.ca1 ?? '-',
      score.ca2 ?? '-',
      score.ca3 ?? '-',
      score.examScore ?? '-',
      total || '-',
      grade || '-'
    ];

    values.forEach((value, i) => {
      const width = colWidths[i];
      const textX = xPos + 4;
      if (i === 0) {
        doc.text(String(value), textX, yPos + 7, { width: width - 8 });
      } else {
        doc.text(String(value), textX, yPos + 7, { width, align: 'center' });
      }
      xPos += width;
    });

    yPos += 22;
  });

  yPos += 12;

  doc.fillColor('#111827').fontSize(14).font('Helvetica-Bold').text('Teacher Remarks', 50, yPos);
  yPos += 18;

  const remarkBoxY = yPos;
  if (theme.showClassTeacherSignature !== false) {
    doc.roundedRect(50, remarkBoxY, 220, 60, 10).fill('#F8FAFC');
    doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold').text(theme.classTeacherName || 'Class Teacher', 64, remarkBoxY + 10);

    const classTeacherSignature = theme.classTeacherSignatureUrl ? await loadRemoteImage(theme.classTeacherSignatureUrl) : null;
    if (classTeacherSignature && classTeacherSignature.length > 0) {
      try {
        doc.image(classTeacherSignature, 64, remarkBoxY + 24, { fit: [90, 28] });
      } catch (error) {
        logger.warn(`Could not embed class teacher signature in PDF: ${error.message}`);
      }
    } else {
      doc.fillColor('#111827').fontSize(9).font('Helvetica').text(report.teacherRemark || 'Excellent performance and strong commitment to learning.', 64, remarkBoxY + 26, { width: 190, height: 24 });
    }
  }

  if (theme.showPrincipalSignature !== false) {
    doc.roundedRect(280, remarkBoxY, 265, 60, 10).fill('#F8FAFC');
    doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold').text(theme.principalName || 'Head Teacher', 294, remarkBoxY + 10);

    const principalSignature = theme.principalSignatureUrl ? await loadRemoteImage(theme.principalSignatureUrl) : null;
    if (principalSignature && principalSignature.length > 0) {
      try {
        doc.image(principalSignature, 294, remarkBoxY + 22, { fit: [110, 28] });
      } catch (error) {
        logger.warn(`Could not embed principal signature in PDF: ${error.message}`);
      }
    } else {
      doc.fillColor('#111827').fontSize(9).font('Helvetica').text(report.headRemark || 'Progress is satisfactory and commendable.', 294, remarkBoxY + 26, { width: 235, height: 24 });
    }
  }

  yPos += 82;

  doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold').text('Attendance Summary', 50, yPos);
  doc.fillColor('#111827').fontSize(9).font('Helvetica').text(`Present: ${report.daysPresent || 0}   Absent: ${report.daysAbsent || 0}   Late: ${report.daysLate || 0}`, 180, yPos);

  const footerY = doc.page.height - 60;
  doc.moveTo(50, footerY).lineTo(doc.page.width - 50, footerY).stroke(theme.accentColor || '#E5E7EB');
  doc.fillColor(theme.secondaryColor || '#0F172A').fontSize(8).font('Helvetica').text(theme.footerText || 'This is a computer-generated report card. No signature is required.', 50, footerY + 15, { align: 'center' });
  doc.text(`Generated on ${new Date().toLocaleDateString('en-GB')}`, 50, footerY + 30, { align: 'center' });

  doc.end();

  // 4. Wait for PDF to be generated
  const pdfBuffer = await new Promise((resolve) => {
    doc.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
  });

  // 5. Upload to Cloudinary
  const publicId = `report_${student.studentNumber}_${term.academicYear.replace("/", "-")}_${term.termNumber}`;
  const pdfUrl = await uploadPDFToCloudinary(pdfBuffer, publicId);

  // 6. Update report record with PDF URL
  await prisma.report.update({
    where: { id: reportId },
    data: { pdfUrl },
  });

  logger.info(`PDF generated and uploaded for report ${reportId}: ${pdfUrl}`);
  return pdfUrl;
};

// ─── Helper Functions ───

const calculateGrade = (score) => {
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  if (score >= 40) return 'E';
  return 'F';
};

const fetchReportData = async (reportId) => {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      student: true,
      term: {
        include: {
          school: {
            select: { id: true, name: true, logoUrl: true, motto: true, address: true, reportConfig: true },
          },
        },
      },
    },
  });

  if (!report) throw createError("Report not found.", 404);

  const scores = await prisma.score.findMany({
    where: { studentId: report.studentId, termId: report.termId },
    include: { subject: { select: { name: true, code: true, type: true } } },
    orderBy: [{ subject: { type: "asc" } }, { subject: { name: "asc" } }],
  });

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: report.studentId, termId: report.termId },
    include: { class: { select: { level: true, section: true } } },
  });

  return {
    school: report.term.school,
    student: report.student,
    term: report.term,
    scores,
    report: { ...report, enrollment },
  };
};

const loadRemoteImage = async (url) => {
  if (!url) return null;

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    return Buffer.from(response.data);
  } catch (error) {
    logger.warn(`Failed to fetch remote image ${url}: ${error.message}`);
    return null;
  }
};

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

// ─── Bulk PDF Generation ───
const generateBulkPDFs = async (reportIds) => {
  let success = 0, failed = 0;
  const results = [];

  for (const reportId of reportIds) {
    try {
      const pdfUrl = await generateReportPDF(reportId);
      results.push({ reportId, pdfUrl, status: "success" });
      success++;
    } catch (error) {
      logger.error(`PDF generation failed for report ${reportId}:`, error.message);
      results.push({ reportId, error: error.message, status: "failed" });
      failed++;
    }
  }

  return { success, failed, results };
};

// ─── Class ZIP Generation ───
const generateClassZIP = async (schoolId, classId, termId) => {
  const archiver = require("archiver");
  const axios = require("axios");

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

  // Generate missing PDFs
  const missingPDF = reports.filter((r) => !r.pdfUrl);
  if (missingPDF.length > 0) {
    await generateBulkPDFs(missingPDF.map((r) => r.id));
  }

  // Build ZIP
  const zipPath = path.join(os.tmpdir(), `edutrack_class_reports_${classId}_${termId}_${Date.now()}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 6 } });

  await new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    let addedFiles = 0;
    const pdfReports = reports.filter(r => r.pdfUrl);
    
    if (pdfReports.length === 0) {
      archive.finalize();
      return;
    }

    for (const report of pdfReports) {
      const filename = `${report.student.studentNumber}_${report.student.lastName}_${report.student.firstName}.pdf`;
      
      axios({
        method: 'get',
        url: report.pdfUrl,
        responseType: 'stream',
      })
      .then(response => {
        archive.append(response.data, { name: filename });
        addedFiles++;
        if (addedFiles === pdfReports.length) {
          archive.finalize();
        }
      })
      .catch(error => {
        logger.error(`Failed to download PDF for ${report.student.studentNumber}:`, error.message);
        archive.append(Buffer.from(`Error: PDF not available for ${report.student.studentNumber}`), { name: filename });
        addedFiles++;
        if (addedFiles === pdfReports.length) {
          archive.finalize();
        }
      });
    }
  });

  return zipPath;
};

// ─── Preview Report HTML ───
const previewReportHTML = async (reportId) => {
  // For pdfkit, we return a simple HTML preview
  const data = await fetchReportData(reportId);
  const { student, term, scores, report } = data;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Report Card Preview</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { text-align: center; margin-bottom: 30px; }
        .student-info { margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .summary { margin-top: 20px; }
        .remarks { margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>EduPortal</h1>
        <h2>End of Term Report Card</h2>
        <p><strong>${term.academicYear} — ${term.termNumber.replace("TERM", "Term ")}</strong></p>
      </div>
      
      <div class="student-info">
        <p><strong>Student:</strong> ${student.firstName} ${student.lastName}</p>
        <p><strong>Student ID:</strong> ${student.studentNumber}</p>
        <p><strong>Class:</strong> ${report.enrollment?.class ? `${report.enrollment.class.level} ${report.enrollment.class.section}` : 'N/A'}</p>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>CA1</th>
            <th>CA2</th>
            <th>CA3</th>
            <th>Exam</th>
            <th>Total</th>
            <th>Grade</th>
          </tr>
        </thead>
        <tbody>
          ${scores.map(s => `
            <tr>
              <td>${s.subject.name}</td>
              <td>${s.ca1 || '-'}</td>
              <td>${s.ca2 || '-'}</td>
              <td>${s.ca3 || '-'}</td>
              <td>${s.examScore || '-'}</td>
              <td>${s.total || '-'}</td>
              <td>${s.grade || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="summary">
        <p><strong>Average:</strong> ${scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + (s.total || 0), 0) / scores.length) : 0}%</p>
        <p><strong>Attendance:</strong> Present: ${report.daysPresent || 0}, Absent: ${report.daysAbsent || 0}, Late: ${report.daysLate || 0}</p>
      </div>
      
      <div class="remarks">
        ${report.teacherRemark ? `<p><strong>Class Teacher:</strong> ${report.teacherRemark}</p>` : ''}
        ${report.headRemark ? `<p><strong>Head Teacher:</strong> ${report.headRemark}</p>` : ''}
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  generateReportPDF,
  generateBulkPDFs,
  generateClassZIP,
  previewReportHTML,
};