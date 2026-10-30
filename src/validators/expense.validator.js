const { body } = require("express-validator");

const createCategoryValidator = [
  body("name").trim().isLength({ min: 2, max: 100 })
    .withMessage("Category name must be 2-100 characters."),
];

const updateCategoryValidator = [
  body("name").optional({ values: "falsy" }).trim().isLength({ min: 2, max: 100 })
    .withMessage("Category name must be 2-100 characters."),
  body("isActive").optional().isBoolean(),
];

const recordExpenseValidator = [
  body("expenseCategoryId").notEmpty().withMessage("expenseCategoryId is required."),
  body("amount").isFloat({ gt: 0 }).withMessage("Amount must be a positive number."),
  body("method").optional({ values: "falsy" })
    .isIn(["CASH", "MOMO", "BANK_TRANSFER", "CHEQUE", "OTHER"])
    .withMessage("Invalid payment method."),
  body("vendor").optional({ values: "falsy" }).isLength({ max: 200 }),
  body("notes").optional({ values: "falsy" }).isLength({ max: 500 }),
  body("receiptUrl").optional({ values: "falsy" }).isString(),
];

const updateExpenseValidator = [
  body("amount").optional({ values: "falsy" }).isFloat({ gt: 0 }),
  body("method").optional({ values: "falsy" })
    .isIn(["CASH", "MOMO", "BANK_TRANSFER", "CHEQUE", "OTHER"]),
];

module.exports = {
  createCategoryValidator, updateCategoryValidator,
  recordExpenseValidator, updateExpenseValidator,
};