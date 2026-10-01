function parseJsonField(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(`${fieldName} must be a valid JSON string or object`);
    }
  }

  if (typeof value === 'object') {
    return value;
  }

  return undefined;
}

function normalizeSchoolUpdatePayload(body = {}) {
  const updateData = {};

  for (const field of ['scoreLabels', 'reportConfig', 'gradingConfig']) {
    const parsedValue = parseJsonField(body[field], field);
    if (parsedValue !== undefined) {
      updateData[field] = parsedValue;
    }
  }

  return updateData;
}

module.exports = {
  normalizeSchoolUpdatePayload,
  parseJsonField,
};
