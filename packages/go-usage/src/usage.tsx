import type { LocationRef, UsageLimitsInfo } from "@opencode/client"
import type { MountedSession } from "@opencode/plugin/gui"
import { usePlugin } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, createUniqueId, For, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import type { definition } from "./definition"
import { WINDOWS, type HistorySample, type Window } from "./history"

type Go = NonNullable<UsageLimitsInfo["go"]>
type Meter = Go[Window]
type Tone = "neutral" | "warning" | "danger"

const LABEL = {
  rolling: "window.rolling",
  weekly: "window.weekly",
  monthly: "window.monthly",
} as const

const REFRESH_MS = 60_000
const SAMPLE_MS = 5 * 60_000
const SAMPLE_TTL = 24 * 60 * 60 * 1000
const SAMPLE_LIMIT = 320
const RESET_TOLERANCE = 2 * 60_000
const CARD_WIDTH = 232
const refreshed = new Map<string, number>()
const pending = new Map<string, Promise<void>>()

const sameReset = (a: number, b: number) => Math.abs(a - b) <= RESET_TOLERANCE

function prune(
  samples: readonly HistorySample[],
  workspace: string,
  resetAt: Record<Window, number>,
  now: number,
) {
  return samples
    .flatMap((sample): HistorySample[] => {
      if (now - sample.at > SAMPLE_TTL) return []
      if (sample.workspace !== workspace) return [sample]
      const windows = sample.windows.filter((meter) => sameReset(resetAt[meter.window], meter.resetsAt))
      if (!windows.length) return []
      return [{ ...sample, windows }]
    })
    .slice(-SAMPLE_LIMIT)
}

function merge(samples: readonly HistorySample[], next: HistorySample) {
  const existing = samples.find((sample) => sample.workspace === next.workspace && sample.at === next.at)
  if (!existing) return [...samples, next]
  const windows = [
    ...existing.windows.filter((meter) => !next.windows.some((entry) => entry.window === meter.window)),
    ...next.windows,
  ]
  return samples.map((sample) => (sample === existing ? { ...sample, windows } : sample))
}

