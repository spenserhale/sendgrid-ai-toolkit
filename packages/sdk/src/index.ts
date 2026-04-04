export { SendgridClient } from "./client.js";
export { AccountManager } from "./account-manager.js";
export { resolveConfig, resolveAccounts } from "./config.js";
export { loadEnv } from "./env.js";
export { SendgridError, SendgridAuthError, SendgridNotFoundError } from "./errors.js";
export type {
  SendgridConfig,
  AccountConfig,
  EmailMessage,
  Block,
  Bounce,
  SpamReport,
  InvalidEmail,
  GlobalSuppression,
  SuppressionListParams,
  MultiAccountResult,
  AccountDiagnosis,
  DiagnoseReport,
  ErrorResponse,
} from "./types.js";
export {
  SendgridConfigSchema,
  AccountConfigSchema,
  AccountsConfigSchema,
  EmailMessageSchema,
  BlockSchema,
  BounceSchema,
  SpamReportSchema,
  InvalidEmailSchema,
  GlobalSuppressionSchema,
  SuppressionListParamsSchema,
  ErrorResponseSchema,
} from "./types.js";
