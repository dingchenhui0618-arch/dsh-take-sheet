/* dsh-take-sheet client bundle — generated from src/client.cjs */
window.__ModuleLoader__.load({
  id: "dsh-take-sheet",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
// Client half of dsh-take-sheet: the 参考帧 tab in the conversation view.
//
// Must stay CommonJS — the build wraps this in window.__ModuleLoader__.load()
// and React is supplied by the harness.

const React = require('react')
const h = React.createElement
const CSS = ".ts-root{--ts-accent:#2f81f7;--ts-line:color-mix(in srgb,currentColor 13%,transparent);--ts-line-strong:color-mix(in srgb,currentColor 26%,transparent);--ts-soft:color-mix(in srgb,currentColor 4%,transparent);--ts-mono:ui-monospace,SFMono-Regular,\"Cascadia Mono\",Consolas,monospace;display:flex;flex-direction:column;gap:16px;height:100%;overflow:auto;padding:22px 26px 40px;color:inherit;font-size:13px;line-height:1.5}.ts-head{display:flex;flex-direction:column;gap:3px}.ts-eyebrow{font-size:10px;letter-spacing:.16em;text-transform:uppercase;opacity:.42}.ts-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.ts-title{font-size:17px;font-weight:650;letter-spacing:-.01em;margin:0}.ts-sub{font-size:12px;opacity:.55;margin:0}.ts-health{margin-left:auto;font-size:11px;padding:3px 9px;border-radius:999px;border:1px solid var(--ts-line);opacity:.75;white-space:nowrap}.ts-health.ts-bad{color:color-mix(in srgb,#d97706 82%,currentColor);border-color:color-mix(in srgb,#d97706 40%,transparent);background:color-mix(in srgb,#d97706 7%,transparent);opacity:1}.ts-card{border:1px solid var(--ts-line);border-radius:12px;background:var(--ts-soft)}.ts-scan{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px}.ts-path{flex:1 1 320px;min-width:220px}.ts-input,.ts-select{height:34px;border:1px solid var(--ts-line);border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:12px;padding:0 10px;outline:none;transition:border-color .12s,box-shadow .12s}.ts-input{width:100%;font-family:var(--ts-mono);font-size:11.5px}.ts-input::placeholder{opacity:.4}.ts-input:focus,.ts-select:focus{border-color:color-mix(in srgb,var(--ts-accent) 60%,var(--ts-line));box-shadow:0 0 0 3px color-mix(in srgb,var(--ts-accent) 14%,transparent)}.ts-select{padding-right:6px;cursor:pointer}.ts-btn{height:34px;padding:0 13px;border:1px solid var(--ts-line);border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;transition:background .12s,border-color .12s,opacity .12s}.ts-btn:hover{background:color-mix(in srgb,currentColor 7%,transparent);border-color:var(--ts-line-strong)}.ts-btn:disabled{opacity:.4;cursor:default}.ts-btn:focus-visible{outline:2px solid color-mix(in srgb,var(--ts-accent) 70%,transparent);outline-offset:2px}.ts-btn-primary{background:color-mix(in srgb,var(--ts-accent) 15%,transparent);border-color:color-mix(in srgb,var(--ts-accent) 45%,transparent)}.ts-btn-primary:hover{background:color-mix(in srgb,var(--ts-accent) 24%,transparent);border-color:color-mix(in srgb,var(--ts-accent) 60%,transparent)}.ts-warn,.ts-err{border:1px solid;border-radius:10px;padding:10px 12px;font-size:12px;display:flex;gap:10px;align-items:flex-start;justify-content:space-between}.ts-warn{border-color:color-mix(in srgb,#d97706 45%,transparent);background:color-mix(in srgb,#d97706 7%,transparent)}.ts-err{border-color:color-mix(in srgb,#dc2626 45%,transparent);background:color-mix(in srgb,#dc2626 7%,transparent)}.ts-warn-text{display:flex;flex-direction:column;gap:3px}.ts-warn code{font-family:var(--ts-mono);font-size:11px;background:color-mix(in srgb,currentColor 8%,transparent);padding:1px 5px;border-radius:4px}.ts-progress{height:3px;border-radius:999px;background:var(--ts-line);overflow:hidden}.ts-progress span{display:block;height:100%;width:38%;border-radius:999px;background:var(--ts-accent);animation:ts-slide 1.1s ease-in-out infinite}@keyframes ts-slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}.ts-busy-line{display:flex;align-items:center;gap:10px;font-size:12px;opacity:.75}.ts-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.ts-chip{font-size:11px;padding:2px 8px;border:1px solid var(--ts-line);border-radius:999px;opacity:.72;white-space:nowrap}.ts-chip b{font-weight:600;opacity:1}.ts-toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.ts-toolbar .ts-btn{height:28px;padding:0 9px;font-size:11px}.ts-count{margin-left:auto;font-size:11px;opacity:.55;font-variant-numeric:tabular-nums}.ts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(172px,1fr));gap:12px}.ts-shot{position:relative;border:1px solid var(--ts-line);border-radius:10px;overflow:hidden;background:color-mix(in srgb,currentColor 2%,transparent);cursor:pointer;transition:border-color .12s,transform .12s,box-shadow .12s;max-width:420px}.ts-shot:hover{border-color:var(--ts-line-strong);transform:translateY(-1px)}.ts-shot.is-on{border-color:color-mix(in srgb,var(--ts-accent) 62%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--ts-accent) 30%,transparent)}.ts-shot.is-off .ts-thumb{opacity:.38;filter:saturate(.55)}.ts-thumb-wrap{position:relative;aspect-ratio:16/9;background:#000}.ts-thumb{width:100%;height:100%;object-fit:cover;display:block;transition:opacity .12s,filter .12s}.ts-check{position:absolute;top:7px;left:7px;width:19px;height:19px;margin:0;border-radius:5px;border:1.5px solid rgba(255,255,255,.9);background:rgba(0,0,0,.4);box-shadow:0 1px 4px rgba(0,0,0,.45);backdrop-filter:blur(3px);appearance:none;-webkit-appearance:none;cursor:pointer;display:grid;place-items:center;color:#fff;font-size:12px;line-height:1}.ts-check:checked{background:var(--ts-accent);border-color:var(--ts-accent)}.ts-check:checked::after{content:\"✓\";font-weight:700}.ts-check:focus-visible{outline:2px solid #fff;outline-offset:1px}.ts-tc{position:absolute;left:7px;bottom:7px;font-family:var(--ts-mono);font-size:11px;font-weight:500;letter-spacing:.02em;font-variant-numeric:tabular-nums;background:rgba(6,8,12,.82);color:#fff;padding:2px 7px;border-radius:5px}.ts-range{position:absolute;right:7px;bottom:7px;font-size:10px;color:rgba(255,255,255,.9);background:rgba(6,8,12,.62);padding:2px 6px;border-radius:5px;font-variant-numeric:tabular-nums}.ts-shot-foot{display:flex;justify-content:space-between;gap:6px;padding:6px 9px;font-size:10.5px;opacity:.62;border-top:1px solid var(--ts-line)}.ts-empty{border:1px dashed var(--ts-line-strong);border-radius:12px;padding:34px 20px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;opacity:.72}.ts-empty svg{opacity:.45}.ts-empty b{font-size:13px;font-weight:600}.ts-empty span{font-size:12px;max-width:460px}.ts-export{padding:12px;display:flex;flex-direction:column;gap:10px}.ts-export-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.ts-export-head b{font-size:13px;font-weight:600}.ts-export-head span{font-size:11px;opacity:.55}.ts-sheet{display:block;width:100%;max-width:100%;border-radius:8px;border:1px solid var(--ts-line);background:#000}.ts-paths{font-family:var(--ts-mono);font-size:11px;opacity:.6;word-break:break-all;line-height:1.7}.ts-links{display:flex;flex-wrap:wrap;gap:14px;font-size:12px}.ts-links a{color:color-mix(in srgb,var(--ts-accent) 85%,currentColor);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--ts-accent) 35%,transparent);padding-bottom:1px}.ts-links a:hover{border-bottom-color:color-mix(in srgb,var(--ts-accent) 75%,transparent)}.ts-foot{font-size:10.5px;opacity:.4;margin-top:2px}.ts-nowrap{white-space:nowrap}@media (max-width:640px){.ts-root{padding:16px 14px 28px}.ts-grid{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.ts-health{display:none}}"

const API = '/dsh-take-sheet'
const POLL_MS = 5000

let snap = { data: null, error: '', at: 0 }
const listeners = new Set()
let timer = null
let inFlight = false

function emit() {
  Array.from(listeners).forEach(function (fn) {
    try {
      fn(snap)
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[dsh-take-sheet] listener failed', error)
    }
  })
}

function load() {
  if (inFlight) return
  inFlight = true
  fetch(API + '/state', { headers: { accept: 'application/json' } })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return res.json()
    })
    .then(function (data) {
      snap = { data: data, error: '', at: Date.now() }
      emit()
    })
    .catch(function (error) {
      snap = { data: snap.data, error: String((error && error.message) || error), at: Date.now() }
      emit()
    })
    .then(function () { inFlight = false }, function () { inFlight = false })
}

