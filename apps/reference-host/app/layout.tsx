import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import 'works-calendar/styles/aviation';
import './globals.css';

export const metadata: Metadata = {
  title: 'Flight School Schedule',
  description: 'works-calendar reference host — aviation flavored.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
