'use client';

import React from 'react';

interface PanelProps {
  title: string;
  /** Optional CSS classes for the outer wrapper */
  className?: string;
  /** Optional icon rendered before the title */
  icon?: React.ReactNode;
  /** Whether to show a glowing top-border accent */
  accent?: 'cyan' | 'amber' | 'red' | 'green' | 'blue' | 'none';
  /** Optional action element rendered in the header right */
  action?: React.ReactNode;
  children: React.ReactNode;
}

const accentClasses: Record<string, string> = {
  cyan: 'border-t-[#00e5c8]',
  amber: 'border-t-[#f5a623]',
  red: 'border-t-[#ff3b5c]',
  green: 'border-t-[#00d68f]',
  blue: 'border-t-[#3b9eff]',
  none: 'border-t-[#1a3348]',
};

export default function Panel({
  title,
  className = '',
  icon,
  accent = 'none',
  action,
  children,
}: PanelProps) {
  return (
    <div
      className={`flex flex-col rounded border border-[#1a3348] bg-[#0d1a2a]/80 backdrop-blur-sm ${accentClasses[accent] ?? ''} border-t-2 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1a3348]/60 px-3 py-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-[#5a7a8f]">{icon}</span>}
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5a7a8f]">
            {title}
          </h3>
        </div>
        {action && <div>{action}</div>}
      </div>
      {/* Body */}
      <div className="flex-1 overflow-auto p-3">{children}</div>
    </div>
  );
}
