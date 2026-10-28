// Pure shot-list math for dsh-take-sheet.
//
// Everything here is deterministic and side-effect free: timecode formatting,
// ffmpeg output parsing, shot planning, contact-sheet geometry, filter-string
// escaping, and the exported CSV. media.js owns the process calls, store.js
// owns the files, host.js owns the routes; this file is what the tests pin.
//
// The single most important decision encoded here: a "shot" is a half-open
// time range whose representative frame is the first frame of that range. The
// timecode written into the manifest is the frame's own position in the source,
// not the shot's start rounded to a friendly number, because the whole point is
// remembering which second a frame came from.

export const LIMITS = Object.freeze({
  threshold: 8,
  maxShots: 60,
  minShotMs: 350,
  frameWidth: 960,
  maxFrameWidth: 1920,
})

const MS = 1000

function clampNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function clampInt(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max))
}

export function pad(value, width) {
  return String(value).padStart(width, '0')
}

export function roundMs(seconds) {
  return Math.round(Number(seconds) * MS) / MS
}

// "00:00:03.200" — the timecode used in the CSV, JSON and contact sheet.
export function formatTimecode(seconds) {
  const total = Math.max(0, Number(seconds) || 0)
  const whole = Math.floor(total)
  const ms = Math.round((total - whole) * MS)
  const carry = ms === MS ? 1 : 0
  const h = Math.floor((whole + carry) / 3600)
  const m = Math.floor(((whole + carry) % 3600) / 60)
  const s = (whole + carry) % 60
  const millis = carry === 1 ? 0 : ms
  return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2) + '.' + pad(millis, 3)
}

// "0:03.200" — compact enough for a thumbnail badge.
export function formatShortTimecode(seconds) {
  const full = formatTimecode(seconds)
  const [h, m, rest] = full.split(':')
  if (h !== '00') return String(Number(h)) + ':' + m + ':' + rest
  return String(Number(m)) + ':' + rest
}

// "00-00-03.200" — colons are illegal in Windows file names.
export function timecodeFilename(seconds) {
  return formatTimecode(seconds).replace(/:/g, '-')
}

export function frameFileName(index, seconds) {
  return pad(index, 2) + '_' + timecodeFilename(seconds) + '.jpg'
}

// ffmpeg prints one showinfo line per frame it actually emits. With scdet's
// sc_pass=1 only scene-change frames reach the encoder, so these are exactly
// the cut timestamps. Config lines and progress lines are ignored.
export function parsePtsTimes(stderr) {
  const found = []
  const re = /pts_time:([0-9]+(?:\.[0-9]+)?)/g
  for (const line of String(stderr || '').split(/\r?\n/)) {
    if (!line.includes('showinfo')) continue
    let match
    while ((match = re.exec(line)) !== null) {
      const value = Number(match[1])
      if (Number.isFinite(value) && value >= 0) found.push(value)
    }
  }
  found.sort((a, b) => a - b)
  // A single frame cannot produce two distinct cut times; duplicate timestamps
  // only appear when a line is repeated, so collapse them at millisecond grain.
  const unique = []
  for (const value of found) {
    const rounded = roundMs(value)
    if (unique.length === 0 || rounded - unique[unique.length - 1] > 0.0005) unique.push(rounded)
  }
  return unique
}