export function GoUsage(props: { session: MountedSession; active: boolean }) {
  const ctx = usePlugin<typeof definition>()
  const cardID = createUniqueId()
  const usage = () => props.session.server.data.location.usage
  const location = () => props.session.location

  const info = createMemo(() => {
    const ref = location()
    return ref ? usage().limits(ref) : undefined
  })

  const workspaceID = () => {
    const id = info()?.workspace?.id
    return id ? id : undefined
  }

  const rows = createMemo(() => {
    const go = info()?.go
    if (!go) return undefined
    return WINDOWS.map((window) => ({ window, ...go[window] }))
  })

  const tightest = createMemo(() => {
    const list = rows()
    if (!list?.length) return undefined
    return list.reduce((worst, row) => {
      if (row.limited !== worst.limited) return row.limited ? row : worst
      return row.percent > worst.percent ? row : worst
    })
  })

  const tone = createMemo<Tone>(() => {
    const list = rows()
    if (!list) return "neutral"
    const percent = Math.round(tightest()?.percent ?? 0)
    if (list.some((row) => row.limited) || percent >= 95) return "danger"
    if (percent >= 80) return "warning"
    return "neutral"
  })

  const percent = (meter: Meter) => Math.max(0, Math.min(100, Math.round(meter.percent)))

  const duration = (ms: number) => {
    const minutes = Math.max(1, Math.round(ms / 60_000))
    if (minutes < 60) return ctx.t("reset.minutes", { count: minutes })
    const hours = Math.round(minutes / 60)
    if (hours < 48) return ctx.t("reset.hours", { count: hours })
    return ctx.t("reset.days", { count: Math.round(hours / 24) })
  }

  const remaining = (at: number) => {
    const left = at - Date.now()
    if (!Number.isFinite(left) || left <= 0) return undefined
    return duration(left)
  }

  const resets = (at: number) => {
    const when = remaining(at)
    return when ? ctx.t("reset.in", { when }) : ctx.t("reset.now")
  }

  const record = (ref: LocationRef) => {
    const limits = usage().limits(ref)
    const workspace = limits?.workspace?.id
    const go = limits?.go
    if (!workspace || !go) return
    const store = ctx.stores.history
    const now = Date.now()
    const latest = store.value.samples.reduce(
      (at, sample) => (sample.workspace === workspace && sample.at > at ? sample.at : at),
      0,
    )
    if (now - latest < SAMPLE_MS) return
    const next = {
      workspace,
      at: now,
      windows: WINDOWS.map((window) => ({
        window,
        percent: go[window].percent,
        resetsAt: go[window].resetsAt,
      })),
    }
    store.set({
      samples: prune(
        merge(store.value.samples, next),
        workspace,
        {
          rolling: go.rolling.resetsAt,
          weekly: go.weekly.resetsAt,
          monthly: go.monthly.resetsAt,
        },
        now,
      ),
    })
  }

  const refresh = () => {
    const ref = location()
    const server = props.session.server
    if (!ref || !server.connected) return
    const key = `${server.id}\n${server.url}\n${server.connected}\n${JSON.stringify(ref)}`
    if (Date.now() - (refreshed.get(key) ?? 0) < REFRESH_MS) return
    if (pending.has(key)) return
    const request = usage()
      .sync(ref)
      .then(
        () => {
          refreshed.set(key, Date.now())
          record(ref)
        },
        () => undefined,
      )
      .finally(() => pending.delete(key))
    pending.set(key, request)
  }

  createEffect(() => {
    if (!props.active) return
    location()
    if (!props.session.server.connected) return
    refresh()
  })

  createEffect(() => {
    if (!props.active) setVisible(false)
  })

  onMount(() => {
    const focus = () => {
      if (!props.active) return
      refresh()
    }
    const reposition = () => {
      if (visible()) place()
    }
    window.addEventListener("focus", focus)
    window.addEventListener("resize", reposition)
    window.addEventListener("scroll", reposition, true)
    onCleanup(() => {
      window.removeEventListener("focus", focus)
      window.removeEventListener("resize", reposition)
      window.removeEventListener("scroll", reposition, true)
    })
  })

  const summary = createMemo(() => {
    const list = rows()
    if (!list) return ctx.t("card.title")
    return [
      ctx.t("card.title"),
      ...list.map((row) => `${ctx.t(LABEL[row.window])} ${percent(row)}% (${resets(row.resetsAt)})`),
    ].join(" · ")
  })

  const forecast = createMemo(() => {
    const row = tightest()
    const workspace = workspaceID()
    if (!row || !workspace) return undefined
    const window = ctx.t(LABEL[row.window])
    if (row.limited || percent(row) >= 100) return ctx.t("forecast.reached", { window })
    const points = ctx.stores.history.value.samples
      .filter((sample) => sample.workspace === workspace)
      .flatMap((sample) => {
        const meter = sample.windows.find(
          (entry) => entry.window === row.window && sameReset(entry.resetsAt, row.resetsAt),
        )
        return meter ? [{ at: sample.at, percent: meter.percent }] : []
      })
      .sort((a, b) => a.at - b.at)
    if (points.length < 2) return undefined
    const first = points[0]
    const last = points[points.length - 1]
    const elapsed = last.at - first.at
    if (elapsed <= 0) return undefined
    const rate = (last.percent - first.percent) / elapsed
    if (!(rate > 0)) return undefined
    const eta = (100 - row.percent) / rate
    if (eta > row.resetsAt - Date.now()) return ctx.t("forecast.resets", { window })
    return ctx.t("forecast.cap", { window, when: duration(eta) })
  })

  const open = () => {
    setVisible(false)
    // App commands return void, and the host reports false for those, so the result cannot tell whether one ran.
    ctx.commands.run("usage.view")
  }

  const [visible, setVisible] = createSignal(false)
  const [position, setPosition] = createSignal<{ top: number; left?: number; right?: number }>({ top: 0 })
  let button: HTMLButtonElement | undefined
  let hiding: number | undefined

  const anchor = (rect: DOMRect) => {
    const margin = 8
    const limit = Math.max(margin, window.innerWidth - CARD_WIDTH - margin)
    const top = rect.bottom + 6
    if (ctx.locale.direction() === "rtl")
      return { top, left: Math.min(Math.max(margin, rect.left), limit) }
    return { top, right: Math.min(Math.max(margin, window.innerWidth - rect.right), limit) }
  }

  const place = () => {
    const rect = button?.getBoundingClientRect()
    if (!rect) return
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setVisible(false)
      return
    }
    const next = anchor(rect)
    const current = position()
    if (next.top === current.top && next.left === current.left && next.right === current.right) return
    setPosition(next)
  }

  const show = () => {
    if (hiding !== undefined) window.clearTimeout(hiding)
    hiding = undefined
    place()
    setVisible(true)
  }

  const hide = () => {
    if (hiding !== undefined) window.clearTimeout(hiding)
    hiding = window.setTimeout(() => setVisible(false), 50)
  }

  onCleanup(() => {
    if (hiding !== undefined) window.clearTimeout(hiding)
  })

  return (
    <Show when={tightest()}>
      {(row) => (
        <div data-component="go-usage" data-tone={tone()}>
          <button
            ref={button}
            type="button"
            data-slot="go-usage-pill"
            aria-label={summary()}
            aria-describedby={visible() ? cardID : undefined}
            onPointerEnter={show}
            onPointerLeave={hide}
            onFocus={show}
            onBlur={hide}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !visible()) return
              event.preventDefault()
              setVisible(false)
            }}
            onClick={open}
          >
            <span data-slot="go-usage-dot" aria-hidden="true" />
            <span>{ctx.t("pill.label", { percent: percent(row()) })}</span>
          </button>
          <Show when={visible()}>
            <Portal>
              <div
                id={cardID}
                data-slot="go-usage-card"
                role="tooltip"
                style={{
                  top: `${position().top}px`,
                  left: position().left === undefined ? "auto" : `${position().left}px`,
                  right: position().right === undefined ? "auto" : `${position().right}px`,
                }}
                onPointerEnter={show}
                onPointerLeave={hide}
              >
                <div data-slot="go-usage-title">{ctx.t("card.title")}</div>
                <For each={rows() ?? []}>
                  {(meter) => (
                    <div data-slot="go-usage-row">
                      <span data-slot="go-usage-window">{ctx.t(LABEL[meter.window])}</span>
                      <span data-slot="go-usage-percent">{percent(meter)}%</span>
                      <span data-slot="go-usage-reset">{resets(meter.resetsAt)}</span>
                    </div>
                  )}
                </For>
                <Show when={forecast()}>
                  {(line) => <div data-slot="go-usage-forecast">{line()}</div>}
                </Show>
              </div>
            </Portal>
          </Show>
        </div>
      )}
    </Show>
  )
}
