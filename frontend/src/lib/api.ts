import axios from 'axios';
import { getToken, removeToken } from './auth';

// --- Interfaces (matching real backend schemas) ---

export interface Job {
  id: number;
  upwork_id: string;
  title: string;
  description: string;
  description_ru: string | null;
  category: string | null;
  contract_type: 'hourly' | 'fixed' | null;
  budget_min: number | null;
  budget_max: number | null;
  hourly_rate_min: number | null;
  hourly_rate_max: number | null;
  duration: string | null;
  engagement: string | null;
  experience_level: 'entry' | 'intermediate' | 'expert' | null;
  skills: string[];
  connect_price: number | null;
  proposals_count: number | null;
  detected_language: string;
  upwork_url: string | null;
  status: string;
  overall_score: number | null;
  score_details: ScoreDetails | null;

  // Client info (denormalized)
  client_country: string | null;
  client_payment_verified: boolean | null;
  client_rating: number | null;
  client_total_spent: number | null;
  client_hire_rate: number | null;
  client_jobs_posted: number | null;
  client_member_since: string | null;

  posted_at: string | null;
  discovered_at: string | null;
}

export interface ScoreDetails {
  skill_match: number;
  budget_fit: number;
  scope_clarity: number;
  win_probability: number;
  client_risk: number;
}

export interface JobListResponse {
  items: Job[];
  total: number;
}

export interface SearchFilter {
  id: number;
  name: string;
  keywords: string[];
  skills: string[];
  category: string | null;
  contract_type: string | null;
  experience_level: string | null;
  budget_min: number | null;
  budget_max: number | null;
  is_active: boolean;
}

