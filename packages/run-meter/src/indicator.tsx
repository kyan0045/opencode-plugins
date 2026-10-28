import { createSignal, For, Show } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { turnMeter, type MeterInput, type TurnMeter } from "./meter"
import { compactLabel, meterDetails } from "./label"

export function RunMeter(props: {
  session: MountedSession
  active: boolean
  now: () => number
  firstOutput: MeterInput["firstOutput"]
  showCost: () => boolean
}) {
  const ctx = usePlugin()
  const [frozen, setFrozen] = createSignal<TurnMeter>()

  const meter = () => {
    if (!props.active || !props.session.id) return undefined
    const data = props.session.server.data

    return turnMeter(data.session.message.list(props.session.id), {
      now: props.now(),
      running: data.session.status(props.session.id) === "running",
      settleMs: 2_000,
      firstOutput: props.firstOutput,
    })
  }
  const live = () => meter()
  const shown = () => {
    const snapshot = frozen()
    const current = live()
    if (snapshot && current && snapshot.turnId !== current.turnId) return current
    return snapshot ?? current
  }

  return (
    <Show when={shown()}>
      {(value) => (
        <div data-component="run-meter">
          <ctx.ui.Tooltip value={<TooltipBody meter={live() ?? value()} showCost={props.showCost} />} placement="bottom">
            <span
              data-slot="run-meter-indicator"
              onPointerEnter={() => setFrozen(live())}
              onPointerLeave={() => setFrozen(undefined)}
            >
              <span>{compactLabel(ctx, value(), props.showCost())}</span>
            </span>
          </ctx.ui.Tooltip>
        </div>
      )}
    </Show>
  )
}

function TooltipBody(props: { meter: TurnMeter; showCost: () => boolean }) {
  const ctx = usePlugin()

  return (
    <div data-slot="run-meter-tooltip">
      <For each={meterDetails(ctx, props.meter, props.showCost())}>
        {(row) => (
          <div data-slot="run-meter-tooltip-row">
            <span data-slot="run-meter-tooltip-label">{row.label}</span>
            <span data-slot="run-meter-tooltip-value">{row.value}</span>
          </div>
        )}
      </For>
    </div>
  )
}
