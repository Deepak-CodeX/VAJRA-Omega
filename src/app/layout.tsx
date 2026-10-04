import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VAJRA-Ω — Intelligent Power Grid Digital Twin',
  description: 'Predict • Simulate • Protect • Recover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#050a12] text-[#e0edf5] antialiased">{children}</body>
    </html>
  );
}
