import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    // Normalize error.data.error to always be a string (prevents React #31)
    const d = err.response?.data;
    if (d && typeof d.error !== 'string') {
      d.error = d.error?.message || d.message || `שגיאת שרת (${err.response?.status})`;
    }
    return Promise.reject(err);
  }
);

export default api;
