import { createEffect, createMemo, createSignal, createUniqueId, For, onCleanup, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { formatCost, formatDuration, formatRate } from "./meter"
import { recentSamples, sampleRate, summarizeModels, type HistorySample, type ModelSummary } from "./history"
import type { definition } from "./definition"

const ranges = [
  { id: "24h", label: "history.range.24h", window: 86_400_000 },
  { id: "7d", label: "history.range.7d", window: 604_800_000 },
  { id: "all", label: "history.range.all", window: undefined },
] as const

type RangeID = (typeof ranges)[number]["id"]

type Domain = readonly [number, number]

const recentLimit = 24
const trendLimit = 60
const chartWidth = 300
const chartHeight = 40
const chartPadding = 4

export default function RunHistoryPanel() {
  const ctx = usePlugin<typeof definition>()
  const rangeName = createUniqueId()
  const [range, setRange] = createSignal<RangeID>("24h")
  const [model, setModel] = createSignal("")
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 60_000)
  onCleanup(() => clearInterval(timer))

  const samples = () => ctx.stores.history.value.samples
  const missing = () => ctx.t("history.missing")
  const allModels = createMemo(() => summarizeModels(samples()))
  const selected = () => (allModels().some((entry) => entry.key === model()) ? model() : "")
  createEffect(() => {
    if (model() !== "" && !allModels().some((entry) => entry.key === model())) setModel("")
  })
  const cutoff = () => {
    const window = ranges.find((entry) => entry.id === range())?.window
    return window === undefined ? undefined : now() - window
  }
  const filtered = createMemo(() => {
    const since = cutoff()
    const key = selected()
    return samples().filter(
      (sample) =>
        (since === undefined || sample.timestamp >= since) &&
        (key === "" || `${sample.providerID}/${sample.modelID}` === key),
    )
  })
  const models = createMemo(() => summarizeModels(filtered()))
  const recent = createMemo(() => recentSamples(filtered(), recentLimit))
  const trend = createMemo(() => filtered().slice(-trendLimit))
  const tpsDomain = createMemo(() => sharedDomain(models().flatMap((entry) => [entry.tpsP10, entry.tpsP95])))
  const ttftDomain = createMemo(() => sharedDomain(models().flatMap((entry) => [entry.ttftP10, entry.ttftP95])))
  const selection = () => allModels().find((entry) => entry.key === selected())
  const selectionLabel = () => selection()?.modelID ?? ctx.t("history.allModelsMixed")
  const selectionTitle = () => {
    const entry = selection()
    return entry ? `${entry.modelID} · ${entry.providerID}` : ctx.t("history.allModels")
  }
  const trendTruncated = () => filtered().length > trendLimit
  const trendCaption = () =>
    [
      selectionLabel(),
      trendTruncated()
        ? ctx.t("history.lastTurns", { count: trendLimit })
        : ctx.plural("history.turns", trend().length),
    ].join(" · ")

  return (
    <div data-component="run-history">
      <p data-slot="run-history-scope">{ctx.t("history.scope")}</p>
      <Show
        when={samples().length > 0}
        fallback={
          <div data-slot="run-history-empty">
            <span data-slot="run-history-empty-title">{ctx.t("history.empty")}</span>
            <span data-slot="run-history-empty-hint">{ctx.t("history.emptyHint")}</span>
          </div>
        }
      >
        <div data-slot="run-history-filters">
          <div data-slot="run-history-segments" role="radiogroup" aria-label={ctx.t("history.range")}>
            <For each={ranges}>
              {(entry) => (
                <label data-slot="run-history-segment">
                  <input
                    type="radio"
                    name={rangeName}
                    value={entry.id}
                    checked={range() === entry.id}
                    onChange={() => setRange(entry.id)}
                  />
                  <span>{ctx.t(entry.label)}</span>
                </label>
              )}
            </For>
          </div>
          <div data-slot="run-history-select">
            <select
              value={selected()}
              aria-label={ctx.t("history.modelFilter")}
              title={selectionTitle()}
              onChange={(event) => setModel(event.currentTarget.value)}
            >
              <option value="">{ctx.t("history.allModels")}</option>
              <For each={allModels()}>
                {(entry) => <option value={entry.key}>{`${entry.modelID} · ${entry.providerID}`}</option>}
              </For>
            </select>
            <span data-slot="run-history-select-chevron" aria-hidden="true" />
          </div>
        </div>
        <Show
          when={filtered().length > 0}
          fallback={
            <div data-slot="run-history-range-empty">
              <span data-slot="run-history-empty-title">{ctx.t("history.rangeEmpty")}</span>
              <span data-slot="run-history-empty-hint">{ctx.t("history.rangeEmptyHint")}</span>
            </div>
          }
        >
          <section data-slot="run-history-section" aria-label={ctx.t("history.models")}>
            <div data-slot="run-history-section-head">
              <h2 data-slot="run-history-heading">{ctx.t("history.models")}</h2>
              <div data-slot="run-history-legend" aria-hidden="true">
                <span data-slot="run-history-legend-item" data-marker="p50">
                  {ctx.t("history.legend.p50")}
                </span>
                <span data-slot="run-history-legend-item" data-marker="p95">
                  {ctx.t("history.legend.p95")}
                </span>
              </div>
            </div>
            <div data-slot="run-history-models">
              <For each={models()}>
                {(entry) => <ModelCard model={entry} tpsDomain={tpsDomain()} ttftDomain={ttftDomain()} />}
              </For>
            </div>
          </section>
          <section data-slot="run-history-section" aria-label={ctx.t("history.trend")}>
            <div data-slot="run-history-trend">
              <div data-slot="run-history-trend-head">
                <h2 data-slot="run-history-heading">{ctx.t("history.trend")}</h2>
                <span data-slot="run-history-caption" title={selectionTitle()}>
                  {trendCaption()}
                </span>
              </div>
              <Sparkline samples={trend()} label={selectionLabel()} missing={missing()} />
            </div>
          </section>
          <section data-slot="run-history-section" aria-label={ctx.t("history.recent")}>
            <h2 data-slot="run-history-heading">{ctx.t("history.recent")}</h2>
            <div data-slot="run-history-table" role="table" aria-label={ctx.t("history.recent")}>
              <div data-slot="run-history-group" data-header role="rowgroup">
                <div data-slot="run-history-row" data-header role="row">
                  <span role="columnheader" data-column="time">
                    {ctx.t("history.time")}
                  </span>
                  <span role="columnheader" data-column="model">
                    {ctx.t("history.model")}
                  </span>
                  <span role="columnheader" data-column="tps">
                    {ctx.t("history.tpsColumn")}
                  </span>
                  <span role="columnheader" data-column="ttft">
                    {ctx.t("history.ttftColumn")}
                  </span>
                  <span role="columnheader" data-column="cost">
                    {ctx.t("history.costColumn")}
                  </span>
                </div>
              </div>
              <div data-slot="run-history-group" role="rowgroup">
                <For each={recent()}>
                  {(sample) => <RecentRow sample={sample} missing={missing} now={now()} />}
                </For>
              </div>
            </div>
          </section>
        </Show>
      </Show>
    </div>
  )
}

