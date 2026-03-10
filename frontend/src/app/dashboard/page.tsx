'use client';

import { useQuery } from '@tanstack/react-query';
import { getJobs, getJobsSummary, getTopJobs, getJobAlerts, type Job } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  Briefcase, CheckCircle, FileText, Send,
  AlertTriangle, Trophy, Sparkles, Bell,
  ArrowRight, Clock,
} from 'lucide-react';
import { clsx } from 'clsx';
import Link from 'next/link';

const statusLabels: Record<string, string> = {
  discovered: 'Обнаружена',
  scored: 'Оценена',
  letter_ready: 'Письмо готово',
  under_review: 'На проверке',
  approved: 'Одобрена',
  applied: 'Отклик',
  response: 'Ответ',
  hired: 'Нанят',
  rejected: 'Отклонена',
};

const statusColors: Record<string, string> = {
  discovered: 'bg-blue-100 text-blue-700',
  scored: 'bg-yellow-100 text-yellow-700',
  letter_ready: 'bg-purple-100 text-purple-700',
  under_review: 'bg-indigo-100 text-indigo-700',
  approved: 'bg-green-100 text-green-700',
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

function scoreBg(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function DashboardPage() {
  const { data: summary } = useQuery({
    queryKey: ['jobsSummary'],
    queryFn: getJobsSummary,
  });

  const { data: topJobs } = useQuery({
    queryKey: ['topJobs'],
    queryFn: () => getTopJobs(5),
  });

  const { data: alerts } = useQuery({
    queryKey: ['jobAlerts'],
    queryFn: getJobAlerts,
  });

  const { data: latestJobs } = useQuery({
    queryKey: ['latestJobs'],
    queryFn: () => getJobs({ limit: 10 }),
  });

  const byStatus = summary?.by_status ?? {};

  const statCards = [
    {
      label: 'Всего вакансий',
      value: summary?.total ?? '-',
      icon: Briefcase,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Оценено',
      value: (byStatus.scored ?? 0) + (byStatus.letter_ready ?? 0) + (byStatus.approved ?? 0) + (byStatus.applied ?? 0),
      icon: CheckCircle,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
    },
    {
      label: 'Писем готово',
      value: (byStatus.letter_ready ?? 0) + (byStatus.approved ?? 0),
      icon: FileText,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Откликов',
      value: byStatus.applied ?? 0,
      icon: Send,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
  ];

  const hasAlerts = alerts && (
    alerts.high_score_jobs.length > 0 ||
    alerts.unscored_count > 0 ||
    alerts.awaiting_review > 0
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Дашборд" />
        <main className="p-8">
          {/* Alerts Banner */}
          {hasAlerts && (
            <div className="mb-6 space-y-3">
              {alerts.unscored_count > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    <span className="text-sm text-amber-800">
                      <strong>{alerts.unscored_count}</strong> новых вакансий ожидают оценки
                    </span>
                  </div>
                  <Link href="/jobs?status=discovered" className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1">
                    Открыть <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
              {alerts.awaiting_review > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-purple-500" />
                    <span className="text-sm text-purple-800">
                      <strong>{alerts.awaiting_review}</strong> вакансий ожидают проверки
                    </span>
                  </div>
                  <Link href="/pipeline" className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1">
                    Пайплайн <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
              {alerts.high_score_jobs.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-3">
                  <Bell className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-green-800">
                    <strong>{alerts.high_score_jobs.length}</strong> вакансий с высокой оценкой требуют внимания!
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Stats Cards */}
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
            {/* Top 5 Jobs by Score */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-semibold text-gray-900">Топ вакансий по оценке</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {topJobs?.map((job, idx) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="px-6 py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors block"
                  >
                    <span className="text-sm font-bold text-gray-400 w-5">#{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
                      <div className="flex gap-1.5 mt-1">
                        {job.skills.slice(0, 3).map((skill) => (
                          <span key={skill} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={clsx('text-xl font-bold', scoreColor(job.overall_score!))}>
                        {job.overall_score}
                      </span>
                      <div className="w-16 bg-gray-200 rounded-full h-1.5 mt-1">
                        <div
                          className={clsx('h-1.5 rounded-full', scoreBg(job.overall_score!))}
                          style={{ width: `${Math.min(job.overall_score!, 100)}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                ))}
                {!topJobs?.length && (
                  <div className="px-6 py-8 text-center text-gray-400 text-sm">
                    Оценённых вакансий пока нет
                  </div>
                )}
              </div>
            </div>

            {/* Pipeline Summary */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Пайплайн</h3>
              </div>
              <div className="p-6">
                {summary ? (
                  <div className="space-y-3">
                    {Object.entries(byStatus).map(([stage, count]) => {
                      const total = summary.total || 1;
                      const pct = Math.round((count / total) * 100);
                      return (
                        <div key={stage} className="flex items-center gap-3">
                          <span className="w-24 text-xs text-gray-500 text-right capitalize">
                            {statusLabels[stage] || stage.replace('_', ' ')}
                          </span>
                          <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden relative">
                            <div
                              className={clsx(
                                'h-full rounded-full transition-all',
                                stage === 'rejected' ? 'bg-red-400' :
                                stage === 'hired' ? 'bg-green-500' :
                                stage === 'applied' ? 'bg-emerald-400' :
                                stage === 'approved' ? 'bg-green-400' :
                                stage === 'letter_ready' ? 'bg-purple-400' :
                                stage === 'scored' ? 'bg-yellow-400' :
                                'bg-blue-400',
                              )}
                              style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
                            />
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
                              {count}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm text-center py-8">Загрузка...</p>
                )}
              </div>
            </div>
          </div>

          {/* Latest Jobs */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Последние вакансии</h3>
              <Link href="/jobs" className="text-sm text-brand-500 hover:text-brand-600">
                Все
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {latestJobs?.items.map((job: Job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors block"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      {job.skills.slice(0, 3).map((skill) => (
                        <span key={skill} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {skill}
                        </span>
                      ))}
                      {job.skills.length > 3 && (
                        <span className="text-xs text-gray-400">+{job.skills.length - 3}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    {job.overall_score !== null && (
                      <div className="text-right">
                        <span className={clsx('text-lg font-bold', scoreColor(job.overall_score))}>
                          {job.overall_score}
                        </span>
                        <span className="text-xs text-gray-400 ml-0.5">/100</span>
                      </div>
                    )}
                    <span
                      className={clsx(
                        'text-xs font-medium px-2.5 py-1 rounded-full',
                        statusColors[job.status] || 'bg-gray-100 text-gray-600'
                      )}
                    >
                      {statusLabels[job.status] || job.status.replace('_', ' ')}
                    </span>
                  </div>
                </Link>
              ))}
              {!latestJobs?.items.length && (
                <div className="px-6 py-12 text-center text-gray-400">
                  Вакансий пока нет. Настройте фильтры поиска в Настройках.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
