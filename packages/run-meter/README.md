# @kyan-plugins/run-meter

Live turn throughput, time to first token, and cost in the OpenCode Desktop session header. It sits to the left of the
other session-header indicators and keeps the settled rate in the assistant footer's hover row.

![The run meter in the session header](assets/header.png)

## What it shows

- The header indicator shows `~43.2 tok/s · 1.2s · $0.04` while a turn runs, then clears two seconds after the step
  settles.
- Hover it for output tokens, active time, time to first token, turn cost, and whether the rate is still estimated.
- The settled rate is appended to the assistant footer's hover row, next to the agent, model, and duration.
- **Settings > Run meter** controls the session header, composer row, assistant footer, and whether turn cost appears.

The estimate loses its `~` when the step's response body ends. A settled turn uses the TUI's exact formula:

```text
(output tokens + reasoning tokens) / (streamed time / 1000)
```

While a step streams, tokens are estimated from the text and reasoning received so far, because the provider reports
usage only when the step ends. TTFT comes from the window's `session.text.started`, `session.reasoning.started`, and
`session.tool.input.started` events, with a reasoning or tool part timestamp as the fallback after a reload.

The cost is for the current turn only. The context usage indicator shows the session total.

## Where it appears

### Assistant footer

![The settled rate in the assistant footer](assets/footer.png)

The settled rate appends to the assistant footer's hover row, next to the agent, model, and duration.

### Composer pill

![The optional composer pill](assets/pill.png)

Turn on **Composer row** in Settings to use the standard OpenCode composer pill above the prompt.

## Install

```bash
opencode plugin add @kyan-plugins/run-meter
```

Requires OpenCode Desktop 2.2.0 or newer. **Settings > Extensions > Plugins** lists it after it loads.

## Settings

All four toggles live under **Settings > Run meter**:

- **Session header** is on. The compact indicator beside the other header indicators.
- **Composer row** is off. Enables the standard OpenCode composer pill above the prompt.
- **Assistant footer** is on. Appends the settled rate to the assistant footer's hover row.
- **Show turn cost** is on. Shows the per-turn cost in the header, tooltip, composer pill, and footer.

## How it decides

The meter reads `session.server.data.session.message.list()` and uses each step's `time.created`, `time.streamed`,
`tokens.output`, `tokens.reasoning`, and `cost`. It does not call the server itself.

The assistant footer is app-owned and has no public plugin slot. The plugin appends a span to the metadata inside the
row the app already renders (`data-slot="text-part-meta"` inside `data-slot="text-part-copy-wrapper"`). It removes
itself with the plugin. If a future app update moves that row, the header indicator keeps working and the footer meter
stops appearing.

## Compatibility

The GUI plugin API is experimental, and this package is built against `@opencode/plugin` 2.2.0. A future desktop release
can change that API, so check the release notes before assuming a newer app works.

## Development

```bash
bun install
bun run dev     # rebuilds dist/gui-experimental.cjs on change
```

To test a local checkout, point the global config at it instead of the package name:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugins": ["/path/to/opencode-plugins/packages/run-meter"]
}
```

The app reloads the bundle in every window after each rebuild.

## License

MIT
