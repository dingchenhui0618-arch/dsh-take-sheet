// Host-half tests: the real HTTP-shaped route, the real store, a fake media
// layer. This pins the part users actually touch — validation, persistence,
// selection, export files, file serving and unload — without needing ffmpeg.

import { strict as assert } from 'node:assert'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply, createApp } from '../src/host.js'
import { planShots } from '../src/shots.js'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

function tempHome() {
  return mkdtempSync(join(tmpdir(), 'take-sheet-host-'))
}

function fakeMedia(overrides) {
  const settings = overrides || {}
  const calls = { scans: 0, sheets: 0, detect: 0 }
  return {
    calls,
    async detect() {
      calls.detect += 1
      if (settings.health) return settings.health
      return {
        ok: true,
        error: '',
        ffmpeg: { path: 'ffmpeg', version: '9.0.1' },
        ffprobe: { path: 'ffprobe' },
      }
    },
    async scan(input, options) {
      calls.scans += 1
      mkdirSync(options.jobDir, { recursive: true })
      const plan = planShots([2, 4], { duration: 10, maxShots: options.maxShots })
      for (const shot of plan.shots) writeFileSync(join(options.jobDir, shot.thumb), JPEG)
      return {
        probe: { duration: 10, width: 1280, height: 720, fps: 25, codec: 'h264', sizeBytes: 987654 },
        shots: plan.shots,
        droppedByGap: 0,
        droppedByLimit: 0,
        rawCuts: 2,
        truncated: false,
        threshold: options.threshold,
        minShotMs: options.minShotMs,
        frameWidth: options.frameWidth,
      }
    },
    async contactSheet(options) {
      calls.sheets += 1
      mkdirSync(options.outputDir, { recursive: true })
      writeFileSync(join(options.outputDir, 'contact-sheet.jpg'), JPEG)
      return { file: 'contact-sheet.jpg', labelled: true, width: 1120, height: 226, columns: 3, rows: 1 }
    },
    resetDetection() {},
  }
}

function setup(overrides) {
  const home = tempHome()
  const media = fakeMedia(overrides)
  const app = createApp({ home, media })
  return { home, app, media }
}

function request(app, method, url, body) {
  return new Promise((resolve, reject) => {
    const listeners = {}
    const req = {
      method,
      url,
      on(event, fn) { listeners[event] = fn; return req },
      destroy() {},
    }
    const res = {
      statusCode: 0,
      headers: {},
      destroyed: false,
      writableEnded: false,
      setHeader(name, value) { this.headers[name.toLowerCase()] = value },
      end(data) {
        this.writableEnded = true
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data === undefined ? '' : data))
        resolve({
          status: this.statusCode,
          headers: this.headers,
          body: buffer,
          json() {
            try { return JSON.parse(buffer.toString('utf8')) } catch (error) { return null }
          },
        })
      },
    }
    app.handle(req, res).catch(reject)
    setImmediate(() => {
      if (body !== undefined && typeof listeners.data === 'function') {
        listeners.data(Buffer.from(JSON.stringify(body)))
      }
      if (typeof listeners.end === 'function') listeners.end()
    })
  })
}

function scanVideo(app, home, extra) {
  const video = join(home, 'clip.mp4')
  writeFileSync(video, 'fake video bytes')
  return request(app, 'POST', '/dsh-take-sheet/scan', {
    path: video,
    threshold: 6,
    maxShots: 10,
    ...extra,
  })
}

test('state starts empty and advertises a working media stack', async () => {
  const h = setup()
  const res = await request(h.app, 'GET', '/dsh-take-sheet/state')
  assert.equal(res.status, 200)
  const body = res.json()
  assert.equal(body.health.ok, true)
  assert.equal(body.health.ffmpeg.version, '9.0.1')
  assert.equal(body.job, null)
  assert.deepEqual(body.jobs, [])
  assert.equal(body.config.threshold, 8)
  assert.ok(body.config.outputDir.endsWith('take-sheet'))
})