function ModelCard(props: { model: ModelSummary; tpsDomain: Domain | undefined; ttftDomain: Domain | undefined }) {
  const ctx = usePlugin<typeof definition>()

  return (
    <article data-slot="run-history-model">
      <div data-slot="run-history-model-head">
        <span data-slot="run-history-model-name" dir="auto" title={`${props.model.providerID}/${props.model.modelID}`}>
          {props.model.modelID}
        </span>
        <span data-slot="run-history-turns">{ctx.plural("history.turns", props.model.turns)}</span>
      </div>
      <span data-slot="run-history-provider" dir="auto">
        {props.model.providerID}
      </span>
      <div data-slot="run-history-metrics">
        <Metric
          label={ctx.t("history.tps")}
          p10={props.model.tpsP10}
          p50={props.model.tpsP50}
          p90={props.model.tpsP90}
          p95={props.model.tpsP95}
          domain={props.tpsDomain}
          format={formatRate}
          missing={ctx.t("history.missing")}
        />
        <Metric
          label={ctx.t("history.ttft")}
          p10={props.model.ttftP10}
          p50={props.model.ttftP50}
          p90={props.model.ttftP90}
          p95={props.model.ttftP95}
          domain={props.ttftDomain}
          format={formatDuration}
          missing={ctx.t("history.missing")}
        />
        <Metric
          label={ctx.t("history.cost")}
          p50={props.model.averageCost}
          format={formatCost}
          missing={ctx.t("history.missing")}
        />
      </div>
    </article>
  )
}

