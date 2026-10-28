// Pure-function coverage for the shot planner and the export formats.
// These tests need no ffmpeg, no network and no filesystem.

import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  cellSize,
  csvText,
  escapeFilterPath,
  escapeFilterValue,
  formatShortTimecode,
  formatTimecode,
  frameFileName,
  gridFor,
  newJobId,
  pad,
  parseProbeJson,
  parsePtsTimes,
  parseRate,
  planShots,
  sanitizeJobId,
  timecodeFilename,
} from '../src/shots.js'

test('timecode is exact, zero-padded and carries milliseconds into the next second', () => {
  assert.equal(formatTimecode(0), '00:00:00.000')
  assert.equal(formatTimecode(3.2), '00:00:03.200')
  assert.equal(formatTimecode(3661.5), '01:01:01.500')
  assert.equal(formatTimecode(2.0004), '00:00:02.000')
  assert.equal(formatTimecode(59.9996), '00:01:00.000')
  assert.equal(formatTimecode(-4), '00:00:00.000')
  assert.equal(formatShortTimecode(3.2), '0:03.200')
  assert.equal(formatShortTimecode(65.25), '1:05.250')
  assert.equal(formatShortTimecode(3670), '1:01:10.000')
  assert.equal(timecodeFilename(3.2), '00-00-03.200')
  assert.equal(frameFileName(7, 83.5), '07_00-01-23.500.jpg')
  assert.equal(pad(4, 3), '004')
})

test('showinfo parsing keeps only frame timestamps, sorted and deduplicated', () => {
  const stderr = [
    'ffmpeg version 9.0.1',
    '[Parsed_showinfo_1 @ 0000] config in time_base: 1/12800, frame_rate: 25/1',
    '[Parsed_showinfo_1 @ 0000] n:   0 pts:  25600 pts_time:2 duration: 512 duration_time:0.04 fmt:yuv420p',
    '[Parsed_showinfo_1 @ 0000] n:   1 pts:  51200 pts_time:4 duration: 512 duration_time:0.04 fmt:yuv420p',
    '[Parsed_showinfo_1 @ 0000] n:   2 pts:  51200 pts_time:4 duration: 512 duration_time:0.04 fmt:yuv420p',
    'frame=    3 fps=0.0 q=4.1 Lsize=N/A time=00:00:00.12 bitrate=N/A',
    '[Parsed_showinfo_1 @ 0000] n:   3 pts:  76800 pts_time:6.04 duration: 512 duration_time:0.04 fmt:yuv420p',
  ].join('\n')
  assert.deepEqual(parsePtsTimes(stderr), [2, 4, 6.04])
  assert.deepEqual(parsePtsTimes(''), [])
})

test('probe parsing reports display dimensions after rotation', () => {
  const info = parseProbeJson({
    streams: [{
      codec_type: 'video',
      codec_name: 'h264',
      width: 1920,
      height: 1080,
      r_frame_rate: '30000/1001',
      side_data_list: [{ rotation: -90 }],
    }],
    format: { duration: '12.500000', size: '1234567' },
  })
  assert.equal(info.width, 1080)
  assert.equal(info.height, 1920)
  assert.equal(info.duration, 12.5)
  assert.equal(info.fps, 29.97)
  assert.equal(info.codec, 'h264')
  assert.equal(info.sizeBytes, 1234567)
  assert.equal(parseRate('25/1'), 25)
  assert.equal(parseRate('0/0'), 0)
  assert.throws(() => parseProbeJson({ streams: [{ codec_type: 'audio' }] }), /没有视频流/)
})

test('no cut means one shot covering the whole video', () => {
  const plan = planShots([], { duration: 10 })
  assert.equal(plan.shots.length, 1)
  assert.deepEqual(
    {
      start: plan.shots[0].start,
      end: plan.shots[0].end,
      frame: plan.shots[0].frame,
      thumb: plan.shots[0].thumb,
      selected: plan.shots[0].selected,
    },
    { start: 0, end: 10, frame: 0.2, thumb: 'shot-001.jpg', selected: true },
  )
})

test('three cuts become four half-open shots with cut-frame thumbnails', () => {
  const plan = planShots([2, 4, 6], { duration: 10 })
  assert.equal(plan.shots.length, 4)
  assert.deepEqual(plan.shots.map((shot) => [shot.start, shot.end, shot.frame, shot.rawCutIndex]), [
    [0, 2, 0.2, null],
    [2, 4, 2, 0],
    [4, 6, 4, 1],
    [6, 10, 6, 2],
  ])
  assert.deepEqual(plan.shots.map((shot) => shot.thumb), [
    'shot-001.jpg', 'shot-002.jpg', 'shot-003.jpg', 'shot-004.jpg',
  ])
  assert.equal(plan.droppedByGap, 0)
})