test('scan rejects missing, relative, URL and nonexistent inputs', async () => {
  const h = setup()
  for (const payload of [
    {},
    { path: '' },
    { path: 'clip.mp4' },
    { path: 'https://example.com/a.mp4' },
    { path: join(h.home, 'missing.mp4') },
  ]) {
    const res = await request(h.app, 'POST', '/dsh-take-sheet/scan', payload)
    assert.equal(res.status, 400, JSON.stringify(payload))
    assert.ok(res.json().error.length > 0)
  }
  assert.equal(h.media.calls.scans, 0, 'validation happens before ffmpeg')
})

test('scan persists the job, its thumbnails and the index', async () => {
  const h = setup()
  const res = await scanVideo(h.app, h.home)
  assert.equal(res.status, 200)
  const job = res.json().job
  assert.equal(job.shots.length, 3)
  assert.equal(job.selectedCount, 3)
  assert.equal(job.params.threshold, 6)
  assert.equal(job.probe.duration, 10)
  assert.match(job.id, /^[a-z0-9-]{6,}$/)

  const dir = join(h.home, 'take-sheet', 'jobs', job.id)
  for (const shot of job.shots) assert.ok(existsSync(join(dir, shot.thumb)))
  const saved = JSON.parse(readFileSync(join(dir, 'scan.json'), 'utf8'))
  assert.equal(saved.input, join(h.home, 'clip.mp4'))

  const state = (await request(h.app, 'GET', '/dsh-take-sheet/state')).json()
  assert.equal(state.job.id, job.id)
  assert.equal(state.jobs.length, 1)
  assert.equal(state.jobs[0].shotCount, 3)
})

test('selection is validated, persisted and reflected in export', async () => {
  const h = setup()
  const job = (await scanVideo(h.app, h.home)).json().job

  let res = await request(h.app, 'POST', '/dsh-take-sheet/select', { jobId: job.id, selected: ['s01', 's03'] })
  assert.equal(res.status, 200)
  assert.equal(res.json().job.selectedCount, 2)

  const saved = JSON.parse(readFileSync(join(h.home, 'take-sheet', 'jobs', job.id, 'scan.json'), 'utf8'))
  assert.deepEqual(saved.shots.map((shot) => shot.selected), [true, false, true])

  res = await request(h.app, 'POST', '/dsh-take-sheet/select', { jobId: job.id, selected: [] })
  assert.equal(res.json().job.selectedCount, 0)
  res = await request(h.app, 'POST', '/dsh-take-sheet/export', { jobId: job.id })
  assert.equal(res.status, 400)
  assert.match(res.json().error, /至少勾选/)
  assert.equal(h.media.calls.sheets, 0)
})

test('export writes the CSV, the JSON manifest, the frames and the sheet', async () => {
  const h = setup()
  const job = (await scanVideo(h.app, h.home)).json().job
  await request(h.app, 'POST', '/dsh-take-sheet/select', { jobId: job.id, selected: ['s02'] })

  const res = await request(h.app, 'POST', '/dsh-take-sheet/export', { jobId: job.id })
  assert.equal(res.status, 200)
  const exported = res.json().export
  assert.equal(exported.count, 1)
  assert.equal(exported.labelled, true)
  assert.deepEqual(exported.files, ['frames/02_00-00-02.000.jpg'])

  const dir = join(h.home, 'take-sheet', 'jobs', job.id, 'export')
  assert.ok(existsSync(join(dir, 'frames', '02_00-00-02.000.jpg')))
  assert.ok(existsSync(join(dir, 'contact-sheet.jpg')))
  const csv = readFileSync(join(dir, 'frames.csv'), 'utf8')
  assert.ok(csv.startsWith('\ufeffshot,timecode'))
  assert.match(csv, /2,00:00:02\.000,2\.000,2\.000,4\.000,2\.000,frames\/02_00-00-02\.000\.jpg/)
  const manifest = JSON.parse(readFileSync(join(dir, 'shots.json'), 'utf8'))
  assert.equal(manifest.selectedCount, 1)
  assert.equal(manifest.frames[0].timecode, '00:00:02.000')
  assert.equal(manifest.contactSheet.file, 'contact-sheet.jpg')

  const sheet = await request(h.app, 'GET', '/dsh-take-sheet/sheet?job=' + job.id)
  assert.equal(sheet.status, 200)
  assert.equal(sheet.headers['content-type'], 'image/jpeg')
  const download = await request(h.app, 'GET', '/dsh-take-sheet/download?job=' + job.id + '&file=frames.csv')
  assert.equal(download.status, 200)
  assert.match(download.headers['content-disposition'], /attachment; filename="frames.csv"/)
})

