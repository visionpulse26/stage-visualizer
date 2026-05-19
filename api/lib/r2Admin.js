/**
 * R2 (S3-compatible) list/delete helpers for admin APIs.
 */

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'

export function r2Env() {
  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
  const R2_BUCKET = process.env.R2_BUCKET
  return { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET }
}

export function assertR2Configured() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = r2Env()
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    const missing = [
      ['R2_ACCOUNT_ID', R2_ACCOUNT_ID],
      ['R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID],
      ['R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY],
      ['R2_BUCKET', R2_BUCKET],
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k)
    const err = new Error('R2 not configured')
    err.missing = missing
    throw err
  }
  return { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET }
}

export function createR2S3Client() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = assertR2Configured()
  const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
}

export function getR2BucketName() {
  return assertR2Configured().R2_BUCKET
}

/**
 * @param {import('@aws-sdk/client-s3').S3Client} s3
 * @param {string} bucket
 * @param {string} prefix
 * @returns {Promise<Array<{ key: string, size: number, lastModified: string | null }>>}
 */
export async function listAllObjectsUnderPrefix(s3, bucket, prefix) {
  const out = []
  let ContinuationToken
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken,
      }),
    )
    for (const o of res.Contents || []) {
      if (!o.Key) continue
      out.push({
        key: o.Key,
        size: Number(o.Size) || 0,
        lastModified: o.LastModified ? o.LastModified.toISOString() : null,
      })
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (ContinuationToken)
  return out
}

/**
 * Top-level "folders" in the bucket (first path segment + '/').
 * @returns {Promise<string[]>} e.g. ['abc12/', 'def34/']
 */
export async function listTopLevelPrefixes(s3, bucket) {
  const prefixes = new Set()
  let ContinuationToken
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: '',
        Delimiter: '/',
        ContinuationToken,
      }),
    )
    for (const p of res.CommonPrefixes || []) {
      if (p.Prefix) prefixes.add(p.Prefix)
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (ContinuationToken)
  return [...prefixes]
}

const DELETE_CHUNK = 1000

/**
 * @returns {{ deleted: string[], failed: Array<{ key: string, message: string }> }}
 */
export async function deleteObjectKeys(s3, bucket, keys) {
  const deleted = []
  const failed = []
  const unique = [...new Set(keys.filter((k) => typeof k === 'string' && k.length > 0))]
  for (let i = 0; i < unique.length; i += DELETE_CHUNK) {
    const chunk = unique.slice(i, i + DELETE_CHUNK)
    const res = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: false,
        },
      }),
    )
    for (const d of res.Deleted || []) {
      if (d.Key) deleted.push(d.Key)
    }
    for (const err of res.Errors || []) {
      failed.push({ key: err.Key || '', message: err.Message || 'Unknown error' })
    }
  }
  return { deleted, failed }
}
