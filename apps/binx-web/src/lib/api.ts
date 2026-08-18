/**
 * api.ts
 * 
 * Global API types for the Binx Web application.
 * 
 * @module apps/binx-web/src/lib/api.ts
 * @author Binx.io
 */
import axios from "axios";

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