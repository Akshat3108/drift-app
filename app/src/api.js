import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Default to your LAN IP. Override at runtime by saving 'drift_api_url' in AsyncStorage.
// To find your machine's LAN IP: `hostname -I` on Linux.
const DEFAULT_API_URL = 'http://192.168.1.100:3001/api';

let _baseURL = DEFAULT_API_URL;
let _token = null;

export async function loadApiConfig() {
  const url = await AsyncStorage.getItem('drift_api_url');
  const token = await AsyncStorage.getItem('drift_token');
  if (url) _baseURL = url;
  _token = token || null;
}

export async function setApiUrl(url) {
  _baseURL = url;
  await AsyncStorage.setItem('drift_api_url', url);
}

export async function setToken(token) {
  _token = token;
  if (token) await AsyncStorage.setItem('drift_token', token);
  else await AsyncStorage.removeItem('drift_token');
}

export function getApiUrl() { return _baseURL; }
export function getToken()  { return _token; }
export function isAuthed()  { return !!_token; }

function client() {
  return axios.create({
    baseURL: _baseURL,
    headers: _token ? { Authorization: `Bearer ${_token}` } : {},
    timeout: 8000,
  });
}

// ─── Auth ───
export const auth = {
  register: (email, password, name) => client().post('/auth/register', { email, password, name }),
  login:    (email, password)       => client().post('/auth/login',    { email, password }),
  me:       ()                      => client().get('/auth/me'),
};

// ─── Categories (pots) ───
export const categories = {
  list:   ()        => client().get('/categories'),
  create: (data)    => client().post('/categories', data),
  update: (id, data)=> client().put(`/categories/${id}`, data),
  delete: (id)      => client().delete(`/categories/${id}`),
};

// ─── Expenses ───
export const expenses = {
  list:    (params = {}) => client().get('/expenses', { params }),
  summary: (month)       => client().get('/expenses/summary', { params: { month } }),
  trend:   ()            => client().get('/expenses/monthly-trend'),
  get:     (id)          => client().get(`/expenses/${id}`),
  create:  (data)        => client().post('/expenses', data),
  update:  (id, data)    => client().put(`/expenses/${id}`, data),
  delete:  (id)          => client().delete(`/expenses/${id}`),
};

// ─── Subscriptions ───
export const subscriptions = {
  list:      ()       => client().get('/subscriptions'),
  create:    (data)   => client().post('/subscriptions', data),
  cancel:    (id)     => client().patch(`/subscriptions/${id}/cancel`),
  reinstate: (id)     => client().patch(`/subscriptions/${id}/reinstate`),
  delete:    (id)     => client().delete(`/subscriptions/${id}`),
};

// ─── Goals ───
export const goals = {
  list:   ()         => client().get('/goals'),
  create: (data)     => client().post('/goals', data),
  update: (id, data) => client().put(`/goals/${id}`, data),
  delete: (id)       => client().delete(`/goals/${id}`),
};

// ─── Settings ───
export const settings = {
  get:    ()     => client().get('/settings'),
  update: (data) => client().put('/settings', data),
};

// ─── Upload (receipt OCR) ───
export const upload = {
  receipt: (formData) => client().post('/upload/receipt', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  }),
};

// Quick health check
export const health = () => axios.get(`${_baseURL}/health`, { timeout: 3000 });
