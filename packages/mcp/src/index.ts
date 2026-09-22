import { FastMCP } from "fastmcp";
import { registerMessageTools } from "./tools/messages.js";
import { registerSuppressionTools } from "./tools/suppressions.js";
import { registerDiagnoseTools } from "./tools/diagnose.js";

const server = new FastMCP({
  name: "sendgrid-toolkit",
  version: "0.2.0",
  instructions:
    "SendGrid deliverability tools that fan out across every configured account. " +
    "For 'why isn't this person getting our email?' call diagnose_email first. " +
    "To fix, call clear_suppressions with dryRun: true, confirm with the user, then run it for real. " +
    "Destructive tools require an explicit account or allAccounts: true.",
});

registerDiagnoseTools(server);
registerMessageTools(server);
registerSuppressionTools(server);

server.start({
  transportType: "stdio",
});
