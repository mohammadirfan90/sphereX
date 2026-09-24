import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SPHEREx Odyssey — Google Earth for the Universe',
  description:
    "Interactive all-sky universe exploration platform powered by NASA's SPHEREx mission (102 near-infrared bands), 14-year WISE/NEOWISE historical baseline, and Aladin Lite v3.",
};

import AgentationProvider from '@/components/AgentationProvider';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-[#10131A] text-[#F5F7FA] overflow-hidden select-none font-google-sans">
        {children}
        <AgentationProvider />
      </body>
    </html>
  );
}
