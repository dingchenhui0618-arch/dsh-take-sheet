// Job storage and export writing for dsh-take-sheet.
//
// A job is one scanned video: scan.json in its own directory, plus the
// thumbnails beside it. Exports are normal files a human can open, copy into a
// brief, or commit next to a shot — not a daemon-only cache.

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { csvText, frameFileName, formatTimecode, sanitizeJobId } from './shots.js'

const INDEX_LIMIT = 30

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function writeAtomic(path, text) {
  const temp = path + '.tmp'
  writeFileSync(temp, text, 'utf8')
  renameSync(temp, path)
}

export function createStore(options) {
  const settings = options || {}
  const home = settings.home
  if (typeof home !== 'string' || home.length === 0) throw new Error('store 需要 home')
  const base = join(home, 'take-sheet')
  const jobsRoot = join(base, 'jobs')
  const indexPath = join(base, 'index.json')
  mkdirSync(jobsRoot, { recursive: true })

  function dirFor(id) {
    const safe = sanitizeJobId(id)
    if (safe === '') throw httpError(400, 'job id 无效')
    return join(jobsRoot, safe)
  }

  function ensureDir(id) {
    const dir = dirFor(id)
    mkdirSync(dir, { recursive: true })
    return dir
  }

  function readIndex() {
    try {
      const parsed = JSON.parse(readFileSync(indexPath, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter((entry) => entry && sanitizeJobId(entry.id) !== '') : []
    } catch (error) {
      return []
    }
  }

  function summary(job) {
    return {
      id: job.id,
      input: job.input,
      createdAt: job.createdAt,
      duration: job.probe ? job.probe.duration : 0,
      shotCount: Array.isArray(job.shots) ? job.shots.length : 0,
      selectedCount: Number(job.selectedCount) || 0,
      hasExport: job.export !== undefined,
    }
  }

  function saveJob(job) {
    const id = sanitizeJobId(job && job.id)
    if (id === '') throw httpError(400, 'job id 无效')
    const dir = ensureDir(id)
    const clean = { ...job, id }
    writeAtomic(join(dir, 'scan.json'), JSON.stringify(clean, null, 2))
    const rest = readIndex().filter((entry) => entry.id !== id)
    const next = [summary(clean), ...rest].slice(0, INDEX_LIMIT)
    writeAtomic(indexPath, JSON.stringify(next, null, 2))
    return clean
  }

  function readJob(id) {
    const dir = dirFor(id)
    let raw
    try {
      raw = readFileSync(join(dir, 'scan.json'), 'utf8')
    } catch (error) {
      throw httpError(404, '找不到这个扫描任务')
    }
    let job
    try {
      job = JSON.parse(raw)
    } catch (error) {
      throw httpError(500, '扫描记录损坏')
    }
    if (!job || job.id !== sanitizeJobId(id)) throw httpError(500, '扫描记录损坏')
    return job
  }

  function listJobs() {
    return readIndex()
  }

  function latestJob() {
    const list = readIndex()
    if (list.length === 0) return undefined
    try {
      return readJob(list[0].id)
    } catch (error) {
      return undefined
    }
  }

  function setSelection(id, selectedIds) {
    const job = readJob(id)
    const wanted = new Set((Array.isArray(selectedIds) ? selectedIds : []).map(String))
    let count = 0
    for (const shot of job.shots) {
      shot.selected = wanted.has(shot.id)
      if (shot.selected) count += 1
    }
    job.selectedCount = count
    job.updatedAt = Date.now()
    return saveJob(job)
  }

  function prepareExport(id) {
    const dir = join(dirFor(id), 'export')
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(join(dir, 'frames'), { recursive: true })
    return dir
  }

  // Copies the exact JPEGs that were previewed, names each file with its own
  // timecode, and writes the two machine-readable lists (CSV + JSON).
  function finalizeExport(job, selectedShots, sheet) {
    const dir = join(dirFor(job.id), 'export')
    mkdirSync(join(dir, 'frames'), { recursive: true })
    const rows = []
    let count = 0
    for (const shot of selectedShots) {
      const thumb = join(dirFor(job.id), shot.thumb)
      if (!existsSync(thumb)) throw httpError(500, '缩略图丢失：' + shot.thumb)
      const name = frameFileName(shot.index, shot.frame)
      const relative = 'frames/' + name
      copyFileSync(thumb, join(dir, relative))
      rows.push({ ...shot, file: relative })
      count += 1
    }
    const csv = csvText(job, rows)
    writeFileSync(join(dir, 'frames.csv'), '\ufeff' + csv, 'utf8')
    const manifest = {
      version: 1,
      generator: 'dsh-take-sheet',
      exportedAt: new Date().toISOString(),
      source: job.input,
      probe: job.probe,
      params: job.params,
      shotCount: job.shots.length,
      selectedCount: count,
      contactSheet: sheet === undefined ? null : {
        file: sheet.file,
        labelled: sheet.labelled,
        width: sheet.width,
        height: sheet.height,
        columns: sheet.columns,
        rows: sheet.rows,
      },
      frames: rows.map((shot) => ({
        shot: shot.index,
        timecode: formatTimecode(shot.frame),
        seconds: shot.frame,
        shotStart: shot.start,
        shotEnd: shot.end,
        shotDuration: shot.duration,
        file: shot.file,
      })),
    }
    writeFileSync(join(dir, 'shots.json'), JSON.stringify(manifest, null, 2), 'utf8')
    return {
      dir,
      count,
      csv: 'frames.csv',
      json: 'shots.json',
      sheet: sheet === undefined ? '' : sheet.file,
      labelled: sheet === undefined ? false : sheet.labelled,
      at: Date.now(),
      files: rows.map((shot) => shot.file),
    }
  }

  function assetPath(id, name) {
    const dir = dirFor(id)
    if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(name)) {
      throw httpError(404, '文件不存在')
    }
    return join(dir, name)
  }

  function exportPath(id, name) {
    const dir = dirFor(id)
    if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(name)) {
      throw httpError(404, '文件不存在')
    }
    return join(dir, 'export', name)
  }

  return {
    home,
    base,
    dirFor,
    ensureDir,
    saveJob,
    readJob,
    listJobs,
    latestJob,
    setSelection,
    prepareExport,
    finalizeExport,
    assetPath,
    exportPath,
  }
}
