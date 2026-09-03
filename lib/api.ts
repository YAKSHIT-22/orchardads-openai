import axios, { AxiosError, AxiosInstance } from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const status = error.response?.status;

    if (status === 401) {
      window.location.href = "/signin";
      return Promise.reject(error);
    }

    // Retry on 429 (rate limit) and 5xx server errors
    const config = error.config as any;
    if (!config) return Promise.reject(error);

    config._retryCount = config._retryCount || 0;

    if (
      (status === 429 || (status !== undefined && status >= 500)) &&
      config._retryCount < MAX_RETRIES
    ) {
      config._retryCount += 1;

      // Respect Retry-After header if present (for 429)
      const retryAfter = error.response?.headers?.["retry-after"];
      const delay = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : RETRY_DELAY_MS * Math.pow(2, config._retryCount - 1); // exponential backoff

      await sleep(delay);
      return api(config);
    }

    return Promise.reject(error);
  }
);
