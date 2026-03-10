'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAnalyticsFunnel,
  getAnalyticsSummary,
  getTimeSeries,
  getScoreDistribution,
  getActivityHeatmap,
  getTopSkills,
  getMarketIntel,
  getStyleStats,
  backfillAnalytics,
  type FunnelStage,
  type HeatmapCell,
  type SkillStat,
} from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Target, TrendingUp, BarChart3, Users, Database } from 'lucide-react';
import { clsx } from 'clsx';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const stageBg: Record<string, string> = {
  discovered: 'bg-blue-500',
  scored: 'bg-yellow-500',
  letter_ready: 'bg-purple-500',
  under_review: 'bg-indigo-500',
  approved: 'bg-green-500',
  applied: 'bg-emerald-500',
  response: 'bg-teal-500',
  hired: 'bg-green-600',
  rejected: 'bg-red-500',
};

function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="space-y-2">
      {stages.map((s) => {
        const pct = (s.count / maxCount) * 100;
        return (
          <div key={s.stage} className="flex items-center gap-3">
            <div className="w-28 text-xs text-gray-600 text-right capitalize">
              {{
                discovered: 'Обнаружена',
                scored: 'Оценена',
                letter_ready: 'Письмо готово',
                under_review: 'На проверке',
                approved: 'Одобрена',
                applied: 'Отклик',
                response: 'Ответ',
                hired: 'Нанят',
                rejected: 'Отклонена',
              }[s.stage] || s.stage.replace('_', ' ')}
            </div>
            <div className="flex-1 h-7 bg-gray-100 rounded-full overflow-hidden relative">
              <div
                className={clsx('h-full rounded-full transition-all', stageBg[s.stage] || 'bg-gray-400')}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-700">
                {s.count}
              </span>
            </div>
            {s.conversion_rate !== null && (
              <div className="w-14 text-xs text-gray-500 text-right">
                {s.conversion_rate}%
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function ActivityHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const maxCount = Math.max(...cells.map((c) => c.count), 1);

  // Build grid
  const grid: Record<string, number> = {};
  for (const c of cells) {
    grid[`${c.day}-${c.hour}`] = c.count;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Hour labels */}
        <div className="flex items-center gap-0.5 ml-10 mb-1">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center text-[10px] text-gray-400">
              {h % 3 === 0 ? `${h}` : ''}
            </div>
          ))}
        </div>
        {/* Rows */}
        {DAY_NAMES.map((dayName, day) => (
          <div key={day} className="flex items-center gap-0.5 mb-0.5">
            <div className="w-9 text-xs text-gray-500 text-right pr-1">{dayName}</div>
            {Array.from({ length: 24 }, (_, hour) => {
              const count = grid[`${day}-${hour}`] || 0;
              const intensity = count / maxCount;
              return (
                <div
                  key={hour}
                  className="flex-1 h-5 rounded-sm"
                  style={{
                    backgroundColor: count === 0
                      ? '#f3f4f6'
                      : `rgba(59, 130, 246, ${0.15 + intensity * 0.85})`,
                  }}
                  title={`${dayName} ${hour}:00 — ${count} вакансий`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopSkillsChart({ skills }: { skills: SkillStat[] }) {
  const maxCount = Math.max(...skills.map((s) => s.count), 1);

  return (
    <div className="space-y-2">
      {skills.map((sk) => {
        const pct = (sk.count / maxCount) * 100;
        return (
          <div key={sk.skill} className="flex items-center gap-3">
            <div className="w-24 text-xs text-gray-600 text-right truncate" title={sk.skill}>
              {sk.skill}
            </div>
            <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden relative">
              <div
                className="h-full rounded-full bg-brand-400 transition-all"
                style={{ width: `${Math.max(pct, 3)}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-gray-700">
                {sk.count}
              </span>
            </div>
            {sk.avg_score !== null && (
              <div className={clsx(
                'w-10 text-xs text-right font-semibold',
                sk.avg_score >= 70 ? 'text-green-600' :
                sk.avg_score >= 40 ? 'text-yellow-600' :
                'text-red-500'
              )}>
                {sk.avg_score}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const TIME_RANGES = [
  { label: '7д', days: 7 },
  { label: '30д', days: 30 },
  { label: '90д', days: 90 },
  { label: '1г', days: 365 },
];

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const [timeRange, setTimeRange] = useState(30);

  const { data: summary } = useQuery({
    queryKey: ['analyticsSummary'],
    queryFn: getAnalyticsSummary,
  });

  const { data: funnel } = useQuery({
    queryKey: ['analyticsFunnel'],
    queryFn: getAnalyticsFunnel,
  });

  const { data: timeSeries } = useQuery({
    queryKey: ['analyticsTimeSeries', timeRange],
    queryFn: () => getTimeSeries(timeRange),
  });

  const { data: scoreDist } = useQuery({
    queryKey: ['analyticsScoreDist'],
    queryFn: getScoreDistribution,
  });

  const { data: heatmap } = useQuery({
    queryKey: ['analyticsHeatmap'],
    queryFn: getActivityHeatmap,
  });

  const { data: topSkills } = useQuery({
    queryKey: ['analyticsTopSkills'],
    queryFn: () => getTopSkills(12),
  });

  const { data: marketIntel } = useQuery({
    queryKey: ['analyticsMarketIntel'],
    queryFn: getMarketIntel,
  });

  const { data: styleStats } = useQuery({
    queryKey: ['analyticsStyleStats'],
    queryFn: getStyleStats,
  });

  const backfillMut = useMutation({
    mutationFn: backfillAnalytics,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyticsSummary'] });
      queryClient.invalidateQueries({ queryKey: ['analyticsFunnel'] });
      queryClient.invalidateQueries({ queryKey: ['analyticsTimeSeries'] });
      queryClient.invalidateQueries({ queryKey: ['analyticsScoreDist'] });
      queryClient.invalidateQueries({ queryKey: ['analyticsHeatmap'] });
      queryClient.invalidateQueries({ queryKey: ['analyticsTopSkills'] });
    },
  });

  const convRates = summary?.conversion_rates ?? {};

  const statCards = [
    {
      label: 'Всего вакансий',
      value: summary?.unique_jobs ?? '-',
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Ср. оценка',
      value: summary?.avg_score != null ? summary.avg_score : '-',
      icon: Target,
      color: 'text-brand-600',
      bg: 'bg-brand-50',
    },
    {
      label: 'Конверсия в отклик',
      value: convRates.discovered_to_applied != null ? `${convRates.discovered_to_applied}%` : '-',
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Всего событий',
      value: summary?.total_events ?? '-',
      icon: BarChart3,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Аналитика" />
        <main className="p-8">
          {/* Backfill button */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => backfillMut.mutate()}
              disabled={backfillMut.isPending}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center gap-2 text-gray-600"
            >
              <Database className={clsx('w-4 h-4', backfillMut.isPending && 'animate-pulse')} />
              {backfillMut.isPending ? 'Заполнение...' : 'Заполнить из вакансий'}
            </button>
            {backfillMut.isSuccess && backfillMut.data && (
              <span className="ml-3 text-xs text-green-600 self-center">
                +{backfillMut.data.events_created} событий
              </span>
            )}
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statCards.map((card) => (
              <div
                key={card.label}
                className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-4"
              >
                <div className={clsx('w-12 h-12 rounded-lg flex items-center justify-center', card.bg)}>
                  <card.icon className={clsx('w-6 h-6', card.color)} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Funnel */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Воронка пайплайна</h3>
              {funnel && funnel.stages.some((s) => s.count > 0) ? (
                <FunnelChart stages={funnel.stages} />
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">
                  Данных пока нет. Нажмите &laquo;Заполнить из вакансий&raquo; для заполнения.
                </p>
              )}
            </div>

            {/* Score Distribution */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Распределение оценок</h3>
              {scoreDist && scoreDist.some((b) => b.count > 0) ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={scoreDist}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="кол-во" radius={[4, 4, 0, 0]}>
                      {scoreDist.map((entry, i) => (
                        <Cell
                          key={entry.range}
                          fill={
                            i === 0 ? '#ef4444' :
                            i === 1 ? '#f97316' :
                            i === 2 ? '#eab308' :
                            i === 3 ? '#22c55e' :
                            '#16a34a'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">Данных об оценках пока нет.</p>
              )}
            </div>
          </div>

          {/* Time Series */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Активность (за {timeRange === 365 ? '1 год' : `${timeRange} дн.`})
              </h3>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {TIME_RANGES.map((tr) => (
                  <button
                    key={tr.days}
                    onClick={() => setTimeRange(tr.days)}
                    className={clsx(
                      'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                      timeRange === tr.days
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    )}
                  >
                    {tr.label}
                  </button>
                ))}
              </div>
            </div>
            {timeSeries && timeSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="discovered" stroke="#3b82f6" strokeWidth={2} dot={false} name="Обнаружена" />
                  <Line type="monotone" dataKey="scored" stroke="#eab308" strokeWidth={2} dot={false} name="Оценена" />
                  <Line type="monotone" dataKey="letter_ready" stroke="#a855f7" strokeWidth={2} dot={false} name="Письмо готово" />
                  <Line type="monotone" dataKey="applied" stroke="#10b981" strokeWidth={2} dot={false} name="Отклик" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-sm text-center py-8">Данных об активности пока нет.</p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Activity Heatmap */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Тепловая карта активности</h3>
              {heatmap && heatmap.length > 0 ? (
                <ActivityHeatmap cells={heatmap} />
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">Данных тепловой карты пока нет.</p>
              )}
            </div>

            {/* Top Skills */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Топ навыков
                <span className="text-xs font-normal text-gray-400 ml-2">кол-во / ср. оценка</span>
              </h3>
              {topSkills && topSkills.length > 0 ? (
                <TopSkillsChart skills={topSkills} />
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">Данных о навыках пока нет.</p>
              )}
            </div>
          </div>

          {/* Conversion Rates */}
          {Object.keys(convRates).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Конверсия</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {Object.entries(convRates).map(([key, val]) => (
                  <div key={key} className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{val}%</p>
                    <p className="text-xs text-gray-500 mt-1 capitalize">
                      {'→ ' + ({
                        discovered_to_scored: 'оценена',
                        discovered_to_letter_ready: 'письмо готово',
                        discovered_to_approved: 'одобрена',
                        discovered_to_applied: 'отклик',
                        discovered_to_response: 'ответ',
                        discovered_to_hired: 'нанят',
                      }[key] || key.replace('discovered_to_', ''))}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Market Intelligence */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Анализ рынка</h3>
              {marketIntel && marketIntel.total_jobs > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-xl font-bold text-gray-900">
                        {marketIntel.avg_budget_min != null ? `$${marketIntel.avg_budget_min}` : '—'}
                        {marketIntel.avg_budget_max != null ? ` - $${marketIntel.avg_budget_max}` : ''}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Ср. диапазон бюджета</p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-xl font-bold text-gray-900">{marketIntel.total_jobs}</p>
                      <p className="text-xs text-gray-500 mt-1">Всего вакансий отслежено</p>
                    </div>
                  </div>
                  {/* Experience distribution */}
                  {Object.keys(marketIntel.experience_distribution).length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Уровень опыта</p>
                      <div className="flex gap-2">
                        {Object.entries(marketIntel.experience_distribution).map(([level, count]) => (
                          <div key={level} className="flex-1 text-center p-2 bg-gray-50 rounded">
                            <p className="text-sm font-bold text-gray-900">{count}</p>
                            <p className="text-[10px] text-gray-500 capitalize">{level}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Contract type distribution */}
                  {Object.keys(marketIntel.contract_type_distribution).length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Тип контракта</p>
                      <div className="flex gap-2">
                        {Object.entries(marketIntel.contract_type_distribution).map(([type, count]) => (
                          <div key={type} className="flex-1 text-center p-2 bg-gray-50 rounded">
                            <p className="text-sm font-bold text-gray-900">{count}</p>
                            <p className="text-[10px] text-gray-500 capitalize">{type}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">Данных о рынке пока нет.</p>
              )}
            </div>

            {/* A/B Testing: Style Stats */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                A/B тест: стили писем
              </h3>
              {styleStats && Object.keys(styleStats).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(styleStats).map(([style, data]) => (
                    <div key={style} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-900 capitalize">{style}</span>
                        <span className={clsx(
                          'text-sm font-bold',
                          data.approval_rate != null && data.approval_rate >= 70 ? 'text-green-600' :
                          data.approval_rate != null && data.approval_rate >= 40 ? 'text-yellow-600' :
                          'text-gray-400'
                        )}>
                          {data.approval_rate != null ? `${data.approval_rate}%` : '—'}
                        </span>
                      </div>
                      <div className="flex gap-3 text-xs text-gray-500">
                        <span>Всего: {data.total}</span>
                        <span className="text-green-600">Одобрено: {data.approved}</span>
                        <span className="text-red-500">Отклонено: {data.rejected}</span>
                        <span>Черновик: {data.draft}</span>
                      </div>
                      {/* Approval rate bar */}
                      {data.total > 0 && (
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                          <div className="flex h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-green-500"
                              style={{ width: `${(data.approved / data.total) * 100}%` }}
                            />
                            <div
                              className="bg-red-400"
                              style={{ width: `${(data.rejected / data.total) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">
                  Данных о стилях пока нет. Сгенерируйте письма с разными стилями для сравнения.
                </p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
