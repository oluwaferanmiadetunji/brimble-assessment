
import * as React from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createDeployment,
  getDeployment,
  listDeployments,
  streamDeploymentLogs,
  type Deployment as ApiDeployment,
  type DeploymentLog as ApiDeploymentLog,
} from '../api/deployments'

type DeploymentStatus = 'pending' | 'building' | 'deploying' | 'running' | 'failed'

type DeploymentLogStage = 'SYSTEM' | 'BUILD' | 'IMAGE' | 'CADDY' | 'DEPLOY' | 'RUNTIME'

type DeploymentLog = {
  time: string
  stage: DeploymentLogStage
  msg: string
}

type Deployment = {
  id: string
  name: string
  shortId: string
  sourceType: string
  sourceIcon: string
  time: string
  version: string
  status: DeploymentStatus
  url: string | null
  logs: DeploymentLog[]
}

function deploymentIdFromHash() {
  const m = window.location.hash.match(/#deployment-(\d+)/)
  return m ? Number(m[1]) : null
}

function toTemplateDeployment(dep: ApiDeployment): Deployment {
  const name =
    dep.source_url?.split('/').filter(Boolean).pop() ??
    (dep.source_type === 'upload' ? 'manual-upload' : `dep-${dep.id}`)

  return {
    id: `dep-${dep.id}`,
    name,
    shortId: `#${dep.id}`,
    sourceType: dep.source_type === 'git' ? 'main' : 'manual upload',
    sourceIcon: 'solar:branch-linear',
    time: new Date(dep.created_at).toLocaleString(),
    version: dep.image_tag,
    status: dep.status,
    url: dep.public_url ? dep.public_url.replace(/^https?:\/\//, '') : null,
    logs: [],
  }
}

function toTemplateLog(row: ApiDeploymentLog): DeploymentLog {
  const stageMap: Record<string, DeploymentLogStage> = {
    queued: 'SYSTEM',
    build: 'BUILD',
    run: 'DEPLOY',
    caddy: 'CADDY',
    runtime: 'RUNTIME',
  }
  return {
    time: new Date(row.created_at).toLocaleTimeString(),
    stage: stageMap[row.stage ?? ''] ?? 'SYSTEM',
    msg: row.message,
  }
}

function IconifyIcon(
  props: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
    icon: string
    strokeWidth?: number | string
    ['stroke-width']?: number | string
  } & { className?: string },
) {
  const { className, strokeWidth, ...rest } = props
  const finalProps: Record<string, unknown> = { ...rest }
  if (className) finalProps.class = className
  if (strokeWidth != null) finalProps['stroke-width'] = strokeWidth
  return React.createElement('iconify-icon', finalProps as unknown as React.HTMLAttributes<HTMLElement>)
}

function loadScriptOnce(src: string) {
  const existing = document.querySelector(`script[src="${CSS.escape(src)}"]`)
  if (existing) return
  const s = document.createElement('script')
  s.src = src
  s.async = true
  document.head.appendChild(s)
}

function loadStylesheetOnce(href: string, attrs?: Record<string, string>) {
  const existing = document.querySelector(`link[href="${CSS.escape(href)}"]`)
  if (existing) return
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = href
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => l.setAttribute(k, v))
  }
  document.head.appendChild(l)
}

function loadPreconnectOnce(href: string, crossOrigin?: string) {
  const existing = document.querySelector(`link[rel="preconnect"][href="${CSS.escape(href)}"]`)
  if (existing) return
  const l = document.createElement('link')
  l.rel = 'preconnect'
  l.href = href
  if (crossOrigin) l.setAttribute('crossorigin', crossOrigin)
  document.head.appendChild(l)
}

