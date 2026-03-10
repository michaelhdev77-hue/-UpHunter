import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/jobs',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => {
  return ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
});

const mockJobs = {
  items: [
    {
      id: 1,
      title: 'React Developer Needed',
      status: 'discovered',
      skills: ['React', 'TypeScript'],
      overall_score: null,
      upwork_url: 'https://www.upwork.com/jobs/~test123',
      contract_type: 'fixed',
      budget_min: 500,
      budget_max: 1000,
      hourly_rate_min: null,
      hourly_rate_max: null,
      client_country: 'US',
      client_rating: 4.5,
      proposals_count: 10,
      experience_level: 'intermediate',
      created_at: '2024-01-01',
    },
    {
      id: 2,
      title: 'Python Backend Engineer',
      status: 'scored',
      skills: ['Python', 'FastAPI', 'PostgreSQL'],
      overall_score: 85,
      upwork_url: null,
      contract_type: 'hourly',
      budget_min: null,
      budget_max: null,
      hourly_rate_min: 40,
      hourly_rate_max: 80,
      client_country: null,
      client_rating: null,
      proposals_count: null,
      experience_level: null,
      created_at: '2024-01-02',
    },
  ],
  total: 2,
};

jest.mock('@/lib/api', () => ({
  getJobs: jest.fn().mockResolvedValue(mockJobs),
  scoreAllJobs: jest.fn().mockResolvedValue({ scored: 5, failed: 0 }),
  getMe: jest.fn().mockResolvedValue({ email: 'test@test.com' }),
}));

jest.mock('@/lib/auth', () => ({
  getToken: jest.fn(() => 'test-token'),
  removeToken: jest.fn(),
}));

import JobsPage from '@/app/jobs/page';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><JobsPage /></QueryClientProvider>);
}

describe('JobsPage — русская локализация', () => {
  it('отображает заголовок "Вакансии"', () => {
    renderPage();
    expect(screen.getAllByText('Вакансии').length).toBeGreaterThanOrEqual(1);
  });

  it('отображает плейсхолдер "Поиск вакансий..."', () => {
    renderPage();
    expect(screen.getByPlaceholderText('Поиск вакансий...')).toBeInTheDocument();
  });

  it('отображает "Мин. оценка"', () => {
    renderPage();
    expect(screen.getByText('Мин. оценка')).toBeInTheDocument();
  });

  it('отображает "Навык"', () => {
    renderPage();
    expect(screen.getByText('Навык')).toBeInTheDocument();
  });

  it('отображает кнопку "Оценить все"', () => {
    renderPage();
    expect(screen.getByText('Оценить все')).toBeInTheDocument();
  });

  it('отображает "Все статусы" в фильтре', () => {
    renderPage();
    expect(screen.getByDisplayValue('Все статусы')).toBeInTheDocument();
  });

  it('содержит опции статусов на русском', () => {
    renderPage();
    ['Обнаружена', 'Оценена', 'Письмо готово', 'На рассмотрении', 'Одобрена', 'Отклик отправлен', 'Есть ответ', 'Нанят', 'Отклонена'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('НЕ содержит английских UI-строк', () => {
    renderPage();
    ['All Statuses', 'Search jobs...', 'Min Score', 'Score All Unscored'].forEach((s) => {
      expect(screen.queryByText(s)).not.toBeInTheDocument();
    });
  });
});

describe('JobsPage — кнопка Upwork (fix nested <a>)', () => {
  it('использует <button> вместо <a> для ссылки Upwork', async () => {
    renderPage();
    const jobTitle = await screen.findByText('React Developer Needed');
    const card = jobTitle.closest('a');
    if (card) {
      // Внутри Link (<a>) НЕ должно быть вложенных <a>
      const nestedAnchors = card.querySelectorAll('a');
      expect(nestedAnchors.length).toBe(0);
    }
  });

  it('вызывает window.open при клике на кнопку Upwork', async () => {
    renderPage();
    await screen.findByText('React Developer Needed');

    const buttons = document.querySelectorAll('button[type="button"]');
    const upworkButton = Array.from(buttons).find((btn) => btn.closest('a[href="/jobs/1"]'));
    expect(upworkButton).toBeTruthy();

    if (upworkButton) {
      fireEvent.click(upworkButton);
      expect(window.open).toHaveBeenCalledWith('https://www.upwork.com/jobs/~test123', '_blank', 'noopener,noreferrer');
    }
  });
});

describe('JobsPage — русские статус-бейджи', () => {
  it('отображает "Обнаружена" для discovered', async () => {
    renderPage();
    await screen.findByText('React Developer Needed');
    const badges = screen.getAllByText('Обнаружена');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('отображает "Оценена" для scored', async () => {
    renderPage();
    await screen.findByText('Python Backend Engineer');
    expect(screen.getAllByText('Оценена').length).toBeGreaterThanOrEqual(2); // фильтр + бейдж
  });
});

describe('JobsPage — русские бюджетные метки', () => {
  it('отображает "Фикс:" для fixed контракта', async () => {
    renderPage();
    await screen.findByText('React Developer Needed');
    expect(screen.getByText(/Фикс: \$500/)).toBeInTheDocument();
  });
});
