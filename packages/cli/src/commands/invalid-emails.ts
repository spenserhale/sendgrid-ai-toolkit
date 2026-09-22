import { buildSuppressionListRoutes } from "./suppression-list.js";
import { formatTimestamp } from "../lib/text.js";

export const invalidEmailsRoutes = buildSuppressionListRoutes({
  noun: "invalid email",
  plural: "invalid email addresses",
  list: (client, params) => client.getInvalidEmails(params),
  remove: (client, email) => client.deleteInvalidEmail(email),
  row: (inv) => `${formatTimestamp(inv.created)}  ${inv.email}  ${inv.reason}`,
});
