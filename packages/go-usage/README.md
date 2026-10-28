# @kyan-plugins/go-usage

An ambient OpenCode Go allowance meter for OpenCode Desktop. It sits in the session header next to the context
indicator, so the window closest to its limit is always in view.

![The Go usage pill in the session header](assets/header.png)

## What it shows

The pill reports the window that will stop you first: rolling, weekly or monthly, whichever has the highest percentage.
A `limited` window always wins, even when another has a higher percentage, because it is actively blocking.

- Neutral until a window reaches 80%, then amber.
- Red at 95%, or as soon as any window reports `limited`.
- Hover for all three meters and their reset times.
- Click to open the app's own **View usage** dialog, with the full breakdown and Console budgets.

The plugin renders nothing when the account has no Go allowance or the user is signed out, so it never adds dead chrome.

## Install

```bash
opencode plugin add @kyan-plugins/go-usage
```

Requires OpenCode Desktop 2.2.0 or newer. **Settings > Extensions > Plugins** lists it after it loads.

## How it decides

The hover card lists rolling, weekly and monthly in that order, each with a compact reset time. The pill shows the
highest of the three.

Data comes from the app's own synced `GET /api/experimental/usage/limits` response, the same one the Usage dialog reads.
The plugin refreshes it at most once a minute per window per location, when the window regains focus, and when the
session becomes active. There is no polling timer, it does not call Console itself, and nothing leaves the machine.

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
  "plugins": ["/path/to/opencode-go-usage"]
}
```

The app reloads the bundle in every window after each rebuild.

## License

MIT
