import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const destination = join(projectRoot, 'resources', 'bin')

if (!ffmpegPath || !existsSync(ffmpegPath)) {
  throw new Error('FFmpeg binary is missing. Run pnpm install before packaging.')
}

if (!ffprobeInstaller.path || !existsSync(ffprobeInstaller.path)) {
  throw new Error('ffprobe binary is missing. Run pnpm install before packaging.')
}

mkdirSync(destination, { recursive: true })
copyFileSync(ffmpegPath, join(destination, 'ffmpeg.exe'))
copyFileSync(ffprobeInstaller.path, join(destination, 'ffprobe.exe'))

const staged = ['ffmpeg.exe', 'ffprobe.exe'].map((name) => {
  const path = join(destination, name)
  return { name, bytes: statSync(path).size }
})

console.log('Staged media binaries:', staged)
