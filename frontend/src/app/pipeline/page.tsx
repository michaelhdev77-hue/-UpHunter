'use client';

import { useQuery } from '@tanstack/react-query';
import { getJobs, type Job } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { clsx } from 'clsx';

const columns = [
  { status: 'new', label: 'New', color: 'border-blue-400' },
  { status: 'scored', label: 'Scored', color: 'border-yellow-400' },
  { status: 'letter_ready', label: 'Letter Ready', color: 'border-purple-400' },
  { status: 'approved', label: 'Approved', color: 'border-green-400' },
  { status: 'applied', label: 'Applied', color: 'border-emerald-400' },
  { status: 'rejected', label: 'Rejected', color: 'border-red-400' },
];

export default function PipelinePage() {
  // Fetch all jobs (limited) for each status
  const queries = columns.map((col) => ({
    status: col.status,
    // eslint-disable-next-line react-hooks/rules-of-hooks
    query: useQuery({
      queryKey: ['pipeline', col.status],
      queryFn: () => getJobs({ status: col.status, size: 50 }),
    }),
  }));

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Pipeline" />
        <main className="p-8">
          {/* TODO: Add drag-and-drop support (e.g., @hello-pangea/dnd) */}
          <div className="flex gap-4 overflow-x-auto pb-4">
            {columns.map((col) => {
              const q = queries.find((x) => x.status === col.status)?.query;
              const jobs = q?.data?.items ?? [];
              const total = q?.data?.total ?? 0;

              return (
                <div
                  key={col.status}
                  className={clsx(
                    'flex-shrink-0 w-72 bg-gray-50 rounded-xl border-t-4',
                    col.color
                  )}
                >
                  <div className="px-4 py-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                    <span className="text-xs bg-white text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">
                      {total}
                    </span>
                  </div>
                  <div className="px-3 pb-3 space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
                    {jobs.map((job: Job) => (
                      <div
                        key={job.id}
                        className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm transition-shadow cursor-pointer"
                      >
                        <p className="text-sm font-medium text-gray-900 line-clamp-2">
                          {job.title}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex gap-1">
                            {job.skills.slice(0, 2).map((s) => (
                              <span
                                key={s}
                                className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                          {job.overall_score !== null && (
                            <span className="text-sm font-bold text-brand-500">
                              {job.overall_score}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {!q?.isLoading && jobs.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">No jobs</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
