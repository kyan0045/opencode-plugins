# @kyan-plugins/run-meter

Live turn throughput, time to first token, and cost in the OpenCode Desktop session header. It sits to the left of the
other session-header indicators and keeps the settled rate in the assistant footer's hover row.

![The run meter in the session header](assets/header.png)

## What it shows

- The header indicator shows `~54.3 tok/s · 2.3s · $0.00` while a turn runs, then clears two seconds after the step
  settles.
- Hover or focus it for output tokens, active time, time to first token, turn cost, and whether the rate is still estimated.
  Press Escape to dismiss the card.
- Click it to open **Run history** in the side panel for the current session.
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

### Run history

Open the **+** menu in the session side panel and choose **Run history**, or pick it from the mobile view menu. The panel
covers successful turns recorded on this device. It summarizes turns per model with a p50 headline, a p10 to p90 band,
and a p95 marker for throughput and time to first token, plus the average cost per turn. A sparkline plots recent
throughput in time order, and the recent table lists the latest turns with a date when they are not from today.

Two filters sit above the content:

- **Time range** picks 24h (the default), 7d, or all recorded turns.
- **Model** picks all models or one model with history.

Both filters drive the summaries, sparkline, and recent list. They are local to the panel and are not saved.

Bands run from p10 at the start to p90 at the end, with a p50 tick and a p95 ring inside a shared per-metric scale so
models stay comparable. The legend above the cards marks both. TTFT bands read in the same direction as throughput.

A model with a single turn shows one value instead of a collapsed band. The sparkline covers the latest 60 turns and
says so when older turns are left out. It breaks at turns without a rate, draws a single sampled turn as a dot, and
labels its maximum plus its minimum unless the series is flat.

The recent table shows every column at the default 300px side panel width. The time column drops below a 264px panel,
and cost below 214px.

A turn that changes model mid-execution contributes to every model it used. Each model gets the tokens, active time,
cost, and throughput of its own steps, and a turn/model pair is recorded once. TTFT for a model is measured from the
start of its first step that produced text, reasoning, or tool input.

The history keeps the latest 500 turn/model records in the plugin's global store, so it survives a window reload. Only
successful executions are recorded; failed and interrupted attempts are dropped, so their cost is not included. Turns
still in flight, and events missed during a reload or reconnect, are not replayed and are not recorded. Windows record
independently, so two windows writing at the same moment can lose one record (last write wins).

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

The run history records successful turns from `session.execution.started`, `session.step.started`,
`session.step.streamed`, `session.step.ended`, and `session.execution.succeeded`. Failed and interrupted executions are
not recorded. Time to first token uses the same `session.text.started`, `session.reasoning.started`, and
`session.tool.input.started` events as the meter. Like the meter, the history does not call the server.

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
