import { buildApplication, buildRouteMap } from "@stricli/core";
import { diagnoseCommand } from "./commands/diagnose.js";
import { messagesCommand } from "./commands/messages.js";
import { blocksRoutes } from "./commands/blocks.js";
import { bouncesRoutes } from "./commands/bounces.js";
import { spamReportsCommand } from "./commands/spam-reports.js";
import { invalidEmailsCommand } from "./commands/invalid-emails.js";
import { globalSuppressionsCommand } from "./commands/global-suppressions.js";

const routes = buildRouteMap({
  routes: {
    diagnose: diagnoseCommand,
    messages: messagesCommand,
    blocks: blocksRoutes,
    bounces: bouncesRoutes,
    "spam-reports": spamReportsCommand,
    "invalid-emails": invalidEmailsCommand,
    "global-suppressions": globalSuppressionsCommand,
  },
  docs: {
    brief: "SendGrid multi-account CLI toolkit",
  },
});

export const app = buildApplication(routes, {
  name: "sendgrid",
  versionInfo: {
    currentVersion: "0.1.0",
  },
});
