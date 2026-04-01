# @sendgrid-toolkit/mcp

MCP server for Sendgrid, built with [FastMCP](https://github.com/punkpeye/fastmcp).

## Tools

| Tool | Description |
|------|-------------|
| `list_resources` | List resources with pagination |
| `get_resource` | Get a resource by ID |
| `create_resource` | Create a new resource |
| `delete_resource` | Delete a resource |

## Setup with Claude Desktop

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sendgrid-toolkit": {
      "command": "bun",
      "args": ["run", "/Users/spenser/Code/Toolkits/sendgrid-toolkit/packages/mcp/src/index.ts"],
      "env": {
        "SENDGRID_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Development

```bash
# Run in stdio mode
vp dev --filter @sendgrid-toolkit/mcp

# Inspect with FastMCP inspector
npx fastmcp inspect src/index.ts
```
