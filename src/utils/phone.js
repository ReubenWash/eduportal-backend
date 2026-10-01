const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

const isValidE164Phone = (value) => E164_PHONE_REGEX.test(String(value || ""));

module.exports = { isValidE164Phone };