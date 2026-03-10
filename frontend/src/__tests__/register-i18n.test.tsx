import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/register',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/link', () => {
  return ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
});

jest.mock('@/lib/api', () => ({ register: jest.fn() }));
jest.mock('@/lib/auth', () => ({ setToken: jest.fn(), getToken: jest.fn() }));

import RegisterPage from '@/app/register/page';

describe('RegisterPage — русская локализация', () => {
  it('отображает "Создайте аккаунт"', () => {
    render(<RegisterPage />);
    expect(screen.getByText('Создайте аккаунт')).toBeInTheDocument();
  });

  it('отображает лейбл "Пароль"', () => {
    render(<RegisterPage />);
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
  });

  it('отображает лейбл "Подтвердите пароль"', () => {
    render(<RegisterPage />);
    expect(screen.getByLabelText('Подтвердите пароль')).toBeInTheDocument();
  });

  it('отображает кнопку "Создать аккаунт"', () => {
    render(<RegisterPage />);
    expect(screen.getByRole('button', { name: 'Создать аккаунт' })).toBeInTheDocument();
  });

  it('отображает "Уже есть аккаунт?"', () => {
    render(<RegisterPage />);
    expect(screen.getByText(/Уже есть аккаунт/)).toBeInTheDocument();
  });

  it('НЕ содержит английских строк', () => {
    render(<RegisterPage />);
    ['Create your account', 'Create account', 'Confirm Password', 'Already have an account?'].forEach((s) => {
      expect(screen.queryByText(s)).not.toBeInTheDocument();
    });
  });
});
