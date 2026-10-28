import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

export const ProcessKind = Schema.Literals([
  "main",
  "renderer",
  "gpu",
  "network",
  "utility",
  "zygote",
  "crashpad",
  "cli",
  "other",
])

export const MemoryProcess = Schema.Struct({
  pid: Schema.Number,
  name: Schema.String,
  kind: ProcessKind,
  pss: Schema.Number,
})

export const CgroupMemory = Schema.Struct({
  version: Schema.Literals([1, 2]),
  path: Schema.String,
  current: Schema.NullOr(Schema.Number),
  peak: Schema.NullOr(Schema.Number),
})

export const MemorySample = Schema.Struct({
  at: Schema.Number,
  app: Schema.Number,
  server: Schema.Number,
  serverPid: Schema.NullOr(Schema.Number),
  serverRunning: Schema.Boolean,
  processes: Schema.Array(MemoryProcess),
  cgroup: Schema.NullOr(CgroupMemory),
})

export type ProcessKind = typeof ProcessKind.Type
export type MemoryProcess = typeof MemoryProcess.Type
export type CgroupMemory = typeof CgroupMemory.Type
export type MemorySample = typeof MemorySample.Type

export const Memory = Ipc.define({
  id: "@kyan-plugins/memory-monitor.memory",
  methods: {
    sample: { output: MemorySample },
  },
})
