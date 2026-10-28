import { createSignal, For, onCleanup, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { Memory, type MemorySample } from "./contract"
import { formatBytes, formatSampleTime } from "./format"
import type { definition } from "./definition"

export function MemoryDialog(props: { onClose: () => void }) {
  const ctx = usePlugin<typeof definition>()
  const memory = ctx.main(Memory)
  const [sample, setSample] = createSignal<MemorySample>()
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string>()
  let controller: AbortController | undefined
  let disposed = false

  const load = () => {
    const next = new AbortController()
    controller?.abort()
    controller = next
    setLoading(true)
    setError(undefined)

    memory.sample({ signal: next.signal }).then(
      (value) => {
        if (disposed || next.signal.aborted) return
        setSample(value)
        setLoading(false)
      },
      (cause: unknown) => {
        if (disposed || next.signal.aborted) return
        setError(cause instanceof Error ? cause.message : String(cause))
        setLoading(false)
      },
    )
  }

  onCleanup(() => {
    disposed = true
    controller?.abort()
  })
  load()

  const rows = () => [...(sample()?.processes ?? [])].sort((left, right) => right.pss - left.pss)
  const bytes = (value: number | null | undefined) =>
    value === null || value === undefined ? ctx.t("dialog.unavailable") : formatBytes(value)

  return (
    <ctx.ui.Dialog
      title={ctx.t("dialog.title")}
      description={ctx.t("dialog.description")}
      size="large"
      footer={
        <>
          <ctx.ui.Button variant="ghost" onClick={load} busy={loading()}>
            {ctx.t("dialog.refresh")}
          </ctx.ui.Button>
          <ctx.ui.Button variant="contrast" onClick={props.onClose}>
            {ctx.t("dialog.close")}
          </ctx.ui.Button>
        </>
      }
    >
      <div data-component="memory-monitor">
        <Show when={loading() && !sample()}>
          <div data-slot="memory-loading">
            <ctx.ui.Loader size="small" />
            <span>{ctx.t("dialog.loading")}</span>
          </div>
        </Show>

        <Show when={error()}>
          {(message) => (
            <div data-slot="memory-error">
              <div data-slot="memory-error-title">{ctx.t("dialog.failed")}</div>
              <code data-slot="memory-error-detail">{message()}</code>
              <ctx.ui.Button size="small" onClick={load}>
                {ctx.t("dialog.retry")}
              </ctx.ui.Button>
            </div>
          )}
        </Show>

        <Show when={sample()}>
          {(value) => (
            <>
              <div data-slot="memory-sampled">
                <span>{ctx.t("dialog.sampledAt", { time: formatSampleTime(value().at) })}</span>
                <Show when={error()}>
                  <span data-slot="memory-stale">{ctx.t("dialog.stale")}</span>
                </Show>
              </div>

              <section data-slot="memory-summary">
                <Metric label={ctx.t("dialog.app")} value={formatBytes(value().app)} />
                <Metric
                  label={ctx.t("dialog.server")}
                  value={value().serverRunning ? formatBytes(value().server) : ctx.t("dialog.serverOff")}
                />
              </section>

              <section data-slot="memory-cgroup">
                <div data-slot="memory-section-heading">
                  <span>{ctx.t("dialog.cgroup")}</span>
                  <Show when={value().cgroup}>
                    {(group) => (
                      <span data-slot="memory-cgroup-version">
                        {ctx.t("dialog.cgroupVersion", { version: group().version })}
                      </span>
                    )}
                  </Show>
                </div>
                <Show
                  when={value().cgroup}
                  fallback={<div data-slot="memory-muted">{ctx.t("dialog.cgroupUnavailable")}</div>}
                >
                  {(group) => (
                    <>
                      <div data-slot="memory-cgroup-metrics">
                        <Metric
                          label={ctx.t("dialog.cgroupCurrent")}
                          value={bytes(group().current)}
                        />
                        <Metric label={ctx.t("dialog.cgroupPeak")} value={bytes(group().peak)} />
                      </div>
                      <div data-slot="memory-cgroup-path-row">
                        <code data-slot="memory-cgroup-path" title={group().path}>
                          {group().path}
                        </code>
                        <ctx.ui.IconButton
                          icon="copy"
                          size="small"
                          label={ctx.t("dialog.copyPath")}
                          onClick={() => void ctx.system.copy(group().path).catch(() => undefined)}
                        />
                      </div>
                    </>
                  )}
                </Show>
              </section>

              <section data-slot="memory-processes">
                <div data-slot="memory-section-heading">
                  <span>{ctx.t("dialog.processes")}</span>
                  <Show when={rows().length > 0}>
                    <span data-slot="memory-process-count">{rows().length}</span>
                  </Show>
                </div>
                <Show
                  when={rows().length > 0}
                  fallback={<div data-slot="memory-muted">{ctx.t("dialog.empty")}</div>}
                >
                  <div
                    data-slot="memory-process-scroll"
                    role="region"
                    aria-label={ctx.t("dialog.processes")}
                    tabIndex={0}
                  >
                    <table data-slot="memory-table">
                      <thead>
                        <tr>
                          <th>{ctx.t("dialog.process")}</th>
                          <th>{ctx.t("dialog.kind")}</th>
                          <th>{ctx.t("dialog.pid")}</th>
                          <th>{ctx.t("dialog.pss")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={rows()}>
                          {(item) => (
                            <tr>
                              <td data-slot="memory-name" title={item.name}>
                                {item.name}
                              </td>
                              <td data-slot="memory-kind">{ctx.t(`kind.${item.kind}`)}</td>
                              <td data-slot="memory-pid">{item.pid}</td>
                              <td data-slot="memory-pss">{formatBytes(item.pss)}</td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </Show>
              </section>
            </>
          )}
        </Show>
      </div>
    </ctx.ui.Dialog>
  )
}

function Metric(props: { label: string; value: string }) {
  return (
    <div data-slot="memory-metric">
      <span data-slot="memory-metric-label">{props.label}</span>
      <span data-slot="memory-metric-value">{props.value}</span>
    </div>
  )
}
