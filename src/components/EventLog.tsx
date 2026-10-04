'use client';

import { useRef, useEffect } from 'react';
import { useVajraStore } from '@/store/vajraStore';
import Panel from '@/components/ui/Panel';
import type { EventLogEntry, AnomalySeverity } from '@/types';

const severityColor: Record<AnomalySeverity, string> = {
  CRITICAL: '#ff3b5c',
  WARNING: '#f5a623',
  INFO: '#3b9eff',
};

const severityDot: Record<AnomalySeverity, string> = {
  CRITICAL: 'bg-[#ff3b5c]',
  WARNING: 'bg-[#f5a623]',
  INFO: 'bg-[#3b9eff]',
};

/** Map event types to more readable labels */
function eventLabel(type: string): string {
  return type.replace(/_/g, ' ');
}

export default function EventLog() {
  const eventLog = useVajraStore((s) => s.eventLog);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [eventLog.length]);

  // Show latest events first (reversed for display)
  const entries = [...eventLog].reverse().slice(0, 100);

  return (
    <Panel title="Event Log" accent="blue">
      <div className="flex flex-col gap-0.5">
        {/* Event count */}
        <div className="mb-1 flex items-center justify-between text-[9px] text-[#3a5568]">
          <span>{eventLog.length} events</span>
          <span>showing latest {Math.min(entries.length, 100)}</span>
        </div>

        {entries.length === 0 && (
          <div className="py-4 text-center text-[10px] text-[#3a5568]">
            No events yet — initialize the simulation to begin
          </div>
        )}

        <div ref={scrollRef} className="flex max-h-[300px] flex-col gap-0.5 overflow-y-auto">
          {entries.map((entry: EventLogEntry) => (
            <div
              key={entry.id}
              className="flex items-start gap-1.5 rounded px-1.5 py-1 hover:bg-[#0a1220]/60"
            >
              {/* Severity dot */}
              <span
                className={`mt-1 h-1 w-1 flex-shrink-0 rounded-full ${severityDot[entry.severity]}`}
              />
              {/* Timestamp */}
              <span className="flex-shrink-0 font-mono text-[9px] tabular-nums text-[#3a5568]">
                {entry.timestamp}
              </span>
              {/* Event type badge */}
              <span
                className="flex-shrink-0 rounded px-1 py-px text-[8px] font-medium uppercase"
                style={{
                  color: severityColor[entry.severity],
                  backgroundColor: `${severityColor[entry.severity]}10`,
                }}
              >
                {eventLabel(entry.type)}
              </span>
              {/* Message */}
              <span className="truncate text-[9px] text-[#5a7a8f]">{entry.message}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
