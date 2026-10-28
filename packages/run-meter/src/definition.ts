import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"
import { History } from "./history"
import en from "./i18n/en"

export const definition = Plugin.define({
  stores: {
    placement: Store.global(
      Schema.Struct({
        header: Schema.Boolean,
        composer: Schema.Boolean,
        footer: Schema.Boolean,
        cost: Schema.Boolean,
      }),
      { header: true, composer: false, footer: true, cost: true },
    ),
    history: Store.global(History, { samples: [] }),
  },
  i18n: { en },
})
