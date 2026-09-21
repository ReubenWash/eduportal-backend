// utils/fileNames.js
// Readable, safe names for report card downloads and links.
//   single student : "Acquah Frederick - Term 3 2024-2025 Results.pdf"
//   whole class    : "JHS 2 A - Term 3 2024-2025 Reports.pdf"   (.zip for the ZIP version)
//   stored link    : ".../acquah-frederick-term-3-2024-2025-results-9f2c41ab77.pdf"

const crypto = require("crypto");

// Remove characters that are illegal in file names on Windows/macOS/Linux, keep letters (incl. Ɛ Ɔ),
// digits, spaces, dashes and dots.
const cleanFileName = (name) =>
  String(name || "")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// "Acquah Frederick" -> "acquah-frederick" (URL/public_id safe, ASCII only)
const slugify = (text) =>
  String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")     // strip accents
    .replace(/[Ɛɛ]/g, "e")
    .replace(/[Ɔɔ]/g, "o")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// "TERM3" -> "Term 3"
const termName = (termNumber) => String(termNumber || "").replace(/^TERM(\d)$/i, "Term $1");

// "JHS1" + "A" -> "JHS 1 A"
const className = (level, section) =>
  `${String(level || "").replace(/^JHS(\d)$/i, "JHS $1")} ${section || ""}`.trim();

// 2024/2025 -> 2024-2025 (a "/" can't be used in a file name)
const yearLabel = (academicYear) => String(academicYear || "").replace(/\//g, "-");

// "Term 3 2024-2025"
const termLabel = (term) => `${termName(term?.termNumber)} ${yearLabel(term?.academicYear)}`.trim();

const studentFullName = (student) =>
  [student?.lastName, student?.firstName, student?.otherNames].filter(Boolean).join(" ").trim();

const studentResultsFileName = (student, term) =>
  `${cleanFileName(`${studentFullName(student)} - ${termLabel(term)} Results`)}.pdf`;

const classReportsFileName = (classLabel, term, ext = "pdf") =>
  `${cleanFileName(`${classLabel} - ${termLabel(term)} Reports`)}.${ext}`;

// Name used for the stored (Cloudinary) copy that goes into emails. A short token derived from the
// report's UUID keeps the link readable but not guessable from a student's name alone.
const storedResultsPublicId = (student, term, reportId) => {
  const token = crypto.createHash("sha256").update(String(reportId)).digest("hex").slice(0, 10);
  const base = slugify(`${studentFullName(student)} ${termLabel(term)} results`) || "results";
  return `${base}-${token}`;
};

// Content-Disposition with an ASCII fallback plus the UTF-8 name (RFC 5987) so names with
// Ɛ/Ɔ or accents still download with the right name.
const contentDisposition = (fileName, attachment = true) => {
  const ascii = fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Ɛɛ]/g, "e")
    .replace(/[Ɔɔ]/g, "o")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\]/g, "");
  // encodeURIComponent leaves ' ( ) * unescaped, which are not allowed in an RFC 5987 value
  const utf8 = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${attachment ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
};

module.exports = {
  cleanFileName,
  slugify,
  termName,
  className,
  yearLabel,
  termLabel,
  studentFullName,
  studentResultsFileName,
  classReportsFileName,
  storedResultsPublicId,
  contentDisposition,
};
