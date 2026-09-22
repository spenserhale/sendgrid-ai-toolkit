import { buildSuppressionListRoutes } from "./suppression-list.js";
import { formatTimestamp } from "../lib/text.js";

export const spamReportsRoutes = buildSuppressionListRoutes({
  noun: "spam report",
  plural: "spam reports",
  list: (client, params) => client.getSpamReports(params),
  remove: (client, email) => client.deleteSpamReport(email),
  row: (s) => `${formatTimestamp(s.created)}  ${s.email}${s.ip ? `  ip ${s.ip}` : ""}`,
});
