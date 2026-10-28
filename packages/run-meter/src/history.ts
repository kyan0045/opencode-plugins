import { Schema } from "effect"
import type {
  ModelRef,
  SessionExecutionFailed,
  SessionExecutionInterrupted,
  SessionExecutionStarted,
  SessionExecutionSucceeded,
  SessionStepEnded,
  SessionStepStarted,
  SessionStepStreamed,
} from "@opencode/client"

export const HistorySample = Schema.Struct({
  timestamp: Schema.Number,
  sessionID: Schema.String,
  turnKey: Schema.String,
  providerID: Schema.String,
  modelID: Schema.String,
  output: Schema.Number,
  reasoning: Schema.Number,
  duration: Schema.Number,
  ttft: Schema.optional(Schema.Number),
  cost: Schema.optional(Schema.Number),
})

export type HistorySample = Schema.Schema.Type<typeof HistorySample>

export const History = Schema.Struct({ samples: Schema.Array(HistorySample) })

const historyLimit = 500

export function mergeSamples(current: readonly HistorySample[], incoming: readonly HistorySample[]) {
  const merged = new Map<string, HistorySample>()
  for (const sample of current) merged.set(sampleKey(sample), sample)
  for (const sample of incoming) merged.set(sampleKey(sample), sample)

  return [...merged.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-historyLimit)
}

function sampleKey(sample: HistorySample) {
  return `${sample.turnKey}:${sample.providerID}/${sample.modelID}`
}

interface RecordedStep {
  started: number
  streamed?: number
  completed?: number
  model: ModelRef
  output?: number
  reasoning?: number
  cost?: number
  firstOutput?: number
}

interface PendingTurn {
  key: string
  sessionID: string
  steps: Map<string, RecordedStep>
}

export function createTurnRecorder(record: (samples: HistorySample[]) => void) {
  const pending = new Map<string, PendingTurn>()

  return {
    start(event: SessionExecutionStarted) {
      pending.set(event.data.sessionID, {
        key: `${event.data.sessionID}:${event.id}`,
        sessionID: event.data.sessionID,
        steps: new Map(),
      })
    },
    stepStarted(event: SessionStepStarted) {
      const turn = pending.get(event.data.sessionID)
      if (!turn) return
      turn.steps.set(event.data.assistantMessageID, {
        started: event.data.started,
        model: event.data.model,
      })
    },
    stepStreamed(event: SessionStepStreamed) {
      const step = pending.get(event.data.sessionID)?.steps.get(event.data.assistantMessageID)
      if (step) step.streamed = event.created
    },
    stepEnded(event: SessionStepEnded, firstOutput: (messageID: string) => number | undefined) {
      const step = pending.get(event.data.sessionID)?.steps.get(event.data.assistantMessageID)
      if (!step) return

      step.completed = event.created
      step.output = event.data.tokens.output
      step.reasoning = event.data.tokens.reasoning
      step.cost = event.data.cost
      step.firstOutput = firstOutput(event.data.assistantMessageID)
    },
    succeed(event: SessionExecutionSucceeded) {
      const turn = pending.get(event.data.sessionID)
      if (!turn) return
      pending.delete(event.data.sessionID)

      const settled = [...turn.steps.values()].filter((step) => step.output !== undefined)
      if (settled.length === 0) return

      const groups = new Map<string, RecordedStep[]>()
      for (const step of settled) {
        const key = `${step.model.providerID}/${step.model.id}`
        const group = groups.get(key)
        if (group) group.push(step)
        else groups.set(key, [step])
      }

      const samples = [...groups.values()].flatMap((group): HistorySample[] => {
        const output = group.reduce((total, step) => total + (step.output ?? 0), 0)
        const reasoning = group.reduce((total, step) => total + (step.reasoning ?? 0), 0)
        if (output + reasoning === 0) return []

        const costs = group.flatMap((step) => (step.cost === undefined ? [] : [step.cost]))
        const model = group[0]?.model
        if (!model) return []

        return [
          {
            timestamp: event.created,
            sessionID: turn.sessionID,
            turnKey: turn.key,
            providerID: model.providerID,
            modelID: model.id,
            output,
            reasoning,
            duration: group.reduce((total, step) => total + stepDuration(step), 0),
            ttft: ttftFor(group),
            cost: costs.length === 0 ? undefined : costs.reduce((total, cost) => total + cost, 0),
          },
        ]
      })

      if (samples.length > 0) record(samples)
    },
    cancel(event: SessionExecutionFailed | SessionExecutionInterrupted) {
      pending.delete(event.data.sessionID)
    },
  }
}

