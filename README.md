# Sendgrid Toolkit

SDK, CLI, and MCP server for Sendgrid

A VitePlus monorepo containing the SDK, CLI, and MCP server for the Sendgrid API.

## Packages

| Package                                   | Description                                         |
| ----------------------------------------- | --------------------------------------------------- |
| [`@sendgrid-toolkit/sdk`](./packages/sdk) | Core SDK with types, API client, and business logic |
| [`@sendgrid-toolkit/cli`](./packages/cli) | Command-line interface (Stricli)                    |
| [`@sendgrid-toolkit/mcp`](./packages/mcp) | MCP server for AI assistants (FastMCP)              |

## Getting Started

```bash
# Install dependencies
bun install

# Build all packages
vp build

# Run the CLI
vp dev --filter @sendgrid-toolkit/cli -- --help

# Run the MCP server (stdio mode for Claude Desktop)
vp dev --filter @sendgrid-toolkit/mcp
```

## Architecture

```
packages/sdk/     <-- Types, API client, business logic (foundation)
    ^       ^
    |       |
packages/cli/   packages/mcp/
    (Stricli)    (FastMCP)
```

Both the CLI and MCP server are thin wrappers over the SDK. If the REST API
changes, you update the SDK and both consumers get the fix automatically.

## Development

```bash
# Run tests across all packages
vp test

# Lint and format
vp check

# Build a specific package
vp build --filter @sendgrid-toolkit/sdk
```

## Adding a New API Operation

1. Add types to `packages/sdk/src/types.ts`
2. Add the client method to `packages/sdk/src/client.ts`
3. Add a CLI command in `packages/cli/src/commands/`
4. Add an MCP tool in `packages/mcp/src/tools/`
