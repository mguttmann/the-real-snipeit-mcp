export const DEFAULT_API_BASE = "https://snipe-it.example.com/api/v1";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_LOG_LEVEL = "info" as const;

export const SERVER_NAME = "the-real-snipeit-mcp";
export const SERVER_VERSION = "0.1.5";

export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 500,
  AUTO_PAGINATE_PAGE_SIZE: 200,
  AUTO_PAGINATE_MAX_ROWS: 10_000,
};

export const RETRY = {
  MAX_ATTEMPTS: 3,
  BACKOFF_MS: [1000, 2000, 4000] as const,
  RETRY_AFTER_CEILING_MS: 60_000,
};
