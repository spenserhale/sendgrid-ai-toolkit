import { buildApplication, buildRouteMap } from "@stricli/core";
import { accountsCommand } from "./commands/accounts.js";
import { diagnoseCommand } from "./commands/diagnose.js";
import { clearCommand } from "./commands/clear.js";
import { messagesCommand } from "./commands/messages.js";
import { blocksRoutes } from "./commands/blocks.js";
import { bouncesRoutes } from "./commands/bounces.js";
import { spamReportsRoutes } from "./commands/spam-reports.js";
import { invalidEmailsRoutes } from "./commands/invalid-emails.js";
import { globalSuppressionsRoutes } from "./commands/global-suppressions.js";
import { unsubscribeGroupsRoutes } from "./commands/unsubscribe-groups.js";
import { agentContextCommand } from "./commands/agent-context.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { CLI_NAME, CLI_VERSION } from "./version.js";

const routes = buildRouteMap({
  routes: {
    diagnose: diagnoseCommand,
    clear: clearCommand,
    messages: messagesCommand,
    blocks: blocksRoutes,
    bounces: bouncesRoutes,
    "spam-reports": spamReportsRoutes,
    "invalid-emails": invalidEmailsRoutes,
    "global-suppressions": globalSuppressionsRoutes,
    "unsubscribe-groups": unsubscribeGroupsRoutes,
    accounts: accountsCommand,
    "agent-context": agentContextCommand,
    upgrade: upgradeCommand,
  },
  docs: {
    brief: "SendGrid multi-account deliverability CLI",
    fullDescription:
      "Investigate and fix email delivery for one address across every configured SendGrid account. " +
      "Output: --format text (default), json, or toon; or set SENDGRID_OUTPUT.",
  },
});

export const app = buildApplication(routes, {
  name: CLI_NAME,
  versionInfo: {
    currentVersion: CLI_VERSION,
  },
});
