'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getJob,
  getCoverLetter,
  generateCoverLetterWithStyle,
  approveLetter,
  rejectLetter,
  regenerateLetter,
  updateCoverLetter,
  scoreJob,
  updateJobStatus,
  getJobScore,
  type Job,
  type CoverLetter,
} from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  ArrowLeft,
  ExternalLink,
  MapPin,
  Star,
  DollarSign,
  Users,
  Clock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  XCircle,
  RefreshCw,
  Sparkles,
  FileText,
  Copy,
  Check,
  Pencil,
  Save,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import Link from 'next/link';

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

function riskLabel(risk: number): { text: string; color: string; icon: typeof Shield } {
  if (risk >= 70) return { text: 'Высокий риск', color: 'text-red-600', icon: ShieldAlert };
  if (risk >= 40) return { text: 'Средний риск', color: 'text-yellow-600', icon: Shield };
  return { text: 'Низкий риск', color: 'text-green-600', icon: ShieldCheck };
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className={clsx('font-semibold', scoreColor(value))}>{value}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={clsx('h-2 rounded-full transition-all', scoreBg(value))}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

const STYLES = ['professional', 'casual', 'technical'] as const;
const STYLE_LABELS: Record<string, string> = {
  professional: 'профессиональный',
  casual: 'неформальный',
  technical: 'технический',
};
const STATUS_LABELS: Record<string, string> = {
  discovered: 'Обнаружена',
  scored: 'Оценена',
  letter_ready: 'Письмо готово',
  under_review: 'На рассмотрении',
  approved: 'Одобрено',
  applied: 'Отправлено',
  response: 'Ответ получен',
  hired: 'Нанят',
  rejected: 'Отклонено',
  draft: 'черновик',
};

function CoverLetterSection({ jobId, jobStatus, upworkUrl }: { jobId: number; jobStatus: string; upworkUrl?: string | null }) {
  const queryClient = useQueryClient();
  const [showRu, setShowRu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>('professional');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editContentRu, setEditContentRu] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const onErr = (e: Error) => { setErrorMsg(e?.message || 'Операция не удалась'); setTimeout(() => setErrorMsg(null), 5000); };

  const { data: letter, isLoading, error } = useQuery({
    queryKey: ['coverLetter', jobId],
    queryFn: () => getCoverLetter(jobId),
    retry: false,
  });

  const generateMut = useMutation({
    mutationFn: (style?: string) => generateCoverLetterWithStyle(jobId, style),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverLetter', jobId] });
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
    },
    onError: onErr,
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => approveLetter(id),
    onSuccess: async (approvedLetter) => {
      queryClient.invalidateQueries({ queryKey: ['coverLetter', jobId] });
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      // Copy letter to clipboard and open Upwork
      try {
        const text = approvedLetter.content_original || letter?.content_original || '';
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } catch { /* clipboard may fail in non-HTTPS */ }
    },
    onError: onErr,
  });

  const rejectMut = useMutation({
    mutationFn: (id: number) => { if (!confirm('Отклонить это сопроводительное письмо?')) throw new Error('cancelled'); return rejectLetter(id); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverLetter', jobId] });
    },
    onError: (e: Error) => { if (e.message !== 'cancelled') onErr(e); },
  });

  const [showRegenOptions, setShowRegenOptions] = useState(false);
  const [regenInstructions, setRegenInstructions] = useState('');
  const [regenStyle, setRegenStyle] = useState('');

  const regenerateMut = useMutation({
    mutationFn: (id: number) => regenerateLetter(id, {
      instructions: regenInstructions || undefined,
      style: regenStyle || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverLetter', jobId] });
      setShowRegenOptions(false);
      setRegenInstructions('');
      setRegenStyle('');
    },
    onError: onErr,
  });

  const saveMut = useMutation({
    mutationFn: (id: number) =>
      updateCoverLetter(id, {
        content_original: editContent,
        content_ru: editContentRu || undefined,
        edited_by: 'user',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverLetter', jobId] });
      setEditing(false);
    },
    onError: onErr,
  });

  const startEditing = () => {
    if (letter) {
      setEditContent(letter.content_original);
      setEditContentRu(letter.content_ru || '');
      setEditing(true);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // No letter yet
  if (error || (!isLoading && !letter)) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Сопроводительное письмо
          </h3>
        </div>
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">Сопроводительное письмо ещё не создано</p>
          <div className="flex items-center justify-center gap-2 mb-3">
            {STYLES.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedStyle(s)}
                className={clsx(
                  'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                  selectedStyle === s
                    ? 'bg-brand-50 border-brand-200 text-brand-600'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                )}
              >
                {STYLE_LABELS[s] || s}
              </button>
            ))}
          </div>
          <button
            onClick={() => generateMut.mutate(selectedStyle)}
            disabled={generateMut.isPending}
            className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {generateMut.isPending ? 'Генерация...' : 'Создать сопроводительное письмо'}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-gray-400 text-center py-4">Загрузка письма...</p>
      </div>
    );
  }

  if (!letter) return null;

  const content = showRu && letter.content_ru ? letter.content_ru : letter.content_original;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {errorMsg && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          <X className="w-3.5 h-3.5 shrink-0 cursor-pointer" onClick={() => setErrorMsg(null)} />
          {errorMsg}
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Сопроводительное письмо
          <span className={clsx(
            'text-xs font-medium px-2 py-0.5 rounded-full ml-2',
            letter.status === 'approved' ? 'bg-green-100 text-green-700' :
            letter.status === 'rejected' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-600'
          )}>
            {STATUS_LABELS[letter.status] || letter.status} v{letter.version}
          </span>
          {letter.style && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 ml-1">
              {STYLE_LABELS[letter.style] || letter.style}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {letter.content_ru && (
            <button
              onClick={() => setShowRu(!showRu)}
              className={clsx(
                'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                showRu
                  ? 'bg-brand-50 border-brand-200 text-brand-600'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              )}
            >
              {showRu ? 'Русский (RU)' : 'Оригинал (EN)'}
            </button>
          )}
          <button
            onClick={() => handleCopy(content)}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors inline-flex items-center gap-1"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Скопировано!' : 'Копировать'}
          </button>
        </div>
      </div>

      {/* Letter content — editable or read-only */}
      {editing ? (
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Оригинал (EN)</label>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={10}
              className="w-full bg-white border border-gray-300 rounded-lg p-3 text-sm text-gray-700 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-y"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Русский (RU)</label>
            <textarea
              value={editContentRu}
              onChange={(e) => setEditContentRu(e.target.value)}
              rows={8}
              className="w-full bg-white border border-gray-300 rounded-lg p-3 text-sm text-gray-700 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-y"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => saveMut.mutate(letter.id)}
              disabled={saveMut.isPending}
              className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              {saveMut.isPending ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center gap-1.5"
            >
              <X className="w-4 h-4" />
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{content}</p>
        </div>
      )}

      {/* Action buttons */}
      {!editing && (
        <div className="flex gap-2 flex-wrap">
          {letter.status === 'draft' && (
            <>
              <button
                onClick={startEditing}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center gap-1.5"
              >
                <Pencil className="w-4 h-4" />
                Редактировать
              </button>
              {upworkUrl ? (
                <button
                  onClick={() => {
                    approveMut.mutate(letter.id);
                    window.open(upworkUrl, '_blank');
                  }}
                  disabled={approveMut.isPending}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  Одобрить и открыть Upwork
                </button>
              ) : (
                <button
                  onClick={() => approveMut.mutate(letter.id)}
                  disabled={approveMut.isPending}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  Одобрить
                </button>
              )}
              <button
                onClick={() => rejectMut.mutate(letter.id)}
                disabled={rejectMut.isPending}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg transition-colors border border-red-200 inline-flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                Отклонить
              </button>
            </>
          )}
          <button
            onClick={() => setShowRegenOptions(!showRegenOptions)}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            Перегенерировать
          </button>
        </div>
      )}

      {/* Regenerate Options */}
      {showRegenOptions && letter && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Параметры перегенерации</p>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 shrink-0">Стиль:</span>
              {STYLES.map((s) => (
                <button key={s} onClick={() => setRegenStyle(s === regenStyle ? '' : s)}
                  className={clsx(
                    'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                    regenStyle === s ? 'bg-brand-50 border-brand-200 text-brand-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  )}>
                  {STYLE_LABELS[s] || s}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Доп. инструкции (необязательно)</label>
              <textarea
                value={regenInstructions}
                onChange={(e) => setRegenInstructions(e.target.value)}
                placeholder="Сделать акцент на опыте с React, упомянуть конкретный проект..."
                rows={2}
                className="w-full bg-white border border-gray-300 rounded-lg p-2.5 text-sm text-gray-700 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-y"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => regenerateMut.mutate(letter.id)}
                disabled={regenerateMut.isPending}
                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-1.5"
              >
                <RefreshCw className={clsx('w-4 h-4', regenerateMut.isPending && 'animate-spin')} />
                {regenerateMut.isPending ? 'Перегенерация...' : 'Перегенерировать'}
              </button>
              <button
                onClick={() => { setShowRegenOptions(false); setRegenInstructions(''); setRegenStyle(''); }}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusActions({ jobId, status }: { jobId: number; status: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  const statusMut = useMutation({
    mutationFn: (newStatus: string) => {
      if (newStatus === 'rejected' && !confirm('Отклонить эту вакансию?')) throw new Error('cancelled');
      return updateJobStatus(jobId, newStatus);
    },
    onSuccess: (updatedJob) => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setMessage(`Статус изменён на «${STATUS_LABELS[updatedJob.status] || updatedJob.status.replace('_', ' ')}»`);
      setTimeout(() => setMessage(null), 3000);
    },
    onError: (e: Error) => {
      if (e.message !== 'cancelled') {
        setMessage(`Ошибка: ${e.message}`);
        setTimeout(() => setMessage(null), 5000);
      }
    },
  });

  const buttons: { label: string; targetStatus: string; color: string }[] = [];

  if (status === 'approved') {
    buttons.push({ label: 'Отметить как отправлено', targetStatus: 'applied', color: 'bg-emerald-500 hover:bg-emerald-600 text-white' });
  }
  if (status === 'applied') {
    buttons.push({ label: 'Отметить ответ', targetStatus: 'response', color: 'bg-teal-500 hover:bg-teal-600 text-white' });
  }
  if (status === 'response') {
    buttons.push({ label: 'Отметить как нанят', targetStatus: 'hired', color: 'bg-green-600 hover:bg-green-700 text-white' });
  }
  if (status !== 'rejected' && status !== 'hired') {
    buttons.push({ label: 'Отклонить', targetStatus: 'rejected', color: 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200' });
  }

  if (buttons.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Действия со статусом</h3>
      <div className="space-y-2">
        {buttons.map((btn) => (
          <button
            key={btn.targetStatus}
            onClick={() => statusMut.mutate(btn.targetStatus)}
            disabled={statusMut.isPending}
            className={clsx(
              'w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50',
              btn.color
            )}
          >
            {statusMut.isPending ? 'Обновление...' : btn.label}
          </button>
        ))}
      </div>
      {message && (
        <p className="text-xs text-green-600 mt-2 text-center">{message}</p>
      )}
    </div>
  );
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const jobId = Number(params.id);

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId),
    enabled: !!jobId,
  });

  const [scoreError, setScoreError] = useState<string | null>(null);
  const scoreMut = useMutation({
    mutationFn: () => scoreJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobScore', jobId] });
    },
    onError: (e: Error) => { setScoreError(e?.message || 'Ошибка оценки'); setTimeout(() => setScoreError(null), 5000); },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 ml-60">
          <Header title="Детали вакансии" />
          <main className="p-8">
            <p className="text-gray-400">Загрузка...</p>
          </main>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 ml-60">
          <Header title="Детали вакансии" />
          <main className="p-8">
            <p className="text-gray-400">Вакансия не найдена</p>
          </main>
        </div>
      </div>
    );
  }

  const details = job.score_details;
  const clientRisk = details?.client_risk ?? null;

  // Fetch detailed score with LLM reasoning
  const { data: scoreData } = useQuery({
    queryKey: ['jobScore', jobId],
    queryFn: () => getJobScore(jobId),
    enabled: job.overall_score !== null,
    retry: false,
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Детали вакансии" />
        <main className="p-8 max-w-5xl">
          {/* Back button */}
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад
          </button>

          {/* Title & meta */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-gray-900">{job.title}</h1>
                {job.upwork_url && (
                  <a
                    href={job.upwork_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-brand-500"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-4 mt-2">
                <span
                  className={clsx(
                    'text-xs font-medium px-2.5 py-1 rounded-full',
                    statusColors[job.status] || 'bg-gray-100 text-gray-600'
                  )}
                >
                  {STATUS_LABELS[job.status] || job.status.replace('_', ' ')}
                </span>
                {job.category && <span className="text-xs text-gray-500">{job.category}</span>}
                {job.experience_level && (
                  <span className="text-xs text-gray-500 capitalize">{job.experience_level}</span>
                )}
                {job.duration && <span className="text-xs text-gray-500">{job.duration}</span>}
              </div>
            </div>
            {job.overall_score !== null && (
              <div className="text-center ml-6">
                <div className={clsx('text-3xl font-bold', scoreColor(job.overall_score))}>
                  {job.overall_score}
                </div>
                <p className="text-xs text-gray-400">/ 100</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column: description + scores + cover letter */}
            <div className="lg:col-span-2 space-y-6">
              {/* Budget & Skills */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex flex-wrap gap-4 mb-4 text-sm text-gray-600">
                  {job.contract_type === 'fixed' && (job.budget_min || job.budget_max) && (
                    <span className="flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      Фикс: ${job.budget_min}{job.budget_max && job.budget_max !== job.budget_min ? ` - $${job.budget_max}` : ''}
                    </span>
                  )}
                  {job.contract_type === 'hourly' && (
                    <span className="flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      ${job.hourly_rate_min ?? '?'} - ${job.hourly_rate_max ?? '?'}/ч
                    </span>
                  )}
                  {job.proposals_count !== null && (
                    <span className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-gray-400" />
                      {job.proposals_count} откликов
                    </span>
                  )}
                  {job.connect_price !== null && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-gray-400" />
                      {job.connect_price} коннектов
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {job.skills.map((skill) => (
                    <span
                      key={skill}
                      className="text-xs bg-brand-50 text-brand-600 px-2.5 py-1 rounded-full"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {job.description}
                </p>
              </div>

              {/* AI Scores */}
              {details ? (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-brand-500" />
                    Детали AI-оценки
                  </h3>
                  <div className="space-y-3">
                    <ScoreBar label="Совпадение навыков" value={details.skill_match} />
                    <ScoreBar label="Соответствие бюджету" value={details.budget_fit} />
                    <ScoreBar label="Чёткость ТЗ" value={details.scope_clarity} />
                    <ScoreBar label="Вероятность победы" value={details.win_probability} />
                    <ScoreBar label="Риск клиента" value={100 - details.client_risk} />
                  </div>
                  {scoreData?.llm_reasoning && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Обоснование AI</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{scoreData.llm_reasoning}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                  <p className="text-gray-400 mb-3">Ещё не оценена</p>
                  <button
                    onClick={() => scoreMut.mutate()}
                    disabled={scoreMut.isPending}
                    className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    {scoreMut.isPending ? 'Оценка...' : 'Оценить через AI'}
                  </button>
                </div>
              )}

              {/* Cover Letter */}
              <CoverLetterSection jobId={jobId} jobStatus={job.status} upworkUrl={job.upwork_url} />
            </div>

            {/* Right column: client info */}
            <div className="space-y-6">
              {/* Client Card */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Клиент</h3>
                <div className="space-y-3">
                  {job.client_country && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" /> Локация
                      </span>
                      <span className="font-medium text-gray-900">{job.client_country}</span>
                    </div>
                  )}
                  {job.client_rating !== null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 flex items-center gap-1.5">
                        <Star className="w-4 h-4" /> Рейтинг
                      </span>
                      <span className="font-medium text-gray-900">
                        {job.client_rating.toFixed(1)} / 5.0
                      </span>
                    </div>
                  )}
                  {job.client_total_spent !== null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4" /> Всего потрачено
                      </span>
                      <span className="font-medium text-gray-900">
                        ${job.client_total_spent.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {job.client_hire_rate !== null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Процент найма</span>
                      <span className="font-medium text-gray-900">
                        {job.client_hire_rate}%
                      </span>
                    </div>
                  )}
                  {job.client_jobs_posted !== null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Опубликовано вакансий</span>
                      <span className="font-medium text-gray-900">{job.client_jobs_posted}</span>
                    </div>
                  )}
                  {job.client_payment_verified !== null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Оплата</span>
                      <span className={clsx(
                        'font-medium flex items-center gap-1',
                        job.client_payment_verified ? 'text-green-600' : 'text-red-500'
                      )}>
                        {job.client_payment_verified ? (
                          <><CheckCircle className="w-3.5 h-3.5" /> Подтверждена</>
                        ) : (
                          <><XCircle className="w-3.5 h-3.5" /> Не подтверждена</>
                        )}
                      </span>
                    </div>
                  )}
                  {job.client_member_since && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">На платформе с</span>
                      <span className="font-medium text-gray-900">
                        {new Date(job.client_member_since).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Client Risk Indicator */}
                {clientRisk !== null && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    {(() => {
                      const risk = riskLabel(clientRisk);
                      const RiskIcon = risk.icon;
                      return (
                        <div className="flex items-center justify-between">
                          <span className={clsx('text-sm font-medium flex items-center gap-1.5', risk.color)}>
                            <RiskIcon className="w-4 h-4" />
                            {risk.text}
                          </span>
                          <span className={clsx('text-lg font-bold', risk.color)}>
                            {clientRisk.toFixed(0)}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Быстрые действия</h3>
                <div className="space-y-2">
                  {job.upwork_url && (
                    <a
                      href={job.upwork_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Открыть на Upwork
                    </a>
                  )}
                </div>
              </div>

              {/* Status Actions */}
              <StatusActions jobId={jobId} status={job.status} />

              {/* Timestamps */}
              <div className="text-xs text-gray-400 space-y-1 px-1">
                {job.posted_at && <p>Опубликовано: {new Date(job.posted_at).toLocaleString()}</p>}
                {job.discovered_at && <p>Обнаружено: {new Date(job.discovered_at).toLocaleString()}</p>}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
