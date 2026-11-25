const { VAIS_FOLDERS, uploadImage, deleteFile, ensureFolder } = require('../lib/vaisBucket');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_FOLDERS = new Set(Object.values(VAIS_FOLDERS));

const hasValidImageSignature = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  return false;
};

// POST /api/admin/uploads
exports.uploadAdminImage = async (req, res) => {
  try {
    const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Please attach an image file (JPEG, PNG, or WebP, max 5 MB).',
      });
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported file type. Only JPEG, PNG, and WebP images are allowed.',
      });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        message: 'Image exceeds the maximum allowed size of 5 MB.',
      });
    }

    if (!hasValidImageSignature(file.buffer, file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'File content is not a valid JPEG, PNG, or WebP image.',
      });
    }

    const requestedFolder = String(req.body?.folder || req.query?.folder || VAIS_FOLDERS.MENU_ITEMS).trim();
    const folderName = ALLOWED_FOLDERS.has(requestedFolder)
      ? requestedFolder
      : VAIS_FOLDERS.MENU_ITEMS;

    const folderId = await ensureFolder(folderName);
    const result = await uploadImage(file.buffer, file.originalname, folderId, file.mimetype);

    return res.status(201).json({
      success: true,
      fileId: result.fileId,
      fileUrl: result.fileUrl,
      data: {
        fileId: result.fileId,
        fileUrl: result.fileUrl,
        width: result.width,
        height: result.height,
        folder: folderName,
      },
    });
  } catch (err) {
    const status = err.statusCode || err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Image upload failed.',
    });
  }
};

// DELETE /api/admin/uploads/:fileId
exports.deleteAdminUpload = async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId || !fileId.trim()) {
      return res.status(400).json({
        success: false,
        message: 'fileId parameter is required.',
      });
    }

    await deleteFile(fileId.trim());
    return res.json({
      success: true,
      message: 'Image permanently deleted from VaisBucket.',
      fileId: fileId.trim(),
    });
  } catch (err) {
    const status = err.statusCode || err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Failed to delete image.',
    });
  }
};
