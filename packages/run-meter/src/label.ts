import type { Context } from "@opencode/plugin/gui"
import { formatCost, formatDuration, formatRate, type TurnMeter } from "./meter"

export function compactLabel(ctx: Context, meter: TurnMeter, showCost = true) {
  const rate =
    meter.rate === undefined
      ? undefined
      : meter.estimated
        ? ctx.t("meter.rate.live", { rate: formatRate(meter.rate) })
        : ctx.t("meter.rate", { rate: formatRate(meter.rate) })
  const ttft = meter.ttft === undefined ? undefined : formatDuration(meter.ttft)
  const head = [rate, ttft].filter((part) => part !== undefined)

  if (head.length === 0) return meter.running ? ctx.t("meter.starting") : ctx.t("meter.empty")
  return [...head, ...(showCost ? [ctx.t("meter.cost", { cost: formatCost(meter.cost) })] : [])].join(" · ")
}

export function fullLabel(ctx: Context, meter: TurnMeter, showCost = true) {
  const rate =
    meter.rate === undefined
      ? undefined
      : meter.estimated
        ? ctx.t("meter.rate.live", { rate: formatRate(meter.rate) })
        : ctx.t("meter.rate", { rate: formatRate(meter.rate) })
  const ttft = meter.ttft === undefined ? undefined : ctx.t("meter.ttft", { duration: formatDuration(meter.ttft) })
  const head = [rate, ttft].filter((part) => part !== undefined)

  return head.length
    ? [...head, ...(showCost ? [ctx.t("meter.cost", { cost: formatCost(meter.cost) })] : [])].join(" · ")
    : undefined
}

export function meterDetails(ctx: Context, meter: TurnMeter, showCost = true) {
  return [
    {
      label: ctx.t("meter.output"),
      value: `${meter.estimated ? "~" : ""}${ctx.plural("meter.tokens", Math.round(meter.output))}`,
    },
    { label: ctx.t("meter.time"), value: formatDuration(meter.duration) },
    ...(meter.ttft === undefined ? [] : [{ label: ctx.t("meter.ttftRow"), value: formatDuration(meter.ttft) }]),
    ...(showCost ? [{ label: ctx.t("meter.costRow"), value: formatCost(meter.cost) }] : []),
  ]
}
