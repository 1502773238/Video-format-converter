import { spawn } from 'node:child_process'

export interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

interface RunCommandOptions {
  timeoutMs?: number
  maxOutputBytes?: number
  stdoutEncoding?: BufferEncoding
}

export function runCommand(
  executable: string,
  args: readonly string[],
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const maxOutputBytes = options.maxOutputBytes ?? 4 * 1024 * 1024

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let outputBytes = 0
    let settled = false

    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }

    const collect = (bucket: Buffer[], chunk: Buffer): void => {
      outputBytes += chunk.byteLength
      if (outputBytes > maxOutputBytes) {
        child.kill()
        finish(() => reject(new Error('外部工具输出过大，进程已终止。')))
        return
      }
      bucket.push(chunk)
    }

    child.stdout.on('data', (chunk: Buffer) => collect(stdout, chunk))
    child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk))
    child.on('error', (error) => finish(() => reject(error)))
    child.on('close', (code) =>
      finish(() =>
        resolve({
          exitCode: code ?? -1,
          stdout: Buffer.concat(stdout).toString(options.stdoutEncoding ?? 'utf8'),
          stderr: Buffer.concat(stderr).toString('utf8')
        })
      )
    )

    const timer = setTimeout(() => {
      child.kill()
      finish(() => reject(new Error(`外部工具运行超过 ${Math.round(timeoutMs / 1000)} 秒。`)))
    }, timeoutMs)
  })
}
