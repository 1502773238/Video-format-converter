import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { MediaInfo } from '../shared/contracts'
import { getPreset } from '../shared/presets'
import { validateConvertedMedia } from './conversion-service'
import { assertSafeJobId, validateMediaFile, validateOutputDirectory } from './validation'

const fixtureDirectory = resolve('work', 'hardening-test')
const fixturePath = resolve(fixtureDirectory, 'sample.mp4')

beforeAll(async () => {
  await mkdir(fixtureDirectory, { recursive: true })
  await writeFile(fixturePath, Buffer.from('fixture'))
})

afterAll(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true })
})

describe('main-process input validation', () => {
  it('accepts safe job ids and rejects path-like ids', () => {
    expect(() => assertSafeJobId('8a7a579d-a5b5-4b71-8a16-98b2ed413780')).not.toThrow()
    expect(() => assertSafeJobId('../../outside')).toThrow('任务标识无效')
  })

  it('requires supported, absolute, non-empty media files', async () => {
    await expect(validateMediaFile(fixturePath)).resolves.toMatchObject({ path: fixturePath, size: 7 })
    await expect(validateMediaFile('relative.mp4')).rejects.toThrow('绝对路径')
    await expect(validateMediaFile(resolve(fixtureDirectory, 'notes.txt'))).rejects.toThrow('不支持这个文件类型')
  })

  it('requires an existing writable output directory', async () => {
    await expect(validateOutputDirectory(fixtureDirectory)).resolves.toBe(fixtureDirectory)
    await expect(validateOutputDirectory(resolve(fixtureDirectory, 'missing'))).rejects.toThrow('找不到输出文件夹')
  })
})

const source: MediaInfo = {
  path: 'source.mp4',
  fileName: 'source.mp4',
  size: 100,
  duration: 10,
  format: 'MP4',
  width: 1920,
  height: 1080,
  frameRate: 30,
  videoCodec: 'h264',
  audioCodec: 'aac',
  bitRate: 1_000_000,
  audioTracks: 1,
  subtitleTracks: 0
}

describe('converted media validation', () => {
  it('accepts a structurally complete H.264 output', () => {
    expect(() => validateConvertedMedia(source, { ...source, path: 'output.mp4' }, getPreset('mp4-h264'))).not.toThrow()
  })

  it('rejects missing audio, unexpected dimensions, and abnormal frame rate', () => {
    expect(() => validateConvertedMedia(source, { ...source, audioCodec: undefined, audioTracks: 0 }, getPreset('mp4-h264'))).toThrow('音频轨道')
    expect(() => validateConvertedMedia(source, { ...source, width: 320, height: 240 }, getPreset('mp4-h264'))).toThrow('分辨率')
    expect(() => validateConvertedMedia(source, { ...source, frameRate: 10 }, getPreset('mp4-h264'))).toThrow('帧率')
  })

  it('requires MP3 output to contain audio and no video', () => {
    const validMp3 = { ...source, path: 'output.mp3', videoCodec: undefined, width: undefined, height: undefined, frameRate: undefined, audioCodec: 'mp3' }
    expect(() => validateConvertedMedia(source, validMp3, getPreset('mp3-audio'))).not.toThrow()
    expect(() => validateConvertedMedia(source, { ...validMp3, videoCodec: 'h264' }, getPreset('mp3-audio'))).toThrow('音频轨道或编码')
  })
})
