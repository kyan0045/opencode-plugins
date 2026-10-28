import type { UsageLimitsInfo } from "@opencode/client"
import type { MountedSession } from "@opencode/plugin/gui"
import { usePlugin } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, createUniqueId, For, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"

type Go = NonNullable<UsageLimitsInfo["go"]>
type GoWindow = keyof Go
type Meter = Go[GoWindow]
type Tone = "neutral" | "warning" | "danger"

const WINDOWS = ["rolling", "weekly", "monthly"] as const
const LABEL = {
  rolling: "window.rolling",
  weekly: "window.weekly",
  monthly: "window.monthly",
} as const

const REFRESH_MS = 60_000
const CARD_WIDTH = 232
const refreshed = new Map<string, number>()
const pending = new Map<string, Promise<void>>()

export function GoUsage(props: { session: MountedSession; active: boolean }) {
  const ctx = usePlugin()
  const cardID = createUniqueId()
  const usage = () => props.session.server.data.location.usage
  const location = () => props.session.location

  const info = createMemo(() => {
    const ref = location()
    return ref ? usage().limits(ref) : undefined
  })

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

  const remaining = (at: number) => {
    const left = at - Date.now()
    if (!Number.isFinite(left) || left <= 0) return undefined
    const minutes = Math.max(1, Math.round(left / 60_000))
    if (minutes < 60) return ctx.t("reset.minutes", { count: minutes })
    const hours = Math.round(minutes / 60)
    if (hours < 48) return ctx.t("reset.hours", { count: hours })
    return ctx.t("reset.days", { count: Math.round(hours / 24) })
  }

  const resets = (at: number) => {
    const when = remaining(at)
    return when ? ctx.t("reset.in", { when }) : ctx.t("reset.now")
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
        () => void refreshed.set(key, Date.now()),
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
    const dismiss = () => setVisible(false)
    window.addEventListener("focus", focus)
    window.addEventListener("resize", dismiss)
    window.addEventListener("scroll", dismiss, true)
    onCleanup(() => {
      window.removeEventListener("focus", focus)
      window.removeEventListener("resize", dismiss)
      window.removeEventListener("scroll", dismiss, true)
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

  const open = () => {
    setVisible(false)
    // App commands return void, and the host reports false for those, so the result cannot tell whether one ran.
    ctx.commands.run("usage.view")
  }

  const [visible, setVisible] = createSignal(false)
  const [position, setPosition] = createSignal<{ top: number; left?: number; right?: number }>({ top: 0 })
  let button: HTMLButtonElement | undefined
  let hiding: number | undefined

  const show = () => {
    if (hiding !== undefined) window.clearTimeout(hiding)
    hiding = undefined
    const rect = button?.getBoundingClientRect()
    if (rect) {
      const margin = 8
      const limit = Math.max(margin, window.innerWidth - CARD_WIDTH - margin)
      const top = rect.bottom + 6
      if (ctx.locale.direction() === "rtl")
        setPosition({ top, left: Math.min(Math.max(margin, rect.left), limit) })
      else setPosition({ top, right: Math.min(Math.max(margin, window.innerWidth - rect.right), limit) })
    }
    setVisible(true)
  }

  const hide = () => {
    if (hiding !== undefined) window.clearTimeout(hiding)
    hiding = window.setTimeout(() => setVisible(false), 140)
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
              </div>
            </Portal>
          </Show>
        </div>
      )}
    </Show>
  )
}
