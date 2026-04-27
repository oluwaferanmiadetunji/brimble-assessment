import type { Deployment, DeploymentStatus } from '../types'
import { hrefForPublicUrl, IconifyIcon } from './helpers'

type StatusConfig = Record<
  DeploymentStatus,
  {
    classes: string
    icon: string
    label: string
  }
>

export default function RecentDeployments(props: {
  deployments: Deployment[]
  statusConfig: StatusConfig
  openDrawer: (id: string) => void
}) {
  const { deployments, statusConfig, openDrawer } = props

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-tight text-zinc-900 px-1">Recent Deployments</h2>
      <div className="bg-white border border-zinc-200/80 rounded-xl shadow-sm overflow-hidden">
        <ul id="deployments-list" className="divide-y divide-zinc-100">
          {deployments.map((dep) => {
            const config = statusConfig[dep.status]

            return (
              <li
                key={dep.id}
                className="p-4 hover:bg-zinc-50 transition-colors group cursor-pointer"
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  if (!target.closest('a')) openDrawer(dep.id)
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg border border-zinc-200 bg-white shadow-sm flex items-center justify-center shrink-0 group-hover:border-zinc-300 transition-colors">
                      <IconifyIcon
                        icon={
                          dep.sourceType === 'manual upload'
                            ? 'solar:file-zip-linear'
                            : 'solar:server-square-linear'
                        }
                        className="text-zinc-600 text-lg"
                        strokeWidth="1.5"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-zinc-900 font-semibold truncate tracking-tight">
                          {dep.name}
                        </span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-mono tracking-tight">
                          {dep.version}
                        </span>
                        <span className="text-xs text-zinc-400 font-mono tracking-tight hidden sm:inline-block">
                          {dep.shortId}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-500 font-sans">
                        <span className="flex items-center gap-1">
                          <IconifyIcon icon={dep.sourceIcon} strokeWidth="1.5" />
                          {dep.sourceType}
                        </span>
                        <span className="w-0.5 h-0.5 rounded-full bg-zinc-300" />
                        <span>{dep.time}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {dep.url ? (
                      <a
                        href={hrefForPublicUrl(dep.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 transition-colors bg-zinc-100 hover:bg-zinc-200 px-2 py-1 rounded-md"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IconifyIcon icon="solar:external-link-linear" />
                        {dep.url}
                      </a>
                    ) : null}

                    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium border shadow-sm ${config.classes}`}>
                      <span dangerouslySetInnerHTML={{ __html: config.icon }} />
                      <span className="hidden sm:inline-block">{config.label}</span>
                    </span>

                    <button
                      type="button"
                      className="hidden md:flex items-center gap-1.5 text-xs font-medium text-zinc-600 bg-white border border-zinc-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openDrawer(dep.id)
                      }}
                    >
                      <iconify-icon icon="solar:terminal-linear"></iconify-icon> View Logs
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}