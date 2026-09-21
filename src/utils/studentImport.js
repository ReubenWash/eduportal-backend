// utils/studentImport.js
// Reading and checking a school's student spreadsheet (bulk registration + enrolment).
// Pure functions: no database access here, so they are easy to test. The service passes in
// the school's classes and the students that already exist.

const ExcelJS = require("exceljs");
const { createError } = require("../middleware/errorHandler");

const MAX_ROWS = 1000;

// Column headings a school might use -> our field names (compared without case, spaces or symbols)
const HEADER_ALIASES = {
  firstName:    ["firstname", "first", "givenname", "forename"],
  lastName:     ["lastname", "last", "surname", "familyname"],
  otherNames:   ["othernames", "othername", "middlename", "middlenames"],
  gender:       ["gender", "sex"],
  dateOfBirth:  ["dateofbirth", "dob", "birthdate", "dateborn", "birthday"],
  className:    ["class", "classname", "classsection", "form", "level"],
  guardianName: ["guardianname", "parentname", "guardian", "parent", "parentguardianname", "parentguardian"],
  guardianPhone:["guardianphone", "parentphone", "guardiancontact", "parentcontact", "phone", "phonenumber", "contact"],
  guardianEmail:["guardianemail", "parentemail", "email", "emailaddress"],
  relationship: ["relationship", "guardianrelationship", "relation"],
};

const squash = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const HEADER_LOOKUP = Object.entries(HEADER_ALIASES).reduce((map, [field, aliases]) => {
  aliases.forEach((a) => map.set(a, field));
  return map;
}, new Map());

const cellValue = (cell) => {
  let value = cell.value;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if (value.text !== undefined) value = value.text;
    else if (value.result !== undefined) value = value.result;
    else if (value.richText) value = value.richText.map((r) => r.text).join("");
    else if (value.hyperlink) value = value.text || value.hyperlink;
  }
  return value;
};

// Reads the first sheet. Returns [{ rowNumber, raw: { firstName, lastName, ... } }] with the
// real Excel row numbers so error messages can say "row 14".
async function parseStudentSheet(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    throw createError("That file is not a valid Excel (.xlsx) file. Download the template and fill it in.", 422);
  }

  // Prefer the sheet called "Students" (our template), otherwise the first sheet
  const sheet = workbook.getWorksheet("Students") || workbook.worksheets[0];
  if (!sheet) throw createError("The Excel file has no sheets.", 422);

  // Find the heading row within the first 5 rows (people sometimes add a title above it)
  let headerRowNumber = null;
  let columns = {};
  for (let r = 1; r <= Math.min(5, sheet.rowCount); r += 1) {
    const found = {};
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const field = HEADER_LOOKUP.get(squash(cellValue(cell)));
      if (field && !Object.values(found).includes(field)) found[colNumber] = field;
    });
    if (Object.values(found).includes("firstName") && Object.values(found).includes("lastName")) {
      headerRowNumber = r;
      columns = found;
      break;
    }
  }

  if (!headerRowNumber) {
    throw createError(
      "Could not find the column headings. The first row must contain at least 'First Name' and 'Last Name'. Please use the template.",
      422
    );
  }

  const rows = [];
  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const raw = {};
    let hasData = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const field = columns[colNumber];
      if (!field) return;
      const value = cellValue(cell);
      if (value === null || value === undefined || String(value).trim() === "") return;
      raw[field] = value;
      hasData = true;
    });
    if (hasData) rows.push({ rowNumber: r, raw });
  }

  if (rows.length === 0) throw createError("The spreadsheet has no students in it.", 422);
  if (rows.length > MAX_ROWS) {
    throw createError(`A file can have at most ${MAX_ROWS} students. Split it into smaller files.`, 422);
  }
  return rows;
}

// ─── field cleaners ─────────────────────────────────────────────

const text = (v) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim());

