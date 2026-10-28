# opencode-plugins

GUI plugins for [OpenCode Desktop](https://opencode.ai).

## Packages

- [`@kyan-plugins/go-usage`](packages/go-usage): ambient OpenCode Go allowance meter in the session header.

Each package publishes to npm and installs with:

```bash
opencode plugin add @kyan-plugins/<name>
```

Requires OpenCode Desktop 2.2.0 or newer.

## Development

```bash
bun install
bun run build
bun run typecheck
```

Each package also has `bun run dev` for a watch build. To load a local checkout, point `plugins` in the global
`~/.config/opencode/opencode.jsonc` at the package directory.

## License

MIT
