import { Plugin, Store } from "@opencode/plugin/gui"
import { History } from "./history"

export const definition = Plugin.define({
  stores: {
    history: Store.global(History, { samples: [] }),
  },
  i18n: {
    en: {
      "pill.label": "Go {{percent}}%",
      "card.title": "OpenCode Go",
      "window.rolling": "Rolling",
      "window.weekly": "Weekly",
      "window.monthly": "Monthly",
      "reset.in": "in {{when}}",
      "reset.now": "now",
      "reset.minutes": "{{count}}m",
      "reset.hours": "{{count}}h",
      "reset.days": "{{count}}d",
      "forecast.cap": "{{window}} cap in {{when}} at this rate",
      "forecast.resets": "{{window}} resets first",
      "forecast.reached": "{{window}} cap reached",
    },
  },
})