export interface User {
  id: number;
  email: string;
  name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TeamProfile {
  id: number;
  name: string;
  skills_description: string;
  portfolio_description: string;
  cover_letter_style: string;
  hourly_rate_min: number;
  hourly_rate_max: number;
}

export interface CoverLetter {
  id: number;
  job_id: number;
  content_original: string;
  content_ru: string | null;
  language: string;
  version: number;
  status: string;
  style: string;
  edited_by: string | null;
  generated_at: string;
  approved_at: string | null;
}

export interface JobSummary {
  total: number;
  by_status: Record<string, number>;
}

// --- Axios instance ---

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
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
        removeToken();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// --- API functions ---

// Jobs
export async function getJobs(params?: {
  status?: string;
  min_score?: number;
  skill?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<JobListResponse> {
  const { data } = await api.get('/api/jobs/', { params });
  return data;
}

export async function getJob(id: number): Promise<Job> {
  const { data } = await api.get(`/api/jobs/${id}`);
  return data;
}

export async function updateJobStatus(id: number, status: string): Promise<Job> {
  const { data } = await api.patch(`/api/jobs/${id}/status`, { status });
  return data;
}

export async function getJobsSummary(): Promise<JobSummary> {
  const { data } = await api.get('/api/jobs/stats/summary');
  return data;
}

export async function getTopJobs(limit = 5): Promise<Job[]> {
  const { data } = await api.get('/api/jobs/stats/top', { params: { limit } });
  return data;
}

export interface JobAlerts {
  high_score_jobs: Job[];
  unscored_count: number;
  awaiting_review: number;
}

export async function getJobAlerts(): Promise<JobAlerts> {
  const { data } = await api.get('/api/jobs/stats/alerts');
  return data;
}

// Filters
export async function getJobFilters(): Promise<SearchFilter[]> {
  const { data } = await api.get('/api/jobs/filters/list');
  return data;
}

export async function createJobFilter(filterData: {
  name: string;
  keywords?: string[];
  skills?: string[];
  category?: string;
  contract_type?: string;
  experience_level?: string;
  budget_min?: number;
  budget_max?: number;
}): Promise<SearchFilter> {
  const { data } = await api.post('/api/jobs/filters', filterData);
  return data;
}

export async function deleteJobFilter(id: number): Promise<void> {
  await api.delete(`/api/jobs/filters/${id}`);
}

// Auth
export async function login(email: string, password: string): Promise<{ access_token: string }> {
  const { data } = await api.post('/api/auth/login', { email, password });
  return data;
}

export async function register(email: string, password: string): Promise<{ access_token: string }> {
  const { data } = await api.post('/api/auth/register', { email, password });
  return data;
}

export async function getMe(): Promise<User> {
  const { data } = await api.get('/api/auth/me');
  return data;
}

// Team Profile
export async function getTeamProfile(): Promise<TeamProfile> {
  const { data } = await api.get('/api/team/profile');
  return data;
}

export async function updateTeamProfile(profileData: Partial<TeamProfile>): Promise<TeamProfile> {
  const { data } = await api.put('/api/team/profile', profileData);
  return data;
}

// Cover Letters
export async function getCoverLetter(jobId: number): Promise<CoverLetter> {
  const { data } = await api.get(`/api/letters/${jobId}`);
  return data;
}

export async function generateCoverLetter(jobId: number): Promise<CoverLetter> {
  const { data } = await api.post('/api/letters/generate', { job_id: jobId });
  return data;
}

export async function updateCoverLetter(letterId: number, data: {
  content_original?: string;
  content_ru?: string;
  edited_by?: string;
}): Promise<CoverLetter> {
  const { data: resp } = await api.put(`/api/letters/${letterId}`, data);
  return resp;
}

export async function approveLetter(letterId: number): Promise<CoverLetter> {
  const { data } = await api.patch(`/api/letters/${letterId}/approve`);
  return data;
}

export async function rejectLetter(letterId: number): Promise<CoverLetter> {
  const { data } = await api.patch(`/api/letters/${letterId}/reject`);
  return data;
}

export async function regenerateLetter(letterId: number, options?: { instructions?: string; style?: string }): Promise<CoverLetter> {
  const { data } = await api.post(`/api/letters/${letterId}/regenerate`, options ?? {});
  return data;
}

// AI Scoring
export async function scoreJob(jobId: number): Promise<unknown> {
  const { data } = await api.post(`/api/scoring/score/${jobId}`);
  return data;
}

export async function scoreAllJobs(): Promise<{ scored: number; failed: number; job_ids: number[] }> {
  const { data } = await api.post('/api/scoring/score-all');
  return data;
}

// Analytics
export interface FunnelStage {
  stage: string;
  count: number;
  conversion_rate: number | null;
}

export interface FunnelData {
  stages: FunnelStage[];
  total_jobs: number;
}

export interface TimeSeriesPoint {
  date: string;
  discovered: number;
  scored: number;
  letter_ready: number;
  applied: number;
}

export interface ScoreBucket {
  range: string;
  count: number;
}

export interface AnalyticsSummary {
  total_events: number;
  unique_jobs: number;
  by_stage: Record<string, number>;
  avg_score: number | null;
  conversion_rates: Record<string, number>;
}

export async function getAnalyticsFunnel(): Promise<FunnelData> {
  const { data } = await api.get('/api/analytics/funnel');
  return data;
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const { data } = await api.get('/api/analytics/summary');
  return data;
}

export async function getTimeSeries(days = 30): Promise<TimeSeriesPoint[]> {
  const { data } = await api.get('/api/analytics/time-series', { params: { days } });
  return data;
}

export async function getScoreDistribution(): Promise<ScoreBucket[]> {
  const { data } = await api.get('/api/analytics/score-distribution');
  return data;
}

export async function backfillAnalytics(): Promise<{ ok: boolean; events_created: number }> {
  const { data } = await api.post('/api/analytics/backfill');
  return data;
}

export interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
}

export interface SkillStat {
  skill: string;
  count: number;
  avg_score: number | null;
}

export async function getActivityHeatmap(): Promise<HeatmapCell[]> {
  const { data } = await api.get('/api/analytics/heatmap');
  return data;
}

export async function getTopSkills(limit = 15): Promise<SkillStat[]> {
  const { data } = await api.get('/api/analytics/top-skills', { params: { limit } });
  return data;
}

export interface MarketTrend {
  avg_budget_min: number | null;
  avg_budget_max: number | null;
  total_jobs: number;
  avg_score: number | null;
  top_skills: { skill: string; count: number }[];
  experience_distribution: Record<string, number>;
  contract_type_distribution: Record<string, number>;
}

export async function getMarketIntel(): Promise<MarketTrend> {
  const { data } = await api.get('/api/analytics/market-intel');
  return data;
}

// --- Service Settings ---

export interface TelegramSettings {
  bot_token: string;
  chat_id: string;
  enabled: boolean;
  score_threshold: number;
  frontend_url: string;
}

export interface ScoringSettings {
  openai_model: string;
  openai_temperature: number;
  weight_skill_match: number;
  weight_budget_fit: number;
  weight_scope_clarity: number;
  weight_win_probability: number;
}

export interface LetterSettings {
  openai_model: string;
  temperature_generation: number;
  temperature_translation: number;
  max_words: number;
}

export interface PollerSettings {
  poll_interval_seconds: number;
  max_jobs_per_poll: number;
}

export interface RiskSettings {
  weight_payment_verified: number;
  weight_total_spent: number;
  weight_hire_rate: number;
  weight_rating: number;
  weight_reviews: number;
  weight_account_age: number;
  weight_location: number;
  flag_hire_rate_below: number;
  flag_rating_below: number;
  flag_account_age_days: number;
  flag_no_reviews_min_jobs: number;
}

// Telegram
export async function getTelegramSettings(): Promise<TelegramSettings> {
  const { data } = await api.get('/api/analytics/settings/telegram');
  return data;
}

export async function updateTelegramSettings(settings: Partial<TelegramSettings>): Promise<TelegramSettings> {
  const { data } = await api.put('/api/analytics/settings/telegram', settings);
  return data;
}

// Scoring
export async function getScoringSettings(): Promise<ScoringSettings> {
  const { data } = await api.get('/api/scoring/settings');
  return data;
}

export async function updateScoringSettings(settings: Partial<ScoringSettings>): Promise<ScoringSettings> {
  const { data } = await api.put('/api/scoring/settings', settings);
  return data;
}

// Letter Gen
export async function getLetterSettings(): Promise<LetterSettings> {
  const { data } = await api.get('/api/letters/settings');
  return data;
}

export async function updateLetterSettings(settings: Partial<LetterSettings>): Promise<LetterSettings> {
  const { data } = await api.put('/api/letters/settings', settings);
  return data;
}

// Poller
export async function getPollerSettings(): Promise<PollerSettings> {
  const { data } = await api.get('/api/jobs/settings');
  return data;
}

export async function updatePollerSettings(settings: Partial<PollerSettings>): Promise<PollerSettings> {
  const { data } = await api.put('/api/jobs/settings', settings);
  return data;
}

// Client Risk Config
export async function getRiskSettings(): Promise<RiskSettings> {
  const { data } = await api.get('/api/clients/settings');
  return data;
}

export async function updateRiskSettings(settings: Partial<RiskSettings>): Promise<RiskSettings> {
  const { data } = await api.put('/api/clients/settings', settings);
  return data;
}

// Filter toggle
export async function toggleJobFilter(id: number): Promise<SearchFilter> {
  const { data } = await api.patch(`/api/jobs/filters/${id}/toggle`);
  return data;
}

// A/B testing: style stats
export async function getStyleStats(): Promise<Record<string, {
  total: number;
  approved: number;
  rejected: number;
  draft: number;
  approval_rate: number | null;
}>> {
  const { data } = await api.get('/api/letters/stats/styles');
  return data;
}

// Cover letters - style support
export async function generateCoverLetterWithStyle(jobId: number, style?: string): Promise<CoverLetter> {
  const { data } = await api.post('/api/letters/generate', { job_id: jobId, style });
  return data;
}

// --- User Profile Management ---

export async function updateUserProfile(data: {
  name?: string;
  current_password?: string;
  new_password?: string;
}): Promise<User> {
  const { data: resp } = await api.put('/api/auth/me', data);
  return resp;
}

// --- Missing Scoring Endpoint ---

export async function getJobScore(jobId: number): Promise<{
  job_id: number;
  skill_match: number;
  budget_fit: number;
  scope_clarity: number;
  win_probability: number;
  client_risk: number;
  overall_score: number;
  llm_reasoning: string;
}> {
  const { data } = await api.get(`/api/scoring/score/${jobId}`);
  return data;
}

// --- Client Analysis ---

export async function analyzeClient(clientData: {
  upwork_uid: string;
  name?: string;
  company?: string;
  country?: string;
  payment_verified?: boolean;
  total_spent?: number;
  hire_rate?: number;
  jobs_posted?: number;
  active_hires?: number;
  rating?: number;
  reviews_count?: number;
}): Promise<ClientInfo> {
  const { data } = await api.post('/api/clients/analyze', clientData);
  return data;
}

// --- Analytics Event Recording ---

export async function recordAnalyticsEvent(jobId: number, stage: string, metadata?: Record<string, unknown>): Promise<{ ok: boolean; event_id: number }> {
  const { data } = await api.post('/api/analytics/events', null, {
    params: { job_id: jobId, stage, metadata: metadata ? JSON.stringify(metadata) : undefined },
  });
  return data;
}

// --- Poller Status & Control ---

export interface PollerStatus {
  running: boolean;
  last_poll_at: string | null;
  last_jobs_found: number;
  total_polls: number;
  total_jobs_discovered: number;
  last_error: string | null;
  active_filters: number;
}

export async function getPollerStatus(): Promise<PollerStatus> {
  const { data } = await api.get('/api/jobs/poller-status');
  return data;
}

export async function triggerPollNow(): Promise<{ ok: boolean; jobs_found: number }> {
  const { data } = await api.post('/api/jobs/poll-now');
  return data;
}

// --- Telegram Test ---

export async function testTelegram(): Promise<{ ok: boolean; message?: string; error?: string }> {
  const { data } = await api.post('/api/analytics/test-telegram');
  return data;
}

// --- Client Intelligence ---

export interface ClientInfo {
  id: number;
  upwork_uid: string;
  name: string | null;
  company: string | null;
  country: string | null;
  city: string | null;
  member_since: string | null;
  payment_verified: boolean;
  total_spent: number;
  hire_rate: number | null;
  jobs_posted: number;
  active_hires: number;
  rating: number | null;
  reviews_count: number;
  avg_hourly_rate: number | null;
  risk_score: number | null;
  red_flags: string[];
  updated_at: string | null;
}

export interface ClientListResponse {
  items: ClientInfo[];
  total: number;
}

export async function getClients(params?: {
  search?: string;
  min_risk?: number;
  max_risk?: number;
  country?: string;
  sort_by?: string;
  sort_dir?: string;
  limit?: number;
  offset?: number;
}): Promise<ClientListResponse> {
  const { data } = await api.get('/api/clients/', { params });
  return data;
}

export async function getClient(upworkUid: string): Promise<ClientInfo> {
  const { data } = await api.get(`/api/clients/${upworkUid}`);
  return data;
}

export async function getClientRisk(upworkUid: string): Promise<{
  upwork_uid: string;
  risk_score: number;
  red_flags: string[];
  payment_verified: boolean;
  total_spent: number;
  hire_rate: number | null;
  rating: number | null;
}> {
  const { data } = await api.get(`/api/clients/risk/${upworkUid}`);
  return data;
}

// --- System Health ---

export interface ServiceHealth {
  name: string;
  url: string;
  status: 'ok' | 'error';
  responseTime: number;
}

export async function checkServiceHealth(name: string, path: string): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await api.get(path, { timeout: 5000 });
    return { name, url: path, status: 'ok', responseTime: Date.now() - start };
  } catch {
    return { name, url: path, status: 'error', responseTime: Date.now() - start };
  }
}

export async function checkAllServicesHealth(): Promise<ServiceHealth[]> {
  const services = [
    { name: 'Jobs', path: '/api/jobs/health' },
    { name: 'AI Scoring', path: '/api/scoring/health' },
    { name: 'Client Intel', path: '/api/clients/health' },
    { name: 'Letter Gen', path: '/api/letters/health' },
    { name: 'Auth', path: '/api/auth/health' },
    { name: 'Analytics', path: '/api/analytics/health' },
  ];
  return Promise.all(services.map((s) => checkServiceHealth(s.name, s.path)));
}

// --- Upwork Token Status ---

export async function getUpworkTokenStatus(): Promise<{
  access_token: string | null;
  connected: boolean;
  expires_at: string | null;
}> {
  const { data } = await api.get('/api/auth/upwork/token');
  return data;
}

export default api;
