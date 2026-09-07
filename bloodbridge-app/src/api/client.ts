import axios from "axios";

import { API_BASE_URL } from "@/config";
import { useAuthStore } from "@/store/authStore";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

// Attach the bearer token to every request, mirroring the backend's
// HTTPBearer scheme (Authorization: Bearer <token>).
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// FastAPI's HTTPException body is {"detail": "..."}; surface that message
// directly so screens can just do error.message.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail = error?.response?.data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : error?.message === "Network Error"
          ? "Can't reach the BloodBridge server. Check src/config.ts and that your backend is running."
          : error?.message || "Something went wrong";
    return Promise.reject(new Error(message));
  }
);