test('cuts closer than minShotMs are merged instead of producing flashes', () => {
  const plan = planShots([2, 2.1, 2.2, 4], { duration: 10, minShotMs: 350 })
  assert.deepEqual(plan.shots.map((shot) => shot.start), [0, 2, 4])
  assert.equal(plan.droppedByGap, 2)
})

test('cuts outside the clip and at its exact edges are ignored', () => {
  const plan = planShots([-2, 0, 0.01, 9.99, 10, 14], { duration: 10 })
  assert.equal(plan.shots.length, 1)
  assert.equal(plan.rawCuts, 0)
})

test('too many cuts are sampled evenly and the mapping stays exact', () => {
  const plan = planShots([1, 2, 3, 4], { duration: 6, maxShots: 3, minShotMs: 100 })
  assert.equal(plan.shots.length, 3)
  assert.equal(plan.droppedByLimit, 2)
  assert.deepEqual(plan.shots.slice(1).map((shot) => shot.rawCutIndex), [0, 2])
  assert.deepEqual(plan.shots.map((shot) => shot.start), [0, 1, 3])
})

test('forcing one shot discards every cut', () => {
  const plan = planShots([1, 2, 3], { duration: 6, maxShots: 1 })
  assert.equal(plan.shots.length, 1)
  assert.equal(plan.droppedByLimit, 3)
})

test('an invalid duration is rejected instead of producing a division by zero', () => {
  assert.throws(() => planShots([1], { duration: 0 }), /时长无效/)
  assert.throws(() => planShots([1], {}), /时长无效/)
})

test('contact sheet grid avoids empty cells and long strips', () => {
  assert.deepEqual(gridFor(1), { cols: 1, rows: 1 })
  assert.deepEqual(gridFor(4), { cols: 2, rows: 2 })
  assert.deepEqual(gridFor(5), { cols: 3, rows: 2 })
  assert.deepEqual(gridFor(6), { cols: 3, rows: 2 })
  assert.deepEqual(gridFor(10), { cols: 5, rows: 2 })
  assert.deepEqual(gridFor(12), { cols: 4, rows: 3 })
})

test('cell size follows source aspect and caps portrait height', () => {
  assert.deepEqual(cellSize(1920, 1080, 360), { width: 360, height: 202 })
  assert.deepEqual(cellSize(1080, 1920, 360), { width: 236, height: 420 })
  assert.deepEqual(cellSize(0, 0, 320), { width: 320, height: 180 })
})

test('filter values and Windows font paths are escaped for ffmpeg', () => {
  assert.equal(escapeFilterValue('00:03.200'), '00\\:03.200')
  assert.equal(escapeFilterValue("a,b[c]'d;e"), "a\\,b\\[c\\]\\'d\\;e")
  assert.equal(escapeFilterPath('C:\\Windows\\Fonts\\consola.ttf'), 'C\\:/Windows/Fonts/consola.ttf')
})

test('CSV quotes commas and newlines and keeps the source on every row', () => {
  const job = { input: 'D:\\refs\\a,b.mp4' }
  const shots = [{
    index: 2,
    frame: 3.2,
    start: 2,
    end: 5,
    duration: 3,
    file: 'frames/02_00-00-03.200.jpg',
  }]
  const csv = csvText(job, shots)
  const lines = csv.trim().split('\r\n')
  assert.equal(lines[0], 'shot,timecode,seconds,start,end,duration,file,source')
  assert.equal(lines[1], '2,00:00:03.200,3.200,2.000,5.000,3.000,frames/02_00-00-03.200.jpg,"D:\\refs\\a,b.mp4"')
})

test('job ids are filename-safe and generated ids match the route guard', () => {
  assert.equal(sanitizeJobId('20261028-153012-a3f1'), '20261028-153012-a3f1')
  assert.equal(sanitizeJobId('../../windows/win.ini'), '')
  assert.equal(sanitizeJobId('ABC'), '')
  assert.equal(sanitizeJobId('short'), '')
  const id = newJobId(new Date('2026-10-28T07:45:12.000Z'), 'zz9')
  assert.match(id, /^[a-z0-9][a-z0-9-]{5,40}$/)
  assert.equal(id, '20261028074512-zz90')
})
