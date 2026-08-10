import axios from "axios";

const platformApi = axios.create({ baseURL: "/api/platform" });

platformApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("platform_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

platformApi.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("platform_token");
      window.location.href = "/platform/login";
    }
    return Promise.reject(error);
  }
);

export default platformApi;
