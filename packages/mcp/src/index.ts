import { FastMCP } from "fastmcp";
import { registerResourceTools } from "./tools/resources.js";

const server = new FastMCP({
  name: "sendgrid-toolkit",
  version: "0.1.0",
});

// Register tool groups
registerResourceTools(server);

// Start the server in stdio mode (for Claude Desktop, Cursor, etc.)
server.start({
  transportType: "stdio",
});
