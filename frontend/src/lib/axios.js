import axios from "axios";

export const axiosInstance = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.MODE === "development"
      ? "http://localhost:8081/api/v1"
      : "/api/v1"),
  withCredentials: true,
});