function stepDuration(step: RecordedStep) {
  return Math.max(0, (step.streamed ?? step.completed ?? step.started) - step.started)
}

function ttftFor(steps: readonly RecordedStep[]) {
  const produced = steps
    .filter((step): step is RecordedStep & { firstOutput: number } => step.firstOutput !== undefined)
    .toSorted((a, b) => a.firstOutput - b.firstOutput)
  const first = produced[0]

  return first === undefined ? undefined : Math.max(0, first.firstOutput - first.started)
}

export interface ModelSummary {
  readonly key: string
  readonly providerID: string
  readonly modelID: string
  readonly turns: number
  readonly tpsP10: number | undefined
  readonly tpsP50: number | undefined
  readonly tpsP90: number | undefined
  readonly tpsP95: number | undefined
  readonly ttftP10: number | undefined
  readonly ttftP50: number | undefined
  readonly ttftP90: number | undefined
  readonly ttftP95: number | undefined
  readonly averageCost: number | undefined
}

interface SummaryDraft {
  providerID: string
  modelID: string
  turns: number
  tps: number[]
  ttft: number[]
  cost: number
  costTurns: number
}

export function summarizeModels(samples: readonly HistorySample[]): ModelSummary[] {
  const groups = samples.reduce((groups, sample) => {
    const key = `${sample.providerID}/${sample.modelID}`
    const existing = groups.get(key)
    const draft = existing ?? {
      providerID: sample.providerID,
      modelID: sample.modelID,
      turns: 0,
      tps: [],
      ttft: [],
      cost: 0,
      costTurns: 0,
    }

    draft.turns += 1

    const rate = sampleRate(sample)
    if (rate !== undefined) draft.tps.push(rate)
    if (sample.ttft !== undefined) draft.ttft.push(sample.ttft)
    if (sample.cost !== undefined) {
      draft.cost += sample.cost
      draft.costTurns += 1
    }
    if (!existing) groups.set(key, draft)

    return groups
  }, new Map<string, SummaryDraft>())

  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      providerID: group.providerID,
      modelID: group.modelID,
      turns: group.turns,
      tpsP10: percentile(group.tps, 0.1),
      tpsP50: percentile(group.tps, 0.5),
      tpsP90: percentile(group.tps, 0.9),
      tpsP95: percentile(group.tps, 0.95),
      ttftP10: percentile(group.ttft, 0.1),
      ttftP50: percentile(group.ttft, 0.5),
      ttftP90: percentile(group.ttft, 0.9),
      ttftP95: percentile(group.ttft, 0.95),
      averageCost: group.costTurns === 0 ? undefined : group.cost / group.costTurns,
    }))
    .sort((a, b) => b.turns - a.turns || a.key.localeCompare(b.key))
}

export function recentSamples(samples: readonly HistorySample[], limit = 24) {
  return samples.toSorted((a, b) => b.timestamp - a.timestamp).slice(0, limit)
}

export function sampleRate(sample: HistorySample) {
  const tokens = sample.output + sample.reasoning
  return tokens > 0 && sample.duration > 0 ? tokens / (sample.duration / 1_000) : undefined
}

export function percentile(values: readonly number[], fraction: number) {
  if (values.length === 0) return undefined

  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)]
}
