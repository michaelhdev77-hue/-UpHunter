'use client';

import { useQuery } from '@tanstack/react-query';
import { getMe } from '@/lib/api';
import { User } from 'lucide-react';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
  });

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8">
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-brand-50 rounded-full flex items-center justify-center">
          <User className="w-4 h-4 text-brand-500" />
        </div>
        <span className="text-sm font-medium text-gray-700">
          {user?.name || user?.email || '...'}
        </span>
      </div>
    </header>
  );
}
