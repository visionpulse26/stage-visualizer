import { supabase } from '../lib/supabaseClient'

/**
 * Direct-to-R2 upload via presigned PUT URL.
 * 1) Get presigned URL from backend
 * 2) PUT file with progress tracking
 * 3) Return public URL on success
 */

/**
 * Fetch presigned PUT URL from backend.
 * @param {{ filename: string, contentType: string, contentLength?: number, projectId?: string, type: 'media'|'hdri'|'stage'|'snapshot' }} opts
 * @returns {Promise<{ putUrl: string, publicUrl: string | null, key: string }>}
 */
export async function getPresignedUploadUrl(opts) {
  const { filename, contentType, contentLength, projectId, type = 'media' } = opts
  const url = '/api/get-upload-url'
  const headers = { 'Content-Type': 'application/json' }

  const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: null }))
  const accessToken = sessionData?.session?.access_token
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ filename, contentType, contentLength, projectId: projectId || null, type }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const authDetail = res.status === 401
      ? [
          data.bearerProvided ? 'session sent' : 'no session',
          data.supabaseAuthConfigured ? 'supabase auth configured' : 'supabase auth missing',
        ].join(', ')
      : ''
    const msg = data.error
      ? `${data.error}${authDetail ? ` (${authDetail})` : ''}`
      : data.detail || `HTTP ${res.status}`
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
 * @param {string} [contentTypeOverride] - Override Content-Type header (must match what was signed)
 * @returns {Promise<string>} - publicUrl on success (or putUrl base if publicUrl missing)
 */
export function uploadFileToPresignedUrl(putUrl, file, publicUrl, onProgress, contentTypeOverride) {
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

    // Use the override when provided so the Content-Type sent to R2 exactly matches what
    // was used to sign the presigned URL — a mismatch causes a 403 SignatureDoesNotMatch.
    xhr.setRequestHeader('Content-Type', contentTypeOverride || file.type || 'application/octet-stream')
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
  if (import.meta.env.DEV && msg) {
    console.error('[upload]', msg)
  }
  if (/timeout|timed out/i.test(msg)) return 'Upload timed out. Try a smaller file or a faster connection.'
  if (/403|Forbidden/i.test(msg)) return 'Upload failed. Please try again or contact support.'
  if (/CORS|cors|blocked/i.test(msg)) return 'Upload failed. Please try again or contact support.'
  if (/Network error|Failed to fetch/i.test(msg)) return 'Network error. Check your connection and try again.'
  if (/Unauthorized|^401$|HTTP 401/i.test(msg)) {
    return 'Upload unauthorized. Please sign in again, then retry the upload.'
  }
  if (/configuration error|contact support/i.test(msg)) {
    return 'Server configuration error. Please try again later or contact support.'
  }
  if (/aborted/i.test(msg)) return 'Upload was cancelled.'
  return 'Upload failed. Please try again or contact support.'
}