function subscribe(fn) {
  listeners.add(fn)
  if (timer === null) {
    load()
    timer = setInterval(load, POLL_MS)
  }
  fn(snap)
  return function () {
    listeners.delete(fn)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

function call(method, body) {
  return fetch(API + '/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then(function (res) {
    return res.json().catch(function () { return {} }).then(function (data) {
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status))
      return data
    })
  })
}

function pad(value, width) { return String(value).padStart(width, '0') }

function timecode(seconds) {
  const total = Math.max(0, Number(seconds) || 0)
  const whole = Math.floor(total)
  const ms = Math.round((total - whole) * 1000)
  const carry = ms === 1000 ? 1 : 0
  const h = Math.floor((whole + carry) / 3600)
  const m = Math.floor(((whole + carry) % 3600) / 60)
  const s = (whole + carry) % 60
  return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2) + '.' + pad(carry === 1 ? 0 : ms, 3)
}

function durationText(seconds) {
  const total = Math.max(0, Number(seconds) || 0)
  if (total >= 60) {
    const m = Math.floor(total / 60)
    const s = total - m * 60
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1)
  }
  return total.toFixed(1) + 's'
}

function fileName(path) {
  const parts = String(path || '').split(/[\\/]/)
  return parts[parts.length - 1] || path
}

