// One real end-to-end pass: a generated clip with two hard cuts, scanned by the
// real ffmpeg, exported as a labelled contact sheet. Skipped where ffmpeg is not
// installed, so CI stays honest instead of green-but-fake.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createMedia } from '../src/media.js'

const media = createMedia({})
const health = await media.detect()
const reason = health.ok ? false : 'ffmpeg 5.1+ not available: ' + health.error

function makeClip() {
  const dir = mkdtempSync(join(tmpdir(), 'take-sheet-real-'))
  const video = join(dir, 'three-shots.mp4')
  const result = spawnSync(health.ffmpeg.path, [
    '-hide_banner', '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=red:s=640x360:d=2:r=25',
    '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:d=2:r=25',
    '-f', 'lavfi', '-i', 'color=c=green:s=640x360:d=2:r=25',
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    video,
  ], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return { dir, video }
}

test('real ffmpeg: two cuts become three shots with three thumbnails', { skip: reason }, async () => {
  const clip = makeClip()
  const jobDir = join(clip.dir, 'job')
  mkdirSync(jobDir, { recursive: true })

  const scan = await media.scan(clip.video, {
    jobDir,
    threshold: 4,
    maxShots: 10,
    minShotMs: 350,
    frameWidth: 320,
  })

  assert.equal(scan.probe.width, 640)
  assert.equal(scan.probe.height, 360)
  assert.ok(Math.abs(scan.probe.duration - 6) < 0.2)
  assert.equal(scan.shots.length, 3, 'two cuts split the clip into three shots')
  assert.deepEqual(scan.shots.map((shot) => Math.round(shot.start * 10) / 10), [0, 2, 4])
  assert.equal(scan.shots[0].frame, 0.2)
  assert.equal(scan.shots[1].frame, 2)
  for (const shot of scan.shots) {
    const file = join(jobDir, shot.thumb)
    assert.ok(existsSync(file), shot.thumb)
    const bytes = statSync(file).size
    assert.ok(bytes > 200, shot.thumb + ' is a real JPEG')
    assert.equal(readFileSync(file).subarray(0, 2).toString('hex'), 'ffd8', shot.thumb + ' has a JPEG header')
  }
})

test('real ffmpeg: a labelled contact sheet and an export set are written', { skip: reason }, async () => {
  const clip = makeClip()
  const jobDir = join(clip.dir, 'job')
  mkdirSync(jobDir, { recursive: true })
  const scan = await media.scan(clip.video, {
    jobDir,
    threshold: 4,
    maxShots: 10,
    minShotMs: 350,
    frameWidth: 320,
  })
  const exportDir = join(jobDir, 'export')
  const sheet = await media.contactSheet({
    jobDir,
    outputDir: exportDir,
    shots: scan.shots,
    probe: scan.probe,
    cellWidth: 320,
  })
  assert.equal(sheet.labelled, true, 'the system font was found and drawtext worked')
  assert.equal(sheet.columns, 3)
  assert.equal(sheet.rows, 1)
  const file = join(exportDir, 'contact-sheet.jpg')
  assert.ok(existsSync(file))
  assert.ok(statSync(file).size > 5000)
  assert.ok(sheet.width > 900)
})
