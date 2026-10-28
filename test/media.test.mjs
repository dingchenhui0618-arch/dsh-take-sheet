// Media-layer tests that do not need a real ffmpeg: binary discovery,
// argument construction, version gating and contact-sheet geometry. The real
// end-to-end pass lives in integration.test.mjs and skips without ffmpeg.

import { strict as assert } from 'node:assert'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  binaryCandidates,
  createMedia,
  findBinary,
  firstFrameArgs,
  parseVersion,
  resolveFont,
  sceneDetectArgs,
  sheetDimensions,
  sheetFilter,
} from '../src/media.js'

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'take-sheet-media-'))
}

test('Windows candidate search includes WinGet Links and PATH entries', () => {
  const list = binaryCandidates('ffmpeg', {
    LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
    PATH: 'C:\\tools;C:\\other',
  }, 'win32')
  assert.ok(list.includes('C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe'))
  assert.ok(list.includes('C:\\tools\\ffmpeg.exe'))
  assert.ok(list.includes('C:\\ffmpeg\\bin\\ffmpeg.exe'))
})

test('explicit paths win, and a missing sibling falls back to the candidate list', () => {
  const dir = tempDir()
  const ffmpeg = join(dir, 'ffmpeg.exe')
  const ffprobe = join(dir, 'ffprobe.exe')
  writeFileSync(ffmpeg, '')
  writeFileSync(ffprobe, '')
  assert.equal(findBinary('ffmpeg', { explicit: ffmpeg, env: {}, platform: 'win32' }), ffmpeg)
  assert.equal(findBinary('ffprobe', { sibling: dir, env: {}, platform: 'win32' }), ffprobe)
  assert.equal(findBinary('ffmpeg', { explicit: join(dir, 'nope.exe'), env: { PATH: join(dir, 'empty') }, platform: 'win32' }), '')
})

test('ffmpeg version parsing gates the 5.1 minimum', () => {
  const modern = parseVersion('ffmpeg version 9.0.1-full_build-www.gyan.dev Copyright')
  assert.equal(modern.major, 9)
  assert.equal(modern.supported, true)
  const old = parseVersion('ffmpeg version 4.4.2 Copyright')
  assert.equal(old.supported, false)
  const git = parseVersion('ffmpeg version n6.1.1 Copyright')
  assert.equal(git.major, 6)
  assert.equal(git.supported, true)
  const five = parseVersion('ffmpeg version 5.0.3')
  assert.equal(five.supported, false)
  assert.equal(parseVersion('').supported, false)
})

test('detect reports a version-gated failure and then recovers after reset', async () => {
  const dir = tempDir()
  const ffmpeg = join(dir, 'ffmpeg.exe')
  const ffprobe = join(dir, 'ffprobe.exe')
  writeFileSync(ffmpeg, '')
  writeFileSync(ffprobe, '')
  let version = '4.4.2'
  const run = async () => ({ status: 0, stdout: 'ffmpeg version ' + version, stderr: '' })
  const media = createMedia({ ffmpegPath: ffmpeg, ffprobePath: ffprobe, run })
  const bad = await media.detect()
  assert.equal(bad.ok, false)
  assert.match(bad.error, /5\.1/)

  version = '6.1.1'
  media.resetDetection()
  const good = await media.detect()
  assert.equal(good.ok, true)
  assert.equal(good.ffmpeg.version, '6.1.1')
})

test('scene detection is one argv array, scdet-only, with no shell string', () => {
  const args = sceneDetectArgs('D:\\refs\\a b.mp4', 'D:\\jobs\\j1', { threshold: 6, frameWidth: 720 })
  assert.ok(args.includes('D:\\refs\\a b.mp4'))
  assert.ok(args.includes(join('D:\\jobs\\j1', 'cut-%04d.jpg')))
  assert.ok(args.includes('scdet=threshold=6:sc_pass=1,showinfo,scale=720:-2'))
  assert.ok(args.includes('-fps_mode'))
  assert.ok(!args.some((arg) => /[;&|]/.test(arg)), 'arguments stay data, never a command line')
})

test('the opening frame is seeked accurately and written as a single image', () => {
  const args = firstFrameArgs('D:\\a.mp4', 'D:\\job\\shot-001.jpg', { at: 0.2, frameWidth: 640 })
  assert.ok(args.indexOf('-ss') < args.indexOf('-i'))
  assert.ok(args.includes('-update'))
  assert.ok(args.includes('scale=640:-2'))
  assert.ok(args.includes('D:\\job\\shot-001.jpg'))
})

test('contact sheet filter labels every cell and escapes the Windows font path', () => {
  const labels = ['#01  00:00:00.200', '#02  00:00:02.000', '#03  00:00:04.000',
    '#04  00:00:06.000', '#05  00:00:08.000']
  const filter = sheetFilter({
    cellW: 400,
    cellH: 225,
    cols: 3,
    rows: 2,
    padding: 8,
    margin: 12,
    labels,
    fontPath: 'C:\\Windows\\Fonts\\consola.ttf',
  })
  assert.match(filter, /^scale=400:224,tile=3x2:padding=8:margin=12:color=black,/)
  assert.equal((filter.match(/drawtext=/g) || []).length, 5)
  assert.ok(filter.includes("fontfile='C\\:/Windows/Fonts/consola.ttf'"))
  assert.ok(filter.includes("text='#01  00\\:00\\:00.200'"))
  assert.ok(filter.includes(':x=22:y=209:fontsize=15:'), 'label sits inside the first cell')
})

test('without a font the sheet has no drawtext and still tiles', () => {
  const filter = sheetFilter({ cellW: 300, cellH: 169, cols: 2, rows: 1, labels: ['#01'], fontPath: '' })
  assert.ok(!filter.includes('drawtext'))
  assert.match(filter, /tile=2x1/)
})

test('contact sheet dimensions match the tiled geometry', () => {
  assert.deepEqual(sheetDimensions({ cellW: 400, cellH: 225, cols: 3, rows: 2, padding: 8, margin: 12 }), {
    width: 1240,
    height: 480,
  })
  assert.deepEqual(sheetDimensions({ cellW: 360, cellH: 202, cols: 1, rows: 1 }), {
    width: 384,
    height: 226,
  })
})

test('font resolution always returns a string and honours a real explicit path', () => {
  assert.equal(typeof resolveFont(''), 'string')
  assert.equal(resolveFont('C:\\definitely\\missing.ttf').endsWith('missing.ttf'), false)
})
