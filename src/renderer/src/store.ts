import { create } from 'zustand'
import type { MediaInfo, PresetId } from '../../shared/contracts'

export type JobStatus = 'loading' | 'ready' | 'converting' | 'validating' | 'completed' | 'error' | 'cancelled'

export interface ConversionJob {
  id: string
  inputPath: string
  fileName: string
  media?: MediaInfo
  presetId: PresetId
  status: JobStatus
  progress: number
  speed?: string
  error?: string
  outputPath?: string
}

interface AppState {
  jobs: ConversionJob[]
  selectedId?: string
  outputDirectory?: string
  queueRunning: boolean
  addJobs: (paths: string[]) => ConversionJob[]
  patchJob: (id: string, patch: Partial<ConversionJob>) => void
  removeJob: (id: string) => void
  clearFinished: () => void
  selectJob: (id: string) => void
  setOutputDirectory: (path?: string) => void
  setQueueRunning: (running: boolean) => void
}

function leafName(path: string): string {
  return path.split(/[\\/]/).at(-1) || path
}

export const useAppStore = create<AppState>((set, get) => ({
  jobs: [],
  queueRunning: false,
  addJobs: (paths) => {
    const existing = new Set(get().jobs.map((job) => job.inputPath.toLocaleLowerCase()))
    const created = paths
      .filter((path) => path && !existing.has(path.toLocaleLowerCase()))
      .map<ConversionJob>((path) => ({
        id: crypto.randomUUID(),
        inputPath: path,
        fileName: leafName(path),
        presetId: 'mp4-h264',
        status: 'loading',
        progress: 0
      }))
    if (created.length) {
      set((state) => ({
        jobs: [...state.jobs, ...created],
        selectedId: state.selectedId ?? created[0].id
      }))
    }
    return created
  },
  patchJob: (id, patch) =>
    set((state) => ({ jobs: state.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)) })),
  removeJob: (id) =>
    set((state) => {
      const jobs = state.jobs.filter((job) => job.id !== id)
      return { jobs, selectedId: state.selectedId === id ? jobs[0]?.id : state.selectedId }
    }),
  clearFinished: () =>
    set((state) => {
      const jobs = state.jobs.filter((job) => !['completed', 'cancelled'].includes(job.status))
      return { jobs, selectedId: jobs.some((job) => job.id === state.selectedId) ? state.selectedId : jobs[0]?.id }
    }),
  selectJob: (id) => set({ selectedId: id }),
  setOutputDirectory: (path) => set({ outputDirectory: path }),
  setQueueRunning: (queueRunning) => set({ queueRunning })
}))
