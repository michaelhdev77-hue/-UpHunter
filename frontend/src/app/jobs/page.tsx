'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJobs, scoreAllJobs, type Job } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Search, ChevronLeft, ChevronRight, MapPin, Star, ExternalLink, DollarSign, Users, Sparkles, X } from 'lucide-react';
import { clsx } from 'clsx';
import Link from 'next/link';

function OpenAIErrorCard({ error, onClose }: { error: string; onClose?: () => void }) {
  const isQuota = /insufficient_quota|exceeded.*quota|429/i.test(error);
  const isRateLimit = /rate.?limit|too many requests/i.test(error);
  const isTimeout = /timeout|timed?\s?out/i.test(error);
  const isKeyError = /invalid.*key|auth|401|incorrect.*api/i.test(error);

  let title = 'Ошибка OpenAI';
  let message = 'Произошла ошибка при обращении к OpenAI API.';
  let actionLabel = 'Открыть OpenAI Dashboard';
  let actionUrl = 'https://platform.openai.com/settings/organization/billing/overview';

  if (isQuota) {
    title = 'Квота API исчерпана';
    message = 'Баланс OpenAI исчерпан. Пополните на platform.openai.com';
  } else if (isRateLimit) {
    title = 'Превышен лимит запросов';
    message = 'Слишком много запросов к OpenAI. Подождите немного и попробуйте снова.';
  } else if (isTimeout) {
    title = 'Таймаут запроса';
    message = 'OpenAI не ответил вовремя. Попробуйте снова.';
  } else if (isKeyError) {
    title = 'Неверный API ключ';
    message = 'Проверьте API ключ OpenAI в настройках.';
    actionLabel = 'Открыть настройки';
    actionUrl = '/settings';
  }

  return (
    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-4 text-left">
      <div className="flex items-start gap-3">
        <span className="text-amber-500 text-lg leading-none mt-0.5">&#9888;</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-800">{title}</p>
            {onClose && (
              <button onClick={onClose} className="text-amber-400 hover:text-amber-600 ml-2">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <p className="text-xs text-amber-700 mt-1">{message}</p>
          <a
            href={actionUrl}
            target={actionUrl.startsWith('http') ? '_blank' : undefined}
            rel={actionUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium mt-2 underline underline-offset-2"
          >
            {actionLabel} &#8599;
          </a>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 20;

const statusOptions = [
  { value: '', label: 'Все статусы' },
  { value: 'discovered', label: 'Новая' },
  { value: 'scored', label: 'Оценена' },
  { value: 'letter_ready', label: 'Черновик' },
  { value: 'under_review', label: 'На проверке' },
  { value: 'applied', label: 'Отклик' },
  { value: 'response', label: 'Ответ' },
  { value: 'hired', label: 'Контракт' },
  { value: 'rejected', label: 'Отклонена' },
];

const statusLabels: Record<string, string> = {
  discovered: 'Новая',
  scored: 'Оценена',
  letter_ready: 'Черновик',
  under_review: 'На проверке',
  applied: 'Отклик',
  response: 'Ответ',
  hired: 'Контракт',
  rejected: 'Отклонена',
};

const statusColors: Record<string, string> = {
  discovered: 'bg-blue-100 text-blue-700',
  scored: 'bg-yellow-100 text-yellow-700',
  letter_ready: 'bg-purple-100 text-purple-700',
  under_review: 'bg-indigo-100 text-indigo-700',
  applied: 'bg-emerald-100 text-emerald-700',
  response: 'bg-teal-100 text-teal-700',
  hired: 'bg-green-200 text-green-800',
  rejected: 'bg-red-100 text-red-700',
};

function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-red-500';
}

function budgetLabel(job: Job): string | null {
  if (job.contract_type === 'fixed') {
    if (job.budget_min || job.budget_max) {
      return `Фикс: $${job.budget_min ?? '?'}${job.budget_max && job.budget_max !== job.budget_min ? ` - $${job.budget_max}` : ''}`;
    }
    return 'Фикс. цена';
  }
  if (job.contract_type === 'hourly') {
    if (job.hourly_rate_min || job.hourly_rate_max) {
      return `$${job.hourly_rate_min ?? '?'} - $${job.hourly_rate_max ?? '?'}/hr`;
    }
    return 'Почасовая';
  }
  return null;
}

export default function JobsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [minScore, setMinScore] = useState<number | ''>('');
  const [skill, setSkill] = useState('');
  const [scoreAllMessage, setScoreAllMessage] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', page, search, status, minScore, skill],
    queryFn: () =>
      getJobs({
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
        min_score: minScore !== '' ? minScore : undefined,
        skill: skill || undefined,
      }),
  });

  const scoreAllMut = useMutation({
    mutationFn: scoreAllJobs,
    onSuccess: (result) => {
      let msg = `Оценено ${result.scored} вакансий`;
      if (result.failed > 0) {
        msg += `, ${result.failed} с ошибкой`;
        if (result.error) msg += `: ${result.error}`;
      }
      setScoreAllMessage(msg);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setTimeout(() => setScoreAllMessage(null), 8000);
    },
    onError: (e: any) => {
      const detail = e?.response?.data?.detail || e?.message || 'Неизвестная ошибка';
      setScoreAllMessage(`Ошибка оценки вакансий: ${detail}`);
      setTimeout(() => setScoreAllMessage(null), 8000);
    },
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Вакансии" />
        <main className="p-8">
          {/* Фильтры */}
          <div className="flex flex-wrap gap-4 mb-6 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Поиск вакансий..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm"
              />
            </div>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm bg-white"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">Мин. оценка</label>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="0"
                value={minScore}
                onChange={(e) => {
                  setMinScore(e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value))));
                  setPage(0);
                }}
                className="w-20 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">Навык</label>
              <input
                type="text"
                placeholder="напр. React"
                value={skill}
                onChange={(e) => {
                  setSkill(e.target.value);
                  setPage(0);
                }}
                className="w-32 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm"
              />
            </div>
            <button
              onClick={() => scoreAllMut.mutate()}
              disabled={scoreAllMut.isPending}
              className="px-4 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap"
            >
              <Sparkles className={clsx('w-4 h-4', scoreAllMut.isPending && 'animate-pulse')} />
              {scoreAllMut.isPending ? 'Оценка...' : 'Оценить все'}
            </button>
            {scoreAllMessage && !scoreAllMessage.includes('Ошибка') && (
              <span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-50 text-green-600">
                {scoreAllMessage}
              </span>
            )}
          </div>
          {scoreAllMessage && scoreAllMessage.includes('Ошибка') && (
            <OpenAIErrorCard error={scoreAllMessage} onClose={() => setScoreAllMessage(null)} />
          )}

          {/* Список вакансий */}
          <div className="space-y-3">
            {isLoading && (
              <div className="text-center py-12 text-gray-400">Загрузка вакансий...</div>
            )}

            {data?.items.map((job: Job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="block bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-brand-300 hover:shadow-sm transition-all"
              >
                <div className="px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {job.title}
                        </h3>
                        {job.upwork_url && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.open(job.upwork_url!, '_blank', 'noopener,noreferrer');
                            }}
                            className="text-gray-400 hover:text-brand-500"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        {budgetLabel(job) && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            {budgetLabel(job)}
                          </span>
                        )}
                        {job.client_country && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {job.client_country}
                          </span>
                        )}
                        {job.client_rating !== null && (
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3" />
                            {job.client_rating.toFixed(1)}
                          </span>
                        )}
                        {job.proposals_count !== null && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {job.proposals_count} откликов
                          </span>
                        )}
                        {job.experience_level && (
                          <span className="capitalize">{job.experience_level}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {job.skills.slice(0, 6).map((skill) => (
                          <span
                            key={skill}
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                          >
                            {skill}
                          </span>
                        ))}
                        {job.skills.length > 6 && (
                          <span className="text-xs text-gray-400">+{job.skills.length - 6}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4 shrink-0">
                      {job.overall_score !== null && (
                        <div className="text-right">
                          <span className={clsx('text-xl font-bold', scoreColor(job.overall_score))}>
                            {job.overall_score}
                          </span>
                          <span className="text-xs text-gray-400 ml-0.5">/100</span>
                        </div>
                      )}
                      <span
                        className={clsx(
                          'text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap',
                          statusColors[job.status] || 'bg-gray-100 text-gray-600'
                        )}
                      >
                        {statusLabels[job.status] || job.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            {!isLoading && !data?.items.length && (
              <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
                Вакансии не найдены
              </div>
            )}
          </div>

          {/* Пагинация */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-gray-500">
                Страница {page + 1} из {totalPages} ({data?.total ?? 0} всего)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
