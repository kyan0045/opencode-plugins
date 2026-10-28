import { Schema } from "effect"

export const WINDOWS = ["rolling", "weekly", "monthly"] as const
export type Window = (typeof WINDOWS)[number]

const Meter = Schema.Struct({
  window: Schema.Literals(WINDOWS),
  percent: Schema.Finite,
  resetsAt: Schema.Finite,
})

export const History = Schema.Struct({
  samples: Schema.Array(
    Schema.Struct({
      workspace: Schema.String,
      at: Schema.Number,
      windows: Schema.Array(Meter),
    }),
  ),
})

export type HistorySample = typeof History.Type["samples"][number]
