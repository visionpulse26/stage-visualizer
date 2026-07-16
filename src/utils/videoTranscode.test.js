import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  detectMp4VideoCodecFromBytes,
  detectH264ProfileFromBytes,
  detectFaststartFromBytes,
  shouldTranscodeByMetadata,
  MAX_BROWSER_SAFE_VIDEO_DIM,
  VIDEO_TRANSCODE_BITRATE_THRESHOLD_BPS,
} from './videoTranscode.js'

const readSource = () => readFileSync(new URL('./videoTranscode.js', import.meta.url), 'utf8')

test('detectMp4VideoCodecFromBytes identifies h264 and h265 sample entries', () => {
  assert.equal(detectMp4VideoCodecFromBytes(new TextEncoder().encode('....avc1....')), 'h264')
  assert.equal(detectMp4VideoCodecFromBytes(new TextEncoder().encode('....avc3....')), 'h264')
  assert.equal(detectMp4VideoCodecFromBytes(new TextEncoder().encode('....hvc1....')), 'h265')
  assert.equal(detectMp4VideoCodecFromBytes(new TextEncoder().encode('....hev1....')), 'h265')
  assert.equal(detectMp4VideoCodecFromBytes(new TextEncoder().encode('....vp09....')), 'unknown')
})

test('detectH264ProfileFromBytes reads AVCProfileIndication from the avcC box', () => {
  // '....avcC' + [configurationVersion=1, profile, compat, level]
  const withProfile = (profile) => {
    const prefix = new TextEncoder().encode('....avcC')
    return Uint8Array.from([...prefix, 1, profile, 0, 51])
  }
  assert.equal(detectH264ProfileFromBytes(withProfile(100)), 100) // High
  assert.equal(detectH264ProfileFromBytes(withProfile(122)), 122) // High 4:2:2
  assert.equal(detectH264ProfileFromBytes(new TextEncoder().encode('....mdat....')), 0)
  assert.equal(detectH264ProfileFromBytes(null), 0)
})

test('shouldTranscodeByMetadata transcodes h264 that browsers cannot actually decode', () => {
  const okDims = { videoWidth: 1920, videoHeight: 1080 }
  // Decodable h264: ≤High profile, loads, within hw-decoder size cap
  assert.equal(shouldTranscodeByMetadata({ codec: 'h264', canLoadInBrowser: true, h264Profile: 100, ...okDims }), false)
  // High 10 / 4:2:2 / 4:4:4 → black frames despite avc1 tag
  assert.equal(shouldTranscodeByMetadata({ codec: 'h264', canLoadInBrowser: true, h264Profile: 110, ...okDims }), true)
  assert.equal(shouldTranscodeByMetadata({ codec: 'h264', canLoadInBrowser: true, h264Profile: 122, ...okDims }), true)
  // Oversized frame (e.g. 4520×3712) exceeds the 4096 hw-decoder cap
  assert.equal(shouldTranscodeByMetadata({
    codec: 'h264', canLoadInBrowser: true, h264Profile: 100,
    videoWidth: MAX_BROWSER_SAFE_VIDEO_DIM + 1, videoHeight: 3712,
  }), true)
  // Metadata probe failed → don't trust it, transcode
  assert.equal(shouldTranscodeByMetadata({ codec: 'h264', canLoadInBrowser: false, h264Profile: 100, ...okDims }), true)
})

test('shouldTranscodeByMetadata skips decodable h264 and only skips supported low-bitrate h265', () => {
  assert.equal(shouldTranscodeByMetadata({ codec: 'h264', canLoadInBrowser: true, videoWidth: 1920, videoHeight: 1080 }), false)
  assert.equal(shouldTranscodeByMetadata({
    codec: 'h265',
    canLoadInBrowser: true,
    bitrateBps: VIDEO_TRANSCODE_BITRATE_THRESHOLD_BPS,
  }), false)
  assert.equal(shouldTranscodeByMetadata({
    codec: 'h265',
    canLoadInBrowser: true,
    bitrateBps: VIDEO_TRANSCODE_BITRATE_THRESHOLD_BPS + 1,
  }), true)
  assert.equal(shouldTranscodeByMetadata({
    codec: 'h265',
    canLoadInBrowser: false,
    bitrateBps: 10_000_000,
  }), true)
  assert.equal(shouldTranscodeByMetadata({ codec: 'unknown' }), true)
})

test('transcode command uses a faster h264 preset while preserving audio', () => {
  const source = readSource()

  assert.match(source, /'-preset', 'veryfast'/)
  assert.match(source, /'-crf', '28'/)
  // Browser-decodable output: 8-bit 4:2:0 (10-bit/4:2:2 sources otherwise
  // yield High 10 / High 4:2:2 h264 → black frames) + even dimensions.
  assert.match(source, /'-pix_fmt', 'yuv420p'/)
  assert.match(source, /scale=trunc\(iw\/4\)\*2:trunc\(ih\/4\)\*2/)
  assert.match(source, /'-c:a', 'aac'/)
  assert.doesNotMatch(source, /'-an'/)
})

test('detectFaststartFromBytes: moov before mdat is faststart, after is not', () => {
  const enc = (s) => new TextEncoder().encode(s)
  assert.equal(detectFaststartFromBytes(enc('ftyp....moov....mdat....')), true)  // progressive
  assert.equal(detectFaststartFromBytes(enc('ftyp....mdat....moov....')), false) // moov at tail
  assert.equal(detectFaststartFromBytes(enc('ftyp....moov....')), true)          // moov, no mdat in head
  assert.equal(detectFaststartFromBytes(enc('ftyp....mdat....')), false)         // moov not in head
  assert.equal(detectFaststartFromBytes(null), false)
})

test('faststart remux copies streams without re-encoding', () => {
  const source = readSource()

  assert.match(source, /'-c', 'copy', '-movflags', '\+faststart'/)
})
