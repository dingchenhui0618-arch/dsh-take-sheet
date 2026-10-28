// Host-side media work for dsh-take-sheet.
//
// One decode pass does both jobs: scdet finds the cuts, and because sc_pass=1
// makes the filter emit only those frames, the same pass writes the thumbnails
// we show in the grid. Export then reuses those exact JPEGs, so the frame the
// user checked is the frame that lands in the manifest — no second seek, no
// off-by-one keyframe, no question about whether the preview was honest.
//
// Nothing here shells out: every ffmpeg call is an argv array. The only writes
// are inside the job directory the caller hands over.

import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  LIMITS,
  clampInt,
  cellSize,
  escapeFilterPath,
  escapeFilterValue,
  formatTimecode,
  gridFor,
  healthError,
  pad,
  parseProbeJson,
  parsePtsTimes,
  planShots,
  roundMs,
} from './shots.js'

const MAX_OUTPUT = 32 * 1024 * 1024

export function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
  return join(homedir(), '.dsh')
}

export function runProcess(bin, args, options) {
  const settings = options || {}
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer
    let child
    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      resolve(result)
    }
    try {
      child = spawn(bin, args, { windowsHide: true, cwd: settings.cwd })
    } catch (error) {
      finish({ status: -1, stdout: '', stderr: '', error: String((error && error.message) || error) })
      return
    }
    child.on('error', (error) => {
      finish({ status: -1, stdout, stderr, error: String((error && error.message) || error) })
    })
    child.stdout.on('data', (chunk) => {
      if (stdout.length < MAX_OUTPUT) stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      if (stderr.length < MAX_OUTPUT) stderr += chunk.toString()
    })
    child.on('close', (code) => {
      finish({ status: code === null ? -1 : code, stdout, stderr, timedOut: false })
    })
    if (settings.timeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          child.kill()
        } catch (error) {
          // The close handler still settles the promise.
        }
        finish({ status: -1, stdout, stderr, timedOut: true })
      }, settings.timeoutMs)
    }
  })
}

function envPath(env) {
  if (typeof env.PATH === 'string') return env.PATH
  if (typeof env.Path === 'string') return env.Path
  return ''
}

