import { createSignal, lazy, onCleanup, Suspense } from "solid-js"
import {
  ComposerPill,
  createKeyed,
  MenuItem,
  Panel,
  Plugin,
  SettingsPage,
  Slot,
  Style,
  type PanelTab,
} from "@opencode/plugin/gui"
import { turnMeter } from "./meter"
import { compactLabel, fullLabel, meterDetails } from "./label"
import { mountFooterMeter } from "./footer"
import { createTurnRecorder, mergeSamples } from "./history"
import { RunMeter } from "./indicator"
import { RunMeterSettings } from "./settings"
import { definition } from "./definition"
import footerCss from "./footer.css?inline"
import historyCss from "./history.css?inline"
import indicatorCss from "./indicator.css?inline"

const RunHistoryPanel = lazy(() => import("./history-panel"))

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 500)
  onCleanup(() => clearInterval(timer))
  const firstOutput = new Map<string, Map<string, number>>()
  const record = (sessionID: string, messageID: string, at: number) => {
    const steps = firstOutput.get(sessionID) ?? new Map<string, number>()
    if (!steps.has(messageID)) steps.set(messageID, at)
    firstOutput.set(sessionID, steps)
  }
  const turns = createTurnRecorder((samples) => {
    const store = ctx.stores.history
    store.set({ samples: mergeSamples(store.value.samples, samples) })
  })

  createKeyed(
    () => ctx.servers.list().map((id) => ctx.servers.get(id)?.data),
    (servers) => {
      for (const data of servers) {
        if (!data) continue
        onCleanup(
          data.on("session.execution.started", (event) => {
            firstOutput.delete(event.data.sessionID)
            turns.start(event)
          }),
        )
        onCleanup(data.on("session.execution.succeeded", (event) => turns.succeed(event)))
        onCleanup(data.on("session.execution.failed", (event) => turns.cancel(event)))
        onCleanup(data.on("session.execution.interrupted", (event) => turns.cancel(event)))
        onCleanup(data.on("session.step.started", (event) => turns.stepStarted(event)))
        onCleanup(data.on("session.step.streamed", (event) => turns.stepStreamed(event)))
        onCleanup(
          data.on("session.step.ended", (event) =>
            turns.stepEnded(event, (messageID) => firstOutput.get(event.data.sessionID)?.get(messageID)),
          ),
        )
        onCleanup(
          data.on("session.text.started", (event) =>
            record(event.data.sessionID, event.data.assistantMessageID, event.created),
          ),
        )
        onCleanup(
          data.on("session.reasoning.started", (event) =>
            record(event.data.sessionID, event.data.assistantMessageID, event.created),
          ),
        )
        onCleanup(
          data.on("session.tool.input.started", (event) =>
            record(event.data.sessionID, event.data.assistantMessageID, event.created),
          ),
        )
      }
    },
    {
      equals: (previous, next) =>
        previous.length === next.length && previous.every((value, index) => value === next[index]),
    },
  )

  ctx.add(Style, footerCss)
  ctx.add(Style, indicatorCss)
  ctx.add(Style, historyCss)
  ctx.add(Slot, (): Slot | undefined => {
    if (!ctx.stores.placement.value.header) return undefined

    return {
      at: "session.header",
      order: 4,
      render: (input) => (
        <RunMeter
          session={input.session}
          active={input.active}
          now={now}
          firstOutput={(step) => firstOutput.get(input.session.id)?.get(step.id)}
          showCost={() => ctx.stores.placement.value.cost}
        />
      ),
    }
  })
  ctx.add(ComposerPill, () => {
    if (!ctx.stores.placement.value.composer) return undefined

    return {
      id: "meter",
      order: 20,
      show: (input) => {
        const data = input.session.server.data
        const running = data.session.status(input.session.id) === "running"
        const meter = turnMeter(data.session.message.list(input.session.id), {
          now: now(),
          running,
          firstOutput: (step) => firstOutput.get(input.session.id)?.get(step.id),
        })

        if (!meter) return undefined

        return {
          icon: "waveform",
          label: compactLabel(ctx, meter, ctx.stores.placement.value.cost),
          tone: meter.running || meter.estimated || meter.rate === undefined ? undefined : "success",
          title: ctx.t("meter.title"),
          rows: meterDetails(ctx, meter, ctx.stores.placement.value.cost).map((row, index) => ({
            id: String(index),
            label: row.label,
            detail: row.value,
          })),
        }
      },
    }
  })
  onCleanup(
    mountFooterMeter({
      read: (promptID) => {
        if (!ctx.stores.placement.value.footer) return undefined

        const session = ctx.sessions
          .list()
          .find((candidate) => candidate.server.data.session.message.get(candidate.id, promptID))
        if (!session) return undefined

        const data = session.server.data
        const meter = turnMeter(data.session.message.list(session.id), {
          now: Date.now(),
          running: data.session.status(session.id) === "running",
          promptId: promptID,
          settleMs: Number.POSITIVE_INFINITY,
          firstOutput: (step) => firstOutput.get(session.id)?.get(step.id),
        })
        if (!meter || meter.rate === undefined) return undefined

        const text = fullLabel(ctx, meter, ctx.stores.placement.value.cost)
        return text ? { label: text } : undefined
      },
    }),
  )

  const historyTab: PanelTab = {
    id: "history",
    get title() {
      return ctx.t("history.title")
    },
    closable: "hover",
  }

  ctx.add(Panel, {
    id: "history",
    region: "side",
    mobile: {
      get title() {
        return ctx.t("history.title")
      },
      order: 40,
      kind: "menu",
      icon: "window-analytics",
    },
    list: (input) => (input.open.includes(historyTab.id) ? [historyTab] : []),
    render: () => (
      <Suspense fallback={<div data-slot="run-history-loading">{ctx.t("history.loading")}</div>}>
        <RunHistoryPanel />
      </Suspense>
    ),
  })
  ctx.add(MenuItem, (): MenuItem | undefined => {
    const session = ctx.sessions.current()

    return {
      menu: "session.panel",
      id: "history",
      title: ctx.t("history.title"),
      icon: "window-analytics",
      order: 20,
      opened: !!session && ctx.layout.state(`${ctx.id}:${historyTab.id}`, session) !== "closed",
      run: () => {
        if (session) ctx.layout.open(`${ctx.id}:${historyTab.id}`, session)
      },
    }
  })

  ctx.add(SettingsPage, {
    id: "run-meter",
    icon: "waveform",
    get title() {
      return ctx.t("settings.title")
    },
    render: () => <RunMeterSettings />,
  })
}

export default Plugin.define({ ...definition, setup })
