'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getJobFilters,
  createJobFilter,
  deleteJobFilter,
  toggleJobFilter,
  getTeamProfile,
  updateTeamProfile,
  getTelegramSettings,
  updateTelegramSettings,
  getScoringSettings,
  updateScoringSettings,
  getLetterSettings,
  updateLetterSettings,
  getPollerSettings,
  updatePollerSettings,
  getUpworkTokenStatus,
  getUpworkOAuthSettings,
  updateUpworkOAuthSettings,
  getMe,
  updateUserProfile,
  testTelegram,
  getRiskSettings,
  updateRiskSettings,
  type SearchFilter,
  type TeamProfile,
  type TelegramSettings,
  type ScoringSettings,
  type LetterSettings,
  type PollerSettings,
  type RiskSettings,
  type UpworkOAuthSettings,
} from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  Plus, Trash2, CheckCircle, XCircle, Save, Link as LinkIcon, Unlink, AlertCircle,
  Bot, Brain, FileText, Timer, ToggleLeft, ToggleRight,
  ChevronDown, ChevronRight, Sliders, Send, Cpu, Clock, User, Lock, SendHorizonal, ShieldAlert, Key,
} from 'lucide-react';
import { getToken } from '@/lib/auth';

// --- Collapsible Section ---
function Section({ title, icon: Icon, defaultOpen = false, children, badge }: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
            <Icon className="w-5 h-5 text-brand-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          {badge}
        </div>
        {open ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
      </button>
      {open && <div className="px-6 pb-6 border-t border-gray-100 pt-4">{children}</div>}
    </section>
  );
}

// --- Saved indicator (shows for 3s on each save) ---
function useSavedFlag() {
  const [counter, setCounter] = useState(0);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (counter > 0) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [counter]);
  return { visible, trigger: () => setCounter(c => c + 1) };
}

function SavedBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="text-xs text-green-600 inline-flex items-center gap-1 ml-3">
      <CheckCircle className="w-3.5 h-3.5" /> Сохранено
    </span>
  );
}

