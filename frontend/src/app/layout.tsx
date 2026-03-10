'use client';

import './globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <html lang="ru">
      <head>
        <title>UpHunter</title>
        <meta name="description" content="AI-платформа для поиска работы на Upwork" />
      </head>
      <body className="font-sans antialiased text-gray-900">
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </body>
    </html>
  );
}
