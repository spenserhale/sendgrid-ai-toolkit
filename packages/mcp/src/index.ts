import { FastMCP } from "fastmcp";
import { registerMessageTools } from "./tools/messages.js";
import { registerSuppressionTools } from "./tools/suppressions.js";
import { registerDiagnoseTools } from "./tools/diagnose.js";

const server = new FastMCP({
  name: "sendgrid-toolkit",
  version: "0.1.0",
});

registerMessageTools(server);
registerSuppressionTools(server);
registerDiagnoseTools(server);

server.start({
  transportType: "stdio",
});
