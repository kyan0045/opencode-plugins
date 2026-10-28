import { Plugin, Slot, Style } from "@opencode/plugin/gui"
import css from "./usage.css?inline"
import { GoUsage } from "./usage"

export default Plugin.define({
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
    },
  },
  setup(ctx) {
    ctx.add(Style, css)
    ctx.add(Slot, {
      at: "session.header",
      order: 5,
      render: (input) => <GoUsage session={input.session} active={input.active} />,
    })
  },
})
