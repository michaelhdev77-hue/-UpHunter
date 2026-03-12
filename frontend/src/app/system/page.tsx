'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { checkAllServicesHealth, getUpworkTokenStatus, getJobsSummary, getAnalyticsSummary, getPollerStatus, triggerPollNow, type ServiceHealth } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  Activity, CheckCircle, XCircle, RefreshCw, Clock, Server,
  Database, Wifi, Shield, Zap, Globe, ArrowRight, Play, AlertTriangle,
} from 'lucide-react';

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
  );
}

function ServiceCard({ service }: { service: ServiceHealth }) {
  const ok = service.status === 'ok';
  return (
    <div className={`rounded-xl border p-4 transition-colors ${ok ? 'bg-white border-gray-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <StatusDot ok={ok} />
          <h4 className="text-sm font-semibold text-gray-900">{service.name}</h4>
        </div>
        {ok
          ? <CheckCircle className="w-5 h-5 text-green-500" />
          : <XCircle className="w-5 h-5 text-red-500" />}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={ok ? 'text-green-600' : 'text-red-600'}>{ok ? 'Работает' : 'Недоступен'}</span>
        <span className="text-gray-400 flex items-center gap-1">
          <Clock className="w-3 h-3" /> {service.responseTime}ms
        </span>
      </div>
      <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${service.responseTime < 200 ? 'bg-green-500' : service.responseTime < 500 ? 'bg-yellow-500' : 'bg-red-500'}`}
          style={{ width: `${Math.min(100, (1 - service.responseTime / 1000) * 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function SystemPage() {
  const queryClient = useQueryClient();
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: healthData, isLoading: healthLoading, isFetching } = useQuery({
    queryKey: ['systemHealth', refreshKey],
    queryFn: checkAllServicesHealth,
    refetchInterval: 30000, // auto-refresh every 30s
  });

  const { data: upworkToken } = useQuery({
    queryKey: ['upworkToken'],
    queryFn: getUpworkTokenStatus,
  });

  const { data: jobsSummary } = useQuery({
    queryKey: ['jobsSummary'],
    queryFn: getJobsSummary,
  });

  const { data: analyticsSummary } = useQuery({
    queryKey: ['analyticsSummary'],
    queryFn: getAnalyticsSummary,
  });

  const { data: pollerData } = useQuery({
    queryKey: ['pollerStatus'],
    queryFn: getPollerStatus,
    refetchInterval: 15000,
  });

  const [pollError, setPollError] = useState<string | null>(null);
  const pollNowMutation = useMutation({
    mutationFn: triggerPollNow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pollerStatus'] });
      queryClient.invalidateQueries({ queryKey: ['jobsSummary'] });
      setPollError(null);
    },
    onError: (e: Error) => setPollError(e?.message || 'Ошибка опроса'),
  });

  const services = healthData ?? [];
  const allOk = services.length > 0 && services.every((s) => s.status === 'ok');
  const downCount = services.filter((s) => s.status === 'error').length;
  const avgLatency = services.length > 0
    ? Math.round(services.reduce((sum, s) => sum + s.responseTime, 0) / services.length)
    : 0;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Состояние системы" />
        <main className="p-8">

          {/* Overall Status Banner */}
          <div className={`rounded-xl p-6 mb-6 ${allOk ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-red-500 to-orange-600'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                  {allOk
                    ? <Activity className="w-7 h-7 text-white" />
                    : <Zap className="w-7 h-7 text-white" />}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {healthLoading ? 'Проверка...' : allOk ? 'Все системы работают' : `Сервис(ы) недоступны: ${downCount}`}
                  </h2>
                  <p className="text-white/80 text-sm">
                    {services.length} сервисов на мониторинге | Ср. задержка: {avgLatency}мс
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={isFetching}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                Обновить
              </button>
            </div>
          </div>

          {/* Service Grid */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Server className="w-4 h-4" /> Микросервисы ({services.length})
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {services.map((service) => (
                <ServiceCard key={service.name} service={service} />
              ))}
            </div>
          </div>

          {/* Poller Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4" /> Сканер вакансий
              </h3>
              <div className="flex items-center gap-2">
                <StatusDot ok={pollerData?.running ?? false} />
                <span className="text-xs text-gray-500">{pollerData?.running ? 'Запущен' : 'Остановлен'}</span>
                <button
                  onClick={() => pollNowMutation.mutate()}
                  disabled={pollNowMutation.isPending}
                  className="ml-2 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1"
                >
                  <Play className="w-3 h-3" />
                  {pollNowMutation.isPending ? 'Опрос...' : 'Опросить сейчас'}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{pollerData?.total_polls ?? 0}</p>
                <p className="text-xs text-gray-500">Всего опросов</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{pollerData?.total_jobs_discovered ?? 0}</p>
                <p className="text-xs text-gray-500">Найдено вакансий</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{pollerData?.last_jobs_found ?? 0}</p>
                <p className="text-xs text-gray-500">Последний опрос</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{pollerData?.active_filters ?? 0}</p>
                <p className="text-xs text-gray-500">Активные фильтры</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-900 font-mono">
                  {pollerData?.last_poll_at ? new Date(pollerData.last_poll_at).toLocaleTimeString() : '-'}
                </p>
                <p className="text-xs text-gray-500">Последний запуск</p>
              </div>
            </div>
            {pollerData?.last_error && (
              <div className="mt-3 flex items-start gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {pollerData.last_error}
              </div>
            )}
            {pollError && (
              <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5" />
                {pollError}
              </div>
            )}
            {pollNowMutation.isSuccess && (
              <div className="mt-3 flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                <CheckCircle className="w-3.5 h-3.5" />
                Ручной опрос завершён: найдено {pollNowMutation.data?.jobs_found ?? 0} новых вакансий
              </div>
            )}
          </div>

          {/* Infrastructure & Integrations */}
          <div className="grid grid-cols-2 gap-6 mb-6">

            {/* Upwork Integration */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Globe className="w-4 h-4" /> Интеграция с Upwork
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Соединение</span>
                  <span className={`text-sm font-medium flex items-center gap-1 ${upworkToken?.connected ? 'text-green-600' : 'text-red-600'}`}>
                    <StatusDot ok={upworkToken?.connected ?? false} />
                    {upworkToken?.connected ? 'Подключено' : 'Отключено'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Токен</span>
                  <span className="text-sm text-gray-900">
                    {upworkToken?.access_token ? 'Действителен' : 'Отсутствует'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600">Истекает</span>
                  <span className="text-sm text-gray-900">
                    {upworkToken?.expires_at ? new Date(upworkToken.expires_at).toLocaleString() : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Pipeline Stats */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Database className="w-4 h-4" /> Статистика пайплайна
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Всего вакансий</span>
                  <span className="text-sm font-bold text-gray-900">{jobsSummary?.total ?? '-'}</span>
                </div>
                {jobsSummary?.by_status && Object.entries(jobsSummary.by_status).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between py-1">
                    <span className="text-xs text-gray-500 capitalize">{{ discovered: 'Обнаружена', scored: 'Оценена', letter_ready: 'Письмо готово', under_review: 'На проверке', applied: 'Отклик', response: 'Ответ', hired: 'Нанят', rejected: 'Отклонена' }[status] || status.replace('_', ' ')}</span>
                    <span className="text-xs font-medium text-gray-700">{count as number}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Analytics Quick View */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Обзор аналитики
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{analyticsSummary?.total_events ?? '-'}</p>
                <p className="text-xs text-gray-500">Всего событий</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{analyticsSummary?.unique_jobs ?? '-'}</p>
                <p className="text-xs text-gray-500">Уникальных вакансий</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {analyticsSummary?.avg_score !== null && analyticsSummary?.avg_score !== undefined ? analyticsSummary.avg_score.toFixed(1) : '-'}
                </p>
                <p className="text-xs text-gray-500">Ср. оценка</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {analyticsSummary?.conversion_rates?.['discovered_to_applied'] !== undefined
                    ? `${(analyticsSummary.conversion_rates['discovered_to_applied'] * 100).toFixed(1)}%`
                    : '-'}
                </p>
                <p className="text-xs text-gray-500">Конверсия</p>
              </div>
            </div>
          </div>

          {/* Monitoring Tools */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Globe className="w-4 h-4" /> Инструменты мониторинга
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <a href="http://localhost:3003" target="_blank" rel="noopener noreferrer"
                className="bg-gray-50 rounded-lg p-4 text-center hover:bg-gray-100 transition-colors group">
                <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-600">Grafana</p>
                <p className="text-xs text-gray-500 mt-1">Дашборды и метрики</p>
                <p className="text-[10px] text-gray-400 mt-1 font-mono">:3003</p>
              </a>
              <a href="http://localhost:9090" target="_blank" rel="noopener noreferrer"
                className="bg-gray-50 rounded-lg p-4 text-center hover:bg-gray-100 transition-colors group">
                <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-600">Prometheus</p>
                <p className="text-xs text-gray-500 mt-1">Метрики и алерты</p>
                <p className="text-[10px] text-gray-400 mt-1 font-mono">:9090</p>
              </a>
              <a href="http://localhost:16687" target="_blank" rel="noopener noreferrer"
                className="bg-gray-50 rounded-lg p-4 text-center hover:bg-gray-100 transition-colors group">
                <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-600">Jaeger</p>
                <p className="text-xs text-gray-500 mt-1">Распределённая трассировка</p>
                <p className="text-[10px] text-gray-400 mt-1 font-mono">:16687</p>
              </a>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