function App() {
  const queryClient = useQueryClient()

  const [limit] = React.useState(20)
  const [offset] = React.useState(0)

  const deploymentsQ = useQuery({
    queryKey: ['deployments', limit, offset],
    queryFn: () => listDeployments({ limit, offset }),
  })

  const deploymentsRef = useRef<Deployment[]>([])

  const [selectedNumericId, setSelectedNumericId] = React.useState<number | null>(() => deploymentIdFromHash())
  const selectedIdRef = useRef<string | null>(selectedNumericId ? `dep-${selectedNumericId}` : null)
  const currentStageRef = useRef<DeploymentLogStage | null>(null)
  const autoScrollRef = useRef(true)

  const uploadPathRef = React.useRef<string>('')

  const selectedDeploymentQ = useQuery({
    queryKey: ['deployment', selectedNumericId],
    queryFn: () => getDeployment(selectedNumericId as number),
    enabled: selectedNumericId != null,
  })

  const liveIdsRef = React.useRef<Set<number>>(new Set())

  useEffect(() => {
    liveIdsRef.current = new Set()
    if (selectedNumericId == null) return
    const cleanup = streamDeploymentLogs(selectedNumericId, (log) => {
      if (liveIdsRef.current.has(log.id)) return
      liveIdsRef.current.add(log.id)

      const templateLog = toTemplateLog(log)
      const depId = `dep-${log.deployment_id}`
      const dep = deploymentsRef.current.find((d) => d.id === depId)
      if (dep) {
        dep.logs.push(templateLog)
        if (selectedIdRef.current === depId) {
          const container = document.getElementById('logs-container')
          if (container) appendLogLine(templateLog, container)
          if (autoScrollRef.current) scrollToBottom()
        }
      }
    })
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNumericId])

  const createMut = useMutation({
    mutationFn: createDeployment,
    onSuccess: async (dep) => {
      await queryClient.invalidateQueries({ queryKey: ['deployments'] })
      window.location.hash = `deployment-${dep.id}`
      openDrawer(`dep-${dep.id}`)
    },
  })

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
    const bodyEl = document.getElementById('logs-body')
    const scrollBtn = document.getElementById('scroll-to-bottom')
    if (!bodyEl || !scrollBtn) return
    if (autoScrollRef.current || force) {
      bodyEl.scrollTop = bodyEl.scrollHeight
      if (force) {
        autoScrollRef.current = true
        scrollBtn.classList.add('hidden')
      }
    }
  }

  function setConnectionStatus(text: string, color: 'emerald' | 'zinc', ping = true) {
    const indicator = document.getElementById('logs-conn-indicator')
    const textEl = document.getElementById('logs-conn-text')
    if (!indicator || !textEl) return
    textEl.textContent = text

    const colorClass = color === 'emerald' ? 'bg-emerald-500' : 'bg-zinc-500'
    if (ping) {
      indicator.innerHTML = `
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${colorClass} opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2 w-2 ${colorClass}"></span>
      `
    } else {
      indicator.innerHTML = `<span class="relative inline-flex rounded-full h-2 w-2 ${colorClass}"></span>`
    }
  }

  function updateProgressHint(status: DeploymentStatus) {
    const hintContainer = document.getElementById('logs-progress-hint')
    if (!hintContainer) return
    const activeDeployments: DeploymentStatus[] = ['building', 'deploying', 'running']

    if (activeDeployments.includes(status)) {
      hintContainer.classList.remove('hidden')
      hintContainer.classList.add('flex')

      const steps: DeploymentStatus[] = ['building', 'deploying', 'running']
      const currentIndex = steps.indexOf(status)

      steps.forEach((step, idx) => {
        const el = document.getElementById(`progress-${step}`)
        if (!el) return
        const iconEl = el.querySelector('.status-icon') as HTMLElement | null
        if (!iconEl) return

        iconEl.classList.remove('animate-pulse', 'animate-spin')

        if (idx < currentIndex || (idx === 2 && status === 'running')) {
          el.className = 'flex items-center gap-1.5 text-emerald-500/80 font-medium transition-colors'
          iconEl.setAttribute('icon', 'solar:check-circle-linear')
        } else if (idx === currentIndex) {
          el.className = 'flex items-center gap-1.5 text-zinc-200 font-medium transition-colors'
          if (step === 'building') {
            iconEl.setAttribute('icon', 'solar:record-circle-linear')
            iconEl.classList.add('animate-pulse')
          } else if (step === 'deploying') {
            iconEl.setAttribute('icon', 'solar:restart-linear')
            iconEl.classList.add('animate-spin')
          }
        } else {
          el.className = 'flex items-center gap-1.5 text-zinc-600 transition-colors'
          iconEl.setAttribute('icon', 'solar:record-circle-linear')
        }
      })
    } else {
      hintContainer.classList.add('hidden')
      hintContainer.classList.remove('flex')
    }
  }

  function updateCursorAndConnection(dep: Deployment) {
    const cursorEl = document.getElementById('logs-cursor')
    if (!cursorEl) return
    if (['pending', 'building', 'deploying'].includes(dep.status)) {
      cursorEl.classList.remove('hidden')
      setConnectionStatus('Connected', 'emerald')
    } else {
      cursorEl.classList.add('hidden')
      setConnectionStatus('Disconnected', 'zinc', false)
    }
  }

  function appendLogLine(log: DeploymentLog, container: HTMLElement) {
    if (currentStageRef.current && currentStageRef.current !== log.stage) {
      const divider = document.createElement('div')
      divider.className = 'w-full h-px bg-zinc-800/40 my-2 rounded'
      container.appendChild(divider)
    }
    currentStageRef.current = log.stage

    const stageColor = stageColors[log.stage] || 'text-zinc-400'
    const line = document.createElement('div')
    line.className =
      'flex items-start gap-3 hover:bg-zinc-800/40 px-1 -mx-1 rounded transition-colors group'
    line.innerHTML = `
      <span class="text-zinc-600 shrink-0 select-none opacity-50 group-hover:opacity-100 transition-opacity">${log.time}</span>
      <span class="${stageColor} shrink-0 w-[55px]">[${log.stage}]</span>
      <span class="text-zinc-300 break-all">${log.msg}</span>
    `
    container.appendChild(line)
  }

  function updateDrawerHeader(dep: Deployment) {
    const config = statusConfig[dep.status]
    const nameEl = document.getElementById('logs-deployment-name')
    const versionEl = document.getElementById('logs-version-tag')
    const badgeEl = document.getElementById('logs-header-badge')
    if (nameEl) nameEl.textContent = dep.name
    if (versionEl) versionEl.textContent = dep.version
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold font-sans uppercase tracking-widest ${config.badgeClasses}">${dep.status}</span>`
    }

    const urlWrapper = document.getElementById('logs-live-url') as HTMLAnchorElement | null
    const urlText = document.getElementById('logs-live-url-text')
    const dividerEl = document.getElementById('logs-divider')

    if (dep.url && urlWrapper && urlText && dividerEl) {
      urlWrapper.classList.remove('hidden')
      urlWrapper.classList.add('flex')
      dividerEl.classList.remove('hidden')
      urlText.textContent = dep.url
      urlWrapper.href = `https://${dep.url}`
    } else if (urlWrapper && dividerEl) {
      urlWrapper.classList.add('hidden')
      urlWrapper.classList.remove('flex')
      if (dividerEl) dividerEl.classList.add('hidden')
    }

    updateProgressHint(dep.status)
    updateCursorAndConnection(dep)
  }

  function renderDrawer(dep: Deployment) {
    updateDrawerHeader(dep)

    const containerEl = document.getElementById('logs-container')
    if (!containerEl) return
    containerEl.innerHTML = ''
    currentStageRef.current = null
    autoScrollRef.current = true

    dep.logs.forEach((log) => appendLogLine(log, containerEl))
    updateCursorAndConnection(dep)
    scrollToBottom(true)
  }

  function openDrawer(id: string) {
    selectedIdRef.current = id
    const dep = deploymentsRef.current.find((d) => d.id === id)
    if (!dep) return

    const numeric = Number.parseInt(id.replace(/^dep-/, ''), 10)
    if (Number.isFinite(numeric)) {
      setSelectedNumericId(numeric)
      window.location.hash = `deployment-${numeric}`
    }

    document.body.classList.add('overflow-hidden')
    const overlay = document.getElementById('drawer-overlay')
    const drawer = document.getElementById('logs-drawer')
    if (!overlay || !drawer) return

    overlay.classList.remove('hidden')
    window.setTimeout(() => {
      overlay.classList.remove('opacity-0')
      drawer.classList.remove('translate-x-full')
    }, 10)

    renderDrawer(dep)
  }

  function closeDrawer() {
    selectedIdRef.current = null
    document.body.classList.remove('overflow-hidden')

    const overlay = document.getElementById('drawer-overlay')
    const drawer = document.getElementById('logs-drawer')
    if (!overlay || !drawer) return

    overlay.classList.add('opacity-0')
    drawer.classList.add('translate-x-full')

    window.setTimeout(() => {
      overlay.classList.add('hidden')
    }, 300)
  }

  function renderList() {
    const listEl = document.getElementById('deployments-list')
    if (!listEl) return
    listEl.innerHTML = ''

    deploymentsRef.current.forEach((dep) => {
      const config = statusConfig[dep.status]

      const li = document.createElement('li')
      li.className = 'p-4 hover:bg-zinc-50 transition-colors group cursor-pointer'
      li.onclick = (e) => {
        const target = e.target as HTMLElement
        if (!target.closest('a')) openDrawer(dep.id)
      }

      const liveLink = dep.url
        ? `
          <a href="https://${dep.url}" target="_blank" class="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 transition-colors bg-zinc-100 hover:bg-zinc-200 px-2 py-1 rounded-md">
            <iconify-icon icon="solar:external-link-linear"></iconify-icon> ${dep.url}
          </a>
        `
        : ''

      li.innerHTML = `
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3.5 min-w-0">
            <div class="w-9 h-9 rounded-lg border border-zinc-200 bg-white shadow-sm flex items-center justify-center shrink-0 group-hover:border-zinc-300 transition-colors">
              <iconify-icon icon="${dep.sourceType === 'manual upload' ? 'solar:file-zip-linear' : 'solar:server-square-linear'
        }" class="text-zinc-600 text-lg" stroke-width="1.5"></iconify-icon>
            </div>
            <div class="flex flex-col gap-0.5 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm text-zinc-900 font-semibold truncate tracking-tight">${dep.name}</span>
                <span class="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-mono tracking-tight">${dep.version}</span>
                <span class="text-xs text-zinc-400 font-mono tracking-tight hidden sm:inline-block">${dep.shortId}</span>
              </div>
              <div class="flex items-center gap-2 text-xs text-zinc-500 font-sans">
                <span class="flex items-center gap-1"><iconify-icon icon="${dep.sourceIcon}" stroke-width="1.5"></iconify-icon> ${dep.sourceType}</span>
                <span class="w-0.5 h-0.5 rounded-full bg-zinc-300"></span>
                <span>${dep.time}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-4 shrink-0">
            ${liveLink}
            <span class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium border shadow-sm ${config.classes}">
              ${config.icon}
              <span class="hidden sm:inline-block">${config.label}</span>
            </span>
            <button class="hidden md:flex items-center gap-1.5 text-xs font-medium text-zinc-600 bg-white border border-zinc-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-zinc-50 hover:text-zinc-900 transition-colors">
              <iconify-icon icon="solar:terminal-linear"></iconify-icon> View Logs
            </button>
          </div>
        </div>
      `
      listEl.appendChild(li)
    })
  }

  // Legacy template simulation removed (backend drives status/logs now).

  function handleDeploy(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const urlInput = (document.getElementById('repo-url') as HTMLInputElement | null)?.value?.trim() ?? ''
    const uploadPath = uploadPathRef.current.trim()

    if (urlInput) createMut.mutate({ source_type: 'git', source_url: urlInput })
    else if (uploadPath) createMut.mutate({ source_type: 'upload', upload_path: uploadPath })
  }

  useEffect(() => {
    // Iconify custom element support
    loadScriptOnce('https://code.iconify.design/iconify-icon/1.0.7/iconify-icon.min.js')

    // Fonts from the original HTML
    loadPreconnectOnce('https://fonts.googleapis.com')
    loadPreconnectOnce('https://fonts.gstatic.com', '')
    loadStylesheetOnce(
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
    )

    const bodyEl = document.getElementById('logs-body')
    const scrollBtn = document.getElementById('scroll-to-bottom')

    const onScroll = () => {
      if (!selectedIdRef.current || !bodyEl || !scrollBtn) return
      const isAtBottom = Math.abs(bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight) < 10
      autoScrollRef.current = isAtBottom
      if (!isAtBottom) scrollBtn.classList.remove('hidden')
      else scrollBtn.classList.add('hidden')
    }

    bodyEl?.addEventListener('scroll', onScroll)

    const onHash = () => {
      const id = deploymentIdFromHash()
      setSelectedNumericId(id)
      if (id != null) openDrawer(`dep-${id}`)
    }
    window.addEventListener('hashchange', onHash)

    return () => {
      bodyEl?.removeEventListener('scroll', onScroll)
      window.removeEventListener('hashchange', onHash)
      document.body.classList.remove('overflow-hidden')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    deploymentsRef.current = (deploymentsQ.data?.items ?? []).map(toTemplateDeployment)
    renderList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentsQ.data?.items])

  useEffect(() => {
    if (!selectedDeploymentQ.data) return
    const dep = toTemplateDeployment(selectedDeploymentQ.data.deployment)
    dep.logs = selectedDeploymentQ.data.logs.map(toTemplateLog)

    const idx = deploymentsRef.current.findIndex((d) => d.id === dep.id)
    if (idx >= 0) deploymentsRef.current[idx] = { ...deploymentsRef.current[idx], ...dep }
    else deploymentsRef.current.unshift(dep)

    if (selectedIdRef.current === dep.id) renderDrawer(dep)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeploymentQ.data])

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
            <h1 className="text-base font-semibold tracking-tight">NXDP</h1>
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
                      type="url"
                      id="repo-url"
                      placeholder="https://github.com/user/repo"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow placeholder:text-zinc-400 text-zinc-900"
                    />
                  </div>

                  <div
                    className="flex items-center justify-center px-4 py-2 border border-dashed border-zinc-300 rounded-lg bg-zinc-50/30 hover:bg-zinc-50 hover:border-zinc-400 transition-colors cursor-pointer group w-full"
                    onClick={() => {
                      const v = window.prompt('Enter upload path (stub)', uploadPathRef.current)
                      if (typeof v === 'string') uploadPathRef.current = v
                    }}
                  >
                    <IconifyIcon
                      icon="solar:folder-with-files-linear"
                      className="text-zinc-400 group-hover:text-zinc-600 transition-colors mr-2"
                      strokeWidth="1.5"
                    />
                    <span className="text-xs text-zinc-600 font-medium">Upload ZIP or TAR.GZ</span>
                  </div>
                </div>

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

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900 px-1">Recent Deployments</h2>
            <div className="bg-white border border-zinc-200/80 rounded-xl shadow-sm overflow-hidden">
              <ul id="deployments-list" className="divide-y divide-zinc-100" />
            </div>
          </section>
        </div>
      </div>

      <div
        id="drawer-overlay"
        onClick={closeDrawer}
        className="fixed inset-0 bg-zinc-900/20 backdrop-blur-sm z-40 hidden transition-opacity opacity-0 duration-300"
      />

      <div
        id="logs-drawer"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-[#0a0a0a] shadow-2xl transform translate-x-full transition-transform duration-300 flex flex-col border-l border-zinc-800 font-mono text-xs"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        <div className="flex flex-col px-5 py-4 border-b border-zinc-800/80 bg-[#121212] shrink-0 z-20 shadow-sm relative gap-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2.5">
                  <span
                    id="logs-deployment-name"
                    className="text-zinc-100 tracking-tight font-medium text-sm font-sans"
                  />
                  <span
                    id="logs-version-tag"
                    className="px-1.5 py-0.5 rounded-md bg-zinc-800/80 text-zinc-400 font-mono text-[10px] tracking-tight"
                  />
                  <div id="logs-header-badge" />
                </div>
                <div className="flex items-center gap-3 text-xs font-sans text-zinc-500">
                  <div className="flex items-center gap-1.5 select-none">
                    <span id="logs-conn-indicator" className="relative flex h-2 w-2" />
                    <span id="logs-conn-text" />
                  </div>
                  <div id="logs-divider" className="h-3 w-px bg-zinc-800 hidden" />
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
            className="hidden items-center gap-2.5 pt-3 border-t border-zinc-800/50 text-[11px] font-sans text-zinc-500 w-full"
          >
            <div className="flex items-center gap-1.5" id="progress-building">
              <IconifyIcon icon="solar:record-circle-linear" className="status-icon text-sm" /> Building
            </div>
            <div className="w-6 h-px bg-zinc-800 rounded" />
            <div className="flex items-center gap-1.5" id="progress-deploying">
              <IconifyIcon icon="solar:record-circle-linear" className="status-icon text-sm" />
              Deploying
            </div>
            <div className="w-6 h-px bg-zinc-800 rounded" />
            <div className="flex items-center gap-1.5" id="progress-running">
              <IconifyIcon icon="solar:record-circle-linear" className="status-icon text-sm" /> Running
            </div>
          </div>
        </div>

        <div
          id="logs-body"
          className="flex-1 p-5 overflow-y-auto leading-relaxed custom-scrollbar bg-[#0a0a0a] relative scroll-smooth"
        >
          <div id="logs-container" className="space-y-1 pb-2" />
          <div className="flex items-start gap-3 mt-1 h-5">
            <span id="logs-cursor" className="w-2 h-3.5 bg-zinc-500 cursor-blink hidden" />
          </div>
        </div>

        <button
          id="scroll-to-bottom"
          onClick={() => scrollToBottom(true)}
          className="hidden absolute bottom-6 right-6 p-2 bg-zinc-800 text-zinc-300 rounded-full shadow-lg border border-zinc-700/50 hover:bg-zinc-700 hover:text-white transition-all z-20 focus:outline-none"
        >
          <IconifyIcon icon="solar:arrow-down-linear" className="text-base block" strokeWidth="2" />
        </button>
      </div>
    </div>
  )
}

export default App