export function binaryCandidates(kind, env, platform) {
  const environment = env || process.env
  const os = platform || process.platform
  const exe = os === 'win32' ? kind + '.exe' : kind
  const explicit = kind === 'ffmpeg'
    ? environment.DSH_FFMPEG_PATH || environment.FFMPEG_PATH
    : environment.DSH_FFPROBE_PATH || environment.FFPROBE_PATH
  const list = []
  if (explicit) list.push(explicit)
  if (os === 'win32') {
    if (environment.LOCALAPPDATA) {
      list.push(join(environment.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', exe))
    }
    list.push('C:\\ffmpeg\\bin\\' + exe)
    list.push('C:\\ProgramData\\chocolatey\\bin\\' + exe)
    for (const dir of envPath(environment).split(';')) if (dir.trim()) list.push(join(dir.trim(), exe))
  } else {
    for (const dir of envPath(environment).split(':')) if (dir.trim()) list.push(join(dir.trim(), exe))
    list.push('/opt/homebrew/bin/' + kind, '/usr/local/bin/' + kind, '/usr/bin/' + kind)
  }
  return list
}

export function findBinary(kind, options) {
  const settings = options || {}
  const env = settings.env || process.env
  const os = settings.platform || process.platform
  const exe = os === 'win32' ? kind + '.exe' : kind
  const explicit = settings.explicit
  if (typeof explicit === 'string' && explicit.length > 0) {
    return existsSync(explicit) ? explicit : ''
  }
  if (settings.sibling && typeof settings.sibling === 'string') {
    const beside = join(settings.sibling, exe)
    if (existsSync(beside)) return beside
  }
  for (const candidate of binaryCandidates(kind, env, os)) {
    if (existsSync(candidate)) return candidate
  }
  return ''
}

export function parseVersion(text) {
  const match = /ffmpeg version\s+([^\s]+)/i.exec(String(text || ''))
  if (match === null) return { raw: '', major: 0, minor: 0, supported: false }
  const numbers = /^n?(\d+)\.(\d+)/.exec(match[1])
  const major = numbers === null ? 0 : Number(numbers[1])
  const minor = numbers === null ? 0 : Number(numbers[2])
  return {
    raw: match[1],
    major,
    minor,
    supported: major > 5 || (major === 5 && minor >= 1),
  }
}

function even(value) {
  const n = Math.round(value)
  return n - (n % 2)
}

export function sceneDetectArgs(input, jobDir, options) {
  const settings = options || {}
  const threshold = clampInt(settings.threshold, LIMITS.threshold, 1, 60)
  const width = clampInt(settings.frameWidth, LIMITS.frameWidth, 160, LIMITS.maxFrameWidth)
  const cap = clampInt(settings.captureLimit, 180, 2, 400)
  return [
    '-hide_banner', '-nostdin', '-y',
    '-i', input,
    '-vf', 'scdet=threshold=' + threshold + ':sc_pass=1,showinfo,scale=' + width + ':-2',
    '-fps_mode', 'vfr',
    '-pix_fmt', 'yuvj420p',
    '-q:v', '3',
    '-frames:v', String(cap),
    join(jobDir, 'cut-%04d.jpg'),
  ]
}

export function firstFrameArgs(input, target, options) {
  const settings = options || {}
  const width = clampInt(settings.frameWidth, LIMITS.frameWidth, 160, LIMITS.maxFrameWidth)
  return [
    '-hide_banner', '-nostdin', '-y',
    '-ss', String(settings.at || 0),
    '-i', input,
    '-frames:v', '1',
    '-vf', 'scale=' + width + ':-2',
    '-pix_fmt', 'yuvj420p',
    '-q:v', '3',
    '-update', '1',
    target,
  ]
}

export function sheetFilter(options) {
  const settings = options || {}
  const cellW = even(settings.cellW || 360)
  const cellH = even(settings.cellH || 202)
  const cols = Math.max(1, Math.floor(settings.cols || 1))
  const rows = Math.max(1, Math.floor(settings.rows || 1))
  const padding = Math.max(0, Math.floor(settings.padding === undefined ? 8 : settings.padding))
  const margin = Math.max(0, Math.floor(settings.margin === undefined ? 12 : settings.margin))
  const labels = Array.isArray(settings.labels) ? settings.labels : []
  const parts = [
    'scale=' + cellW + ':' + cellH,
    'tile=' + cols + 'x' + rows + ':padding=' + padding + ':margin=' + margin + ':color=black',
  ]
  if (settings.fontPath && labels.length > 0) {
    const font = escapeFilterPath(settings.fontPath)
    const fontSize = Math.max(12, Math.round(cellW / 26))
    for (let i = 0; i < labels.length; i += 1) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = margin + col * (cellW + padding) + Math.max(6, Math.round(cellW / 40))
      const y = margin + row * (cellH + padding) + cellH - fontSize - 12
      parts.push(
        "drawtext=fontfile='" + font + "'" +
        ":text='" + escapeFilterValue(labels[i]) + "'" +
        ':x=' + x + ':y=' + y +
        ':fontsize=' + fontSize +
        ':fontcolor=white:box=1:boxcolor=black@0.58:boxborderw=5',
      )
    }
  }
  return parts.join(',')
}

export function sheetDimensions(options) {
  const settings = options || {}
  const cols = Math.max(1, Math.floor(settings.cols || 1))
  const rows = Math.max(1, Math.floor(settings.rows || 1))
  const cellW = even(settings.cellW || 360)
  const cellH = even(settings.cellH || 202)
  const padding = Math.max(0, Math.floor(settings.padding === undefined ? 8 : settings.padding))
  const margin = Math.max(0, Math.floor(settings.margin === undefined ? 12 : settings.margin))
  return {
    width: cols * cellW + (cols - 1) * padding + margin * 2,
    height: rows * cellH + (rows - 1) * padding + margin * 2,
  }
}

const FONT_CANDIDATES = [
  'C:\\Windows\\Fonts\\consola.ttf',
  'C:\\Windows\\Fonts\\segoeui.ttf',
  'C:\\Windows\\Fonts\\arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
  '/System/Library/Fonts/Supplemental/Consolas.ttf',
  '/Library/Fonts/Arial.ttf',
]

export function resolveFont(explicit) {
  if (typeof explicit === 'string' && explicit.length > 0 && existsSync(explicit)) return explicit
  for (const candidate of FONT_CANDIDATES) if (existsSync(candidate)) return candidate
  return ''
}

export function createMedia(options) {
  const settings = options || {}
  const run = settings.run || runProcess
  const timeoutMs = clampInt(settings.timeoutMs, 180000, 5000, 1800000)
  const state = {
    ffmpegPath: '',
    ffprobePath: '',
    version: '',
    detection: undefined,
    detectionOk: false,
    detectedAt: 0,
  }

  function find(optionsForFind) {
    return findBinary(optionsForFind.kind, {
      explicit: optionsForFind.explicit,
      sibling: optionsForFind.sibling,
      env: settings.env,
      platform: settings.platform,
    })
  }

  async function detect() {
    // A failed probe is retried after a short pause so installing ffmpeg while
    // the harness is open does not require a restart; a success is cached.
    if (state.detection !== undefined && (state.detectionOk || Date.now() - state.detectedAt < 15000)) {
      return state.detection
    }
    state.detectedAt = Date.now()
    state.detection = (async () => {
      const ffmpegPath = find({ kind: 'ffmpeg', explicit: settings.ffmpegPath })
      if (ffmpegPath === '') {
        return {
          ok: false,
          ffmpeg: null,
          ffprobe: null,
          error: '没有找到 ffmpeg。先安装 ffmpeg 5.1+（Windows: winget install Gyan.FFmpeg），或在插件 config 里设置 ffmpegPath。',
        }
      }
      const ffprobePath = find({
        kind: 'ffprobe',
        explicit: settings.ffprobePath,
        sibling: dirname(ffmpegPath),
      })
      if (ffprobePath === '') {
        return {
          ok: false,
          ffmpeg: { path: ffmpegPath },
          ffprobe: null,
          error: '找到 ffmpeg 但没有找到同一目录下的 ffprobe。请安装完整版 ffmpeg。',
        }
      }
      const result = await run(ffmpegPath, ['-hide_banner', '-version'], { timeoutMs: 20000 })
      if (result.error || result.status !== 0) {
        return {
          ok: false,
          ffmpeg: { path: ffmpegPath },
          ffprobe: { path: ffprobePath },
          error: 'ffmpeg 无法运行：' + (result.error || healthError(result.stderr) || '未知错误'),
        }
      }
      const version = parseVersion(result.stdout + '\n' + result.stderr)
      if (!version.supported) {
        return {
          ok: false,
          ffmpeg: { path: ffmpegPath, version: version.raw },
          ffprobe: { path: ffprobePath },
          error: '需要 ffmpeg 5.1 及以上（当前 ' + (version.raw || '未知版本') + '）：-fps_mode 与 scdet 都需要这个版本。',
        }
      }
      state.ffmpegPath = ffmpegPath
      state.ffprobePath = ffprobePath
      state.version = version.raw
      state.detectionOk = true
      return {
        ok: true,
        ffmpeg: { path: ffmpegPath, version: version.raw },
        ffprobe: { path: ffprobePath },
        error: '',
      }
    })()
    return state.detection
  }

  async function probe(input) {
    const health = await detect()
    if (!health.ok) throw new Error(health.error)
    const result = await run(state.ffprobePath, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      input,
    ], { timeoutMs: 60000 })
    if (result.error) throw new Error('无法启动 ffprobe：' + result.error)
    if (result.status !== 0) throw new Error('ffprobe 读取失败：' + (healthError(result.stderr) || '退出码 ' + result.status))
    let json
    try {
      json = JSON.parse(result.stdout)
    } catch (error) {
      throw new Error('ffprobe 的输出不是合法 JSON')
    }
    return parseProbeJson(json)
  }

  async function scan(input, optionsForScan) {
    const opts = optionsForScan || {}
    const jobDir = opts.jobDir
    if (typeof jobDir !== 'string' || jobDir.length === 0) throw new Error('缺少 jobDir')
    const health = await detect()
    if (!health.ok) throw new Error(health.error)
    mkdirSync(jobDir, { recursive: true })

    const probeInfo = await probe(input)
    if (!(probeInfo.duration > 0)) throw new Error('读不到视频时长，无法切分镜头')
    const frameWidth = clampInt(opts.frameWidth, LIMITS.frameWidth, 160, LIMITS.maxFrameWidth)
    const threshold = clampInt(opts.threshold, LIMITS.threshold, 1, 60)
    const maxShots = clampInt(opts.maxShots, LIMITS.maxShots, 1, 200)
    const minShotMs = clampInt(opts.minShotMs, LIMITS.minShotMs, 0, 10000)

    const firstAt = roundMs(Math.min(0.2, probeInfo.duration / 2))
    const firstPath = join(jobDir, 'shot-001.jpg')
    const first = await run(state.ffmpegPath, firstFrameArgs(input, firstPath, { at: firstAt, frameWidth }), { timeoutMs })
    if (first.status !== 0 || !existsSync(firstPath)) {
      throw new Error('无法从视频开头取帧：' + (healthError(first.stderr) || 'ffmpeg 退出码 ' + first.status))
    }

    const captureLimit = Math.min(400, Math.max(maxShots * 2 + 20, 60))
    const detectRun = await run(state.ffmpegPath, sceneDetectArgs(input, jobDir, {
      threshold,
      frameWidth,
      captureLimit,
    }), { timeoutMs: Math.max(timeoutMs, probeInfo.duration * 2500) })

    const cutFiles = readdirSync(jobDir).filter((name) => /^cut-\d{4}\.jpg$/.test(name)).sort()
    if (detectRun.status !== 0 && cutFiles.length === 0) {
      // A clip with no detectable cut legitimately writes zero frames; ffmpeg
      // reports that as a non-zero exit on some builds. Only a real failure
      // with diagnostics should stop the scan, so probe stderr for the known
      // "nothing was written" shape before failing.
      const text = String(detectRun.stderr || '')
      if (!/Nothing was written|No filtered frames|Output file is empty|received no packets/i.test(text)) {
        throw new Error('镜头检测失败：' + (healthError(text) || 'ffmpeg 退出码 ' + detectRun.status))
      }
    } else if (detectRun.status !== 0 && cutFiles.length > 0) {
      throw new Error('镜头检测中途失败：' + (healthError(detectRun.stderr) || 'ffmpeg 退出码 ' + detectRun.status))
    }

    const rawTimes = parsePtsTimes(detectRun.stderr)
    if (rawTimes.length > cutFiles.length) rawTimes.length = cutFiles.length
    const plan = planShots(rawTimes, { duration: probeInfo.duration, maxShots, minShotMs })

    // Give every planned shot its thumbnail. Cut j (0-based raw index) is
    // cut-0001.jpg, so the mapping survives dropped cuts without re-decoding.
    for (let i = 1; i < plan.shots.length; i += 1) {
      const shot = plan.shots[i]
      const source = join(jobDir, 'cut-' + pad(shot.rawCutIndex + 1, 4) + '.jpg')
      if (!existsSync(source)) {
        throw new Error('缺少镜头 ' + shot.index + ' 的抽帧文件，扫描结果不完整')
      }
      renameSync(source, join(jobDir, shot.thumb))
    }
    for (const name of readdirSync(jobDir)) {
      if (/^cut-\d{4}\.jpg$/.test(name)) rmSync(join(jobDir, name), { force: true })
    }

    return {
      probe: probeInfo,
      shots: plan.shots,
      droppedByGap: plan.droppedByGap,
      droppedByLimit: plan.droppedByLimit,
      rawCuts: rawTimes.length,
      capturedCuts: cutFiles.length,
      truncated: cutFiles.length >= captureLimit,
      threshold,
      minShotMs,
      frameWidth,
    }
  }

  async function contactSheet(optionsForSheet) {
    const opts = optionsForSheet || {}
    const jobDir = opts.jobDir
    const shots = Array.isArray(opts.shots) ? opts.shots : []
    const probeInfo = opts.probe || { width: 16, height: 9 }
    if (typeof jobDir !== 'string' || jobDir.length === 0) throw new Error('缺少 jobDir')
    if (shots.length === 0) throw new Error('没有选中任何帧')
    const health = await detect()
    if (!health.ok) throw new Error(health.error)

    const targetWidth = clampInt(opts.cellWidth, 360, 160, 640)
    const cell = cellSize(probeInfo.width, probeInfo.height, targetWidth)
    const grid = gridFor(shots.length)
    const fontPath = opts.fontPath === '' ? '' : (opts.fontPath || resolveFont())

    const exportDir = opts.outputDir || join(jobDir, 'export')
    mkdirSync(exportDir, { recursive: true })
    const sheetWork = join(jobDir, '.sheet')
    rmSync(sheetWork, { recursive: true, force: true })
    mkdirSync(sheetWork, { recursive: true })
    const labels = []
    for (let i = 0; i < shots.length; i += 1) {
      const source = join(jobDir, shots[i].thumb)
      if (!existsSync(source)) throw new Error('缺少缩略图：' + shots[i].thumb)
      copyFileSync(source, join(sheetWork, pad(i + 1, 4) + '.jpg'))
      labels.push('#' + pad(shots[i].index, 2) + '  ' + formatTimecode(shots[i].frame))
    }

    const base = { cellW: cell.width, cellH: cell.height, cols: grid.cols, rows: grid.rows, padding: 8, margin: 12, labels }
    const output = join(sheetWork, 'sheet-%04d.jpg')
    const target = join(exportDir, 'contact-sheet.jpg')
    const args = (filter) => [
      '-hide_banner', '-nostdin', '-y',
      '-framerate', '1',
      '-i', join(sheetWork, '%04d.jpg'),
      '-vf', filter,
      '-pix_fmt', 'yuvj420p',
      '-frames:v', '1',
      output,
    ]

    let labelled = fontPath !== ''
    let result = await run(state.ffmpegPath, args(sheetFilter({ ...base, fontPath })), { timeoutMs })
    if (result.status !== 0 && labelled) {
      // freetype may be missing from a minimal ffmpeg build; the sheet is still
      // useful without labels, so degrade instead of failing the export.
      labelled = false
      rmSync(join(sheetWork, 'sheet-0001.jpg'), { force: true })
      result = await run(state.ffmpegPath, args(sheetFilter({ ...base, fontPath: '' })), { timeoutMs })
    }
    if (result.status !== 0 || !existsSync(join(sheetWork, 'sheet-0001.jpg'))) {
      throw new Error('生成联系表失败：' + (healthError(result.stderr) || 'ffmpeg 退出码 ' + result.status))
    }
    renameSync(join(sheetWork, 'sheet-0001.jpg'), target)
    rmSync(sheetWork, { recursive: true, force: true })

    const dimensions = sheetDimensions({ ...base })
    return {
      file: 'contact-sheet.jpg',
      path: target,
      labelled,
      width: dimensions.width,
      height: dimensions.height,
      columns: grid.cols,
      rows: grid.rows,
    }
  }

  return {
    detect,
    probe,
    scan,
    contactSheet,
    resetDetection() {
      state.detection = undefined
      state.detectionOk = false
      state.detectedAt = 0
    },
    paths: state,
  }
}