export function parseRate(text) {
  const raw = String(text || '')
  const slash = raw.indexOf('/')
  if (slash > 0) {
    const num = Number(raw.slice(0, slash))
    const den = Number(raw.slice(slash + 1))
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) return Math.round((num / den) * 1000) / 1000
    return 0
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

export function parseProbeJson(json) {
  const streams = Array.isArray(json && json.streams) ? json.streams : []
  const video = streams.find((stream) => stream && stream.codec_type === 'video')
  if (video === undefined) throw new Error('这个文件里没有视频流')

  let width = Number(video.width) || 0
  let height = Number(video.height) || 0
  // A phone clip is often encoded 1920x1080 plus a 90° rotation matrix.
  // ffmpeg displays it upright, so the manifest must report the upright size.
  const side = Array.isArray(video.side_data_list)
    ? video.side_data_list.find((entry) => entry && entry.rotation !== undefined)
    : undefined
  const tagRotate = video.tags && video.tags.rotate !== undefined ? Number(video.tags.rotate) : 0
  const rotation = side !== undefined ? Number(side.rotation) : tagRotate
  if (Number.isFinite(rotation) && Math.abs(rotation) % 180 === 90) {
    const swap = width
    width = height
    height = swap
  }

  const format = json && json.format ? json.format : {}
  const duration = Number(format.duration) || Number(video.duration) || 0
  return {
    duration: roundMs(duration),
    width,
    height,
    fps: parseRate(video.r_frame_rate || video.avg_frame_rate),
    codec: String(video.codec_name || ''),
    sizeBytes: Number(format.size) || 0,
  }
}

// Turn raw ffmpeg cut timestamps into the shot list the UI exposes.
//
// rawCutIndex keeps the link back to cut-0001.jpg so media.js can rename the
// exact frame that was previewed instead of re-seeking the video at export
// time. A cut can be dropped twice: too close to its neighbour (a flash or a
// dissolve tripping the detector twice) or beyond maxShots (an evenly spaced
// sample keeps the shape of the whole clip).
export function planShots(rawCutTimes, options) {
  const settings = options || {}
  const duration = Number(settings.duration)
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('视频时长无效，无法切分镜头')
  const minGap = clampNumber(settings.minShotMs, LIMITS.minShotMs, 0, 10000) / MS
  const maxShots = clampInt(settings.maxShots, LIMITS.maxShots, 1, 200)

  const margin = Math.min(minGap / 2, 0.05)
  const entries = []
  for (let raw = 0; raw < rawCutTimes.length; raw += 1) {
    const time = Number(rawCutTimes[raw])
    if (!Number.isFinite(time)) continue
    if (time <= margin || time >= duration - margin) continue
    entries.push({ time: roundMs(time), raw })
  }
  entries.sort((a, b) => a.time - b.time || a.raw - b.raw)

  let droppedByGap = 0
  const spaced = []
  for (const entry of entries) {
    if (spaced.length === 0 || entry.time - spaced[spaced.length - 1].time >= minGap) {
      spaced.push(entry)
    } else {
      droppedByGap += 1
    }
  }

  let chosen = spaced
  let droppedByLimit = 0
  const maxCuts = maxShots - 1
  if (spaced.length > maxCuts) {
    const target = Math.max(0, maxCuts)
    const step = spaced.length / Math.max(1, target)
    const picked = []
    for (let i = 0; i < target; i += 1) {
      const pick = spaced[Math.min(spaced.length - 1, Math.round(i * step))]
      if (picked.length === 0 || picked[picked.length - 1].raw !== pick.raw) picked.push(pick)
    }
    chosen = picked
    droppedByLimit = spaced.length - picked.length
  }

  const shots = []
  let start = 0
  for (let i = 0; i < chosen.length; i += 1) {
    const end = chosen[i].time
    if (end - start <= 0.0005) {
      start = end
      continue
    }
    const index = shots.length + 1
    shots.push({
      id: 's' + pad(index, 2),
      index,
      start: roundMs(start),
      end: roundMs(end),
      duration: roundMs(end - start),
      // The first shot has no cut frame, so its thumbnail is sampled a little
      // way in. Every other shot's thumbnail *is* the cut frame.
      frame: roundMs(i === 0 ? Math.min(0.2, (end - start) / 2) : start),
      rawCutIndex: i === 0 ? null : chosen[i - 1].raw,
      thumb: 'shot-' + pad(index, 3) + '.jpg',
      selected: true,
    })
    start = end
  }
  if (start < duration - 0.0005) {
    const index = shots.length + 1
    const length = duration - start
    shots.push({
      id: 's' + pad(index, 2),
      index,
      start: roundMs(start),
      end: roundMs(duration),
      duration: roundMs(length),
      // With no cuts at all this is the only shot, so it must still sample a
      // little way in rather than report the frame at exactly 0.
      frame: roundMs(shots.length === 0 ? Math.min(0.2, length / 2) : start),
      rawCutIndex: chosen.length === 0 ? null : chosen[chosen.length - 1].raw,
      thumb: 'shot-' + pad(index, 3) + '.jpg',
      selected: true,
    })
  }

  return {
    shots,
    droppedByGap,
    droppedByLimit,
    rawCuts: entries.length,
  }
}

// Pick a near-3:2 grid with as few empty cells as possible. A contact sheet
// with one black hole is fine; one with five is a layout bug. Long strips are
// penalised on both axes so five frames do not become a 1x5 column or a 5x1
// banner.
export function gridFor(count) {
  const n = Math.max(1, Math.floor(Number(count) || 1))
  let best
  for (let cols = 1; cols <= Math.min(6, n); cols += 1) {
    const rows = Math.ceil(n / cols)
    if (rows > 6) continue
    const empty = cols * rows - n
    const aspect = cols / rows
    let strip = 0
    if (aspect < 1) strip = (1 / aspect - 1) * 6
    else if (aspect > 2.2) strip = (aspect - 2.2) * 6
    const score = empty * 6 + strip + Math.abs(aspect - 1.5) * 0.5
    if (best === undefined || score < best.score) best = { cols, rows, score }
  }
  return { cols: best.cols, rows: best.rows }
}

// A thumbnail cell keeps the source aspect ratio, so scale() alone fills it:
// ffmpeg 9 rejects pad() when the padded size equals the input size.
export function cellSize(width, height, targetWidth) {
  const sourceW = Math.max(1, Number(width) || 16)
  const sourceH = Math.max(1, Number(height) || 9)
  const aspect = sourceW / sourceH
  let cellW = Math.round(Number(targetWidth) || 360)
  let cellH = Math.round(cellW / aspect)
  if (cellH > 420) {
    cellH = 420
    cellW = Math.round(cellH * aspect)
  }
  cellW = Math.max(2, cellW - (cellW % 2))
  cellH = Math.max(2, cellH - (cellH % 2))
  return { width: cellW, height: cellH }
}

// drawtext's option parser splits on ':' and the filtergraph parser splits on
// ','; both must be escaped once inside a single-quoted value.
export function escapeFilterValue(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/[:'[\],;]/g, (char) => '\\' + char)
}

export function escapeFilterPath(path) {
  return escapeFilterValue(String(path).replace(/\\/g, '/'))
}

export function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value)
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

// The export list is the deliverable: one row per selected frame, with the
// timecode column first because that is what a human copies into a brief.
export function csvText(job, shots) {
  const rows = [['shot', 'timecode', 'seconds', 'start', 'end', 'duration', 'file', 'source']]
  for (const shot of shots) {
    rows.push([
      shot.index,
      formatTimecode(shot.frame),
      Number(shot.frame).toFixed(3),
      Number(shot.start).toFixed(3),
      Number(shot.end).toFixed(3),
      Number(shot.duration).toFixed(3),
      shot.file || '',
      job.input,
    ])
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function sanitizeJobId(id) {
  const text = String(id || '')
  return /^[a-z0-9][a-z0-9-]{5,40}$/.test(text) ? text : ''
}

export function newJobId(now, random) {
  const date = now instanceof Date ? now : new Date()
  const stamp = date.toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const tail = (typeof random === 'string' ? random : Math.random().toString(36).slice(2, 6)).toLowerCase()
  return stamp + '-' + tail.replace(/[^a-z0-9]/g, '').slice(0, 4).padEnd(4, '0')
}

export function healthError(text) {
  return String(text || '').split(/\r?\n/).filter(Boolean).slice(-4).join(' | ')
}
