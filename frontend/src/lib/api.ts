import axios from 'axios';
import { getToken } from './auth';

// --- Interfaces ---

export interface JobScore {
  relevance: number;
  budget: number;
  client_quality: number;
  competition: number;
  overall: number;
}

export interface Job {
  id: string;
  upwork_id: string;
  title: string;
  description: string;
  budget_min: number | null;
  budget_max: number | null;
  budget_type: string;
  skills: string[];
  category: string;
  client_country: string;
  client_rating: number | null;
  client_total_spent: number | null;
  client_hires: number | null;
  proposals_count: number | null;
  connect_price: number | null;
  url: string;
  posted_at: string;
  scraped_at: string;
  status: string;
  overall_score: number | null;
  scores: JobScore | null;
  cover_letter_id: string | null;
  filter_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobListResponse {
  items: Job[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface SearchFilter {
  id: string;
  name: string;
  query: string;
  category: string | null;
  budget_min: number | null;
  budget_max: number | null;
  skills: string[];
  is_active: boolean;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface TeamProfile {
  id: string;
  skills: string[];
  portfolio_urls: string[];
  cover_letter_style: string;
  hourly_rate_min: number | null;
  hourly_rate_max: number | null;
  bio: string;
  updated_at: string;
}

export interface CoverLetter {
  id: string;
  job_id: string;
  content: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface FunnelStats {
  total_jobs: number;
  scored: number;
  letters_ready: number;
  applied: number;
  rejected: number;
  period_days: number;
}

// --- Axios instance ---

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// --- API functions ---

export async function getJobs(params?: {
  page?: number;
  size?: number;
  status?: string;
  search?: string;
}): Promise<JobListResponse> {
  const { data } = await api.get('/api/jobs', { params });
  return data;
}

export async function getJob(id: string): Promise<Job> {
  const { data } = await api.get(`/api/jobs/${id}`);
  return data;
}

export async function updateJobStatus(id: string, status: string): Promise<Job> {
  const { data } = await api.patch(`/api/jobs/${id}/status`, { status });
  return data;
}

export async function getJobFilters(): Promise<SearchFilter[]> {
  const { data } = await api.get('/api/filters');
  return data;
}

export async function createJobFilter(filterData: {
  name: string;
  query: string;
  category?: string;
  budget_min?: number;
  budget_max?: number;
  skills?: string[];
}): Promise<SearchFilter> {
  const { data } = await api.post('/api/filters', filterData);
  return data;
}

export async function login(email: string, password: string): Promise<{ access_token: string }> {
  const { data } = await api.post('/api/auth/login', { email, password });
  return data;
}

export async function getMe(): Promise<User> {
  const { data } = await api.get('/api/auth/me');
  return data;
}

export async function getTeamProfile(): Promise<TeamProfile> {
  const { data } = await api.get('/api/team/profile');
  return data;
}

export async function updateTeamProfile(profileData: Partial<TeamProfile>): Promise<TeamProfile> {
  const { data } = await api.put('/api/team/profile', profileData);
  return data;
}

export async function getFunnelStats(): Promise<FunnelStats> {
  const { data } = await api.get('/api/analytics/funnel');
  return data;
}

export async function getCoverLetter(jobId: string): Promise<CoverLetter> {
  const { data } = await api.get(`/api/jobs/${jobId}/cover-letter`);
  return data;
}

export async function approveLetter(letterId: string): Promise<CoverLetter> {
  const { data } = await api.post(`/api/cover-letters/${letterId}/approve`);
  return data;
}

export async function rejectLetter(letterId: string): Promise<CoverLetter> {
  const { data } = await api.post(`/api/cover-letters/${letterId}/reject`);
  return data;
}

export async function regenerateLetter(letterId: string): Promise<CoverLetter> {
  const { data } = await api.post(`/api/cover-letters/${letterId}/regenerate`);
  return data;
}

export default api;
