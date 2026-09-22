import { buildSuppressionListRoutes } from "./suppression-list.js";
import { formatTimestamp } from "../lib/text.js";

export const blocksRoutes = buildSuppressionListRoutes({
  noun: "block",
  plural: "blocked email addresses",
  list: (client, params) => client.getBlocks(params),
  getOne: (client, email) => client.getBlock(email),
  remove: (client, email) => client.deleteBlock(email),
  row: (b) => `${formatTimestamp(b.created)}  ${b.email}  ${b.reason}`,
});