function thumbUrl(jobId, file) {
  return API + '/thumb?job=' + encodeURIComponent(jobId) + '&file=' + encodeURIComponent(file)
}

function IconFilm() {
  return h('svg', { width: 30, height: 30, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round', 'aria-hidden': 'true' },
    h('rect', { x: 3, y: 5, width: 7, height: 5, rx: 1 }),
    h('rect', { x: 14, y: 5, width: 7, height: 5, rx: 1 }),
    h('rect', { x: 3, y: 14, width: 7, height: 5, rx: 1 }),
    h('rect', { x: 14, y: 14, width: 7, height: 5, rx: 1 }),
  )
}

function Chip(props) {
  return h('span', { className: 'ts-chip' }, props.children)
}

function ShotCard(props) {
  const shot = props.shot
  const jobId = props.jobId
  return h('div', {
    className: 'ts-shot' + (shot.selected ? ' is-on' : ' is-off'),
    onClick: function () { props.onToggle(shot.id) },
  },
  h('div', { className: 'ts-thumb-wrap' },
    h('img', {
      className: 'ts-thumb',
      src: thumbUrl(jobId, shot.thumb),
      alt: '镜头 ' + shot.index + ' · ' + timecode(shot.frame),
      loading: 'lazy',
      draggable: false,
    }),
    h('input', {
      className: 'ts-check',
      type: 'checkbox',
      checked: shot.selected === true,
      'aria-label': '选择镜头 ' + shot.index + '（' + timecode(shot.frame) + '）',
      onChange: function () { props.onToggle(shot.id) },
      onClick: function (event) { event.stopPropagation() },
    }),
    h('span', { className: 'ts-tc' }, timecode(shot.frame)),
    h('span', { className: 'ts-range' }, shot.start.toFixed(1) + '–' + shot.end.toFixed(1) + 's'),
  ),
  h('div', { className: 'ts-shot-foot' },
    h('span', null, '#' + pad(shot.index, 2)),
    h('span', null, shot.duration.toFixed(1) + 's'),
  ))
}

function EmptyState() {
  return h('div', { className: 'ts-empty' },
    h(IconFilm),
    h('b', null, '还没有扫描过视频'),
    h('span', null, '把一段本地参考视频的绝对路径粘到上面，扫描后会按镜头切分，每一镜给一帧可勾选的缩略图。'),
    h('span', { style: { fontSize: '11px', opacity: '.75' } }, '需要 ffmpeg 5.1+；视频与帧都只在这台机器上处理。'),
  )
}

function TakeSheetView() {
  const [state, setState] = React.useState(snap)
  const [job, setJob] = React.useState(null)
  const [path, setPath] = React.useState('')
  const [threshold, setThreshold] = React.useState(null)
  const [maxShots, setMaxShots] = React.useState(null)
  const [busy, setBusy] = React.useState('')
  const [error, setError] = React.useState('')
  const [exportInfo, setExportInfo] = React.useState(null)

  React.useEffect(function () { return subscribe(setState) }, [])

  const data = state.data
  const config = (data && data.config) || {}
  const health = data && data.health
  const thresholdValue = threshold === null ? (config.threshold || 8) : threshold
  const maxShotsValue = maxShots === null ? (config.maxShots || 60) : maxShots

  React.useEffect(function () {
    const remote = (state.data && state.data.job) || null
    if (remote === null) return
    setJob(function (current) {
      if (current && current.id === remote.id) return current
      return remote
    })
    // Keep the field usable after a reload: the job knows what it was scanned
    // from, so re-running with another threshold does not mean retyping a path.
    setPath(function (current) { return current === '' ? remote.input : current })
    if (remote.export) setExportInfo(remote.export)
  }, [state.data])

  function runScan() {
    const target = path.trim()
    if (target === '') {
      setError('先填写视频文件的绝对路径')
      return
    }
    setBusy('scan')
    setError('')
    call('scan', { path: target, threshold: Number(thresholdValue), maxShots: Number(maxShotsValue) })
      .then(function (result) {
        setJob(result.job)
        setExportInfo(null)
        setPath(result.job.input)
      })
      .catch(function (failure) { setError(String((failure && failure.message) || failure)) })
      .then(function () {
        setBusy('')
        load()
      })
  }

  function toggle(id) {
    if (job === null) return
    const shots = job.shots.map(function (shot) {
      return shot.id === id ? { ...shot, selected: !shot.selected } : shot
    })
    const selectedCount = shots.filter(function (shot) { return shot.selected }).length
    setJob({ ...job, shots: shots, selectedCount: selectedCount })
    setExportInfo(null)
    call('select', {
      jobId: job.id,
      selected: shots.filter(function (shot) { return shot.selected }).map(function (shot) { return shot.id }),
    }).catch(function (failure) {
      setError(String((failure && failure.message) || failure))
      load()
    })
  }

  function setAll(value) {
    if (job === null) return
    const shots = job.shots.map(function (shot) { return { ...shot, selected: value } })
    setJob({ ...job, shots: shots, selectedCount: value ? shots.length : 0 })
    setExportInfo(null)
    call('select', {
      jobId: job.id,
      selected: value ? shots.map(function (shot) { return shot.id }) : [],
    }).catch(function (failure) {
      setError(String((failure && failure.message) || failure))
      load()
    })
  }

  function runExport() {
    if (job === null) return
    setBusy('export')
    setError('')
    call('export', { jobId: job.id })
      .then(function (result) {
        setJob(result.job)
        setExportInfo(result.export)
      })
      .catch(function (failure) { setError(String((failure && failure.message) || failure)) })
      .then(function () { setBusy(''); load() })
  }

  function recheck() {
    setBusy('recheck')
    setError('')
    call('recheck', {})
      .then(function () { load() })
      .catch(function (failure) { setError(String((failure && failure.message) || failure)) })
      .then(function () { setBusy('') })
  }

  const healthOk = health && health.ok === true
  const selectedCount = job ? job.shots.filter(function (shot) { return shot.selected }).length : 0

  return h('div', { className: 'ts-root' },
    h('div', { className: 'ts-head' },
      h('div', { className: 'ts-eyebrow' }, 'take sheet'),
      h('div', { className: 'ts-title-row' },
        h('h2', { className: 'ts-title' }, '参考帧'),
        h('span', { className: 'ts-health' + (healthOk ? '' : ' ts-bad') },
          healthOk
            ? 'ffmpeg ' + (health.ffmpeg && health.ffmpeg.version ? health.ffmpeg.version.split('-')[0] : '') + ' · 本地处理'
            : (health ? 'ffmpeg 不可用' : '检查中…')),
      ),
      h('p', { className: 'ts-sub' }, '把参考片按镜头切开，勾选真正要用的帧，导出带时间码的清单和一张联系表。'),
    ),

    state.error ? h('div', { className: 'ts-err' }, '与 host 通信失败：' + state.error) : null,

    health && !health.ok
      ? h('div', { className: 'ts-warn' },
        h('div', { className: 'ts-warn-text' },
          h('b', null, '这台机器上还不能切镜头'),
          h('span', null, health.error || '没有找到 ffmpeg。'),
          h('span', null, 'Windows 可运行 ', h('code', null, 'winget install Gyan.FFmpeg'), '；macOS 用 ', h('code', null, 'brew install ffmpeg'), '。'),
          h('span', { style: { opacity: '.55' } }, '装好后点“重新检测”，不用重启。'),
        ),
        h('button', { className: 'ts-btn', type: 'button', onClick: recheck, disabled: busy !== '' }, '重新检测'),
      )
      : null,

    error ? h('div', { className: 'ts-err' }, error) : null,

    h('div', { className: 'ts-card ts-scan' },
      h('div', { className: 'ts-path' },
        h('input', {
          className: 'ts-input',
          value: path,
          placeholder: 'D:\\refs\\clip.mp4',
          spellCheck: false,
          'aria-label': '视频文件绝对路径',
          onChange: function (event) { setPath(event.target.value) },
          onKeyDown: function (event) { if (event.key === 'Enter') runScan() },
        }),
      ),
      h('select', {
        className: 'ts-select',
        value: String(thresholdValue),
        'aria-label': '切点灵敏度',
        title: '切点灵敏度：数值越低越容易判为换镜',
        onChange: function (event) { setThreshold(Number(event.target.value)) },
      },
      h('option', { value: '4' }, '敏感'),
      h('option', { value: '8' }, '标准'),
      h('option', { value: '15' }, '稳健')),
      h('select', {
        className: 'ts-select',
        value: String(maxShotsValue),
        'aria-label': '最多镜头数',
        onChange: function (event) { setMaxShots(Number(event.target.value)) },
      },
      h('option', { value: '30' }, '最多 30 镜'),
      h('option', { value: '60' }, '最多 60 镜'),
      h('option', { value: '120' }, '最多 120 镜')),
      h('button', {
        className: 'ts-btn ts-btn-primary',
        type: 'button',
        onClick: runScan,
        disabled: busy !== '' || !healthOk,
      }, busy === 'scan' ? '扫描中…' : '扫描'),
    ),

    busy === 'scan'
      ? h('div', { className: 'ts-card', style: { padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' } },
        h('div', { className: 'ts-busy-line' },
          h('span', null, '正在解码视频并检测镜头切点…'),
          h('span', { style: { opacity: '.5' } }, '一次完整解码，长视频需要几十秒')),
        h('div', { className: 'ts-progress' }, h('span', null)))
      : null,

    job
      ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('div', { className: 'ts-meta' },
          h(Chip, null, h('b', null, fileName(job.input))),
          h(Chip, null, durationText(job.probe.duration)),
          h(Chip, null, job.probe.width + '×' + job.probe.height),
          h(Chip, null, (Number(job.probe.fps) || 0).toFixed(2) + ' fps'),
          h(Chip, null, job.shots.length + ' 镜'),
          h(Chip, null, '阈值 ' + job.params.threshold),
        ),
        job.truncated
          ? h('div', { className: 'ts-warn' }, '镜头数超过单次上限，只保留了前一部分切点。可以把“最多镜头数”调大后重扫。')
          : null,
        job.droppedByLimit > 0
          ? h('div', { className: 'ts-warn' }, '切点太多，已按时间均匀保留 ' + job.shots.length + ' 镜（丢弃 ' + job.droppedByLimit + ' 个切点）。')
          : null,
        h('div', { className: 'ts-toolbar' },
          h('button', { className: 'ts-btn', type: 'button', onClick: function () { setAll(true) }, disabled: busy !== '' }, '全选'),
          h('button', { className: 'ts-btn', type: 'button', onClick: function () { setAll(false) }, disabled: busy !== '' }, '全不选'),
          h('span', { className: 'ts-count' }, '已选 ' + selectedCount + ' / ' + job.shots.length),
          h('button', {
            className: 'ts-btn ts-btn-primary',
            type: 'button',
            onClick: runExport,
            disabled: busy !== '' || selectedCount === 0,
          }, busy === 'export' ? '导出中…' : '导出参考帧清单（' + selectedCount + '）'),
        ),
        job.shots.length === 0
          ? h('div', { className: 'ts-empty' }, h('b', null, '没有识别到镜头'), h('span', null, '换一段有明确剪辑点的视频，或把灵敏度调成“敏感”。'))
          : h('div', { className: 'ts-grid' }, job.shots.map(function (shot) {
            return h(ShotCard, { key: shot.id, shot: shot, jobId: job.id, onToggle: toggle })
          })),
      )
      : (busy === 'scan' ? null : h(EmptyState)),

    exportInfo
      ? h('div', { className: 'ts-card ts-export' },
        h('div', { className: 'ts-export-head' },
          h('b', null, '已导出 ' + exportInfo.count + ' 帧'),
          h('span', null, exportInfo.labelled ? '· 联系表带时间码' : '· 联系表未加时间码'),
        ),
        exportInfo.sheet
          ? h('img', {
            className: 'ts-sheet',
            src: API + '/sheet?job=' + encodeURIComponent(job.id) + '&t=' + exportInfo.at,
            alt: '联系表',
          })
          : null,
        h('div', { className: 'ts-links' },
          h('a', { href: API + '/download?job=' + encodeURIComponent(job.id) + '&file=frames.csv', download: 'frames.csv' }, 'frames.csv'),
          h('a', { href: API + '/download?job=' + encodeURIComponent(job.id) + '&file=shots.json', download: 'shots.json' }, 'shots.json'),
          h('a', { href: API + '/download?job=' + encodeURIComponent(job.id) + '&file=contact-sheet.jpg', download: 'contact-sheet.jpg' }, 'contact-sheet.jpg'),
        ),
        h('div', { className: 'ts-paths' }, exportInfo.dir),
      )
      : null,

    h('div', { className: 'ts-foot' },
      '全部在本机处理 · 输出目录 ' + (config.outputDir || '~/.dsh/take-sheet')),
  )
}

function apply(ctx) {
  // dsh can unload a plugin at runtime; the poll lives at module scope and needs
  // its own teardown, not just the view's.
  ctx.effect(function () {
    return function () {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
      listeners.clear()
      snap = { data: null, error: '', at: 0 }
    }
  })

  ctx.effect(function () {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-take-sheet'
    style.textContent = CSS
    document.head.appendChild(style)
    return function () { style.remove() }
  })

  ctx.slots.inject('conversation.view', function () {
    let disposeView
    try {
      disposeView = ctx.slots.register(
        { name: 'conversation.view', id: 'take-sheet', order: 45, label: '参考帧' },
        TakeSheetView,
      )
    } catch (error) {
      disposeView = undefined
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[dsh-take-sheet] could not register the 参考帧 view', error)
      }
    }
    return typeof disposeView === 'function' ? disposeView : function () {}
  })
}

module.exports = {
  name: 'dsh-take-sheet',
  inject: ['slots'],
  apply: apply,
}
    return module.exports;
  },
});