// "kofi mensah" / "KOFI MENSAH" -> "Kofi Mensah"; "Kofi acquah" -> "Kofi Acquah".
// Names that are already mixed case (McDonald, De Souza) keep their inner capitals.
const capitaliseWords = (t) => t.replace(/(^|[\s\-'’])([a-zɛɔ])/g, (m, p, c) => p + c.toUpperCase());
const tidyName = (v) => {
  const t = text(v);
  if (!t) return "";
  if (t === t.toUpperCase() || t === t.toLowerCase()) return capitaliseWords(t.toLowerCase());
  return capitaliseWords(t);
};

const parseGender = (v) => {
  const t = squash(v);
  if (["male", "m", "boy", "b"].includes(t)) return "MALE";
  if (["female", "f", "girl", "g"].includes(t)) return "FEMALE";
  return null;
};

const isoDate = (d) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Accepts: Excel dates, Excel serial numbers, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, yyyy-mm-dd, "5 March 2011"
const parseDob = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    // Excel dates come back as UTC midnight; use the UTC calendar day
    return Number.isNaN(v.getTime()) ? null : new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  }
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000); // Excel serial
    return null;
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);            // yyyy-mm-dd
  if (m) return buildDate(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);           // dd/mm/yyyy (Ghana order)
  if (m) {
    let year = +m[3];
    if (m[3].length === 2) year += year > 30 ? 1900 : 2000;
    return buildDate(year, +m[2], +m[1]);
  }
  const parsed = new Date(`${t} UTC`);                                   // "5 March 2011"
  if (!Number.isNaN(parsed.getTime()) && /[a-z]/i.test(t)) {
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  }
  return null;
};

const buildDate = (y, mo, d) => {
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
};

