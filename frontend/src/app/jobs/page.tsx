'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getJobs, type Job } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Search, ChevronLeft, ChevronRight, MapPin, Star, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'new', label: 'New' },
  { value: 'scored', label: 'Scored' },
  { value: 'letter_ready', label: 'Letter Ready' },
  { value: 'approved', label: 'Approved' },
  { value: 'applied', label: 'Applied' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'skipped', label: 'Skipped' },
];

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  scored: 'bg-yellow-100 text-yellow-700',
  letter_ready: 'bg-purple-100 text-purple-700',
  approved: 'bg-green-100 text-green-700',
  applied: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-600',
};

export default function JobsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', page, search, status],
    queryFn: () =>
      getJobs({
        page,
        size: 20,
        search: search || undefined,
        status: status || undefined,
      }),
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Jobs" />
        <main className="p-8">
          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search jobs..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm"
              />
            </div>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm bg-white"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Job List */}
          <div className="space-y-3">
            {isLoading && (
              <div className="text-center py-12 text-gray-400">Loading jobs...</div>
            )}

            {data?.items.map((job: Job) => (
              <div
                key={job.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-gray-300 transition-colors"
              >
                <div
                  className="px-6 py-4 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === job.id ? null : job.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {job.title}
                        </h3>
                        {job.url && (
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-gray-400 hover:text-brand-500"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        {job.budget_type && (
                          <span>
                            {job.budget_type === 'fixed'
                              ? `Fixed: $${job.budget_min ?? '?'}${job.budget_max ? ` - $${job.budget_max}` : ''}`
                              : `Hourly: $${job.budget_min ?? '?'} - $${job.budget_max ?? '?'}/hr`}
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
                          <span>{job.proposals_count} proposals</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {job.skills.map((skill) => (
                          <span
                            key={skill}
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4 shrink-0">
                      {job.overall_score !== null && (
                        <div className="text-right">
                          <span className="text-xl font-bold text-brand-500">
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
                        {job.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>

                {expandedId === job.id && (
                  <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {job.description}
                    </p>
                    {job.scores && (
                      <div className="mt-4 flex gap-6">
                        {Object.entries(job.scores).map(([key, value]) => (
                          <div key={key} className="text-center">
                            <p className="text-lg font-semibold text-gray-900">{value}</p>
                            <p className="text-xs text-gray-500 capitalize">{key}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {!isLoading && !data?.items.length && (
              <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
                No jobs found
              </div>
            )}
          </div>

          {/* Pagination */}
          {data && data.pages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-gray-500">
                Page {data.page} of {data.pages} ({data.total} total)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                  disabled={page === data.pages}
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
