'use client';

import { useState, useRef, DragEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJobs, updateJobStatus, type Job } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
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

const columns = [
  { status: 'discovered', label: 'Обнаружена', color: 'border-blue-400', bg: 'bg-blue-50' },
  { status: 'scored', label: 'Оценена', color: 'border-yellow-400', bg: 'bg-yellow-50' },
  { status: 'letter_ready', label: 'Письмо готово', color: 'border-purple-400', bg: 'bg-purple-50' },
  { status: 'under_review', label: 'На проверке', color: 'border-indigo-400', bg: 'bg-indigo-50' },
  { status: 'approved', label: 'Одобрена', color: 'border-green-400', bg: 'bg-green-50' },
  { status: 'applied', label: 'Отклик', color: 'border-emerald-400', bg: 'bg-emerald-50' },
  { status: 'response', label: 'Ответ', color: 'border-teal-400', bg: 'bg-teal-50' },
  { status: 'hired', label: 'Нанят', color: 'border-green-500', bg: 'bg-green-50' },
  { status: 'rejected', label: 'Отклонена', color: 'border-red-400', bg: 'bg-red-50' },
];

function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-red-500';
}

function PipelineCard({
  job,
  colStatus,
  onDragStart,
}: {
  job: Job;
  colStatus: string;
  onDragStart: (e: DragEvent, jobId: number, fromStatus: string) => void;
}) {
  const queryClient = useQueryClient();

  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateJobStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });

  const statusOrder = columns.map((c) => c.status);
  const currentIdx = statusOrder.indexOf(colStatus);
  const nextStatus = currentIdx < statusOrder.length - 2 ? statusOrder[currentIdx + 1] : null;
  const canReject = colStatus !== 'rejected' && colStatus !== 'hired';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, job.id, colStatus)}
      className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing"
    >
      <Link href={`/jobs/${job.id}`}>
        <p className="text-sm font-medium text-gray-900 line-clamp-2 hover:text-brand-600">
          {job.title}
        </p>
      </Link>
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
          <span className={clsx('text-sm font-bold', scoreColor(job.overall_score))}>
            {job.overall_score}
          </span>
        )}
      </div>
      <div className="flex gap-1 mt-2">
        {nextStatus && (
          <button
            onClick={() => moveMutation.mutate({ id: job.id, status: nextStatus })}
            disabled={moveMutation.isPending}
            className="flex-1 text-[10px] px-2 py-1 bg-brand-50 text-brand-600 rounded hover:bg-brand-100 transition-colors disabled:opacity-50"
          >
            &rarr; {statusLabels[nextStatus] || nextStatus.replace('_', ' ')}
          </button>
        )}
        {canReject && (
          <button
            onClick={() => moveMutation.mutate({ id: job.id, status: 'rejected' })}
            disabled={moveMutation.isPending}
            className="text-[10px] px-2 py-1 bg-red-50 text-red-500 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            &#x2715;
          </button>
        )}
      </div>
    </div>
  );
}

function PipelineColumn({
  col,
  onDragStart,
  onDrop,
  dragOverStatus,
  setDragOverStatus,
}: {
  col: (typeof columns)[number];
  onDragStart: (e: DragEvent, jobId: number, fromStatus: string) => void;
  onDrop: (targetStatus: string) => void;
  dragOverStatus: string | null;
  setDragOverStatus: (s: string | null) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['pipeline', col.status],
    queryFn: () => getJobs({ status: col.status, limit: 50 }),
  });

  const jobs = data?.items ?? [];
  const total = data?.total ?? 0;
  const isOver = dragOverStatus === col.status;

  return (
    <div
      className={clsx(
        'flex-shrink-0 w-64 rounded-xl border-t-4 transition-all',
        col.color,
        isOver ? 'bg-brand-50 ring-2 ring-brand-300' : col.bg
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOverStatus(col.status);
      }}
      onDragLeave={() => setDragOverStatus(null)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOverStatus(null);
        onDrop(col.status);
      }}
    >
      <div className="px-3 py-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          {col.label}
        </h3>
        <span className="text-xs bg-white text-gray-500 px-2 py-0.5 rounded-full border border-gray-200 font-medium">
          {total}
        </span>
      </div>
      <div className="px-2 pb-2 space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto min-h-[60px]">
        {jobs.map((job: Job) => (
          <PipelineCard key={job.id} job={job} colStatus={col.status} onDragStart={onDragStart} />
        ))}
        {!isLoading && jobs.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">
            {isOver ? 'Перетащите сюда' : 'Нет вакансий'}
          </p>
        )}
        {isLoading && (
          <p className="text-xs text-gray-400 text-center py-4">Загрузка...</p>
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const dragData = useRef<{ jobId: number; fromStatus: string } | null>(null);

  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateJobStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });

  const handleDragStart = (e: DragEvent, jobId: number, fromStatus: string) => {
    dragData.current = { jobId, fromStatus };
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (targetStatus: string) => {
    if (!dragData.current) return;
    const { jobId, fromStatus } = dragData.current;
    if (fromStatus === targetStatus) return;
    moveMutation.mutate({ id: jobId, status: targetStatus });
    dragData.current = null;
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Пайплайн" />
        <main className="p-8">
          <div className="flex gap-3 overflow-x-auto pb-4">
            {columns.map((col) => (
              <PipelineColumn
                key={col.status}
                col={col}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                dragOverStatus={dragOverStatus}
                setDragOverStatus={setDragOverStatus}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
