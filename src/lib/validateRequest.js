/**
 * Validates request payloads using a Zod schema and formats errors into a clean
 * field-level object (`errors: { fieldName: 'Error message' }`) for inline UI rendering.
 */
function formatZodErrors(zodError) {
  const fieldErrors = {};
  for (const issue of zodError.issues || []) {
    const key = issue.path && issue.path.length > 0 ? issue.path.join('.') : '_form';
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

function validateWithSchema(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const errors = formatZodErrors(result.error);
    const firstMsg = Object.values(errors)[0] || 'Invalid input data.';
    return {
      ok: false,
      message: firstMsg,
      errors,
    };
  }
  return {
    ok: true,
    data: result.data,
  };
}

module.exports = {
  formatZodErrors,
  validateWithSchema,
};
