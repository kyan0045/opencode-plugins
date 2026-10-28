import type { Plugin } from "@opencode/plugin/gui"
import { Memory } from "./contract"
import { sampleMemory } from "./memory"

export const main: Plugin.MainSetup = (ctx) => {
  ctx.provide(Memory, {
    sample: () => sampleMemory(ctx.serverEndpoints.get("sidecar")),
  })
}