test('thumbnails are whitelisted by the job, not by path arithmetic', async () => {
  const h = setup()
  const job = (await scanVideo(h.app, h.home)).json().job
  const ok = await request(h.app, 'GET', '/dsh-take-sheet/thumb?job=' + job.id + '&file=shot-001.jpg')
  assert.equal(ok.status, 200)
  assert.equal(ok.headers['content-type'], 'image/jpeg')

  for (const file of ['../scan.json', 'scan.json', 'shot-999.jpg', '']) {
    const bad = await request(h.app, 'GET', '/dsh-take-sheet/thumb?job=' + job.id + '&file=' + encodeURIComponent(file))
    assert.equal(bad.status, 404, file)
  }
  const noJob = await request(h.app, 'GET', '/dsh-take-sheet/thumb?job=nothing-here&file=shot-001.jpg')
  assert.equal(noJob.status, 404)
})

test('unknown routes and verbs are reported instead of hanging', async () => {
  const h = setup()
  assert.equal((await request(h.app, 'GET', '/dsh-take-sheet/nope')).status, 404)
  assert.equal((await request(h.app, 'PUT', '/dsh-take-sheet/state')).status, 405)
  assert.equal((await request(h.app, 'POST', '/dsh-take-sheet/nope', {})).status, 404)
})

test('a missing ffmpeg is a health warning and a 503, not a crash', async () => {
  const health = {
    ok: false,
    error: '没有找到 ffmpeg。',
    ffmpeg: null,
    ffprobe: null,
  }
  const h = setup({ health })
  const state = (await request(h.app, 'GET', '/dsh-take-sheet/state')).json()
  assert.equal(state.health.ok, false)
  assert.match(state.health.error, /ffmpeg/)

  const video = join(h.home, 'clip.mp4')
  writeFileSync(video, 'x')
  const res = await request(h.app, 'POST', '/dsh-take-sheet/scan', { path: video })
  assert.equal(res.status, 503)
  assert.match(res.json().error, /ffmpeg/)
})

test('apply registers the prefix route and unload removes it', () => {
  const routes = []
  const disposers = []
  const ctx = {
    webServer: {
      register(route) {
        routes.push(route)
        return function () {
          const index = routes.indexOf(route)
          if (index >= 0) routes.splice(index, 1)
        }
      },
    },
    effect(fn) {
      const dispose = fn()
      disposers.push(typeof dispose === 'function' ? dispose : function () {})
    },
  }
  apply(ctx, { dshHome: tempHome() })
  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'prefix')
  assert.equal(routes[0].path, '/dsh-take-sheet')
  assert.equal(typeof routes[0].handler, 'function')
  disposers.splice(0).forEach((dispose) => dispose())
  assert.equal(routes.length, 0)
})

test('a webServer that refuses to register does not throw out of apply', () => {
  const ctx = {
    webServer: { register() { throw new Error('no web server') } },
    effect(fn) { fn() },
  }
  assert.doesNotThrow(() => apply(ctx, { dshHome: tempHome() }))
})
