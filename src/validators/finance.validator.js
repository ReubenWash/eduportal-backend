const { body } = require("express-validator");

const createCategoryValidator = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Category name must be 2-100 characters."),
  body("description")
    .optional({ values: "falsy" })
    .isLength({ max: 500 })
    .withMessage("Description must be under 500 characters."),
  body("expectedAmount")
    .optional({ values: "falsy" })
    .isFloat({ min: 0 })
    .withMessage("Expected amount must be a positive number."),
];

const updateCategoryValidator = [
  body("name")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Category name must be 2-100 characters."),
  body("expectedAmount")
    .optional({ values: "falsy" })
    .isFloat({ min: 0 })
    .withMessage("Expected amount must be a positive number."),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be true or false."),
];

const recordTransactionValidator = [
  body("studentId").notEmpty().withMessage("studentId is required."),
  body("categoryId").notEmpty().withMessage("categoryId is required."),
  body("termId").optional({ values: "falsy" }).isString(),
  body("feeInvoiceId").optional({ values: "falsy" }).isString(),
  body("amount")
    .isFloat({ gt: 0 })
    .withMessage("Amount must be a positive number."),
  body("method")
    .optional({ values: "falsy" })
    .isIn(["CASH", "MOMO", "BANK_TRANSFER", "CHEQUE", "OTHER"])
    .withMessage("Invalid payment method."),
  body("reference")
    .optional({ values: "falsy" })
    .isLength({ max: 100 })
    .withMessage("Reference must be under 100 characters."),
  body("notes")
    .optional({ values: "falsy" })
    .isLength({ max: 500 })
    .withMessage("Notes must be under 500 characters."),
];

const updateTransactionValidator = [
  body("feeInvoiceId")
    .optional({ values: "falsy" })
    .isString()
    .withMessage("feeInvoiceId must be a string."),
  body("amount")
    .optional({ values: "falsy" })
    .isFloat({ gt: 0 })
    .withMessage("Amount must be a positive number."),
  body("method")
    .optional({ values: "falsy" })
    .isIn(["CASH", "MOMO", "BANK_TRANSFER", "CHEQUE", "OTHER"])
    .withMessage("Invalid payment method."),
];

const feeStructureValidator = [
  body("classId").notEmpty().isString(),
  body("termId").notEmpty().isString(),
  body("items").isArray({ min: 1, max: 50 }).withMessage("Add between 1 and 50 fee items."),
  body("items.*.categoryId").notEmpty().isString(),
  body("items.*.amount").isFloat({ gt: 0 }),
];

const generateFeeInvoicesValidator = [
  body("classId").notEmpty().isString(),
  body("termId").notEmpty().isString(),
  body("dueDate").isISO8601().withMessage("A valid due date is required."),
];

const concessionValidator = [
  body("amount").isFloat({ gt: 0 }),
  body("reason").trim().isLength({ min: 2, max: 500 }),
];

const reminderValidator = [
  body("invoiceIds").isArray({ min: 1, max: 100 }),
  body("invoiceIds.*").isString().notEmpty(),
];

module.exports = {
  createCategoryValidator,
  updateCategoryValidator,
  recordTransactionValidator,
  updateTransactionValidator,
  feeStructureValidator,
  generateFeeInvoicesValidator,
  concessionValidator,
  reminderValidator,
};