// Ghana numbers: Excel often drops the leading 0 (244962942) or people type +233...
const parsePhone = (v) => {
  const raw = text(v);
  if (!raw) return { value: "", warning: null };
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+233")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("233") && digits.length === 12) digits = `0${digits.slice(3)}`;
  else if (/^\d{9}$/.test(digits)) digits = `0${digits}`;
  digits = digits.replace(/\+/g, "");
  if (!/^0\d{9}$/.test(digits)) return { value: raw, warning: `Phone number "${raw}" does not look like a 10-digit Ghana number.` };
  return { value: digits, warning: null };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// "JHS 1 A", "jhs1a", "JHS1-A" all become "JHS1A"
const classKey = (label) => squash(label);

const ageOn = (dob, today = new Date()) => {
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const m = today.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
};

const dupKey = (first, last, dobIso) => `${squash(first)}|${squash(last)}|${dobIso}`;

// ─── main check ─────────────────────────────────────────────────
// parsedRows : output of parseStudentSheet
// context    : {
//   classes:            [{ id, level, section, academicYear }]  classes students can be enrolled in
//   existingStudents:   [{ firstName, lastName, dateOfBirth, studentNumber }]
//   guardianAccounts:   Map(email -> { isGuardian })   emails that already have a login
// }
// Row status: "ready" (will be imported) | "duplicate" (already registered, skipped) | "error" (must be fixed)
function checkStudentRows(parsedRows, context, today = new Date()) {
  const { classes = [], existingStudents = [], guardianAccounts = new Map() } = context;

  const classByKey = new Map();
  const ambiguous = new Set();
  classes.forEach((c) => {
    const key = classKey(`${c.level}${c.section}`);
    if (classByKey.has(key)) ambiguous.add(key);
    classByKey.set(key, c);
  });
  const classLabels = classes.map((c) => `${String(c.level).replace(/^JHS(\d)$/, "JHS $1")} ${c.section}`);

  const existing = new Map();
  existingStudents.forEach((s) => {
    const dob = s.dateOfBirth instanceof Date ? isoDate(s.dateOfBirth) : String(s.dateOfBirth || "").slice(0, 10);
    existing.set(dupKey(s.firstName, s.lastName, dob), s.studentNumber);
  });

  const seenInFile = new Map();
  const results = [];

  parsedRows.forEach(({ rowNumber, raw }) => {
    const errors = [];
    const warnings = [];

    const firstName = tidyName(raw.firstName);
    const lastName = tidyName(raw.lastName);
    const otherNames = tidyName(raw.otherNames);
    if (!firstName) errors.push("First name is missing.");
    if (!lastName) errors.push("Last name is missing.");

    const gender = parseGender(raw.gender);
    if (!raw.gender) errors.push("Gender is missing (use MALE or FEMALE).");
    else if (!gender) errors.push(`Gender "${text(raw.gender)}" is not recognised (use MALE or FEMALE).`);

    const dob = parseDob(raw.dateOfBirth);
    let dobIso = "";
    if (!raw.dateOfBirth) {
      errors.push("Date of birth is missing (use dd/mm/yyyy).");
    } else if (!dob) {
      errors.push(`Date of birth "${text(raw.dateOfBirth)}" is not a valid date (use dd/mm/yyyy).`);
    } else {
      dobIso = isoDate(dob);
      const age = ageOn(dob, today);
      if (dob > today) errors.push("Date of birth is in the future.");
      else if (age < 3 || age > 25) warnings.push(`Age ${age} looks unusual, please check the date of birth.`);
    }

    // class
    let classId = null;
    let classLabel = "";
    const rawClass = text(raw.className);
    if (!rawClass) {
      warnings.push("No class given: the student will be registered but not enrolled in a class.");
    } else {
      const key = classKey(rawClass);
      const cls = classByKey.get(key);
      if (!cls) {
        const hint = classLabels.length ? ` Available classes: ${classLabels.slice(0, 8).join(", ")}${classLabels.length > 8 ? ", ..." : ""}.` : " No classes exist yet - create them first.";
        errors.push(`Class "${rawClass}" was not found.${hint}`);
      } else if (ambiguous.has(key)) {
        errors.push(`Class "${rawClass}" matches more than one class.`);
      } else {
        classId = cls.id;
        classLabel = `${String(cls.level).replace(/^JHS(\d)$/, "JHS $1")} ${cls.section}`;
      }
    }

    // guardian
    const guardianName = tidyName(raw.guardianName);
    const emailRaw = text(raw.guardianEmail).toLowerCase();
    let guardianEmail = "";
    if (emailRaw) {
      if (!EMAIL_RE.test(emailRaw)) errors.push(`Guardian email "${emailRaw}" is not a valid email address.`);
      else if (!guardianName) errors.push("Guardian name is required when a guardian email is given.");
      else {
        guardianEmail = emailRaw;
        const account = guardianAccounts.get(emailRaw);
        if (account && !account.isGuardian) errors.push(`The email ${emailRaw} already belongs to a non-guardian account.`);
        else if (account) warnings.push("This guardian already has a portal account: the student will be linked to it.");
      }
    } else if (guardianName) {
      warnings.push("No guardian email: the guardian is saved but gets no portal login.");
    }
    const phone = parsePhone(raw.guardianPhone);
    if (phone.warning) warnings.push(phone.warning);
    const relationship = text(raw.relationship) || (guardianName ? "Parent" : "");

    // duplicates
    let status = errors.length ? "error" : "ready";
    let duplicateOf = null;
    if (!errors.length) {
      const key = dupKey(firstName, lastName, dobIso);
      if (seenInFile.has(key)) {
        errors.push(`Same name and date of birth as row ${seenInFile.get(key)} in this file.`);
        status = "error";
      } else {
        seenInFile.set(key, rowNumber);
        if (existing.has(key)) {
          duplicateOf = existing.get(key);
          warnings.push(`Already registered as ${duplicateOf}: this row is skipped.`);
          status = "duplicate";
        }
      }
    }

    results.push({
      rowNumber,
      status,
      errors,
      warnings,
      duplicateOf,
      display: {
        name: [lastName, firstName, otherNames].filter(Boolean).join(" "),
        gender: gender || text(raw.gender),
        dateOfBirth: dobIso || text(raw.dateOfBirth),
        className: classLabel || rawClass,
        guardianName,
        guardianPhone: phone.value,
        guardianEmail,
      },
      // exactly what the import needs (only meaningful when status === "ready")
      data: {
        firstName,
        lastName,
        otherNames: otherNames || null,
        gender,
        dateOfBirth: dobIso,
        classId,
        guardianName: guardianName || null,
        guardianPhone: phone.value || null,
        guardianEmail: guardianEmail || null,
        guardianRelationship: relationship || null,
      },
    });
  });

  const summary = {
    total: results.length,
    ready: results.filter((r) => r.status === "ready").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    errors: results.filter((r) => r.status === "error").length,
    withWarnings: results.filter((r) => r.status === "ready" && r.warnings.length > 0).length,
    withoutClass: results.filter((r) => r.status === "ready" && !r.data.classId).length,
  };

  return { rows: results, summary };
}

module.exports = {
  MAX_ROWS,
  HEADER_ALIASES,
  parseStudentSheet,
  checkStudentRows,
  // exported for tests
  parseDob,
  parsePhone,
  parseGender,
  tidyName,
  classKey,
};
