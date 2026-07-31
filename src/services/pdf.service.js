/**
 * EduTrack JHS — PDF Service (Using pdfkit)
 * Generates report card PDFs without Puppeteer
 */

const PDFDocument = require('pdfkit');
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

  // 1. Fetch data
  const data = await fetchReportData(reportId);
  const { school, student, term, scores, report } = data;

  // 2. Create PDF document
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const buffers = [];
  
  doc.on('data', buffers.push.bind(buffers));
  doc.on('end', () => {
    const pdfBuffer = Buffer.concat(buffers);
    // Store for later upload
    doc._pdfBuffer = pdfBuffer;
  });

  // ─── HEADER ───
  doc.rect(0, 0, doc.page.width, 80).fill('#4F46E5');
  doc.fillColor('#FFFFFF')
     .fontSize(24)
     .font('Helvetica-Bold')
     .text(school.name || 'EduPortal', 50, 25);
  
  doc.fontSize(12)
     .font('Helvetica')
     .text('End of Term Report Card', 50, 52);

  // ─── TERM BADGE ───
  const termLabel = `${term.academicYear} — ${term.termNumber.replace("TERM", "Term ")}`;
  doc.rect(430, 20, 120, 30).fill('#10B981');
  doc.fillColor('#FFFFFF')
     .fontSize(10)
     .font('Helvetica-Bold')
     .text(termLabel, 440, 28, { align: 'center' });

  // ─── STUDENT INFO SECTION ───
  let yPos = 110;
  
  // Section title
  doc.fillColor('#1F2937')
     .fontSize(14)
     .font('Helvetica-Bold')
     .text('Student Information', 50, yPos);
  
  yPos += 25;

  // Student info grid
  const studentInfo = [
    { label: 'Student Name', value: `${student.firstName} ${student.lastName}` },
    { label: 'Student ID', value: student.studentNumber },
    { label: 'Gender', value: student.gender },
    { label: 'Date of Birth', value: new Date(student.dateOfBirth).toLocaleDateString('en-GB') },
    { label: 'Class', value: report.enrollment?.class ? `${report.enrollment.class.level} ${report.enrollment.class.section}` : 'N/A' },
    { label: 'Academic Year', value: term.academicYear },
  ];

  // Draw info boxes
  const colWidth = (doc.page.width - 100) / 3;
  studentInfo.forEach((info, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 50 + (col * colWidth);
    const y = yPos + (row * 30);
    
    doc.fillColor('#F3F4F6')
       .rect(x, y, colWidth - 10, 25)
       .fill();
    
    doc.fillColor('#6B7280')
       .fontSize(9)
       .font('Helvetica')
       .text(info.label + ':', x + 5, y + 4);
    
    doc.fillColor('#1F2937')
       .fontSize(10)
       .font('Helvetica-Bold')
       .text(info.value, x + 80, y + 4);
  });

  yPos += 85;

  // ─── SCORES TABLE ───
  doc.fillColor('#1F2937')
     .fontSize(14)
     .font('Helvetica-Bold')
     .text('Subject Scores', 50, yPos);
  
  yPos += 20;

  // Table headers
  const headers = ['Subject', 'CA1', 'CA2', 'CA3', 'Exam', 'Total', 'Grade', 'Position'];
  const colWidths = [90, 40, 40, 40, 50, 50, 50, 50];
  let xPos = 50;

  // Header background
  doc.rect(50, yPos - 2, doc.page.width - 100, 20).fill('#E5E7EB');
  
  doc.fillColor('#1F2937')
     .fontSize(9)
     .font('Helvetica-Bold');
  
  headers.forEach((header, i) => {
    doc.text(header, xPos, yPos + 2, { width: colWidths[i], align: 'center' });
    xPos += colWidths[i];
  });

  yPos += 22;
  
  // Table rows
  scores.forEach((score, index) => {
    const total = (score.ca1 || 0) + (score.ca2 || 0) + (score.ca3 || 0) + (score.examScore || 0);
    const grade = calculateGrade(total);
    const position = index + 1;
    
    const rowData = [
      score.subject.name,
      score.ca1 || '-',
      score.ca2 || '-',
      score.ca3 || '-',
      score.examScore || '-',
      total || '-',
      grade || '-',
      position || '-'
    ];

    // Alternate row colors
    if (index % 2 === 0) {
      doc.rect(50, yPos - 2, doc.page.width - 100, 18).fill('#F9FAFB');
    }

    xPos = 50;
    rowData.forEach((value, i) => {
      doc.fillColor('#1F2937')
         .fontSize(8)
         .font('Helvetica');
      
      if (i === 0) {
        doc.text(String(value), xPos + 3, yPos + 2);
      } else {
        doc.text(String(value), xPos, yPos + 2, { width: colWidths[i], align: 'center' });
      }
      xPos += colWidths[i];
    });

    yPos += 22;

    // Page break if needed
    if (yPos > 700) {
      doc.addPage();
      yPos = 50;
    }
  });

  yPos += 20;

  // ─── SUMMARY ───
  const totalScore = scores.reduce((sum, s) => sum + (s.total || 0), 0);
  const avgScore = scores.length > 0 ? Math.round(totalScore / scores.length) : 0;
  const passedCount = scores.filter(s => (s.total || 0) >= 50).length;
  const passRate = scores.length > 0 ? Math.round((passedCount / scores.length) * 100) : 0;

  doc.fillColor('#1F2937')
     .fontSize(12)
     .font('Helvetica-Bold')
     .text('Summary', 50, yPos);
  
  yPos += 20;

  const summaryItems = [
    { label: 'Average Score', value: `${avgScore}%` },
    { label: 'Pass Rate', value: `${passRate}%` },
    { label: 'Subjects Passed', value: `${passedCount} / ${scores.length}` },
    { label: 'Days Present', value: report.daysPresent || 0 },
    { label: 'Days Absent', value: report.daysAbsent || 0 },
    { label: 'Days Late', value: report.daysLate || 0 },
  ];

  summaryItems.forEach((item, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 50 + (col * 150);
    const y = yPos + (row * 25);
    
    doc.fillColor('#6B7280')
       .fontSize(9)
       .font('Helvetica')
       .text(item.label + ':', x, y);
    
    doc.fillColor('#1F2937')
       .fontSize(10)
       .font('Helvetica-Bold')
       .text(String(item.value), x + 100, y);
  });

  yPos += 70;

  // ─── REMARKS ───
  if (report.teacherRemark || report.headRemark) {
    doc.fillColor('#1F2937')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('Remarks', 50, yPos);
    
    yPos += 20;

    if (report.teacherRemark) {
      doc.fillColor('#6B7280')
         .fontSize(9)
         .font('Helvetica')
         .text('Class Teacher:', 50, yPos);
      
      doc.fillColor('#1F2937')
         .fontSize(10)
         .font('Helvetica')
         .text(report.teacherRemark, 150, yPos, { width: 400 });
      
      yPos += 20;
    }

    if (report.headRemark) {
      doc.fillColor('#6B7280')
         .fontSize(9)
         .font('Helvetica')
         .text('Head Teacher:', 50, yPos);
      
      doc.fillColor('#1F2937')
         .fontSize(10)
         .font('Helvetica')
         .text(report.headRemark, 150, yPos, { width: 400 });
      
      yPos += 20;
    }
  }

  // ─── FOOTER ───
  const footerY = doc.page.height - 60;
  doc.moveTo(50, footerY)
     .lineTo(doc.page.width - 50, footerY)
     .stroke('#E5E7EB');

  doc.fillColor('#9CA3AF')
     .fontSize(8)
     .font('Helvetica')
     .text('This is a computer-generated report card. No signature is required.', 
       50, 
       footerY + 15, 
       { align: 'center' }
     );

  doc.text(`Generated on ${new Date().toLocaleDateString('en-GB')}`, 
    50, 
    footerY + 30, 
    { align: 'center' }
  );

  // ─── FINALIZE ───
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
            select: { id: true, name: true, logoUrl: true, motto: true, address: true },
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