const { deleteFile } = require('./vaisBucket');

/**
 * Safely deletes an image file from VaisBucket without throwing if it fails
 * during non-fatal cleanup hooks, logging only non-secret context.
 */
async function safeDeleteFile(fileId, contextLabel = 'cleanup') {
  if (!fileId) return;
  try {
    await deleteFile(fileId);
  } catch (err) {
    console.warn(`[VaisBucket ${contextLabel}] Could not delete file ${fileId}:`, err.message);
  }
}

/**
 * Normalizes incoming create/update body so `imageUrl`, legacy `image`, and `imageFileId`
 * stay synchronized across products and outlets.
 */
function applyProductImageFields(body = {}) {
  const normalized = { ...body };
  const hasImageUrlProp = Object.prototype.hasOwnProperty.call(body, 'imageUrl');
  const hasLegacyImageProp = Object.prototype.hasOwnProperty.call(body, 'image');

  if (hasImageUrlProp || hasLegacyImageProp) {
    const resolvedUrl = (hasImageUrlProp ? body.imageUrl : body.image) || '';
    normalized.imageUrl = String(resolvedUrl).trim();
    normalized.image = normalized.imageUrl;
    normalized.imageFileId = body.imageFileId ? String(body.imageFileId).trim() : null;
  }

  return normalized;
}

/**
 * Normalizes a serialized product object so `imageUrl` is always available to clients.
 */
function attachResolvedImageUrl(productObj) {
  if (!productObj) return productObj;
  const url = productObj.imageUrl || productObj.image || '';
  return {
    ...productObj,
    imageUrl: url,
    image: url,
  };
}

/**
 * Cleans up the just-uploaded VaisBucket file if saving to MongoDB failed afterward.
 */
async function cleanupUploadAfterDbFailure(submittedFileId, previousFileId = null) {
  if (submittedFileId && submittedFileId !== previousFileId) {
    await safeDeleteFile(submittedFileId, 'orphan-rollback');
  }
}

/**
 * Deletes the previous VaisBucket file strictly AFTER the replacement DB save succeeds.
 */
async function deletePreviousFileAfterSave(previousFileId, currentFileId = null) {
  if (previousFileId && previousFileId !== currentFileId) {
    await safeDeleteFile(previousFileId, 'replace-cleanup');
  }
}

module.exports = {
  safeDeleteFile,
  applyProductImageFields,
  attachResolvedImageUrl,
  cleanupUploadAfterDbFailure,
  deletePreviousFileAfterSave,
};
