'use client';

import { useQuery } from '@tanstack/react-query';
import { getFunnelStats, getJobs, type Job } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Briefcase, CheckCircle, FileText, Send } from 'lucide-react';
import { clsx } from 'clsx';

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  scored: 'bg-yellow-100 text-yellow-700',
  letter_ready: 'bg-purple-100 text-purple-700',
  approved: 'bg-green-100 text-green-700',
  applied: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-600',
};

export default function DashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ['funnelStats'],
    queryFn: getFunnelStats,
  });

  const { data: latestJobs } = useQuery({
    queryKey: ['latestJobs'],
    queryFn: () => getJobs({ page: 1, size: 5 }),
  });

  const statCards = [
    {
      label: 'Total Jobs',
      value: stats?.total_jobs ?? '-',
      icon: Briefcase,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Scored',
      value: stats?.scored ?? '-',
      icon: CheckCircle,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
    },
    {
      label: 'Letters Ready',
      value: stats?.letters_ready ?? '-',
      icon: FileText,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Applied',
      value: stats?.applied ?? '-',
      icon: Send,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Dashboard" />
        <main className="p-8">
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

          {/* Latest Jobs */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Latest Jobs</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {latestJobs?.items.map((job: Job) => (
                <div key={job.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
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
                        <span className="text-lg font-bold text-brand-500">{job.overall_score}</span>
                        <span className="text-xs text-gray-400 ml-0.5">/100</span>
                      </div>
                    )}
                    <span
                      className={clsx(
                        'text-xs font-medium px-2.5 py-1 rounded-full',
                        statusColors[job.status] || 'bg-gray-100 text-gray-600'
                      )}
                    >
                      {job.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
              {!latestJobs?.items.length && (
                <div className="px-6 py-12 text-center text-gray-400">
                  No jobs yet. Set up search filters in Settings to start scanning.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
