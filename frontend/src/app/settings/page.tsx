'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJobFilters, createJobFilter, type SearchFilter } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { Plus, Trash2, CheckCircle, XCircle, Link as LinkIcon } from 'lucide-react';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [showFilterForm, setShowFilterForm] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const { data: filters } = useQuery({
    queryKey: ['filters'],
    queryFn: getJobFilters,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createJobFilter({
        name: filterName,
        query: filterQuery,
        category: filterCategory || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filters'] });
      setFilterName('');
      setFilterQuery('');
      setFilterCategory('');
      setShowFilterForm(false);
    },
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Settings" />
        <main className="p-8 max-w-4xl">
          {/* Upwork Connection */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Upwork Connection</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                  <LinkIcon className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">RSS Feed</p>
                  <p className="text-xs text-gray-500">
                    Upwork RSS feeds are configured per search filter
                  </p>
                </div>
              </div>
              <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                Active
              </span>
            </div>
          </section>

          {/* Team Profile */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Profile</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>
                <input
                  type="text"
                  disabled
                  placeholder="ДОБАВИМ ПОЗЖЕ"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Portfolio URLs</label>
                <input
                  type="text"
                  disabled
                  placeholder="ДОБАВИМ ПОЗЖЕ"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cover Letter Style
                </label>
                <textarea
                  disabled
                  placeholder="ДОБАВИМ ПОЗЖЕ"
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 text-sm resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Hourly Rate ($)
                  </label>
                  <input
                    type="number"
                    disabled
                    placeholder="ДОБАВИМ ПОЗЖЕ"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Hourly Rate ($)
                  </label>
                  <input
                    type="number"
                    disabled
                    placeholder="ДОБАВИМ ПОЗЖЕ"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 text-sm"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Search Filters */}
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Search Filters</h3>
              <button
                onClick={() => setShowFilterForm(!showFilterForm)}
                className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Filter
              </button>
            </div>

            {showFilterForm && (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Filter Name
                    </label>
                    <input
                      type="text"
                      value={filterName}
                      onChange={(e) => setFilterName(e.target.value)}
                      placeholder="e.g., React Senior"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Search Query
                    </label>
                    <input
                      type="text"
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      placeholder="e.g., react next.js typescript"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category (optional)
                    </label>
                    <input
                      type="text"
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      placeholder="e.g., Web Development"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => createMutation.mutate()}
                      disabled={!filterName || !filterQuery || createMutation.isPending}
                      className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {createMutation.isPending ? 'Creating...' : 'Create'}
                    </button>
                    <button
                      onClick={() => setShowFilterForm(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {filters?.map((filter: SearchFilter) => (
                <div
                  key={filter.id}
                  className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{filter.name}</p>
                      {filter.is_active ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Query: {filter.query}
                      {filter.category && ` | Category: ${filter.category}`}
                    </p>
                    {filter.skills.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {filter.skills.map((s) => (
                          <span
                            key={s}
                            className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {filters?.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  No search filters configured yet.
                </p>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
