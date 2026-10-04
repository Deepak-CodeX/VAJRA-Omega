'use client';

import React, { useState, useMemo } from 'react';
import { useVajraStore } from '@/store/vajraStore';

export default function EventsView() {
  const eventLog = useVajraStore((s) => s.eventLog);
  const activeCascade = useVajraStore((s) => s.activeCascade);

  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'>('ALL');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const filteredEvents = useMemo(() => {
    return eventLog
      .filter((e) => {
        if (severityFilter === 'ALL') return true;
        return e.severity === severityFilter;
      })
      .slice()
      .reverse(); // Most recent first
  }, [eventLog, severityFilter]);

  const selectedEvent = useMemo(() => {
    return eventLog.find((e) => e.id === selectedEventId) || filteredEvents[0] || null;
  }, [eventLog, selectedEventId, filteredEvents]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden p-6 font-mono text-[#e0edf5]">
      {/* ─── Header & Severity Filters ────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#1b2a38] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-[#00e5c8]/15 px-2 py-0.5 text-xs font-bold text-[#00e5c8]">
              SYSTEM EVENT LOG
            </span>
            <h1 className="text-xl font-bold tracking-tight text-[#e0edf5]">
              Prioritized Operational Alerts
            </h1>
          </div>
          <p className="mt-1 font-sans text-xs text-[#5a7a8f]">
            Structured causal audit: WHAT happened, WHERE, WHEN, WHY, and recommended recovery.
          </p>
        </div>

        {/* Filter Badges */}
        <div className="flex items-center gap-2 text-xs">
          {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`rounded-lg border px-3 py-1.5 transition ${
                severityFilter === sev
                  ? 'border-[#00e5c8] bg-[#00e5c8]/15 text-[#00e5c8]'
                  : 'border-[#1b2a38] bg-[#0c1824] text-[#5a7a8f] hover:text-[#e0edf5]'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Two-Column: Event Stream List vs Event Diagnostic Detail ───── */}
      <div className="grid flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-12">
        {/* Left: Event Stream (7 Cols) */}
        <div className="flex flex-col overflow-y-auto rounded-xl border border-[#1b2a38] bg-[#09131f] p-3 lg:col-span-7">
          {filteredEvents.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-xs text-[#5a7a8f]">
              Zero recorded events matching the selected filter.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEvents.map((evt) => {
                const isSelected = selectedEvent?.id === evt.id;
                const isCrit = evt.severity === 'CRITICAL';
                const isWarn = evt.severity === 'WARNING';

                return (
                  <div
                    key={evt.id}
                    onClick={() => setSelectedEventId(evt.id)}
                    className={`cursor-pointer rounded-lg border p-3 transition ${
                      isSelected
                        ? 'border-[#00e5c8] bg-[#00e5c8]/10'
                        : 'border-[#1b2a38] bg-[#0c1824] hover:border-[#2b4157]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                            isCrit
                              ? 'bg-[#d9383a]/20 text-[#ff6b6b]'
                              : isWarn
                              ? 'bg-[#f5a623]/20 text-[#f5a623]'
                              : 'bg-[#3a86ff]/20 text-[#3a86ff]'
                          }`}
                        >
                          {evt.severity}
                        </span>
                        <span className="text-[10px] text-[#5a7a8f]">{evt.timestamp}</span>
                      </div>
                      <span className="text-[10px] text-[#5a7a8f]">Tick {evt.tick}</span>
                    </div>
                    <div className="mt-1.5 text-xs font-semibold text-[#e0edf5]">{evt.message}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Diagnostic Detail Panel (5 Cols) */}
        <div className="flex flex-col overflow-y-auto rounded-xl border border-[#1b2a38] bg-[#09131f] p-5 lg:col-span-5">
          <h2 className="mb-4 text-xs font-bold tracking-wider text-[#00e5c8] uppercase">
            Causal Diagnostic Detail
          </h2>

          {selectedEvent ? (
            <div className="space-y-4 text-xs">
              <div>
                <span className="text-[10px] text-[#5a7a8f]">WHAT HAPPENED?</span>
                <div className="mt-0.5 font-bold text-[#e0edf5]">{selectedEvent.message}</div>
              </div>

              <div>
                <span className="text-[10px] text-[#5a7a8f]">WHERE?</span>
                <div className="mt-0.5 text-[#a0c4d8]">
                  {selectedEvent.relatedAssetIds?.length
                    ? `Asset ID: ${selectedEvent.relatedAssetIds.join(', ')}`
                    : 'System Wide Interconnection'}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-[#5a7a8f]">WHEN?</span>
                <div className="mt-0.5 text-[#e0edf5]">
                  Timestamp: {selectedEvent.timestamp} • Simulation Tick: {selectedEvent.tick}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-[#5a7a8f]">WHY?</span>
                <div className="mt-0.5 font-sans leading-relaxed text-[#a0c4d8]">
                  {selectedEvent.severity === 'CRITICAL'
                    ? 'Cascade propagation or breaker trip triggered by thermal overload rating exceeded on connecting transmission line.'
                    : selectedEvent.severity === 'WARNING'
                    ? 'Voltage angle excursion or minor frequency depression below 49.90 Hz.'
                    : 'Standard system initialization and steady-state dispatch adjustment.'}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-[#5a7a8f]">SYSTEM IMPACT?</span>
                <div className="mt-0.5 font-sans leading-relaxed text-[#a0c4d8]">
                  {activeCascade?.totalUnservedLoadMW
                    ? `${activeCascade.totalUnservedLoadMW.toFixed(1)} MW of consumer load currently disconnected.`
                    : 'Zero consumer load disconnected. Redundant parallel corridors absorbed flow.'}
                </div>
              </div>

              <div className="rounded-lg border border-[#00e5c8]/30 bg-[#00e5c8]/10 p-3">
                <span className="text-[10px] font-bold text-[#00e5c8]">WHAT DOES VAJRA RECOMMEND?</span>
                <div className="mt-1 font-sans text-xs leading-relaxed text-[#e0edf5]">
                  {selectedEvent.severity === 'CRITICAL'
                    ? 'Initiate blackstart sequencing on isolated distribution substations and ramp emergency gas turbines.'
                    : selectedEvent.severity === 'WARNING'
                    ? 'Adjust reactive power dispatch on adjacent capacitor banks to stabilize voltage.'
                    : 'Maintain current steady-state generator economic dispatch.'}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#5a7a8f]">Select an event to inspect its causal chain.</div>
          )}
        </div>
      </div>
    </div>
  );
}
