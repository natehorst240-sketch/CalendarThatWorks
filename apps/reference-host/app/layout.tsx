import type { Metadata } from 'next';
import type { ReactNode } from 'react';
// Base stylesheet — component layout + Tailwind utilities + the default
// theme tokens. This one is required; without it the calendar renders
// unstyled. The aviation import below is just a token overlay that takes
// effect when `theme="aviation"` sets data-wc-theme on the calendar root.
import 'works-calendar/styles';
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
