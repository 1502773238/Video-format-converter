import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileVideo2,
  FolderOpen,
  Gauge,
  Info,
  Layers3,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  UploadCloud,
  Video,
  X
} from 'lucide-react'
import type { PresetId, ToolchainStatus } from '../../shared/contracts'
import { conversionPresets, getPreset } from '../../shared/presets'
import { codecLabel, formatBytes, formatDuration, formatRate } from './format'
import { type ConversionJob, useAppStore } from './store'

const statusCopy: Record<ConversionJob['status'], string> = {
  loading: '正在读取',
  ready: '等待转换',
  converting: '正在转换',
  validating: '正在校验',
  completed: '转换完成',
  error: '需要处理',
  cancelled: '已取消'
}

function statusIcon(status: ConversionJob['status']) {
  if (status === 'completed') return <CheckCircle2 size={15} />
  if (status === 'error') return <CircleAlert size={15} />
  if (status === 'cancelled') return <Pause size={15} />
  if (['loading', 'converting', 'validating'].includes(status)) return <LoaderCircle className="spin" size={15} />
  return <span className="status-dot" />
}

export default function App() {
  const {
    jobs,
    selectedId,
    outputDirectory,
    queueRunning,
    addJobs,
    patchJob,
    removeJob,
    clearFinished,
    selectJob,
    setOutputDirectory,
    setQueueRunning
  } = useAppStore()
  const [isDragging, setDragging] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [toolchain, setToolchain] = useState<ToolchainStatus>({ ready: false })
  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0]
  const activeJob = jobs.find((job) => ['converting', 'validating'].includes(job.status))
  const completedCount = jobs.filter((job) => job.status === 'completed').length

  useEffect(() => {
    void window.frameFlow.getToolchainStatus().then(setToolchain)
    return window.frameFlow.onConversionProgress((progress) => {
      patchJob(progress.jobId, {
        progress: progress.percent,
        speed: progress.speed,
        outputPath: progress.outputPath,
        status: progress.phase === 'validating' ? 'validating' : 'converting'
      })
    })
  }, [patchJob])

  const importPaths = useCallback(
    async (paths: string[]) => {
      const created = addJobs(paths)
      await Promise.all(
        created.map(async (job) => {
          try {
            const media = await window.frameFlow.inspectMedia(job.inputPath)
            patchJob(job.id, { media, fileName: media.fileName, status: 'ready' })
          } catch (error) {
            patchJob(job.id, {
              status: 'error',
              error: error instanceof Error ? error.message : String(error)
            })
          }
        })
      )
    },
    [addJobs, patchJob]
  )

  const chooseFiles = async (): Promise<void> => importPaths(await window.frameFlow.chooseVideos())

  const startQueue = async (): Promise<void> => {
    if (queueRunning || !toolchain.ready) return
    setQueueRunning(true)
    try {
      const pending = useAppStore.getState().jobs.filter((job) => job.status === 'ready')
      for (const snapshot of pending) {
        const latest = useAppStore.getState().jobs.find((job) => job.id === snapshot.id)
        if (!latest || latest.status !== 'ready') continue
        selectJob(latest.id)
        patchJob(latest.id, { status: 'converting', progress: 0, error: undefined })
        try {
          const result = await window.frameFlow.startConversion({
            jobId: latest.id,
            inputPath: latest.inputPath,
            outputDirectory,
            presetId: latest.presetId
          })
          patchJob(latest.id, { status: 'completed', progress: 100, outputPath: result.outputPath })
        } catch (error) {
          const current = useAppStore.getState().jobs.find((job) => job.id === latest.id)
          if (current?.status !== 'cancelled') {
            patchJob(latest.id, {
              status: 'error',
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }
      }
    } finally {
      setQueueRunning(false)
    }
  }

  const cancelCurrent = async (): Promise<void> => {
    if (!activeJob) return
    patchJob(activeJob.id, { status: 'cancelled', progress: 0, speed: undefined })
    await window.frameFlow.cancelConversion(activeJob.id)
  }

  const readyCount = jobs.filter((job) => job.status === 'ready').length
  const selectedPreset = selected ? getPreset(selected.presetId) : conversionPresets[0]
  const canStart = toolchain.ready && readyCount > 0 && !queueRunning

  return (
    <div
      className={`app-shell ${isDragging ? 'is-dragging' : ''} ${!toolchain.ready && toolchain.error ? 'has-tool-alert' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        void importPaths(Array.from(event.dataTransfer.files).map(window.frameFlow.getPathForFile))
      }}
    >
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Video size={19} strokeWidth={2.4} /></span>
          <span>FrameFlow</span>
          <span className="version-pill">本地转换</span>
        </div>
        <div className="topbar-meta">
          <span className={`tool-status ${toolchain.ready ? 'ready' : 'warning'}`}>
            <span className="tool-dot" />
            {toolchain.ready ? 'FFmpeg 已就绪' : 'FFmpeg 不可用'}
          </span>
          <button className="icon-button" type="button" aria-label="设置（后续版本开放）" title="设置将在后续版本开放" disabled>
            <Settings2 size={18} />
          </button>
        </div>
      </header>

      {!toolchain.ready && toolchain.error && (
        <div className="tool-alert"><CircleAlert size={16} /><span>{toolchain.error}</span></div>
      )}

      {jobs.length === 0 ? (
        <main className="empty-stage">
          <section className="hero-copy">
            <span className="eyebrow"><Sparkles size={14} /> 清晰、安心地转换视频</span>
            <h1>不用研究参数，<br />把视频交给 FrameFlow。</h1>
            <p>所有处理都在本机完成。拖入视频，选择用途，然后开始转换。</p>
            <div className="feature-row">
              <span><Check size={15} /> 自动读取视频信息</span>
              <span><Check size={15} /> 批量任务队列</span>
              <span><Check size={15} /> 不上传云端</span>
            </div>
          </section>
          <button className="drop-zone" type="button" onClick={() => void chooseFiles()}>
            <span className="drop-visual"><UploadCloud size={34} /></span>
            <strong>{isDragging ? '松开鼠标即可添加' : '把视频拖到这里'}</strong>
            <span>或者点击选择视频文件</span>
            <small>支持 MP4、MOV、MKV、AVI、WebM 等常见格式</small>
          </button>
        </main>
      ) : (
        <main className="workspace">
          <aside className="queue-panel">
            <div className="panel-heading">
              <div><span className="section-kicker">任务队列</span><h2>{jobs.length} 个文件</h2></div>
              <button className="small-button" type="button" onClick={() => void chooseFiles()}><Plus size={15} />添加</button>
            </div>
            <div className="queue-list">
              {jobs.map((job) => (
                <button
                  className={`queue-item ${selected?.id === job.id ? 'selected' : ''}`}
                  type="button"
                  key={job.id}
                  onClick={() => selectJob(job.id)}
                >
                  <span className="queue-thumb">
                    {job.media?.thumbnailDataUrl ? <img src={job.media.thumbnailDataUrl} alt="" /> : <FileVideo2 size={22} />}
                  </span>
                  <span className="queue-copy">
                    <strong title={job.fileName}>{job.fileName}</strong>
                    <span className={`job-status status-${job.status}`}>{statusIcon(job.status)} {statusCopy[job.status]} {job.speed && `· ${job.speed}`}</span>
                    {['converting', 'validating', 'completed'].includes(job.status) && (
                      <span className="micro-progress"><i style={{ width: `${job.progress}%` }} /></span>
                    )}
                  </span>
                  {!['converting', 'validating'].includes(job.status) && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="remove-job"
                      aria-label={`移除 ${job.fileName}`}
                      onClick={(event) => { event.stopPropagation(); removeJob(job.id) }}
                      onKeyDown={(event) => { if (event.key === 'Enter') removeJob(job.id) }}
                    ><X size={14} /></span>
                  )}
                </button>
              ))}
            </div>
            <div className="queue-footer">
              <span>{completedCount ? `${completedCount} 个已完成` : '准备好后开始队列'}</span>
              {completedCount > 0 && <button type="button" onClick={clearFinished}>清除已完成</button>}
            </div>
          </aside>

          {selected && (
            <section className="editor-panel">
              <div className="media-header">
                <div className="preview-card">
                  {selected.media?.thumbnailDataUrl ? (
                    <img src={selected.media.thumbnailDataUrl} alt={`${selected.fileName} 缩略图`} />
                  ) : (
                    <div className="preview-placeholder">{selected.status === 'loading' ? <LoaderCircle className="spin" /> : <FileVideo2 />}</div>
                  )}
                  <span className="duration-chip">{selected.media ? formatDuration(selected.media.duration) : '--:--'}</span>
                </div>
                <div className="media-summary">
                  <span className="section-kicker">当前视频</span>
                  <h1 title={selected.fileName}>{selected.fileName}</h1>
                  {selected.media ? (
                    <>
                      <div className="summary-chips">
                        <span>{selected.media.width && selected.media.height ? `${selected.media.width} × ${selected.media.height}` : '未知分辨率'}</span>
                        <span>{selected.media.frameRate ? `${selected.media.frameRate.toFixed(2)} FPS` : '未知帧率'}</span>
                        <span>{formatBytes(selected.media.size)}</span>
                      </div>
                      <div className="media-facts">
                        <div><Video size={15} /><span>视频</span><strong>{codecLabel(selected.media.videoCodec)}</strong></div>
                        <div><Music2 size={15} /><span>音频</span><strong>{codecLabel(selected.media.audioCodec)}</strong></div>
                        <div><Gauge size={15} /><span>码率</span><strong>{formatRate(selected.media.bitRate)}</strong></div>
                        <div><Layers3 size={15} /><span>轨道</span><strong>{selected.media.audioTracks} 音频 · {selected.media.subtitleTracks} 字幕</strong></div>
                      </div>
                    </>
                  ) : (
                    <div className="loading-copy"><LoaderCircle className="spin" size={18} /> 正在读取视频信息和缩略图…</div>
                  )}
                </div>
              </div>

              <div className="section-block">
                <div className="section-title"><div><span className="step-number">1</span><span><b>选择转换用途</b><small>不确定时使用“通用 MP4”</small></span></div></div>
                <div className="preset-grid">
                  {conversionPresets.map((preset) => (
                    <button
                      type="button"
                      className={`preset-card ${selected.presetId === preset.id ? 'active' : ''}`}
                      key={preset.id}
                      aria-pressed={selected.presetId === preset.id}
                      disabled={queueRunning || selected.status === 'completed'}
                      onClick={() => patchJob(selected.id, { presetId: preset.id as PresetId })}
                    >
                      <span className="preset-top"><strong>{preset.label}</strong><em>{preset.badge}</em></span>
                      <span>{preset.description}</span>
                      {selected.presetId === preset.id && <i><Check size={13} /></i>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="section-block compact">
                <div className="section-title"><div><span className="step-number">2</span><span><b>确认输出位置</b><small>{outputDirectory ?? '默认保存到源文件所在文件夹'}</small></span></div></div>
                <button className="outline-button" type="button" onClick={async () => setOutputDirectory(await window.frameFlow.chooseOutputDirectory())}>
                  <FolderOpen size={16} /> {outputDirectory ? '更换文件夹' : '选择文件夹'}
                </button>
              </div>

              <button className={`advanced-toggle ${advancedOpen ? 'open' : ''}`} type="button" onClick={() => setAdvancedOpen((open) => !open)}>
                <span><Settings2 size={15} /> 高级信息</span><ChevronDown size={16} />
              </button>
              {advancedOpen && (
                <div className="advanced-panel">
                  <div><span>输出格式</span><strong>{selectedPreset.extension.toUpperCase()}</strong></div>
                  <div><span>处理方式</span><strong>{selectedPreset.shortLabel}</strong></div>
                  <code>ffmpeg … {selectedPreset.args.join(' ')} …</code>
                </div>
              )}

              {selected.error && <div className="error-card"><CircleAlert size={18} /><div><strong>这个任务没有完成</strong><span>{selected.error}</span></div><button type="button" onClick={() => patchJob(selected.id, { status: 'ready', error: undefined })}><RotateCcw size={14} />重试</button></div>}
              {selected.status === 'completed' && selected.outputPath && (
                <div className="success-card"><CheckCircle2 size={20} /><div><strong>转换完成</strong><span title={selected.outputPath}>{selected.outputPath}</span></div><button type="button" onClick={() => window.frameFlow.showItemInFolder(selected.outputPath!)}>打开位置</button></div>
              )}
            </section>
          )}
        </main>
      )}

      <footer className="action-bar">
        <div className="action-summary">
          {jobs.length === 0 ? <><Info size={16} /><span>视频只在你的电脑上处理</span></> : <><span className="summary-icon"><FileVideo2 size={16} /></span><span><strong>{readyCount}</strong> 个等待 · <strong>{completedCount}</strong> 个完成</span></>}
        </div>
        {queueRunning ? (
          <button className="danger-button" type="button" onClick={() => void cancelCurrent()} disabled={!activeJob}><Pause size={17} />取消当前任务</button>
        ) : (
          <button className="primary-button" type="button" onClick={() => void startQueue()} disabled={!canStart}>
            <Play size={17} fill="currentColor" />{readyCount > 1 ? `开始转换 ${readyCount} 个文件` : '开始转换'}
          </button>
        )}
      </footer>

      {isDragging && <div className="drag-overlay"><UploadCloud size={42} /><strong>松开以添加视频</strong><span>可以一次添加多个文件</span></div>}
    </div>
  )
}
