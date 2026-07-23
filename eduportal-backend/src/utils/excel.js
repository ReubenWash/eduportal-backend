// utils/excel.js
const ExcelJS = require("exceljs");
const { createError } = require("../middleware/errorHandler");

async function parseExcelBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    throw createError("Uploaded file is not a valid Excel (.xlsx) file.", 422);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw createError("Excel file has no worksheets.", 422);

  const headerRow = worksheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    let hasData = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (!key) return;
      let value = cell.value;
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if (value.text) value = value.text;
        else if (value.result !== undefined) value = value.result;
      }
      obj[key] = value;
      hasData = true;
    });
    if (hasData) rows.push(obj);
  });

  return rows;
}

async function generateExcelBuffer({ sheetName = "Sheet1", columns, rows }) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 20 }));

  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3C5E" } };

  rows.forEach((r) => worksheet.addRow(r));

  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  return workbook.xlsx.writeBuffer();
}

function sendExcelFile(res, buffer, filename) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}

module.exports = { parseExcelBuffer, generateExcelBuffer, sendExcelFile };