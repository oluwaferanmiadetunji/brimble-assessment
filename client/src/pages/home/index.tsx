
import * as React from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  createDeployment,
  createDeploymentFromUpload,
  getDeployment,
  listDeployments,
  streamDeploymentLogs,
} from '../../api/deployments'
import { type Deployment, type DeploymentLog, type DeploymentLogStage, type DeploymentStatus } from './types'
import { deploymentIdFromHash, toTemplateDeployment, toTemplateLog, hrefForPublicUrl, IconifyIcon } from './_components/helpers'
import RecentDeployments from './_components/RecentDeployments'

export default function Page() {
  const queryClient = useQueryClient()

  const [limit] = React.useState(20)
  const [offset] = React.useState(0)
  const [repoUrl, setRepoUrl] = React.useState('')

  const failureToastedRef = React.useRef<Set<number>>(new Set())

  const deploymentsQ = useQuery({
    queryKey: ['deployments', limit, offset],
    queryFn: () => listDeployments({ limit, offset }),
  })

  const deploymentsRef = useRef<Deployment[]>([])
  const [deployments, setDeployments] = React.useState<Deployment[]>([])

  const [selectedNumericId, setSelectedNumericId] = React.useState<number | null>(() => deploymentIdFromHash())
  const [selectedId, setSelectedId] = React.useState<string | null>(selectedNumericId ? `dep-${selectedNumericId}` : null)
  const selectedIdRef = useRef<string | null>(selectedNumericId ? `dep-${selectedNumericId}` : null)
  const autoScrollRef = useRef(true)

  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const logsBodyRef = React.useRef<HTMLDivElement | null>(null)

  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [overlayVisible, setOverlayVisible] = React.useState(false)
  const [showScrollToBottom, setShowScrollToBottom] = React.useState(false)

  const [logsView, setLogsView] = React.useState<DeploymentLog[]>([])

  const selectedDeploymentQ = useQuery({
    queryKey: ['deployment', selectedNumericId],
    queryFn: () => getDeployment(selectedNumericId as number),
    enabled: selectedNumericId != null,
  })

  const liveIdsRef = React.useRef<Set<number>>(new Set())

  useEffect(() => {
    liveIdsRef.current = new Set()
    if (selectedNumericId == null) return
    const sseStartedAtMs = Date.now()
    const cleanup = streamDeploymentLogs(selectedNumericId, (log) => {
      if (liveIdsRef.current.has(log.id)) return
      liveIdsRef.current.add(log.id)

      const looksTerminalFailure =
        log.level === 'error' || (log.stage === 'runtime' && /failed|exited with code|error/i.test(log.message))
      const looksTerminalSuccess =
        log.stage === 'runtime' && /deployment running/i.test(log.message)


      const createdAtMs = Date.parse(log.created_at)
      const isNewEnough = Number.isFinite(createdAtMs) ? createdAtMs >= sseStartedAtMs - 1_000 : true

      if (looksTerminalFailure || looksTerminalSuccess) {
        void queryClient.invalidateQueries({ queryKey: ['deployment', selectedNumericId] })
        void queryClient.invalidateQueries({ queryKey: ['deployments', limit, offset] })
      }

      if (looksTerminalFailure && isNewEnough) {
        const depId = log.deployment_id
        if (!failureToastedRef.current.has(depId)) {
          failureToastedRef.current.add(depId)
          toast.error('Deployment failed')
        }
      }

      const templateLog = toTemplateLog(log)
      const depId = `dep-${log.deployment_id}`
      const dep = deploymentsRef.current.find((d) => d.id === depId)
      if (dep) {
        dep.logs.push(templateLog)
        if (selectedIdRef.current === depId) setLogsView((prev) => [...prev, templateLog])
      }
    })
    return cleanup

  }, [selectedNumericId, queryClient, limit, offset])

  const createMut = useMutation({
    mutationFn: createDeployment,
    onSuccess: async (dep) => {
      await queryClient.invalidateQueries({ queryKey: ['deployments'] })
      const id = `dep-${dep.id}`
      selectedIdRef.current = id
      setSelectedId(id)
      setSelectedNumericId(dep.id)
      setOverlayVisible(true)
      setDrawerOpen(true)
      setRepoUrl('')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
  })

  const uploadMut = useMutation({
    mutationFn: createDeploymentFromUpload,
    onSuccess: async (dep) => {
      await queryClient.invalidateQueries({ queryKey: ['deployments'] })
      const id = `dep-${dep.id}`
      selectedIdRef.current = id
      setSelectedId(id)
      setSelectedNumericId(dep.id)
      setOverlayVisible(true)
      setDrawerOpen(true)
      
      setRepoUrl('')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    },
  })

  function normalizeRepoUrlForUi(raw: string) {
    const trimmed = raw.trim().replace(/\/+$/, '')
    const m = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
    if (m) return `https://github.com/${m[1]}/${m[2]}.git`
    return trimmed
  }

  function isValidRepoUrl(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return false
    if (trimmed.startsWith('https://')) return true
    if (/^git@github\.com:[^/]+\/.+?(\.git)?$/.test(trimmed)) return true
    return false
  }

  const statusConfig = useMemo(
    () => ({
      pending: {
        classes: 'bg-zinc-100 text-zinc-600 border-zinc-200',
        badgeClasses: 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20',
        icon: '<iconify-icon icon="solar:clock-circle-linear" class="text-zinc-500"></iconify-icon>',
        label: 'Pending',
      },
      building: {
        classes: 'bg-blue-50 text-blue-700 border-blue-200/60',
        badgeClasses: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
        icon: '<iconify-icon icon="solar:record-circle-linear" class="animate-pulse text-blue-500"></iconify-icon>',
        label: 'Building',
      },
      deploying: {
        classes: 'bg-purple-50 text-purple-700 border-purple-200/60',
        badgeClasses: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
        icon: '<iconify-icon icon="solar:restart-linear" class="animate-spin text-purple-500"></iconify-icon>',
        label: 'Deploying',
      },
      running: {
        classes: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
        badgeClasses: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
        icon: '<span class="w-2 h-2 rounded-full bg-emerald-500"></span>',
        label: 'Running',
      },
      failed: {
        classes: 'bg-red-50 text-red-700 border-red-200/60',
        badgeClasses: 'bg-red-500/10 text-red-400 border border-red-500/20',
        icon: '<span class="w-2 h-2 rounded-full bg-red-500"></span>',
        label: 'Failed',
      },
    }),
    [],
  )

  const stageColors = useMemo(
    () => ({
      SYSTEM: 'text-zinc-500',
      BUILD: 'text-blue-400',
      IMAGE: 'text-purple-400',
      CADDY: 'text-yellow-400',
      DEPLOY: 'text-cyan-400',
      RUNTIME: 'text-emerald-400',
    }),
    [],
  )

  function scrollToBottom(force = false) {
    const bodyEl = logsBodyRef.current
    if (!bodyEl) return
    if (autoScrollRef.current || force) {
      bodyEl.scrollTop = bodyEl.scrollHeight
      if (force) {
        autoScrollRef.current = true
        setShowScrollToBottom(false)
      }
    }
  }

  function openDrawer(id: string) {
    selectedIdRef.current = id
    setSelectedId(id)

    const dep = deployments.find((d) => d.id === id)
    if (!dep) {

      setOverlayVisible(true)
      setDrawerOpen(true)
      return
    }

    const numeric = Number.parseInt(id.replace(/^dep-/, ''), 10)
    if (Number.isFinite(numeric)) {
      setSelectedNumericId(numeric)
    }
    setOverlayVisible(true)
    setDrawerOpen(true)
  }

  function closeDrawer() {
    selectedIdRef.current = null
    setSelectedId(null)
    setSelectedNumericId(null)
    setDrawerOpen(false)
    window.setTimeout(() => setOverlayVisible(false), 300)
  }


  function handleDeploy(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (selectedFile) {
      uploadMut.mutate(selectedFile)
      return
    }

    const urlInput = normalizeRepoUrlForUi(repoUrl)
    if (urlInput) createMut.mutate({ source_type: 'git', source_url: urlInput })
  }

  useEffect(() => {
    const onHash = () => {
      const id = deploymentIdFromHash()
      setSelectedNumericId(id)
      if (id != null) {
        const str = `dep-${id}`
        selectedIdRef.current = str
        setSelectedId(str)
        setOverlayVisible(true)
        setDrawerOpen(true)
      }
    }
    window.addEventListener('hashchange', onHash)
    onHash()

    return () => {
      window.removeEventListener('hashchange', onHash)
    }

  }, [])

  useEffect(() => {
    deploymentsRef.current = (deploymentsQ.data?.items ?? []).map(toTemplateDeployment)
    setDeployments(deploymentsRef.current)
  }, [deploymentsQ.data?.items])

  useEffect(() => {
    if (!selectedDeploymentQ.data) return
    const dep = toTemplateDeployment(selectedDeploymentQ.data.deployment)
    dep.logs = selectedDeploymentQ.data.logs.map(toTemplateLog)

    const idx = deploymentsRef.current.findIndex((d) => d.id === dep.id)
    if (idx >= 0) deploymentsRef.current[idx] = { ...deploymentsRef.current[idx], ...dep }
    else deploymentsRef.current.unshift(dep)

    if (selectedIdRef.current === dep.id) {
      autoScrollRef.current = true
      setShowScrollToBottom(false)
      setLogsView(dep.logs)
      scrollToBottom(true)
    }

  }, [selectedDeploymentQ.data])

  const selectedDep: Deployment | null = useMemo(() => {
    if (!selectedId) return null
    return deployments.find((d) => d.id === selectedId) ?? null
  }, [deployments, selectedId])

  const connection = useMemo(() => {
    const status = selectedDep?.status
    const connected = status != null && ['pending', 'building', 'deploying'].includes(status)
    return {
      text: connected ? 'Connected' : 'Disconnected',
      color: connected ? ('emerald' as const) : ('zinc' as const),
      ping: connected,
    }
  }, [selectedDep?.status])

  const progress = useMemo(() => {
    const status = selectedDep?.status
    const active = status != null && ['building', 'deploying', 'running'].includes(status)
    const steps: DeploymentStatus[] = ['building', 'deploying', 'running']
    const currentIndex = status ? steps.indexOf(status) : -1
    return { active, steps, currentIndex, status }
  }, [selectedDep?.status])

  const selectedApiDep = selectedDeploymentQ.data?.deployment ?? null

  const [nowMs, setNowMs] = React.useState(() => Date.now())
  useEffect(() => {
    if (!drawerOpen) return
    if (!selectedApiDep) return
    
    if (selectedApiDep.status === 'failed') return
    if (selectedApiDep.finished_at) return
    const t = window.setInterval(() => setNowMs(Date.now()), 1_000)
    return () => window.clearInterval(t)
  }, [drawerOpen, selectedApiDep])

  const durationText = useMemo(() => {
    const dep = selectedApiDep
    if (!dep) return ''

    const parse = (s: string | null | undefined) => {
      if (!s) return null
      const ms = Date.parse(s)
      return Number.isFinite(ms) ? ms : null
    }

    const created = parse(dep.created_at)
    const started = parse(dep.started_at)
    const finished = parse(dep.finished_at)

    const end = finished ?? nowMs
    const start = dep.status === 'running' && started != null ? started : created
    if (start == null) return ''

    const delta = Math.max(0, end - start)
    const s = Math.floor(delta / 1000)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    const fmt = h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`

    if (dep.status === 'failed') return `Failed after ${fmt}`
    if (dep.status === 'running') return `Running for ${fmt}`
    return `Elapsed ${fmt}`
  }, [selectedApiDep, nowMs])

  useEffect(() => {
    if (drawerOpen) document.body.classList.add('overflow-hidden')
    else document.body.classList.remove('overflow-hidden')
  }, [drawerOpen])

  useEffect(() => {
    const currentHash = window.location.hash
    if (selectedNumericId == null) {

      if (currentHash.startsWith('#deployment-')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
      return
    }

    const desired = `#deployment-${selectedNumericId}`
    if (currentHash !== desired) window.history.replaceState(null, '', desired)
  }, [selectedNumericId])

  useEffect(() => {
    if (!drawerOpen) return
    if (!autoScrollRef.current) return
    scrollToBottom()

  }, [drawerOpen, logsView.length])

  const onLogsScroll = React.useCallback(() => {
    const bodyEl = logsBodyRef.current
    if (!bodyEl) return
    const isAtBottom = Math.abs(bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight) < 10
    autoScrollRef.current = isAtBottom
    setShowScrollToBottom(!isAtBottom)
  }, [])

  return (
    <div
      className="bg-[#fafafa] text-zinc-900 antialiased selection:bg-zinc-200 overflow-y-scroll min-h-screen"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        .cursor-blink { animation: blink 1s step-end infinite; }
      `}</style>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 lg:py-8 min-h-screen flex flex-col relative z-10">
        <header className="flex items-center justify-between mb-8 pb-4 border-b border-zinc-200/60 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-zinc-900 rounded-md flex items-center justify-center shadow-sm">
              <IconifyIcon icon="solar:rocket-linear" className="text-white text-sm" strokeWidth="1.5" />
            </div>
            <h1 className="text-base font-semibold tracking-tight">Brimble</h1>
          </div>

        </header>

        <div className="flex flex-col gap-8 flex-1">
          <section className="bg-white border border-zinc-200/80 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-zinc-900">New Deployment</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Deploy a project by connecting a Git repository or uploading a directory.
                </p>
              </div>
              <IconifyIcon
                icon="solar:widget-add-linear"
                className="text-zinc-400 text-lg hidden sm:block"
                strokeWidth="1.5"
              />
            </div>
            <div className="p-5">
              <form id="deploy-form" className="space-y-5" onSubmit={handleDeploy}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
                  <div className="relative flex items-center w-full">
                    <div className="absolute left-3 flex items-center justify-center text-zinc-400">
                      <IconifyIcon icon="solar:link-linear" className="text-base" strokeWidth="1.5" />
                    </div>
                    <input
                      type="text"
                      id="repo-url"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="https://github.com/user/repo or git@github.com:user/repo.git"
                      value={repoUrl}
                      onChange={(e) => {
                        setRepoUrl(e.target.value)
                        if (isValidRepoUrl(e.target.value) && selectedFile) {
                          setSelectedFile(null)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }
                      }}
                      disabled={selectedFile != null}
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow placeholder:text-zinc-400 text-zinc-900"
                    />
                  </div>

                  <div
                    className={`flex items-center justify-center px-4 py-2 border border-dashed border-zinc-300 rounded-lg bg-zinc-50/30 transition-colors group w-full ${
                      isValidRepoUrl(repoUrl) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-zinc-50 hover:border-zinc-400'
                    }`}
                    onClick={() => {
                      if (isValidRepoUrl(repoUrl)) {
                        toast.error('Clear the repo URL to upload a file')
                        return
                      }
                      if (!fileInputRef.current) return
                      fileInputRef.current.click()
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".zip,.tar.gz,.tgz"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null
                        if (!f) return
                        if (repoUrl.trim()) setRepoUrl('')

                        const name = f.name.toLowerCase()
                        const okExt = name.endsWith('.zip') || name.endsWith('.tar.gz') || name.endsWith('.tgz')
                        if (!okExt) {
                          toast.error('Only .zip, .tar.gz, or .tgz files are supported')
                          e.target.value = ''
                          return
                        }
                        const max = 200 * 1024 * 1024
                        if (f.size > max) {
                          toast.error('File too large (max 200MB)')
                          e.target.value = ''
                          return
                        }
                        setSelectedFile(f)
                      }}
                      disabled={isValidRepoUrl(repoUrl)}
                    />
                    <IconifyIcon
                      icon="solar:folder-with-files-linear"
                      className="text-zinc-400 group-hover:text-zinc-600 transition-colors mr-2"
                      strokeWidth="1.5"
                    />
                    <span className="text-xs text-zinc-600 font-medium">Upload ZIP or TAR.GZ</span>
                  </div>
                </div>

                {selectedFile ? (
                  <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200/80">
                    <div className="min-w-0 flex items-center gap-2">
                      <IconifyIcon icon="solar:file-text-linear" className="text-zinc-500 text-base shrink-0" strokeWidth="1.5" />
                      <div className="min-w-0 flex flex-col">
                        <span className="text-xs font-medium text-zinc-800 truncate">{selectedFile.name}</span>
                        <span className="text-[11px] text-zinc-500">
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 bg-white border border-zinc-200 px-2.5 py-1.5 rounded-lg shadow-sm hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
                      onClick={() => {
                        setSelectedFile(null)
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                    >
                      <IconifyIcon icon="solar:trash-bin-trash-linear" strokeWidth="1.5" />
                      Clear
                    </button>
                  </div>
                ) : null}

                <div className="flex justify-end pt-2 border-t border-zinc-100">
                  <button
                    type="submit"
                    className="inline-flex justify-center items-center gap-2 px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 transition-all shadow-sm"
                  >
                    Deploy Project
                  </button>
                </div>
              </form>
            </div>
          </section>

          {deployments && deployments.length > 0 && <RecentDeployments deployments={deployments} statusConfig={statusConfig} openDrawer={openDrawer} />}
        </div>
      </div>

      <div
        id="drawer-overlay"
        onClick={closeDrawer}
        className={`fixed inset-0 bg-zinc-900/20 backdrop-blur-sm z-40 transition-opacity duration-300 ${overlayVisible ? '' : 'hidden'
          } ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
      />

      <div
        id="logs-drawer"
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-[#0a0a0a] shadow-2xl transform transition-transform duration-300 flex flex-col border-l border-zinc-800 font-mono text-xs will-change-transform ${drawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        <div className="flex flex-col px-5 py-4 border-b border-zinc-800/80 bg-[#121212] shrink-0 z-20 shadow-sm relative gap-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2.5">
                  <span id="logs-deployment-name" className="text-zinc-100 tracking-tight font-medium text-sm font-sans">
                    {selectedDep?.name ?? ''}
                  </span>
                  <span id="logs-version-tag" className="px-1.5 py-0.5 rounded-md bg-zinc-800/80 text-zinc-400 font-mono text-[10px] tracking-tight">
                    {selectedDep?.version ?? ''}
                  </span>
                  <div id="logs-header-badge">
                    {selectedDep ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold font-sans uppercase tracking-widest ${statusConfig[selectedDep.status].badgeClasses
                          }`}
                      >
                        {selectedDep.status}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs font-sans text-zinc-500">
                  <div className="flex items-center gap-1.5 select-none">
                    <span id="logs-conn-indicator" className="relative flex h-2 w-2">
                      {connection.ping ? (
                        <>
                          <span
                            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${connection.color === 'emerald' ? 'bg-emerald-500' : 'bg-zinc-500'
                              } opacity-75`}
                          />
                          <span
                            className={`relative inline-flex rounded-full h-2 w-2 ${connection.color === 'emerald' ? 'bg-emerald-500' : 'bg-zinc-500'
                              }`}
                          />
                        </>
                      ) : (
                        <span
                          className={`relative inline-flex rounded-full h-2 w-2 ${connection.color === 'emerald' ? 'bg-emerald-500' : 'bg-zinc-500'
                            }`}
                        />
                      )}
                    </span>
                    <span id="logs-conn-text">{connection.text}</span>
                  </div>
                  {durationText ? (
                    <>
                      <span className="w-0.5 h-0.5 rounded-full bg-zinc-600/70" />
                      <span id="logs-duration">{durationText}</span>
                    </>
                  ) : null}
                  <div id="logs-divider" className={`h-3 w-px bg-zinc-800 ${selectedDep?.url ? '' : 'hidden'}`} />
                  {selectedDep?.url ? (
                    <a
                      id="logs-live-url"
                      href={hrefForPublicUrl(selectedDep.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span id="logs-live-url-text">{selectedDep.url}</span>
                      <IconifyIcon icon="solar:external-link-linear" strokeWidth="1.5" />
                    </a>
                  ) : (
                    <a
                      id="logs-live-url"
                      href="#"
                      target="_blank"
                      rel="noreferrer"
                      className="hidden items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      <span id="logs-live-url-text" />
                      <IconifyIcon icon="solar:external-link-linear" strokeWidth="1.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={closeDrawer}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-md hover:bg-zinc-800/50"
            >
              <IconifyIcon icon="solar:close-square-linear" className="text-xl block" />
            </button>
          </div>

          <div
            id="logs-progress-hint"
            className={`${progress.active ? 'flex' : 'hidden'} items-center gap-2.5 pt-3 border-t border-zinc-800/50 text-[11px] font-sans text-zinc-500 w-full`}
          >
            {(() => {
              const status = progress.status
              const steps: DeploymentStatus[] = ['building', 'deploying', 'running']
              const currentIndex = status ? steps.indexOf(status) : -1

              const stepView = (step: DeploymentStatus, idx: number) => {
                const completed = idx < currentIndex || (idx === 2 && status === 'running')
                const current = idx === currentIndex && !completed

                const classes = completed
                  ? 'flex items-center gap-1.5 text-emerald-500/80 font-medium transition-colors'
                  : current
                    ? 'flex items-center gap-1.5 text-zinc-200 font-medium transition-colors'
                    : 'flex items-center gap-1.5 text-zinc-600 transition-colors'

                const icon =
                  completed
                    ? 'solar:check-circle-linear'
                    : step === 'deploying' && current
                      ? 'solar:restart-linear'
                      : 'solar:record-circle-linear'

                const iconClass =
                  `status-icon text-sm` +
                  (current && step === 'building' ? ' animate-pulse' : '') +
                  (current && step === 'deploying' ? ' animate-spin' : '')

                const label = step === 'building' ? 'Building' : step === 'deploying' ? 'Deploying' : 'Running'

                return (
                  <div className={classes} id={`progress-${step}`} key={step}>
                    <IconifyIcon icon={icon} className={iconClass} /> {label}
                  </div>
                )
              }

              return (
                <>
                  {stepView('building', 0)}
                  <div className="w-6 h-px bg-zinc-800 rounded" />
                  {stepView('deploying', 1)}
                  <div className="w-6 h-px bg-zinc-800 rounded" />
                  {stepView('running', 2)}
                </>
              )
            })()}
          </div>
        </div>

        <div
          id="logs-body"
          ref={logsBodyRef}
          onScroll={onLogsScroll}
          className="flex-1 p-5 overflow-y-auto leading-relaxed custom-scrollbar bg-[#0a0a0a] relative scroll-smooth"
        >
          <div id="logs-container" className="space-y-1 pb-2">
            {(() => {
              let prevStage: DeploymentLogStage | null = null
              const out: React.ReactNode[] = []

              logsView.forEach((log, idx) => {
                if (prevStage && prevStage !== log.stage) {
                  out.push(<div key={`divider-${idx}`} className="w-full h-px bg-zinc-800/40 my-2 rounded" />)
                }
                prevStage = log.stage

                const stageColor = stageColors[log.stage] || 'text-zinc-400'
                out.push(
                  <div
                    key={`log-${idx}`}
                    className="flex items-start gap-3 hover:bg-zinc-800/40 px-1 -mx-1 rounded transition-colors group"
                  >
                    <span className="text-zinc-600 shrink-0 select-none opacity-50 group-hover:opacity-100 transition-opacity">
                      {log.time}
                    </span>
                    <span className={`${stageColor} shrink-0 w-[55px]`}>[{log.stage}]</span>
                    <span className="text-zinc-300 break-all">{log.msg}</span>
                  </div>,
                )
              })

              return out
            })()}
          </div>
          <div className="flex items-start gap-3 mt-1 h-5">
            <span
              id="logs-cursor"
              className={`w-2 h-3.5 bg-zinc-500 cursor-blink ${selectedDep && ['pending', 'building', 'deploying'].includes(selectedDep.status) ? '' : 'hidden'
                }`}
            />
          </div>
        </div>

        <button
          id="scroll-to-bottom"
          onClick={() => scrollToBottom(true)}
          className={`${showScrollToBottom ? '' : 'hidden'} absolute bottom-6 right-6 p-2 bg-zinc-800 text-zinc-300 rounded-full shadow-lg border border-zinc-700/50 hover:bg-zinc-700 hover:text-white transition-all z-20 focus:outline-none`}
        >
          <IconifyIcon icon="solar:arrow-down-linear" className="text-base block" strokeWidth="2" />
        </button>
      </div>
    </div>
  )
}



