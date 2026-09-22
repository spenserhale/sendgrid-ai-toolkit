import { buildSuppressionListRoutes } from "./suppression-list.js";
import { formatTimestamp } from "../lib/text.js";

export const bouncesRoutes = buildSuppressionListRoutes({
  noun: "bounce",
  plural: "bounced email addresses",
  list: (client, params) => client.getBounces(params),
  getOne: (client, email) => client.getBounce(email),
  remove: (client, email) => client.deleteBounce(email),
  row: (b) => `${formatTimestamp(b.created)}  ${b.email}  ${b.reason}`,
});
