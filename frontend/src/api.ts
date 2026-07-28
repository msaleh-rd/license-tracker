import axios from 'axios';

import type {
  AuditLog,
  ControlSettings,
  DashboardResponse,
  ImportResult,
  LicenseFormValues,
  LicenseItem,
  LoginRequest,
  TokenResponse,
  User,
} from './types';

import type { KeycloakConfig } from './keycloak';
import { getValidKeycloakToken } from './keycloak';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
});

api.interceptors.request.use(async (config) => {
  const token = (await getValidKeycloakToken()) ?? localStorage.getItem('license_tracker_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    localStorage.setItem('license_tracker_token', token);
  } else {
    delete api.defaults.headers.common.Authorization;
    localStorage.removeItem('license_tracker_token');
  }
}

export function hydrateAuthToken() {
  const token = localStorage.getItem('license_tracker_token');
  if (token) {
    setAuthToken(token);
  }
  return token;
}

export async function getKeycloakConfig(): Promise<KeycloakConfig> {
  try {
    const { data } = await api.get<KeycloakConfig>('/api/auth/keycloak-config');
    return data;
  } catch {
    return {
      enabled: true,
      url: 'https://identity.vertodemos.com:8443',
      realm: 'vertowave',
      client_id: 'vertowave',
    };
  }
}


export async function login(payload: LoginRequest) {
  const { data } = await api.post<TokenResponse>('/api/auth/login', payload);
  setAuthToken(data.access_token);
  return data;
}

export async function getMe() {
  const { data } = await api.get<User>('/api/auth/me');
  return data;
}

export async function getUsers() {
  const { data } = await api.get<User[]>('/api/users');
  return data;
}

export async function updateUserRole(userId: number, role: string) {
  const { data } = await api.patch<User>(`/api/users/${userId}/role`, { role });
  return data;
}

export async function createUser(payload: { email: string; password: string; role: string; full_name: string }) {
  const { data } = await api.post<User>('/api/users', payload);
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const { data } = await api.patch<{ detail: string }>('/api/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return data;
}

export async function getDashboard() {
  const { data } = await api.get<DashboardResponse>('/api/dashboard');
  return data;
}

export async function getLicenses() {
  const { data } = await api.get<LicenseItem[]>('/api/licenses');
  return data;
}

export async function saveLicense(id: number | null, payload: LicenseFormValues) {
  const endpoint = id ? `/api/licenses/${id}` : '/api/licenses';
  const method = id ? 'patch' : 'post';
  const normalizedPayload = {
    ...payload,
    start_date: payload.start_date || null,
    expiry_date: payload.expiry_date || null,
    eol_date: payload.eol_date || null,
    last_reviewed: payload.last_reviewed || null,
  };
  const { data } = await api.request<LicenseItem>({ method, url: endpoint, data: normalizedPayload });
  return data;
}

export async function deleteLicense(id: number) {
  const { data } = await api.delete<{ status: string }>(`/api/licenses/${id}`);
  return data;
}

export async function uploadWorkbook(file: File) {
  const formData = new FormData();
  formData.append('upload', file);
  const { data } = await api.post<ImportResult>('/api/import/xlsx', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getAuditLogs() {
  const { data } = await api.get<AuditLog[]>('/api/audit-logs');
  return data;
}

export async function getInsights() {
  const { data } = await api.get<Record<string, number>>('/api/insights');
  return data;
}

export async function getCategories() {
  const { data } = await api.get<{ items: string[] }>('/api/categories');
  return data.items;
}

export async function getControlSettings() {
  const { data } = await api.get<ControlSettings>('/api/control-settings');
  return data;
}

export async function updateControlSettings(payload: ControlSettings) {
  const { data } = await api.put<ControlSettings>('/api/control-settings', payload);
  return data;
}

export async function exportWorkbook() {
  const response = await api.get('/api/export/xlsx', { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([response.data as BlobPart]));
  const link = document.createElement('a');
  link.href = url;
  link.download = `license-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function requestCurrentToken() {
  return localStorage.getItem('license_tracker_token');
}