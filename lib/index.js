// Host half of dsh-take-sheet.
//
// One prefix route carries the whole app: the scan request, the three files the
// panel asks for (thumbnail, contact sheet, download), and the two mutations
// (selection, export). Media work lives in media.js, job persistence in
// store.js, and the contract the panel relies on in shots.js.
//
// The route is the product here; there is no fallback half. If the web server
// refuses the prefix the panel has nowhere to talk to, so that failure is
// reported and contained instead of aborting the whole plugin graph.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { createMedia, dshHome, resolveFont } from './media.js'
import { clampInt, formatTimecode, LIMITS, newJobId, sanitizeJobId } from './shots.js'
import { createStore } from './store.js'

export const name = 'dsh-take-sheet'
export const inject = ['webServer']

const MAX_BODY = 4 * 1024 * 1024

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function sendJson(res, status, body) {
  if (res.destroyed === true || res.writableEnded === true) return
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(text)
}

const CONTENT_TYPES = {
  jpg: 'image/jpeg',
  png: 'image/png',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
}

function sendFile(res, path, options) {
  const settings = options || {}
  const data = readFileSync(path)
  const ext = String(path).slice(String(path).lastIndexOf('.') + 1).toLowerCase()
  res.statusCode = 200
  res.setHeader('content-type', CONTENT_TYPES[ext] || 'application/octet-stream')
  res.setHeader('content-length', String(data.length))
  res.setHeader('cache-control', 'no-store')
  if (settings.download === true) {
    res.setHeader('content-disposition', 'attachment; filename="' + settings.name + '"')
  }
  res.end(data)
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    let closed = false
    const finish = (value) => {
      if (closed) return
      closed = true
      resolve(value)
    }
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > MAX_BODY) {
        finish({})
        req.destroy()
      }
    })
    req.on('end', () => {
      if (raw.length === 0) return finish({})
      try {
        const parsed = JSON.parse(raw)
        finish(parsed && typeof parsed === 'object' ? parsed : {})
      } catch (error) {
        finish({})
      }
    })
    req.on('error', () => finish({}))
  })
}

function methodFromUrl(url) {
  const path = String(url || '').split('?')[0]
  const rest = path.replace(/^\/dsh-take-sheet\/?/, '')
  return rest.split('/')[0] || 'state'
}

function queryFromUrl(url) {
  try {
    return new URL(url, 'http://127.0.0.1').searchParams
  } catch (error) {
    return new URLSearchParams()
  }
}

