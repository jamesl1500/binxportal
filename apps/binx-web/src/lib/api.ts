/**
 * api.ts
 *
 * Global API types for the Binx Web application.
 *
 * @module apps/binx-web/src/lib/api.ts
 * @author Binx Portal
 */
import axios, { AxiosError } from "axios";

import { clientIpHeaders } from "@/lib/client-ip";
import { hasDotSegment } from "@/lib/file-proxy";

/**
 * api
 *
 * Axios instance configured with the base URL from the environment variable `NEXT_PUBLIC_API_URL`.
 * This instance is used for making API requests throughout the application.
 *
 * @constant {AxiosInstance} api - The configured Axios instance for API requests.
 * @example
 * import { api } from "@/lib/api";
 *
 * const fetchData = async () => {
 *   const response = await api.get("/endpoint");
 *   return response.data;
 * };
 */
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Route params (already URL-decoded by Next) are interpolated into request
// paths all over lib/*. A param like `..%2F..%2Fusers` would otherwise walk
// the path to a different binx-api endpoint, called with the viewer's token.
// Rejected as a response-less AxiosError, which every caller already treats
// as a generic failure.
api.interceptors.request.use((config) => {
  if (hasDotSegment(config.url)) {
    throw new AxiosError(
      "Refusing an API path with a dot-segment",
      AxiosError.ERR_BAD_REQUEST,
      config,
    );
  }
  return config;
});

// Every call carries the visitor's IP (when PROXY_SHARED_SECRET is set) so
// binx-api's per-IP rate limits apply per visitor, not to this server as a
// whole — see lib/client-ip.ts. Only ever runs server-side: nothing in the
// client bundle imports this module.
api.interceptors.request.use(async (config) => {
  for (const [name, value] of Object.entries(await clientIpHeaders())) {
    config.headers.set(name, value);
  }
  return config;
});
