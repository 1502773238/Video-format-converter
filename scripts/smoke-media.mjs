import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'

const smokeDirectory = resolve('work', 'media-smoke')
const sourcePath = resolve(smokeDirectory, 'source-测试视频.mp4')
const thumbnailPath = resolve(smokeDirectory, 'thumbnail.jpg')
const outputPath = resolve(smokeDirectory, 'converted.webm')

mkdirSync(smokeDirectory, { recursive: true })

function run(executable, args, label) {
  const result = spawnSync(executable, args, { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) {
    throw new Error(`${label}失败：${result.stderr?.trim() || `退出码 ${result.status}`}`)
  }
  return result.stdout
}

if (!ffmpegPath || !existsSync(ffmpegPath)) throw new Error('找不到 ffmpeg-static 二进制。')
if (!existsSync(ffprobeInstaller.path)) throw new Error('找不到 ffprobe 二进制。')

run(
  ffmpegPath,
  [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=44100',
    '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', sourcePath
  ],
  '生成测试视频'
)

const probeJson = run(
  ffprobeInstaller.path,
  ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', sourcePath],
  '读取媒体信息'
)
const probe = JSON.parse(probeJson)
const video = probe.streams.find((stream) => stream.codec_type === 'video')
const audio = probe.streams.find((stream) => stream.codec_type === 'audio')
if (video?.width !== 640 || video?.height !== 360 || !audio) {
  throw new Error('ffprobe 返回的测试视频结构不符合预期。')
}

run(
  ffmpegPath,
  ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.5', '-i', sourcePath, '-frames:v', '1', '-vf', 'scale=320:-2', thumbnailPath],
  '生成缩略图'
)

run(
  ffmpegPath,
  [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath,
    '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-c:a', 'libopus', outputPath
  ],
  '转换 WebM'
)

const outputProbe = JSON.parse(
  run(ffprobeInstaller.path, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', outputPath], '校验输出')
)
const outputVideo = outputProbe.streams.find((stream) => stream.codec_type === 'video')
if (outputVideo?.codec_name !== 'vp9' || Number(outputProbe.format.duration) < 1.9) {
  throw new Error('转换结果编码或时长不符合预期。')
}

console.log(JSON.stringify({
  ffmpeg: ffmpegPath,
  ffprobe: ffprobeInstaller.path,
  source: { path: sourcePath, bytes: statSync(sourcePath).size, codec: video.codec_name },
  thumbnail: { path: thumbnailPath, bytes: statSync(thumbnailPath).size },
  output: { path: outputPath, bytes: statSync(outputPath).size, codec: outputVideo.codec_name, duration: Number(outputProbe.format.duration) }
}, null, 2))
