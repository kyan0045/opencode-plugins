import { createEffect, createSignal, createUniqueId, For, onCleanup, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { turnMeter, type MeterInput, type TurnMeter } from "./meter"
import { compactLabel, meterDetails } from "./label"

const fallbackCardWidth = 208

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
      {(value) => {
        const cardId = createUniqueId()
        const [visible, setVisible] = createSignal(false)
        const [position, setPosition] = createSignal({ top: 0, left: 0 })
        let trigger: HTMLButtonElement | undefined
        let card: HTMLElement | undefined
        let hiding: ReturnType<typeof setTimeout> | undefined

        const cancelHide = () => {
          if (hiding !== undefined) clearTimeout(hiding)
          hiding = undefined
        }
        const close = () => {
          cancelHide()
          setVisible(false)
          setFrozen(undefined)
        }
        const hide = () => {
          cancelHide()
          hiding = setTimeout(close, 50)
        }
        const place = () => {
          if (!visible()) return

          const rect = trigger?.getBoundingClientRect()
          if (!rect) return
          if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
            close()
            return
          }

          const width = card?.offsetWidth || fallbackCardWidth
          setPosition({
            top: rect.bottom + 6,
            left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
          })
        }
        const show = () => {
          cancelHide()
          setFrozen(live())
          setVisible(true)
          place()
          requestAnimationFrame(place)
        }
        const openHistory = () => {
          close()
          ctx.layout.open(`${ctx.id}:history`, props.session)
        }

        createEffect(() => {
          if (!visible()) return

          const reposition = () => place()
          const dismiss = (event: KeyboardEvent) => {
            if (event.key === "Escape") close()
          }

          window.addEventListener("scroll", reposition, true)
          window.addEventListener("resize", reposition)
          window.addEventListener("keydown", dismiss)
          onCleanup(() => {
            window.removeEventListener("scroll", reposition, true)
            window.removeEventListener("resize", reposition)
            window.removeEventListener("keydown", dismiss)
          })
        })
        onCleanup(close)

        return (
          <div data-component="run-meter">
            <button
              ref={trigger}
              type="button"
              data-slot="run-meter-indicator"
              aria-label={`${compactLabel(ctx, value(), props.showCost())} (${ctx.t("history.open")})`}
              aria-describedby={visible() ? cardId : undefined}
              onPointerEnter={show}
              onPointerLeave={hide}
              onFocus={show}
              onBlur={hide}
              onClick={openHistory}
            >
              <span>{compactLabel(ctx, value(), props.showCost())}</span>
            </button>
            <Portal>
              <Show when={visible()}>
                <div
                  ref={(element) => {
                    card = element
                  }}
                  id={cardId}
                  data-slot="run-meter-card"
                  role="tooltip"
                  style={{ top: `${position().top}px`, left: `${position().left}px` }}
                  onPointerEnter={cancelHide}
                  onPointerLeave={hide}
                >
                  <TooltipBody meter={value()} showCost={props.showCost} />
                </div>
              </Show>
            </Portal>
          </div>
        )
      }}
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
