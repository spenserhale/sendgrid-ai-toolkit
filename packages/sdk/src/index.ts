export { SendgridClient } from "./client.js";
export { resolveConfig } from "./config.js";
export { SendgridError, SendgridAuthError, SendgridNotFoundError } from "./errors.js";
export type {
  SendgridConfig,
  Resource,
  ListResourcesParams,
  CreateResourceParams,
  PaginatedResponse,
  ErrorResponse,
} from "./types.js";
export {
  SendgridConfigSchema,
  ResourceSchema,
  ListResourcesParamsSchema,
  CreateResourceParamsSchema,
  ErrorResponseSchema,
} from "./types.js";