function ErrorBanner({ error, onDismiss }: { error: string | null; onDismiss: () => void }) {
  if (!error) return null;
  return (
    <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-center gap-2 text-sm text-red-700">
        <AlertCircle className="w-4 h-4 shrink-0" />
        {error}
      </div>
      <button onClick={onDismiss} className="text-red-400 hover:text-red-600">
        <XCircle className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [globalError, setGlobalError] = useState<string | null>(null);
  const onMutationError = (err: Error) => setGlobalError(err?.message || 'Операция не удалась');

  // --- Upwork Connection ---
  const { data: upworkStatus } = useQuery({
    queryKey: ['upworkToken'],
    queryFn: getUpworkTokenStatus,
  });

  const [upworkJustConnected, setUpworkJustConnected] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upwork') === 'connected') {
      setUpworkJustConnected(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const isUpworkConnected = upworkJustConnected || upworkStatus?.connected;

  // --- Upwork OAuth Settings ---
  const { data: upworkOAuth } = useQuery({ queryKey: ['upworkOAuth'], queryFn: getUpworkOAuthSettings });
  const [upworkClientId, setUpworkClientId] = useState('');
  const [upworkClientSecret, setUpworkClientSecret] = useState('');
  const [upworkRedirectUri, setUpworkRedirectUri] = useState('http://localhost:8080/api/auth/upwork/callback');
  useEffect(() => {
    if (upworkOAuth) {
      setUpworkClientId(upworkOAuth.client_id ?? '');
      setUpworkClientSecret('');
      setUpworkRedirectUri(upworkOAuth.redirect_uri ?? 'http://localhost:8080/api/auth/upwork/callback');
    }
  }, [upworkOAuth]);
  const upworkOAuthSaved = useSavedFlag();
  const upworkOAuthMutation = useMutation({
    mutationFn: (data: { client_id?: string; client_secret?: string; redirect_uri?: string }) => updateUpworkOAuthSettings(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['upworkOAuth'] }); upworkOAuthSaved.trigger(); },
    onError: onMutationError,
  });

  // --- User Profile ---
  const { data: currentUser } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const [userName, setUserName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  useEffect(() => {
    if (currentUser?.name) setUserName(currentUser.name);
  }, [currentUser]);
  const userSaved = useSavedFlag();
  const userMutation = useMutation({
    mutationFn: (data: { name?: string; current_password?: string; new_password?: string }) => updateUserProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setCurrentPassword('');
      setNewPassword('');
      userSaved.trigger();
    },
  });

  // --- Telegram Test ---
  const telegramTestMutation = useMutation({ mutationFn: testTelegram, onError: onMutationError });

  // --- Team Profile ---
  const { data: profile } = useQuery({ queryKey: ['teamProfile'], queryFn: getTeamProfile });
  const [profileForm, setProfileForm] = useState({
    name: '', skills_description: '', portfolio_description: '', cover_letter_style: '',
    hourly_rate_min: 0, hourly_rate_max: 0,
  });
  useEffect(() => {
    if (profile) {
      setProfileForm({
        name: profile.name ?? '', skills_description: profile.skills_description ?? '',
        portfolio_description: profile.portfolio_description ?? '',
        cover_letter_style: profile.cover_letter_style ?? '',
        hourly_rate_min: profile.hourly_rate_min ?? 0, hourly_rate_max: profile.hourly_rate_max ?? 0,
      });
    }
  }, [profile]);
  const profileSaved = useSavedFlag();
  const profileMutation = useMutation({
    mutationFn: (data: Partial<TeamProfile>) => updateTeamProfile(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['teamProfile'] }); profileSaved.trigger(); },
    onError: onMutationError,
  });

  // --- Filters ---
  const [showFilterForm, setShowFilterForm] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [filterKeywords, setFilterKeywords] = useState('');
  const [filterSkills, setFilterSkills] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterContractType, setFilterContractType] = useState('');
  const [filterExperienceLevel, setFilterExperienceLevel] = useState('');
  const [filterBudgetMin, setFilterBudgetMin] = useState('');
  const [filterBudgetMax, setFilterBudgetMax] = useState('');
  const { data: filters } = useQuery({ queryKey: ['filters'], queryFn: getJobFilters });
  const createMutation = useMutation({
    mutationFn: () => createJobFilter({
      name: filterName,
      keywords: filterKeywords ? filterKeywords.split(',').map((s) => s.trim()).filter(Boolean) : [],
      skills: filterSkills ? filterSkills.split(',').map((s) => s.trim()).filter(Boolean) : [],
      category: filterCategory || undefined,
      contract_type: filterContractType || undefined,
      experience_level: filterExperienceLevel || undefined,
      budget_min: filterBudgetMin ? parseFloat(filterBudgetMin) : undefined,
      budget_max: filterBudgetMax ? parseFloat(filterBudgetMax) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filters'] });
      setFilterName(''); setFilterKeywords(''); setFilterSkills(''); setFilterCategory('');
      setFilterContractType(''); setFilterExperienceLevel(''); setFilterBudgetMin(''); setFilterBudgetMax('');
      setShowFilterForm(false);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => { if (!confirm('Удалить этот фильтр?')) throw new Error('cancelled'); return deleteJobFilter(id); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['filters'] }),
    onError: onMutationError,
  });
  const toggleMutation = useMutation({
    mutationFn: (id: number) => toggleJobFilter(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['filters'] }),
    onError: onMutationError,
  });

  // --- Scoring Settings ---
  const { data: scoringSettings } = useQuery({ queryKey: ['scoringSettings'], queryFn: getScoringSettings });
  const [scoringForm, setScoringForm] = useState<Partial<ScoringSettings>>({});
  useEffect(() => { if (scoringSettings) setScoringForm(scoringSettings); }, [scoringSettings]);
  const scoringSaved = useSavedFlag();
  const scoringMutation = useMutation({
    mutationFn: (data: Partial<ScoringSettings>) => updateScoringSettings(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['scoringSettings'] }); scoringSaved.trigger(); },
    onError: onMutationError,
  });

  // --- Letter Settings ---
  const { data: letterSettings } = useQuery({ queryKey: ['letterSettings'], queryFn: getLetterSettings });
  const [letterForm, setLetterForm] = useState<Partial<LetterSettings>>({});
  useEffect(() => { if (letterSettings) setLetterForm(letterSettings); }, [letterSettings]);
  const letterSaved = useSavedFlag();
  const letterMutation = useMutation({
    mutationFn: (data: Partial<LetterSettings>) => updateLetterSettings(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['letterSettings'] }); letterSaved.trigger(); },
    onError: onMutationError,
  });

  // --- Poller Settings ---
  const { data: pollerSettings } = useQuery({ queryKey: ['pollerSettings'], queryFn: getPollerSettings });
  const [pollerForm, setPollerForm] = useState<Partial<PollerSettings>>({});
  useEffect(() => { if (pollerSettings) setPollerForm(pollerSettings); }, [pollerSettings]);
  const pollerSaved = useSavedFlag();
  const pollerMutation = useMutation({
    mutationFn: (data: Partial<PollerSettings>) => updatePollerSettings(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pollerSettings'] }); pollerSaved.trigger(); },
    onError: onMutationError,
  });

  // --- Risk Settings ---
  const { data: riskSettings } = useQuery({ queryKey: ['riskSettings'], queryFn: getRiskSettings });
  const [riskForm, setRiskForm] = useState<Partial<RiskSettings>>({});
  useEffect(() => { if (riskSettings) setRiskForm(riskSettings); }, [riskSettings]);
  const riskSaved = useSavedFlag();
  const riskMutation = useMutation({
    mutationFn: (data: Partial<RiskSettings>) => updateRiskSettings(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['riskSettings'] }); riskSaved.trigger(); },
    onError: onMutationError,
  });

  // --- Telegram Settings ---
  const { data: telegramSettings } = useQuery({ queryKey: ['telegramSettings'], queryFn: getTelegramSettings });
  const [telegramForm, setTelegramForm] = useState<Partial<TelegramSettings>>({});
  useEffect(() => { if (telegramSettings) setTelegramForm(telegramSettings); }, [telegramSettings]);
  const telegramSaved = useSavedFlag();
  const telegramMutation = useMutation({
    mutationFn: (data: Partial<TelegramSettings>) => updateTelegramSettings(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['telegramSettings'] }); telegramSaved.trigger(); },
    onError: onMutationError,
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Настройки" />
        <main className="p-8 max-w-4xl">

          <ErrorBanner error={globalError} onDismiss={() => setGlobalError(null)} />

          {/* ===== UPWORK OAUTH CREDENTIALS ===== */}
          <Section title="Upwork API ключи" icon={Key} defaultOpen={false}>
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700">
                  Получите ключи на{' '}
                  <a href="https://www.upwork.com/developer/keys" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                    upwork.com/developer/keys
                  </a>
                  . Callback URL:{' '}
                  <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-800">{upworkRedirectUri}</code>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                <input type="text" value={upworkClientId}
                  onChange={(e) => setUpworkClientId(e.target.value)}
                  placeholder="Вставьте Upwork Client ID"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Secret
                  {upworkOAuth?.configured && <span className="text-xs text-gray-400 ml-2">(текущий: {upworkOAuth.client_secret})</span>}
                </label>
                <input type="password" value={upworkClientSecret}
                  onChange={(e) => setUpworkClientSecret(e.target.value)}
                  placeholder={upworkOAuth?.configured ? 'Оставьте пустым, чтобы не менять' : 'Вставьте Upwork Client Secret'}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Redirect URI</label>
                <input type="text" value={upworkRedirectUri}
                  onChange={(e) => setUpworkRedirectUri(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm font-mono" />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const payload: { client_id?: string; client_secret?: string; redirect_uri?: string } = {};
                    if (upworkClientId) payload.client_id = upworkClientId;
                    if (upworkClientSecret) payload.client_secret = upworkClientSecret;
                    if (upworkRedirectUri) payload.redirect_uri = upworkRedirectUri;
                    upworkOAuthMutation.mutate(payload);
                  }}
                  disabled={upworkOAuthMutation.isPending || !upworkClientId}
                  className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> Сохранить ключи
                </button>
                <SavedBadge show={upworkOAuthSaved.visible} />
              </div>
            </div>
          </Section>

          {/* ===== UPWORK CONNECTION ===== */}
          <Section title="Подключение Upwork" icon={LinkIcon} defaultOpen={false}>
            {isUpworkConnected ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                    <LinkIcon className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Upwork подключён</p>
                    <p className="text-xs text-green-600">
                      Ваш аккаунт Upwork привязан. Вакансии будут загружаться автоматически.
                    </p>
                    {upworkStatus?.expires_at && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Токен истекает: {new Date(upworkStatus.expires_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Подключён
                </span>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center">
                      <Unlink className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Не подключён</p>
                      <p className="text-xs text-gray-500">
                        {upworkOAuth?.configured
                          ? 'Ключи настроены. Нажмите кнопку для подключения.'
                          : 'Сначала добавьте Upwork API ключи выше'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
                      const token = getToken();
                      window.location.href = `${apiUrl}/api/auth/upwork/authorize?token=${token}`;
                    }}
                    disabled={!upworkOAuth?.configured}
                    className="px-5 py-2.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
                  >
                    <LinkIcon className="w-4 h-4" /> Подключить Upwork
                  </button>
                </div>
              </div>
            )}
          </Section>

          {/* ===== USER PROFILE ===== */}
          <Section title="Профиль пользователя" icon={User}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="text" value={currentUser?.email ?? ''} disabled
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Отображаемое имя</label>
                <input type="text" value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Ваше имя"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
              </div>
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Изменить пароль
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Текущий пароль</label>
                    <input type="password" value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Введите текущий пароль"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Новый пароль</label>
                    <input type="password" value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Введите новый пароль"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                  </div>
                </div>
              </div>
              {userMutation.isError && (
                <p className="text-xs text-red-600">{(userMutation.error as Error)?.message || 'Ошибка обновления'}</p>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => userMutation.mutate({
                    name: userName || undefined,
                    ...(newPassword ? { current_password: currentPassword, new_password: newPassword } : {}),
                  })}
                  disabled={userMutation.isPending}
                  className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2">
                  <Save className="w-4 h-4" /> {userMutation.isPending ? 'Сохранение...' : 'Сохранить профиль'}
                </button>
                <SavedBadge show={userSaved.visible} />
              </div>
            </div>
          </Section>

          {/* ===== TEAM PROFILE ===== */}
          <Section title="Профиль команды" icon={Sliders} defaultOpen={false}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Название команды</label>
                <input type="text" value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder="Название вашей команды"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание навыков</label>
                <textarea value={profileForm.skills_description}
                  onChange={(e) => setProfileForm({ ...profileForm, skills_description: e.target.value })}
                  placeholder="Python, React, FastAPI, PostgreSQL..." rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание портфолио</label>
                <textarea value={profileForm.portfolio_description}
                  onChange={(e) => setProfileForm({ ...profileForm, portfolio_description: e.target.value })}
                  placeholder="Прошлые проекты и опыт..." rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Стиль сопроводительного письма</label>
                <textarea value={profileForm.cover_letter_style}
                  onChange={(e) => setProfileForm({ ...profileForm, cover_letter_style: e.target.value })}
                  placeholder="Инструкции для ИИ по тону и структуре письма..." rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Мин. почасовая ставка ($)</label>
                  <input type="number" value={profileForm.hourly_rate_min || ''}
                    onChange={(e) => setProfileForm({ ...profileForm, hourly_rate_min: Number(e.target.value) || 0 })}
                    placeholder="30"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Макс. почасовая ставка ($)</label>
                  <input type="number" value={profileForm.hourly_rate_max || ''}
                    onChange={(e) => setProfileForm({ ...profileForm, hourly_rate_max: Number(e.target.value) || 0 })}
                    placeholder="80"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => profileMutation.mutate(profileForm)} disabled={profileMutation.isPending}
                  className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2">
                  <Save className="w-4 h-4" /> {profileMutation.isPending ? 'Сохранение...' : 'Сохранить профиль'}
                </button>
                <SavedBadge show={profileSaved.visible} />
              </div>
            </div>
          </Section>

          {/* ===== AI SCORING SETTINGS ===== */}
          <Section title="Настройки оценки ИИ" icon={Brain}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Модель OpenAI</label>
                  <select value={scoringForm.openai_model || 'gpt-4o'}
                    onChange={(e) => setScoringForm({ ...scoringForm, openai_model: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm bg-white">
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Температура: {scoringForm.openai_temperature ?? 0.3}
                  </label>
                  <input type="range" min="0" max="1" step="0.05"
                    value={scoringForm.openai_temperature ?? 0.3}
                    onChange={(e) => setScoringForm({ ...scoringForm, openai_temperature: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Точно (0)</span><span>Креативно (1)</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Веса оценки</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'weight_skill_match' as const, label: 'Совпадение навыков', color: 'bg-blue-500' },
                    { key: 'weight_budget_fit' as const, label: 'Соответствие бюджету', color: 'bg-green-500' },
                    { key: 'weight_scope_clarity' as const, label: 'Ясность ТЗ', color: 'bg-yellow-500' },
                    { key: 'weight_win_probability' as const, label: 'Вероятность победы', color: 'bg-purple-500' },
                  ].map(({ key, label, color }) => (
                    <div key={key} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700">{label}</span>
                        <span className="text-xs font-bold text-gray-900">
                          {Math.round((scoringForm[key] ?? 0) * 100)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${color}`} />
                        <input type="range" min="0" max="1" step="0.05"
                          value={scoringForm[key] ?? 0}
                          onChange={(e) => setScoringForm({ ...scoringForm, [key]: parseFloat(e.target.value) })}
                          className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500" />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Итого: {Math.round(((scoringForm.weight_skill_match ?? 0) + (scoringForm.weight_budget_fit ?? 0) +
                    (scoringForm.weight_scope_clarity ?? 0) + (scoringForm.weight_win_probability ?? 0)) * 100)}%
                  {' '}(должно быть 100%)
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={() => scoringMutation.mutate(scoringForm)} disabled={scoringMutation.isPending}
                  className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2">
                  <Save className="w-4 h-4" /> {scoringMutation.isPending ? 'Сохранение...' : 'Сохранить настройки оценки'}
                </button>
                <SavedBadge show={scoringSaved.visible} />
              </div>
            </div>
          </Section>

          {/* ===== CLIENT RISK SETTINGS ===== */}
          <Section title="Оценка рисков клиентов" icon={ShieldAlert}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Веса оценки рисков</label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: 'weight_payment_verified' as const, label: 'Подтверждение оплаты', color: 'bg-red-500' },
                    { key: 'weight_total_spent' as const, label: 'Общий расход', color: 'bg-green-500' },
                    { key: 'weight_hire_rate' as const, label: 'Процент найма', color: 'bg-blue-500' },
                    { key: 'weight_rating' as const, label: 'Рейтинг', color: 'bg-yellow-500' },
                    { key: 'weight_reviews' as const, label: 'Отзывы', color: 'bg-purple-500' },
                    { key: 'weight_account_age' as const, label: 'Возраст аккаунта', color: 'bg-orange-500' },
                    { key: 'weight_location' as const, label: 'Локация', color: 'bg-teal-500' },
                  ] as const).map(({ key, label, color }) => (
                    <div key={key} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700">{label}</span>
                        <span className="text-xs font-bold text-gray-900">
                          {Math.round((riskForm[key] ?? 0) * 100)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${color}`} />
                        <input type="range" min="0" max="1" step="0.05"
                          value={riskForm[key] ?? 0}
                          onChange={(e) => setRiskForm({ ...riskForm, [key]: parseFloat(e.target.value) })}
                          className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500" />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Итого: {Math.round(((riskForm.weight_payment_verified ?? 0) + (riskForm.weight_total_spent ?? 0) +
                    (riskForm.weight_hire_rate ?? 0) + (riskForm.weight_rating ?? 0) +
                    (riskForm.weight_reviews ?? 0) + (riskForm.weight_account_age ?? 0) +
                    (riskForm.weight_location ?? 0)) * 100)}%
                  {' '}(должно быть 100%)
                </p>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-3">Пороги красных флагов</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Процент найма ниже (%)</label>
                    <input type="number" value={riskForm.flag_hire_rate_below ?? 20} min={0} max={100}
                      onChange={(e) => setRiskForm({ ...riskForm, flag_hire_rate_below: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Рейтинг ниже</label>
                    <input type="number" value={riskForm.flag_rating_below ?? 3.0} min={0} max={5} step={0.1}
                      onChange={(e) => setRiskForm({ ...riskForm, flag_rating_below: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Порог нового аккаунта (дней)</label>
                    <input type="number" value={riskForm.flag_account_age_days ?? 30} min={1} max={365}
                      onChange={(e) => setRiskForm({ ...riskForm, flag_account_age_days: parseInt(e.target.value) || 30 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Мин. вакансий без отзывов</label>
                    <input type="number" value={riskForm.flag_no_reviews_min_jobs ?? 10} min={1} max={100}
                      onChange={(e) => setRiskForm({ ...riskForm, flag_no_reviews_min_jobs: parseInt(e.target.value) || 10 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={() => riskMutation.mutate(riskForm)} disabled={riskMutation.isPending}
                  className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2">
                  <Save className="w-4 h-4" /> {riskMutation.isPending ? 'Сохранение...' : 'Сохранить настройки рисков'}
                </button>
                <SavedBadge show={riskSaved.visible} />
              </div>
            </div>
          </Section>

          {/* ===== LETTER GEN SETTINGS ===== */}
          <Section title="Генерация сопроводительных писем" icon={FileText}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Модель OpenAI</label>
                  <select value={letterForm.openai_model || 'gpt-4o'}
                    onChange={(e) => setLetterForm({ ...letterForm, openai_model: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm bg-white">
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Макс. слов</label>
                  <input type="number" value={letterForm.max_words ?? 300}
                    onChange={(e) => setLetterForm({ ...letterForm, max_words: Number(e.target.value) || 300 })}
                    min={50} max={1000}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Темп. генерации: {letterForm.temperature_generation ?? 0.7}
                  </label>
                  <input type="range" min="0" max="1" step="0.05"
                    value={letterForm.temperature_generation ?? 0.7}
                    onChange={(e) => setLetterForm({ ...letterForm, temperature_generation: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Формально</span><span>Креативно</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Темп. перевода: {letterForm.temperature_translation ?? 0.3}
                  </label>
                  <input type="range" min="0" max="1" step="0.05"
                    value={letterForm.temperature_translation ?? 0.3}
                    onChange={(e) => setLetterForm({ ...letterForm, temperature_translation: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Дословно</span><span>Свободно</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => letterMutation.mutate(letterForm)} disabled={letterMutation.isPending}
                  className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2">
                  <Save className="w-4 h-4" /> {letterMutation.isPending ? 'Сохранение...' : 'Сохранить настройки писем'}
                </button>
                <SavedBadge show={letterSaved.visible} />
              </div>
            </div>
          </Section>

          {/* ===== JOB POLLER SETTINGS ===== */}
          <Section title="Настройки сканера вакансий" icon={Timer}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Интервал опроса (секунды)</label>
                  <input type="number" value={pollerForm.poll_interval_seconds ?? 300}
                    onChange={(e) => setPollerForm({ ...pollerForm, poll_interval_seconds: Number(e.target.value) || 300 })}
                    min={30} max={3600}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                  <p className="text-xs text-gray-400 mt-1">
                    = {Math.floor((pollerForm.poll_interval_seconds ?? 300) / 60)}m {(pollerForm.poll_interval_seconds ?? 300) % 60}s
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Макс. вакансий за опрос</label>
                  <input type="number" value={pollerForm.max_jobs_per_poll ?? 50}
                    onChange={(e) => setPollerForm({ ...pollerForm, max_jobs_per_poll: Number(e.target.value) || 50 })}
                    min={1} max={200}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => pollerMutation.mutate(pollerForm)} disabled={pollerMutation.isPending}
                  className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2">
                  <Save className="w-4 h-4" /> {pollerMutation.isPending ? 'Сохранение...' : 'Сохранить настройки сканера'}
                </button>
                <SavedBadge show={pollerSaved.visible} />
              </div>
            </div>
          </Section>

          {/* ===== TELEGRAM NOTIFICATIONS ===== */}
          <Section title="Уведомления Telegram" icon={Send} badge={
            (telegramForm.enabled ?? telegramSettings?.enabled)
              ? <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">ВКЛ</span>
              : <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">ВЫКЛ</span>
          }>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">Включить уведомления</p>
                  <p className="text-xs text-gray-500">Получать оповещения в Telegram о вакансиях с высоким баллом</p>
                </div>
                <button
                  onClick={() => {
                    const next = !telegramForm.enabled;
                    setTelegramForm({ ...telegramForm, enabled: next });
                    telegramMutation.mutate({ ...telegramForm, enabled: next });
                  }}
                  className="text-brand-500"
                >
                  {telegramForm.enabled
                    ? <ToggleRight className="w-8 h-8" />
                    : <ToggleLeft className="w-8 h-8 text-gray-400" />}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Токен бота</label>
                  <input type="password" value={telegramForm.bot_token ?? ''}
                    onChange={(e) => setTelegramForm({ ...telegramForm, bot_token: e.target.value })}
                    placeholder="123456:ABC-DEF..."
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID чата</label>
                  <input type="text" value={telegramForm.chat_id ?? ''}
                    onChange={(e) => setTelegramForm({ ...telegramForm, chat_id: e.target.value })}
                    placeholder="-100123456789"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Порог оценки: {telegramForm.score_threshold ?? 70}
                </label>
                <input type="range" min="0" max="100" step="5"
                  value={telegramForm.score_threshold ?? 70}
                  onChange={(e) => setTelegramForm({ ...telegramForm, score_threshold: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500" />
                <p className="text-xs text-gray-400 mt-1">Уведомлять только когда оценка вакансии выше этого порога</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL фронтенда (для ссылок в уведомлениях)</label>
                <input type="text" value={telegramForm.frontend_url ?? 'http://localhost:3002'}
                  onChange={(e) => setTelegramForm({ ...telegramForm, frontend_url: e.target.value })}
                  placeholder="http://localhost:3002"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                <p className="text-xs text-gray-400 mt-1">Базовый URL для кнопок &laquo;Подробнее&raquo; в сообщениях Telegram</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => telegramMutation.mutate(telegramForm)} disabled={telegramMutation.isPending}
                  className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2">
                  <Save className="w-4 h-4" /> {telegramMutation.isPending ? 'Сохранение...' : 'Сохранить настройки Telegram'}
                </button>
                <button onClick={() => telegramTestMutation.mutate()} disabled={telegramTestMutation.isPending}
                  className="px-4 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2">
                  <Send className="w-4 h-4" /> {telegramTestMutation.isPending ? 'Отправка...' : 'Тест'}
                </button>
                <SavedBadge show={telegramSaved.visible} />
                {telegramTestMutation.isSuccess && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {telegramTestMutation.data?.ok ? 'Отправлено!' : telegramTestMutation.data?.error}
                  </span>
                )}
              </div>
            </div>
          </Section>

          {/* ===== SEARCH FILTERS ===== */}
          <Section title="Фильтры поиска" icon={Cpu} defaultOpen={false}>
            <div className="flex justify-end mb-4">
              <button onClick={() => setShowFilterForm(!showFilterForm)}
                className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> Добавить фильтр
              </button>
            </div>

            {showFilterForm && (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Название фильтра</label>
                    <input type="text" value={filterName} onChange={(e) => setFilterName(e.target.value)}
                      placeholder="напр., React Senior"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ключевые слова (через запятую)</label>
                    <input type="text" value={filterKeywords} onChange={(e) => setFilterKeywords(e.target.value)}
                      placeholder="react, next.js, typescript"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Навыки (через запятую)</label>
                    <input type="text" value={filterSkills} onChange={(e) => setFilterSkills(e.target.value)}
                      placeholder="React, Python, FastAPI"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Категория (необязательно)</label>
                      <input type="text" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
                        placeholder="Веб-разработка"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Тип контракта</label>
                      <select value={filterContractType} onChange={(e) => setFilterContractType(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm bg-white">
                        <option value="">Любой</option>
                        <option value="hourly">Почасовая</option>
                        <option value="fixed">Фикс. цена</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Уровень опыта</label>
                      <select value={filterExperienceLevel} onChange={(e) => setFilterExperienceLevel(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm bg-white">
                        <option value="">Любой</option>
                        <option value="entry">Начальный</option>
                        <option value="intermediate">Средний</option>
                        <option value="expert">Эксперт</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Бюджет мин. ($)</label>
                      <input type="number" value={filterBudgetMin} onChange={(e) => setFilterBudgetMin(e.target.value)}
                        placeholder="0" min="0"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Бюджет макс. ($)</label>
                      <input type="number" value={filterBudgetMax} onChange={(e) => setFilterBudgetMax(e.target.value)}
                        placeholder="10000" min="0"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => createMutation.mutate()} disabled={!filterName || createMutation.isPending}
                      className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors">
                      {createMutation.isPending ? 'Создание...' : 'Создать'}
                    </button>
                    <button onClick={() => setShowFilterForm(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                      Отмена
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {filters?.map((filter: SearchFilter) => (
                <div key={filter.id}
                  className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{filter.name}</p>
                      {filter.is_active
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                        : <XCircle className="w-3.5 h-3.5 text-gray-400" />}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {filter.keywords.length > 0 && (
                        <p className="text-xs text-gray-500">Ключевые слова: {filter.keywords.join(', ')}</p>
                      )}
                      {filter.category && <p className="text-xs text-gray-500">| {filter.category}</p>}
                      {filter.contract_type && <p className="text-xs text-gray-500">| {filter.contract_type}</p>}
                      {filter.experience_level && <p className="text-xs text-gray-500">| {filter.experience_level}</p>}
                      {(filter.budget_min !== null || filter.budget_max !== null) && (
                        <p className="text-xs text-gray-500">| ${filter.budget_min ?? 0} – ${filter.budget_max ?? '∞'}</p>
                      )}
                    </div>
                    {filter.skills.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {filter.skills.map((s) => (
                          <span key={s} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleMutation.mutate(filter.id)}
                      className="p-2 text-gray-400 hover:text-brand-500 transition-colors" title="Переключить активность">
                      {filter.is_active
                        ? <ToggleRight className="w-5 h-5 text-green-500" />
                        : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button onClick={() => deleteMutation.mutate(filter.id)} disabled={deleteMutation.isPending}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {filters?.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Фильтры поиска ещё не настроены.</p>
              )}
            </div>
          </Section>

        </main>
      </div>
    </div>
  );
}
