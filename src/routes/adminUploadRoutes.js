const express = require('express');
const multer = require('multer');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const { uploadAdminImage, deleteAdminUpload } = require('../controllers/uploadController');

const router = express.Router();

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      const err = new Error('Unsupported file type. Only JPEG, PNG, and WebP images are allowed.');
      err.statusCode = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

const handleMultipartUpload = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'Image exceeds the maximum allowed size of 5 MB.',
        });
      }
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message || 'Invalid multipart image upload.',
      });
    }
    return next();
  });
};

router.post('/', requireAuth, requireAdmin, handleMultipartUpload, uploadAdminImage);
router.delete('/:fileId', requireAuth, requireAdmin, deleteAdminUpload);

module.exports = router;
