import { spawn, type ChildProcess } from 'node:child_process'

export async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || !child.pid) return

  if (process.platform !== 'win32') {
    child.kill('SIGTERM')
    return
  }

  await new Promise<void>((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      if (child.exitCode === null) child.kill()
      resolve()
    }
    killer.once('error', finish)
    killer.once('close', finish)
  })
}
