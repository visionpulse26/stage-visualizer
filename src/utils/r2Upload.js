/**
 * Direct-to-R2 upload via presigned PUT URL.
 * 1) Get presigned URL from backend
 * 2) PUT file with progress tracking
 * 3) Return public URL on success
 */

const API_BASE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_URL
  ? import.meta.env.VITE_APP_URL.replace(/\/$/, '')
  : (typeof window !== 'undefined' ? window.location.origin : '')

/**
 * Fetch presigned PUT URL from backend.
 * @param {{ filename: string, contentType: string, projectId?: string, type: 'media'|'hdri'|'stage' }} opts
 * @returns {Promise<{ putUrl: string, publicUrl: string | null, key: string }>}
 */
export async function getPresignedUploadUrl(opts) {
  const { filename, contentType, projectId, type = 'media' } = opts
  const url = `${API_BASE}/api/get-upload-url`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType, projectId: projectId || null, type }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.error || data.detail || `HTTP ${res.status}`
    throw new Error(msg)
  }
  if (!data.putUrl) throw new Error('Server did not return upload URL')
  return { putUrl: data.putUrl, publicUrl: data.publicUrl || null, key: data.key || '' }
}

/**
 * Upload file to presigned PUT URL with progress.
 * @param {string} putUrl - Presigned URL from getPresignedUploadUrl
 * @param {File} file - Raw file
 * @param {string | null} publicUrl - Final public URL to return (from getPresignedUploadUrl)
 * @param {(percent: number) => void} onProgress - 0–100
 * @returns {Promise<string>} - publicUrl on success (or putUrl base if publicUrl missing)
 */
export function uploadFileToPresignedUrl(putUrl, file, publicUrl, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', putUrl)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && typeof onProgress === 'function') {
        const percent = Math.min(100, Math.round((e.loaded / e.total) * 100))
        onProgress(percent)
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100)
        resolve(publicUrl || putUrl.split('?')[0])
      } else {
        reject(new Error(`Upload failed: HTTP ${xhr.status}${xhr.responseText ? ` — ${xhr.responseText.slice(0, 150)}` : ''}`))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Network error — request failed. Check connection and CORS.'))
    })
    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted.'))
    })

    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.send(file)
  })
}

/**
 * User-friendly message for known error patterns.
 * @param {Error} err
 * @returns {string}
 */
export function getUploadErrorMessage(err) {
  const msg = (err && err.message) ? err.message : String(err)
  if (/timeout|timed out/i.test(msg)) return 'Upload timed out. Try a smaller file or a faster connection.'
  if (/403|Forbidden/i.test(msg)) return 'Upload forbidden (403). Check R2 bucket policy and CORS.'
  if (/CORS|cors|blocked/i.test(msg)) return 'Request blocked (CORS). Ensure R2 and API allow your origin.'
  if (/Network error|Failed to fetch/i.test(msg)) return 'Network error. Check your connection and that the API is reachable.'
  if (/Unauthorized|^401$|HTTP 401/i.test(msg)) {
    return 'Upload unauthorized. Verify upload origin policy and server environment settings.'
  }
  if (/configuration error|contact support/i.test(msg)) {
    return 'Server configuration error. Please try again later or contact support.'
  }
  if (/aborted/i.test(msg)) return 'Upload was cancelled.'
  return msg
}
