'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getClients, getClient, getClientRisk, analyzeClient, type ClientInfo } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  Search, Shield, ShieldAlert, ShieldCheck, AlertTriangle,
  DollarSign, Star, MapPin, Calendar, Briefcase, ChevronLeft,
  ChevronRight, ArrowUpDown, ExternalLink, Users, RefreshCw,
} from 'lucide-react';

function riskColor(score: number | null): string {
  if (score === null) return 'bg-gray-100 text-gray-500';
  if (score >= 60) return 'bg-red-100 text-red-700';
  if (score >= 35) return 'bg-yellow-100 text-yellow-700';
  return 'bg-green-100 text-green-700';
}

function riskLabel(score: number | null): string {
  if (score === null) return 'Н/Д';
  if (score >= 60) return 'Высокий';
  if (score >= 35) return 'Средний';
  return 'Низкий';
}

function RiskIcon({ score }: { score: number | null }) {
  if (score === null) return <Shield className="w-4 h-4 text-gray-400" />;
  if (score >= 60) return <ShieldAlert className="w-4 h-4 text-red-500" />;
  if (score >= 35) return <Shield className="w-4 h-4 text-yellow-500" />;
  return <ShieldCheck className="w-4 h-4 text-green-500" />;
}

function RiskBar({ score }: { score: number | null }) {
  const pct = score ?? 0;
  const color = pct >= 60 ? 'bg-red-500' : pct >= 35 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function formatMoney(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('risk_score');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const perPage = 25;

  const riskParams = riskFilter === 'high' ? { min_risk: 60 }
    : riskFilter === 'medium' ? { min_risk: 35, max_risk: 59.9 }
    : riskFilter === 'low' ? { max_risk: 34.9 }
    : {};

  const { data, isLoading } = useQuery({
    queryKey: ['clients', search, page, sortBy, sortDir, riskFilter],
    queryFn: () => getClients({
      search: search || undefined,
      sort_by: sortBy,
      sort_dir: sortDir,
      limit: perPage,
      offset: (page - 1) * perPage,
      ...riskParams,
    }),
  });

  const clients = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / perPage);

  function toggleSort(field: string) {
    if (sortBy === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setPage(1);
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Аналитика клиентов" />
        <main className="p-8">

          {/* Stats bar */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <Users className="w-4 h-4" /> Всего клиентов
              </div>
              <p className="text-2xl font-bold text-gray-900">{total}</p>
            </div>
            <button onClick={() => { setRiskFilter(riskFilter === 'high' ? 'all' : 'high'); setPage(1); }}
              className={`bg-white rounded-xl border p-4 text-left transition-colors ${riskFilter === 'high' ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-red-200'}`}>
              <div className="flex items-center gap-2 text-red-500 text-xs mb-1">
                <ShieldAlert className="w-4 h-4" /> Высокий риск
              </div>
              <p className="text-2xl font-bold text-gray-900">{riskFilter === 'high' ? total : '-'}</p>
            </button>
            <button onClick={() => { setRiskFilter(riskFilter === 'medium' ? 'all' : 'medium'); setPage(1); }}
              className={`bg-white rounded-xl border p-4 text-left transition-colors ${riskFilter === 'medium' ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200 hover:border-yellow-200'}`}>
              <div className="flex items-center gap-2 text-yellow-600 text-xs mb-1">
                <Shield className="w-4 h-4" /> Средний риск
              </div>
              <p className="text-2xl font-bold text-gray-900">{riskFilter === 'medium' ? total : '-'}</p>
            </button>
            <button onClick={() => { setRiskFilter(riskFilter === 'low' ? 'all' : 'low'); setPage(1); }}
              className={`bg-white rounded-xl border p-4 text-left transition-colors ${riskFilter === 'low' ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-green-200'}`}>
              <div className="flex items-center gap-2 text-green-600 text-xs mb-1">
                <ShieldCheck className="w-4 h-4" /> Низкий риск
              </div>
              <p className="text-2xl font-bold text-gray-900">{riskFilter === 'low' ? total : '-'}</p>
            </button>
          </div>

          {/* Search */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Поиск по имени, компании или UID..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm" />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Клиент</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none"
                      onClick={() => toggleSort('risk_score')}>
                      <span className="inline-flex items-center gap-1">
                        Риск <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none"
                      onClick={() => toggleSort('total_spent')}>
                      <span className="inline-flex items-center gap-1">
                        Расход <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none"
                      onClick={() => toggleSort('rating')}>
                      <span className="inline-flex items-center gap-1">
                        Рейтинг <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Локация</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none"
                      onClick={() => toggleSort('jobs_posted')}>
                      <span className="inline-flex items-center gap-1">
                        Вакансии <ArrowUpDown className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Флаги</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoading ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Загрузка...</td></tr>
                  ) : clients.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Клиенты не найдены</td></tr>
                  ) : clients.map((client) => (
                    <>
                      <tr key={client.id}
                        onClick={() => setExpanded(expanded === client.id ? null : client.id)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors">
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {client.name || client.upwork_uid}
                            </p>
                            {client.company && (
                              <p className="text-xs text-gray-500">{client.company}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <RiskIcon score={client.risk_score} />
                            <div className="w-24">
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${riskColor(client.risk_score)}`}>
                                  {client.risk_score !== null ? client.risk_score.toFixed(0) : '-'}
                                </span>
                                <span className="text-[10px] text-gray-400">{riskLabel(client.risk_score)}</span>
                              </div>
                              <RiskBar score={client.risk_score} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-sm text-gray-700">
                            <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                            {formatMoney(client.total_spent)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-sm text-gray-700">
                            <Star className="w-3.5 h-3.5 text-yellow-400" />
                            {client.rating?.toFixed(1) ?? '-'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin className="w-3.5 h-3.5" />
                            {client.country || 'Неизвестно'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-sm text-gray-700">
                            <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                            {client.jobs_posted}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {client.red_flags.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" />
                              {client.red_flags.length}
                            </span>
                          ) : (
                            <span className="text-xs text-green-600">Чисто</span>
                          )}
                        </td>
                      </tr>
                      {expanded === client.id && (
                        <tr key={`${client.id}-detail`}>
                          <td colSpan={7} className="px-4 py-4 bg-gray-50">
                            <ClientDetail client={client} />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Показано {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} из {total}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600">{page} / {totalPages}</span>
                  <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}

// --- Expanded Client Detail ---
function ClientDetail({ client }: { client: ClientInfo }) {
  const queryClient = useQueryClient();

  // Fetch fresh data from dedicated endpoint
  const { data: freshClient } = useQuery({
    queryKey: ['client', client.upwork_uid],
    queryFn: () => getClient(client.upwork_uid),
    initialData: client,
  });

  // Fetch dedicated risk assessment
  const { data: riskData } = useQuery({
    queryKey: ['clientRisk', client.upwork_uid],
    queryFn: () => getClientRisk(client.upwork_uid),
  });

  // Re-analyze mutation
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const reanalyzeMut = useMutation({
    mutationFn: () => analyzeClient({
      upwork_uid: client.upwork_uid,
      name: client.name ?? undefined,
      company: client.company ?? undefined,
      country: client.country ?? undefined,
      payment_verified: client.payment_verified,
      total_spent: client.total_spent,
      hire_rate: client.hire_rate ?? undefined,
      jobs_posted: client.jobs_posted,
      active_hires: client.active_hires,
      rating: client.rating ?? undefined,
      reviews_count: client.reviews_count,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', client.upwork_uid] });
      queryClient.invalidateQueries({ queryKey: ['clientRisk', client.upwork_uid] });
      setReanalyzeError(null);
    },
    onError: (e: Error) => setReanalyzeError(e?.message || 'Ошибка переоценки'),
  });

  const c = freshClient ?? client;
  const risk = riskData ?? { risk_score: c.risk_score ?? 0, red_flags: c.red_flags };

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <button
          onClick={() => reanalyzeMut.mutate()}
          disabled={reanalyzeMut.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${reanalyzeMut.isPending ? 'animate-spin' : ''}`} />
          {reanalyzeMut.isPending ? 'Анализ...' : 'Переоценить'}
        </button>
        {reanalyzeError && (
          <span className="text-xs text-red-600 ml-2">{reanalyzeError}</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-6">
        {/* Profile */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Профиль</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">UID</span>
              <span className="text-gray-900 font-mono text-xs">{c.upwork_uid}</span>
            </div>
            {c.company && (
              <div className="flex justify-between">
                <span className="text-gray-500">Компания</span>
                <span className="text-gray-900">{c.company}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Локация</span>
              <span className="text-gray-900">
                {[c.city, c.country].filter(Boolean).join(', ') || 'Неизвестно'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">На платформе с</span>
              <span className="text-gray-900">
                {c.member_since ? new Date(c.member_since).toLocaleDateString() : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Оплата подтверждена</span>
              <span className={c.payment_verified ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                {c.payment_verified ? 'Да' : 'Нет'}
              </span>
            </div>
          </div>
        </div>

        {/* Financials */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Финансы</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Общий расход</span>
              <span className="text-gray-900 font-medium">{formatMoney(c.total_spent)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Ср. почасовая ставка</span>
              <span className="text-gray-900">{c.avg_hourly_rate ? `$${c.avg_hourly_rate}/hr` : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Процент найма</span>
              <span className="text-gray-900">{c.hire_rate !== null ? `${c.hire_rate.toFixed(0)}%` : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Вакансий опубликовано</span>
              <span className="text-gray-900">{c.jobs_posted}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Активные контракты</span>
              <span className="text-gray-900">{c.active_hires}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Отзывы</span>
              <span className="text-gray-900">{c.reviews_count}</span>
            </div>
          </div>
        </div>

        {/* Risk Assessment */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Оценка рисков</h4>
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">Оценка риска</span>
              <span className={`text-lg font-bold px-2 py-0.5 rounded ${riskColor(risk.risk_score)}`}>
                {risk.risk_score?.toFixed(1) ?? '-'}
              </span>
            </div>
            <RiskBar score={risk.risk_score} />
          </div>
          {risk.red_flags.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-red-600 uppercase">Красные флаги</p>
              {risk.red_flags.map((flag: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {flag}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg">
              <ShieldCheck className="w-4 h-4" /> Красных флагов не обнаружено
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
