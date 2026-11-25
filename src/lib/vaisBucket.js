const REQUEST_TIMEOUT_MS = 30000;

const VAIS_FOLDERS = Object.freeze({
  MENU_ITEMS: 'menu-items',
  OUTLETS: 'outlets',
  BANNERS: 'banners',
});

class VaisBucketError extends Error {
  constructor(message, { status = null, isNetworkError = false } = {}) {
    super(message);
    this.name = 'VaisBucketError';
    this.status = status;
    this.statusCode = status || 500;
    this.isNetworkError = isNetworkError;
  }
}

const folderCache = new Map();
const inFlightFolders = new Map();

const getConfig = () => {
  const apiKey = (process.env.VAIS_BUCKET_API_KEY || '').trim();
  const baseUrl = (
    process.env.VAIS_BUCKET_BASE_URL || 'https://apibucket.vais.co.in/api/v1/user'
  )
    .trim()
    .replace(/\/+$/, '');

  if (!apiKey) {
    throw new VaisBucketError(
      'VaisBucket API key is not configured on the server (missing VAIS_BUCKET_API_KEY).',
      { status: 500 }
    );
  }

  return { apiKey, baseUrl };
};

const inferMimeType = (filename = '') => {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
};

const toBuffer = async (fileInput) => {
  if (Buffer.isBuffer(fileInput)) return fileInput;
  if (fileInput instanceof Uint8Array) return Buffer.from(fileInput);
  if (fileInput && (typeof fileInput.pipe === 'function' || fileInput[Symbol.asyncIterator])) {
    const chunks = [];
    for await (const chunk of fileInput) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new VaisBucketError('Invalid file input provided for upload.', { status: 400 });
};

/**
 * Executes a VaisBucket HTTP request with a 30s timeout and 1 automatic retry
 * on network/timeout errors. Non-2xx HTTP responses are NOT retried and throw
 * a VaisBucketError carrying the upstream status code.
 */
const requestWithRetry = async (path, buildRequestInit) => {
  const { apiKey, baseUrl } = getConfig();
  const url = `${baseUrl}${path}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const init = await buildRequestInit();
      const headers = {
        ...(init.headers || {}),
        'X-API-Key': apiKey,
      };

      const res = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });

      const rawText = await res.text();
      let payload = null;
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          payload = null;
        }
      }

      if (!res.ok) {
        const detail =
          payload?.message ||
          payload?.error ||
          (rawText && rawText.slice(0, 200)) ||
          res.statusText ||
          'Upstream request failed';
        throw new VaisBucketError(`VaisBucket error (${res.status}): ${detail}`, {
          status: res.status,
          isNetworkError: false,
        });
      }

      return payload || {};
    } catch (err) {
      if (err instanceof VaisBucketError && !err.isNetworkError) {
        throw err;
      }

      const isTimeout = err?.name === 'AbortError';
      const networkErr = new VaisBucketError(
        isTimeout
          ? 'VaisBucket request timed out after 30s.'
          : `VaisBucket network error: ${err?.message || 'Connection failed'}`,
        { status: isTimeout ? 504 : 502, isNetworkError: true }
      );

      if (attempt === 0) {
        continue;
      }
      throw networkErr;
    } finally {
      clearTimeout(timeoutId);
    }
  }
};

const extractFolderList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.folders)) return payload.data.folders;
  if (Array.isArray(payload?.folders)) return payload.folders;
  return [];
};

const extractFolderId = (folder) => {
  if (!folder || typeof folder !== 'object') return null;
  return folder.folderId || folder._id || folder.id || null;
};

/**
 * Finds an existing VaisBucket folder by name or creates it, caching its ID in memory.
 */
async function ensureFolder(name) {
  const cleanName = String(name || '').trim();
  if (!cleanName) {
    throw new VaisBucketError('Folder name is required.', { status: 400 });
  }

  if (folderCache.has(cleanName)) {
    return folderCache.get(cleanName);
  }

  if (inFlightFolders.has(cleanName)) {
    return inFlightFolders.get(cleanName);
  }

  const lookupPromise = (async () => {
    const listPayload = await requestWithRetry('/folders?all=true', () => ({
      method: 'GET',
    }));

    const folders = extractFolderList(listPayload);
    const existing = folders.find((f) => String(f?.name || '').trim() === cleanName);
    const existingId = extractFolderId(existing);
    if (existingId) {
      folderCache.set(cleanName, existingId);
      return existingId;
    }

    const createPayload = await requestWithRetry('/folders', () => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName }),
    }));

    const createdId =
      extractFolderId(createPayload?.data) || extractFolderId(createPayload);
    if (!createdId) {
      throw new VaisBucketError(`Failed to create or resolve VaisBucket folder "${cleanName}".`, {
        status: 502,
      });
    }

    folderCache.set(cleanName, createdId);
    return createdId;
  })();

  inFlightFolders.set(cleanName, lookupPromise);
  try {
    return await lookupPromise;
  } finally {
    inFlightFolders.delete(cleanName);
  }
}

/**
 * Uploads an image buffer/stream to VaisBucket with public visibility.
 * @returns {Promise<{ fileId: string, fileUrl: string, width: number|null, height: number|null }>}
 */
async function uploadImage(fileInput, filename = 'upload.jpg', folderId = null, mimeType = null) {
  const buffer = await toBuffer(fileInput);
  if (!buffer || buffer.length === 0) {
    throw new VaisBucketError('Cannot upload an empty image file.', { status: 400 });
  }

  const safeFilename = String(filename || 'upload.jpg').replace(/[^\w.\-()]/g, '_');
  const resolvedMime = mimeType || inferMimeType(safeFilename);

  const payload = await requestWithRetry('/files/upload', () => {
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: resolvedMime }), safeFilename);
    formData.append('visibility', 'public');
    if (folderId) {
      formData.append('folderId', String(folderId));
    }
    return {
      method: 'POST',
      body: formData,
    };
  });

  const data = payload?.data || payload;
  if (!data?.fileId || !data?.fileUrl) {
    throw new VaisBucketError('VaisBucket upload response missing fileId or fileUrl.', {
      status: 502,
    });
  }

  return {
    fileId: data.fileId,
    fileUrl: data.fileUrl,
    width: data.metadata?.width ?? null,
    height: data.metadata?.height ?? null,
  };
}

/**
 * Permanently deletes a file from VaisBucket by fileId.
 */
async function deleteFile(fileId) {
  const cleanId = String(fileId || '').trim();
  if (!cleanId) {
    throw new VaisBucketError('fileId is required for deletion.', { status: 400 });
  }

  await requestWithRetry(`/files/${encodeURIComponent(cleanId)}`, () => ({
    method: 'DELETE',
  }));

  return { success: true, fileId: cleanId };
}

const clearFolderCache = () => {
  folderCache.clear();
  inFlightFolders.clear();
};

module.exports = {
  VAIS_FOLDERS,
  VaisBucketError,
  uploadImage,
  deleteFile,
  ensureFolder,
  clearFolderCache,
};