export function createApp(options) {
  const settings = options || {}
  const home = typeof settings.home === 'string' && settings.home.length > 0
    ? settings.home
    : (settings.settings && typeof settings.settings.dshHome === 'string' ? settings.settings.dshHome : dshHome())
  const config = settings.settings && typeof settings.settings === 'object' ? settings.settings : {}
  const store = settings.store || createStore({ home })
  const media = settings.media || createMedia({
    ffmpegPath: config.ffmpegPath,
    ffprobePath: config.ffprobePath,
    timeoutMs: config.timeoutMs,
    env: process.env,
  })

  const defaults = {
    threshold: clampInt(config.threshold, LIMITS.threshold, 1, 60),
    maxShots: clampInt(config.maxShots, LIMITS.maxShots, 1, 200),
    minShotMs: clampInt(config.minShotMs, LIMITS.minShotMs, 0, 10000),
    frameWidth: clampInt(config.frameWidth, LIMITS.frameWidth, 160, LIMITS.maxFrameWidth),
  }

  let busy = ''
  let chain = Promise.resolve()

  function enqueue(kind, task) {
    const run = chain.then(async () => {
      busy = kind
      try {
        return await task()
      } finally {
        busy = ''
      }
    })
    chain = run.then(() => undefined, () => undefined)
    return run
  }

  function nextJobId() {
    let id = newJobId(new Date())
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!store.listJobs().some((entry) => entry.id === id)) return id
      id = newJobId(new Date(), Math.random().toString(36).slice(2, 8) + attempt)
    }
    return id
  }

  async function state(params) {
    const health = await media.detect()
    const requested = params ? sanitizeJobId(params.get('job')) : ''
    let job
    if (requested !== '') job = store.readJob(requested)
    else job = store.latestJob()
    return {
      version: 1,
      health: {
        ok: health.ok,
        error: health.error,
        ffmpeg: health.ffmpeg,
        ffprobe: health.ffprobe,
        font: resolveFont(config.fontPath) || '',
      },
      config: {
        ...defaults,
        outputDir: store.base,
        busy,
      },
      job: job || null,
      jobs: store.listJobs(),
    }
  }

  async function scan(payload) {
    const body = payload || {}
    const input = String(body.path || body.input || '').trim()
    if (input === '') throw httpError(400, '请填写本地视频路径')
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) throw httpError(400, '只支持本地文件路径，不支持 URL')
    if (!isAbsolute(input)) throw httpError(400, '请填写绝对路径，例如 D:\\refs\\clip.mp4')
    if (!existsSync(input)) throw httpError(400, '找不到文件：' + input)
    let info
    try {
      info = statSync(input)
    } catch (error) {
      throw httpError(400, '读不到文件：' + input)
    }
    if (!info.isFile()) throw httpError(400, '这不是一个文件：' + input)

    const health = await media.detect()
    if (!health.ok) throw httpError(503, health.error)

    const params = {
      threshold: clampInt(body.threshold, defaults.threshold, 1, 60),
      maxShots: clampInt(body.maxShots, defaults.maxShots, 1, 200),
      minShotMs: clampInt(body.minShotMs, defaults.minShotMs, 0, 10000),
      frameWidth: defaults.frameWidth,
    }
    const id = nextJobId()
    const dir = store.ensureDir(id)

    return enqueue('scan', async () => {
      const result = await media.scan(input, { jobDir: dir, ...params })
      const selectedCount = result.shots.filter((shot) => shot.selected !== false).length
      const job = {
        id,
        input,
        createdAt: Date.now(),
        probe: result.probe,
        params: {
          threshold: result.threshold,
          maxShots: params.maxShots,
          minShotMs: result.minShotMs,
          frameWidth: result.frameWidth,
        },
        shots: result.shots,
        droppedByGap: result.droppedByGap,
        droppedByLimit: result.droppedByLimit,
        rawCuts: result.rawCuts,
        truncated: result.truncated,
        selectedCount,
      }
      return store.saveJob(job)
    })
  }

  function select(payload) {
    const body = payload || {}
    const jobId = sanitizeJobId(body.jobId)
    if (jobId === '') throw httpError(400, 'jobId 无效')
    if (!Array.isArray(body.selected)) throw httpError(400, 'selected 必须是数组')
    if (body.selected.length > 500) throw httpError(400, 'selected 过多')
    return store.setSelection(jobId, body.selected)
  }

  async function exportJob(payload) {
    const body = payload || {}
    const jobId = sanitizeJobId(body.jobId)
    if (jobId === '') throw httpError(400, 'jobId 无效')
    const job = store.readJob(jobId)
    const selected = job.shots.filter((shot) => shot.selected === true)
    if (selected.length === 0) throw httpError(400, '至少勾选一帧再导出')
    const health = await media.detect()
    if (!health.ok) throw httpError(503, health.error)

    return enqueue('export', async () => {
      const dir = store.prepareExport(job.id)
      let sheet
      try {
        sheet = await media.contactSheet({
          jobDir: store.dirFor(job.id),
          outputDir: dir,
          shots: selected,
          probe: job.probe,
          fontPath: config.fontPath,
          cellWidth: config.cellWidth,
        })
      } catch (error) {
        store.prepareExport(job.id)
        throw error
      }
      const exported = store.finalizeExport(job, selected, sheet)
      job.export = exported
      job.exportedAt = exported.at
      store.saveJob(job)
      return { export: exported, job }
    })
  }

  async function recheck() {
    // Drop the cached failure and probe again: the user may have just installed
    // ffmpeg and should not have to restart the harness.
    if (typeof media.resetDetection === 'function') media.resetDetection()
    const health = await media.detect()
    return {
      ok: health.ok,
      error: health.error,
      ffmpeg: health.ffmpeg,
      ffprobe: health.ffprobe,
      font: resolveFont(config.fontPath) || '',
    }
  }

  async function route(req, res) {
    const method = methodFromUrl(req.url)
    const params = queryFromUrl(req.url)

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (method === 'state' || method === '') {
        sendJson(res, 200, await state(params))
        return
      }
      if (method === 'thumb') {
        const id = sanitizeJobId(params.get('job'))
        const file = params.get('file') || ''
        if (id === '') throw httpError(400, 'job 无效')
        const job = store.readJob(id)
        if (!job.shots.some((shot) => shot.thumb === file)) throw httpError(404, '没有这张缩略图')
        const path = store.assetPath(id, file)
        if (!existsSync(path)) throw httpError(404, '缩略图文件不存在')
        sendFile(res, path)
        return
      }
      if (method === 'sheet') {
        const id = sanitizeJobId(params.get('job'))
        if (id === '') throw httpError(400, 'job 无效')
        const job = store.readJob(id)
        const path = store.exportPath(id, 'contact-sheet.jpg')
        if (job.export === undefined || !existsSync(path)) throw httpError(404, '还没有导出联系表')
        sendFile(res, path)
        return
      }
      if (method === 'download') {
        const id = sanitizeJobId(params.get('job'))
        const file = params.get('file') || ''
        if (id === '') throw httpError(400, 'job 无效')
        const job = store.readJob(id)
        if (job.export === undefined) throw httpError(404, '还没有导出')
        if (file !== 'frames.csv' && file !== 'shots.json' && file !== 'contact-sheet.jpg') {
          throw httpError(404, '文件不可下载')
        }
        const path = store.exportPath(id, file)
        if (!existsSync(path)) throw httpError(404, '文件不存在')
        sendFile(res, path, { download: true, name: file })
        return
      }
      throw httpError(404, '未知的读取接口')
    }

    if (req.method !== 'POST') throw httpError(405, '只支持 GET / POST')
    const body = await readBody(req)
    if (method === 'scan') return sendJson(res, 200, { job: await scan(body) })
    if (method === 'select') return sendJson(res, 200, { job: select(body) })
    if (method === 'export') return sendJson(res, 200, await exportJob(body))
    if (method === 'recheck') return sendJson(res, 200, { health: await recheck() })
    throw httpError(404, '未知的写入接口')
  }

  async function handle(req, res) {
    try {
      await route(req, res)
    } catch (error) {
      const status = Number(error && error.status) || 500
      const message = String((error && error.message) || error)
      try {
        sendJson(res, status, { error: message })
      } catch (inner) {
        // A closed socket is not an application error.
      }
    }
  }

  return {
    store,
    media,
    defaults,
    state,
    scan,
    select,
    exportJob,
    recheck,
    handle,
    describe() {
      return {
        name,
        version: 1,
        defaults,
        outputDir: store.base,
      }
    },
  }
}

export function apply(ctx, config) {
  const settings = config && typeof config === 'object' ? config : {}
  const app = createApp({ settings })
  ctx.effect(function () {
    let disposeRoute
    try {
      disposeRoute = ctx.webServer.register({
        kind: 'prefix',
        path: '/dsh-take-sheet',
        handler: app.handle,
      })
    } catch (error) {
      disposeRoute = undefined
      console.error('[dsh-take-sheet] 路由注册失败，面板无法读取扫描结果：', error)
    }
    return function () {
      if (typeof disposeRoute === 'function') disposeRoute()
    }
  })
}

// Exported for tests and for anything that wants the same timecode the panel
// shows without importing the client bundle.
export { formatTimecode }
