import { Plugin, Slot, Style } from "@opencode/plugin/gui"
import { definition } from "./definition"
import { GoUsage } from "./usage"
import css from "./usage.css?inline"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  ctx.add(Style, css)
  ctx.add(Slot, {
    at: "session.header",
    order: 5,
    render: (input) => <GoUsage session={input.session} active={input.active} />,
  })
}

export default Plugin.define({ ...definition, setup })
