import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => {
  return ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
});

jest.mock('@/lib/api', () => ({ login: jest.fn() }));
jest.mock('@/lib/auth', () => ({ setToken: jest.fn(), getToken: jest.fn() }));

import LoginPage from '@/app/login/page';

describe('LoginPage — русская локализация', () => {
  it('отображает "Войдите в аккаунт"', () => {
    render(<LoginPage />);
    expect(screen.getByText('Войдите в аккаунт')).toBeInTheDocument();
  });

  it('отображает лейбл "Пароль"', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
  });

  it('отображает плейсхолдер "Введите пароль"', () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText('Введите пароль')).toBeInTheDocument();
  });

  it('отображает кнопку "Войти"', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
  });

  it('отображает "Нет аккаунта?"', () => {
    render(<LoginPage />);
    expect(screen.getByText(/Нет аккаунта/)).toBeInTheDocument();
  });

  it('отображает ссылку "Создать"', () => {
    render(<LoginPage />);
    expect(screen.getByText('Создать')).toBeInTheDocument();
  });

  it('сохраняет бренд "UpHunter"', () => {
    render(<LoginPage />);
    expect(screen.getByText('UpHunter')).toBeInTheDocument();
  });

  it('НЕ содержит английских строк', () => {
    render(<LoginPage />);
    ['Sign in', 'Sign in to your account', 'Enter your password', "Don't have an account?", 'Create one'].forEach((s) => {
      expect(screen.queryByText(s)).not.toBeInTheDocument();
    });
  });
});
