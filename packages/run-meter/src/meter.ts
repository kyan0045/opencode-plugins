import type { SessionMessageAssistant, SessionMessageInfo } from "@opencode/client"

const defaultSettleMs = 12_000

export interface MeterInput {
  readonly now: number
  readonly running: boolean
  readonly promptId?: string
  readonly settleMs?: number
  readonly firstOutput?: (step: SessionMessageAssistant) => number | undefined
}

export interface TurnMeter {
  readonly turnId: string | undefined
  readonly rate: number | undefined
  readonly estimated: boolean
  readonly ttft: number | undefined
  readonly cost: number
  readonly output: number
  readonly duration: number
  readonly running: boolean
}

export function turnMeter(messages: readonly SessionMessageInfo[], input: MeterInput): TurnMeter | undefined {
  const relevant =
    !input.running && messages[messages.length - 1]?.type === "idle" ? messages.slice(0, -1) : messages
  const steps = turnSteps(relevant, input.promptId)
  if (steps.length === 0) return undefined

  const end = steps.reduce(
    (latest, step) => Math.max(latest, step.time.completed ?? step.time.streamed ?? step.time.created),
    0,
  )
  if (!input.running && input.now - end > (input.settleMs ?? defaultSettleMs)) return undefined

  const settled = steps.every((step) => step.time.streamed !== undefined)
  const cutoff = input.running ? input.now : end
  const output = steps.reduce((total, step) => total + outputTokens(step, settled), 0)
  const duration = steps.reduce(
    (total, step) => total + Math.max(0, (step.time.streamed ?? step.time.completed ?? cutoff) - step.time.created),
    0,
  )
  const first = steps[0]
  const firstOutput = first ? (input.firstOutput?.(first) ?? firstPartOutput(first)) : undefined

  return {
    turnId: first?.id,
    rate: output > 0 && duration > 0 ? output / (duration / 1_000) : undefined,
    estimated: !settled,
    ttft: first && firstOutput !== undefined ? Math.max(0, firstOutput - first.time.created) : undefined,
    cost: steps.reduce((total, step) => total + (step.cost ?? 0), 0),
    output,
    duration,
    running: input.running,
  }
}

export function formatRate(rate: number) {
  return rate.toFixed(1)
}

export function formatDuration(ms: number) {
  if (ms < 1_000) return `${Math.round(ms)}ms`
  if (ms < 10_000) return `${(ms / 1_000).toFixed(1)}s`
  return `${Math.round(ms / 1_000)}s`
}

export function formatCost(cost: number) {
  if (cost > 0 && cost < 0.001) return `$${cost.toFixed(4)}`
  if (cost > 0 && cost < 0.01) return `$${cost.toFixed(3)}`
  return `$${cost.toFixed(2)}`
}

function turnSteps(messages: readonly SessionMessageInfo[], promptID?: string) {
  if (promptID) {
    const start = messages.findIndex((message) => message.id === promptID)
    if (start === -1) return []
    const legacy = !messages.some((message) => message.type === "idle")
    const end = messages.findIndex(
      (message, index) =>
        index > start &&
        (message.type === "idle" || (legacy && (message.type === "user" || message.type === "synthetic"))),
    )

    return messages
      .slice(start + 1, end === -1 ? undefined : end)
      .filter((message): message is SessionMessageAssistant => message.type === "assistant")
  }

  const idle = messages.findLastIndex((message) => message.type === "idle")
  const boundary =
    idle >= 0
      ? idle
      : messages.findLastIndex((message) => message.type === "user" || message.type === "synthetic")

  if (boundary === -1 && messages[0]?.type === "assistant") return []

  return messages
    .slice(boundary + 1)
    .filter((message): message is SessionMessageAssistant => message.type === "assistant")
}

function outputTokens(step: SessionMessageAssistant, settled: boolean) {
  if (step.tokens) return step.tokens.output + step.tokens.reasoning
  return settled ? 0 : estimateTokens(step.content)
}

function estimateTokens(content: SessionMessageAssistant["content"]) {
  const counts = content.reduce(
    (total, part) => {
      if (part.type !== "text" && part.type !== "reasoning") return total
      for (const character of part.text) {
        if (character.charCodeAt(0) <= 0x7f) total.ascii++
        else total.wide++
      }
      return total
    },
    { ascii: 0, wide: 0 },
  )
  return Math.ceil(counts.ascii / 4) + counts.wide
}

function firstPartOutput(step: SessionMessageAssistant) {
  const part = step.content[0]
  if (part?.type === "reasoning") return part.time?.created
  if (part?.type === "tool") return part.time.created
  return undefined
}
