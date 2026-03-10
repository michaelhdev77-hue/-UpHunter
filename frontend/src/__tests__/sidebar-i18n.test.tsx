import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => {
  return ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
});

jest.mock('@/lib/auth', () => ({
  removeToken: jest.fn(),
  getToken: jest.fn(() => 'test-token'),
}));

jest.mock('@/lib/api', () => ({
  getMe: jest.fn().mockResolvedValue({ email: 'test@test.com', name: 'Test' }),
}));

import Sidebar from '@/components/Sidebar';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('Sidebar — русская локализация', () => {
  const expectedLabels = ['Дашборд', 'Вакансии', 'Пайплайн', 'Клиенты', 'Аналитика', 'Система', 'Настройки'];

  it.each(expectedLabels)('отображает пункт меню "%s" на русском', (label) => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('отображает кнопку "Выйти"', () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText('Выйти')).toBeInTheDocument();
  });

  it('сохраняет бренд "UpHunter"', () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText('UpHunter')).toBeInTheDocument();
  });

  it('НЕ содержит английских навигационных меток', () => {
    renderWithProviders(<Sidebar />);
    ['Dashboard', 'Jobs', 'Pipeline', 'Clients', 'Analytics', 'System', 'Settings', 'Sign out'].forEach((label) => {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
  });
});
