import { constants } from 'node:fs'
import { access, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute } from 'node:path'

export const MAX_INPUT_BYTES = 500 * 1024 ** 3

const supportedMediaExtensions = new Set([
  '.avi',
  '.flv',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp3',
  '.mp4',
  '.ts',
  '.webm',
  '.wmv'
])

export function assertSafeJobId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) {
    throw new Error('任务标识无效。')
  }
}

export function assertStringPath(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 32_767 || value.includes('\0')) {
    throw new Error(`${label}无效。`)
  }
  if (!isAbsolute(value)) throw new Error(`${label}必须是绝对路径。`)
}

export async function validateMediaFile(filePath: unknown): Promise<{
  path: string
  size: number
}> {
  assertStringPath(filePath, '媒体文件路径')
  const extension = extname(filePath).toLocaleLowerCase()
  if (!supportedMediaExtensions.has(extension)) {
    throw new Error('不支持这个文件类型。请选择 MP4、MOV、MKV、AVI、WebM 等媒体文件。')
  }

  const canonicalPath = await realpath(filePath).catch(() => {
    throw new Error('找不到这个媒体文件，可能已被移动或删除。')
  })
  const fileStat = await stat(canonicalPath)
  if (!fileStat.isFile()) throw new Error('选择的路径不是文件。')
  if (fileStat.size <= 0) throw new Error('这个媒体文件是空文件。')
  if (fileStat.size > MAX_INPUT_BYTES) {
    throw new Error('文件超过 500 GB。为避免长时间占用电脑资源，本版本暂不处理。')
  }
  return { path: canonicalPath, size: fileStat.size }
}

export async function validateOutputDirectory(directoryPath: unknown): Promise<string> {
  assertStringPath(directoryPath, '输出文件夹路径')
  const canonicalPath = await realpath(directoryPath).catch(() => {
    throw new Error('找不到输出文件夹，请重新选择。')
  })
  const directoryStat = await stat(canonicalPath)
  if (!directoryStat.isDirectory()) throw new Error('输出位置不是文件夹。')
  await access(canonicalPath, constants.W_OK).catch(() => {
    throw new Error('输出文件夹不可写，请选择其他位置。')
  })
  return canonicalPath
}