function Metric(props: {
  label: string
  p10?: number
  p50?: number
  p90?: number
  p95?: number
  domain?: Domain
  format: (value: number) => string
  missing: string
}) {
  const ctx = usePlugin<typeof definition>()
  const band = () => {
    if (
      props.p10 === undefined ||
      props.p50 === undefined ||
      props.p90 === undefined ||
      props.p95 === undefined ||
      props.domain === undefined
    ) {
      return undefined
    }

    return { p10: props.p10, p50: props.p50, p90: props.p90, p95: props.p95, domain: props.domain }
  }
  const tail = () => {
    const value = props.p95
    if (value === undefined || value === props.p50) return undefined
    return ctx.t("history.p95", { value: props.format(value) })
  }

  return (
    <div data-slot="run-history-metric">
      <div data-slot="run-history-metric-head">
        <span data-slot="run-history-metric-label">{props.label}</span>
        <span data-slot="run-history-metric-value" data-missing={props.p50 === undefined ? "true" : undefined}>
          {props.p50 === undefined ? props.missing : props.format(props.p50)}
        </span>
        <Show when={tail()}>{(text) => <span data-slot="run-history-metric-tail">{text()}</span>}</Show>
      </div>
      <Show when={band()}>
        {(values) => (
          <Band
            metric={props.label}
            p10={values().p10}
            p50={values().p50}
            p90={values().p90}
            p95={values().p95}
            domain={values().domain}
            format={props.format}
          />
        )}
      </Show>
    </div>
  )
}

function Band(props: {
  metric: string
  p10: number
  p50: number
  p90: number
  p95: number
  domain: Domain
  format: (value: number) => string
}) {
  const ctx = usePlugin<typeof definition>()
  const position = (value: number) => {
    const [min, max] = props.domain
    if (max <= min) return 50
    return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
  }
  const start = () => position(props.p10)
  const end = () => position(props.p90)
  const single = () => props.p10 === props.p95
  const label = () =>
    single()
      ? ctx.t("history.bandSingleAria", {
          metric: props.metric,
          value: props.format(props.p50),
        })
      : ctx.t("history.bandAria", {
          metric: props.metric,
          p10: props.format(props.p10),
          p50: props.format(props.p50),
          p90: props.format(props.p90),
          p95: props.format(props.p95),
        })

  return (
    <div data-slot="run-history-band" data-single={single() ? "true" : undefined} role="img" aria-label={label()}>
      <Show
        when={!single()}
        fallback={
          <>
            <span data-slot="run-history-band-end" data-side="start">
              {props.format(props.p50)}
            </span>
            <span data-slot="run-history-band-track">
              <span
                data-slot="run-history-band-single"
                style={{ "inset-inline-start": `${position(props.p50)}%` }}
              />
            </span>
          </>
        }
      >
        <span data-slot="run-history-band-end" data-side="start">
          {props.format(props.p10)}
        </span>
        <span data-slot="run-history-band-track">
          <span
            data-slot="run-history-band-fill"
            style={{
              "inset-inline-start": `${Math.min(start(), end())}%`,
              width: `${Math.abs(end() - start())}%`,
            }}
          />
          <span data-slot="run-history-band-p95" style={{ "inset-inline-start": `${position(props.p95)}%` }} />
          <span data-slot="run-history-band-p50" style={{ "inset-inline-start": `${position(props.p50)}%` }} />
        </span>
        <span data-slot="run-history-band-end" data-side="end">
          {props.format(props.p90)}
        </span>
      </Show>
    </div>
  )
}

