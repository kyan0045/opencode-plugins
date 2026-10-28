import { createSignal, onCleanup } from "solid-js"
import { Plugin, Style, TitlebarItem } from "@opencode/plugin/gui"
import { Memory, type MemorySample } from "./contract"
import { MemoryDialog } from "./dialog"
import { compactBytes, formatBytes, formatSampleTime } from "./format"
import type { definition } from "./definition"
import css from "./memory.css?inline"

const SAMPLE_MS = 45_000

export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const memory = ctx.main(Memory)
  const [sample, setSample] = createSignal<MemorySample>()
  const [failed, setFailed] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  let inFlight = false
  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false

  const load = async () => {
    if (inFlight || disposed) return
    inFlight = true
    setLoading(true)
    const next = await memory.sample({ signal: ctx.signal }).catch(() => undefined)
    inFlight = false
    setLoading(false)
    if (disposed) return
    if (next) {
      setSample(next)
      setFailed(false)
      return
    }
    setFailed(true)
  }

  const active = () => document.visibilityState === "visible" && document.hasFocus()
  const stop = () => {
    if (timer === undefined) return
    clearInterval(timer)
    timer = undefined
  }
  const sync = () => {
    if (disposed || !active()) {
      stop()
      return
    }
    if (timer !== undefined) return
    void load()
    timer = setInterval(() => void load(), SAMPLE_MS)
  }

  document.addEventListener("visibilitychange", sync)
  window.addEventListener("focus", sync)
  window.addEventListener("blur", sync)
  onCleanup(() => {
    disposed = true
    stop()
    document.removeEventListener("visibilitychange", sync)
    window.removeEventListener("focus", sync)
    window.removeEventListener("blur", sync)
  })
  sync()

  ctx.add(Style, css)
  ctx.add(TitlebarItem, (): TitlebarItem | undefined => {
    const current = sample()
    const server = current?.serverRunning ? formatBytes(current.server) : ctx.t("titlebar.serverOff")
    const label = current
      ? `${compactBytes(current.app)} · ${
          current.serverRunning ? compactBytes(current.server) : ctx.t("titlebar.serverOffCompact")
        }`
      : failed()
        ? ctx.t("titlebar.failed")
        : ctx.t("titlebar.loading")
    const title = current
      ? ctx.t(failed() ? "titlebar.stale" : "titlebar.title", {
          app: formatBytes(current.app),
          server,
          time: formatSampleTime(current.at),
        })
      : failed()
        ? ctx.t("titlebar.failedTitle")
        : ctx.t("titlebar.pending")

    return {
      id: "memory",
      icon: "server",
      label,
      title,
      busy: loading() && !current,
      run: () => {
        if (!current && failed()) {
          void load()
          return
        }
        ctx.dialogs.open((dialog) => <MemoryDialog onClose={dialog.close} />)
      },
    }
  })
}
