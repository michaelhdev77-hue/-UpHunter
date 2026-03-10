'use client';

import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { BarChart3, TrendingUp, Target, Clock } from 'lucide-react';

const mockStats = [
  { label: 'Avg Score', value: '72', icon: Target, color: 'text-blue-600', bg: 'bg-blue-50' },
  { label: 'Win Rate', value: '—', icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
  { label: 'Avg Response Time', value: '—', icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  { label: 'Total Applied', value: '—', icon: BarChart3, color: 'text-purple-600', bg: 'bg-purple-50' },
];

export default function AnalyticsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Analytics" />
        <main className="p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {mockStats.map((stat) => (
              <div
                key={stat.label}
                className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-4"
              >
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${stat.bg}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">Coming soon</h3>
            <p className="text-gray-400 max-w-md mx-auto">
              Detailed analytics with charts, trends, and insights about your job hunting
              performance will be available here.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