function Sparkline(props: { samples: readonly HistorySample[]; label: string; missing: string }) {
  const ctx = usePlugin<typeof definition>()
  const plot = createMemo(() => buildPlot(props.samples))
  const dots = createMemo(() => plot()?.segments.flatMap((segment) => (segment.length === 1 ? segment : [])) ?? [])
  const aria = () => {
    const series = plot()
    if (!series) return undefined

    return [
      ctx.t("history.trendAria", { model: props.label }),
      ctx.t("history.trendRange", { min: formatRate(series.min), max: formatRate(series.max) }),
      ctx.plural("history.turns", series.count),
    ].join(". ")
  }

  return (
    <Show
      when={plot()}
      fallback={
        <div data-slot="run-history-spark-missing">
          <span>{props.missing}</span>
          <span data-slot="run-history-spark-missing-hint">{ctx.t("history.trendMissing")}</span>
        </div>
      }
    >
      {(series) => (
        <div data-slot="run-history-trend-chart">
          <div data-slot="run-history-spark-plot">
            <svg
              data-slot="run-history-spark"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={aria()}
            >
              <For each={series().segments}>
                {(segment) => (
                  <Show when={segment.length > 1}>
                    <path data-slot="run-history-spark-area" d={areaPath(segment)} />
                    <path data-slot="run-history-spark-line" d={linePath(segment)} />
                  </Show>
                )}
              </For>
            </svg>
            <For each={dots()}>
              {(dot) => (
                <span
                  data-slot="run-history-spark-point"
                  aria-hidden="true"
                  style={{
                    "inset-inline-start": `${(dot.x / chartWidth) * 100}%`,
                    top: `${(dot.y / chartHeight) * 100}%`,
                  }}
                />
              )}
            </For>
          </div>
          <div
            data-slot="run-history-spark-scale"
            data-flat={series().min === series().max ? "true" : undefined}
            aria-hidden="true"
          >
            <span>{formatRate(series().max)}</span>
            <Show when={series().min !== series().max}>
              <span>{formatRate(series().min)}</span>
            </Show>
          </div>
        </div>
      )}
    </Show>
  )
}

function RecentRow(props: { sample: HistorySample; missing: () => string; now: number }) {
  const rate = () => {
    const value = sampleRate(props.sample)
    return value === undefined ? props.missing() : formatRate(value)
  }

  return (
    <div data-slot="run-history-row" role="row">
      <span data-column="time" role="cell" title={new Date(props.sample.timestamp).toLocaleString()}>
        {formatTimestamp(props.sample.timestamp, props.now)}
      </span>
      <span data-column="model" role="cell" dir="auto" title={`${props.sample.providerID}/${props.sample.modelID}`}>
        {props.sample.modelID}
      </span>
      <span data-column="tps" role="cell">
        {rate()}
      </span>
      <span data-column="ttft" role="cell">
        {props.sample.ttft === undefined ? props.missing() : formatDuration(props.sample.ttft)}
      </span>
      <span data-column="cost" role="cell">
        {props.sample.cost === undefined ? props.missing() : formatCost(props.sample.cost)}
      </span>
    </div>
  )
}

interface SparkPoint {
  x: number
  y: number
}

interface SparkPlot {
  segments: SparkPoint[][]
  min: number
  max: number
  count: number
}

function buildPlot(samples: readonly HistorySample[]): SparkPlot | undefined {
  const rates = samples.map(sampleRate)
  const values = rates.filter((rate): rate is number => rate !== undefined)
  if (values.length === 0) return undefined

  const min = Math.min(...values)
  const max = Math.max(...values)
  const flat = max === min
  const span = max - min
  const step = rates.length > 1 ? (chartWidth - chartPadding * 2) / (rates.length - 1) : 0
  const x = (index: number) => (rates.length > 1 ? chartPadding + index * step : chartWidth / 2)
  const y = (rate: number) =>
    flat ? chartHeight / 2 : chartPadding + (1 - (rate - min) / span) * (chartHeight - chartPadding * 2)
  const segments = rates.reduce<SparkPoint[][]>((groups, rate, index) => {
    if (rate === undefined) return groups

    const point = { x: x(index), y: y(rate) }
    if (index === 0 || rates[index - 1] === undefined) return [...groups, [point]]

    const current = groups.at(-1) ?? []
    return [...groups.slice(0, -1), [...current, point]]
  }, [])

  return { segments, min, max, count: values.length }
}

function linePath(points: readonly SparkPoint[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${round(point.x)} ${round(point.y)}`).join(" ")
}

function areaPath(points: readonly SparkPoint[]) {
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last) return ""

  return `${linePath(points)} L${round(last.x)} ${chartHeight} L${round(first.x)} ${chartHeight} Z`
}

function round(value: number) {
  return value.toFixed(1)
}

function sharedDomain(values: readonly (number | undefined)[]): Domain | undefined {
  const present = values.filter((value): value is number => value !== undefined)
  if (present.length === 0) return undefined

  const min = Math.min(...present)
  const max = Math.max(...present)
  if (max > min) return [min, max]

  const padding = Math.abs(min) * 0.1 || 1
  return [Math.max(0, min - padding), max + padding]
}

function formatTimestamp(timestamp: number, now: number) {
  const date = new Date(timestamp)
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  if (date.toDateString() === new Date(now).toDateString()) return time

  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`
}
