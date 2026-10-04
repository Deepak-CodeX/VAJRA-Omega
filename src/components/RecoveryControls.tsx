'use client';

import { useVajraStore } from '@/store/vajraStore';
import Panel from '@/components/ui/Panel';
import type { RecoveryPlan, RecoveryAction, RecoveryActionType } from '@/types';

const ACTION_ICONS: Record<RecoveryActionType, string> = {
  ISOLATE: '🛡',
  REROUTE: '🔀',
  DISPATCH_BATTERY: '🔋',
  INCREASE_GENERATION: '⚡',
  SHED_LOAD: '✂',
  RESTORE_LOAD: '🔌',
  PRIORITIZE_CRITICAL: '🏥',
};

const ACTION_COLORS: Record<RecoveryActionType, string> = {
  ISOLATE: '#f5a623',
  REROUTE: '#3b9eff',
  DISPATCH_BATTERY: '#00d68f',
  INCREASE_GENERATION: '#00e5c8',
  SHED_LOAD: '#ff3b5c',
  RESTORE_LOAD: '#00d68f',
  PRIORITIZE_CRITICAL: '#ff79c6',
};

const PLAN_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  NONE: { color: '#5a7a8f', bg: 'rgba(90, 122, 143, 0.1)' },
  PROPOSED: { color: '#f5a623', bg: 'rgba(245, 166, 35, 0.12)' },
  EXECUTING: { color: '#3b9eff', bg: 'rgba(59, 158, 255, 0.12)' },
  COMPLETED: { color: '#00d68f', bg: 'rgba(0, 214, 143, 0.12)' },
  PARTIAL: { color: '#ff79c6', bg: 'rgba(255, 121, 198, 0.12)' },
};

export default function RecoveryControls() {
  const recoveryPlans = useVajraStore((s) => s.recoveryPlans);
  const generateRecovery = useVajraStore((s) => s.generateRecovery);
  const executeRecovery = useVajraStore((s) => s.executeRecovery);
  const executeRecoveryAction = useVajraStore((s) => s.executeRecoveryAction);
  const failures = useVajraStore((s) => s.failures);
  const metrics = useVajraStore((s) => s.metrics);
  const snapshots = useVajraStore((s) => s.snapshots);
  const initialized = useVajraStore((s) => s.initialized);

  // Latest plan
  const activePlan: RecoveryPlan | undefined = [...recoveryPlans].reverse()[0];
  const unresolvedFailures = failures.filter((f) => !f.resolved);
  const hasDamagedGrid = metrics.failedAssetCount > 0 || metrics.unservedLoadMW > 0 || unresolvedFailures.length > 0;

  const planStatus = activePlan ? activePlan.status : 'NONE';
  const statusConfig = PLAN_STATUS_COLORS[planStatus] || PLAN_STATUS_COLORS.NONE;

  const canGenerate = initialized && hasDamagedGrid && (!activePlan || activePlan.status === 'COMPLETED');
  const canExecute = initialized && activePlan && (activePlan.status === 'PROPOSED' || activePlan.status === 'PARTIAL');

  return (
    <Panel title="Grid Recovery & Restoration" accent="green">
      <div className="flex flex-col gap-3">
        {/* Top Status & Main Actions */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-wider text-[#5a7a8f]">Recovery Status:</span>
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
                style={{ color: statusConfig.color, backgroundColor: statusConfig.bg }}
              >
                {planStatus}
              </span>
            </div>

            {activePlan && (
              <span className="font-mono text-[8px] text-[#3a5568]">
                ID: {activePlan.id.slice(0, 12)}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={generateRecovery}
              disabled={!canGenerate}
              className="flex-1 rounded border border-[#00e5c8]/50 bg-[#00e5c8]/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#00e5c8] transition hover:bg-[#00e5c8]/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Generate Plan
            </button>

            <button
              onClick={executeRecovery}
              disabled={!canExecute}
              className="flex-1 rounded border border-[#00d68f]/60 bg-[#00d68f]/15 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#00d68f] transition hover:bg-[#00d68f]/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Execute Recovery
            </button>
          </div>
        </div>

        {/* Damage Warning Banner */}
        {hasDamagedGrid && (!activePlan || activePlan.status === 'COMPLETED') && (
          <div className="flex items-center justify-between rounded border border-[#ff3b5c]/30 bg-[#ff3b5c]/10 px-2.5 py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm">⚠️</span>
              <span className="text-[9px] text-[#ff3b5c]">
                Active Grid Stress: {metrics.failedAssetCount} failed assets ({metrics.unservedLoadMW.toFixed(1)} MW unserved)
              </span>
            </div>
            <span className="text-[8px] font-semibold text-[#f5a623]">Action Required</span>
          </div>
        )}

        {/* Active Recovery Plan Actions List */}
        {activePlan ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[9px] text-[#5a7a8f]">
              <span className="uppercase tracking-wider">
                Planned Sequence ({activePlan.actions.filter((a) => a.executed).length}/{activePlan.actions.length} executed)
              </span>
              <span className="font-mono text-[#00e5c8]">
                +{activePlan.actions.reduce((acc, a) => acc + (a.actualBenefitMW ?? a.estimatedBenefitMW ?? 0), 0).toFixed(0)} MW Est.
              </span>
            </div>

            <div className="flex max-h-[190px] flex-col gap-1 overflow-y-auto pr-0.5">
              {activePlan.actions.map((action: RecoveryAction, idx: number) => {
                const icon = ACTION_ICONS[action.type] || '⚙';
                const color = ACTION_COLORS[action.type] || '#00e5c8';

                return (
                  <div
                    key={action.id}
                    className={`flex items-center justify-between rounded border px-2 py-1.5 text-[9px] transition ${
                      action.executed
                        ? 'border-[#00d68f]/30 bg-[#00d68f]/5'
                        : 'border-[#1a3348] bg-[#050a12]/70 hover:border-[#3a5568]'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="font-mono text-[8px] text-[#3a5568]">#{idx + 1}</span>
                      <span className="text-xs">{icon}</span>
                      <div className="flex flex-col overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-mono text-[8px] font-semibold uppercase tracking-wider"
                            style={{ color }}
                          >
                            {action.type.replace(/_/g, ' ')}
                          </span>
                          {action.estimatedBenefitMW > 0 && (
                            <span className="font-mono text-[8px] text-[#00d68f]">
                              +{action.estimatedBenefitMW.toFixed(0)} MW
                            </span>
                          )}
                        </div>
                        <span className="truncate text-[8px] text-[#5a7a8f]">{action.description}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {action.executed ? (
                        <span className="flex items-center gap-1 text-[8px] font-bold text-[#00d68f]">
                          ✓ DONE
                        </span>
                      ) : (
                        <button
                          onClick={() => executeRecoveryAction(action.id)}
                          className="rounded border border-[#3b9eff]/50 bg-[#3b9eff]/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-[#3b9eff] hover:bg-[#3b9eff]/20 active:scale-95"
                        >
                          Run Step
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recovery Metrics Differential */}
            <div className="mt-1 grid grid-cols-3 gap-1.5 rounded border border-[#1a3348]/60 bg-[#050a12] p-2 text-center">
              <div className="flex flex-col">
                <span className="text-[7px] uppercase tracking-wider text-[#5a7a8f]">Stability Index</span>
                <span className="font-mono text-[10px] font-bold text-[#00e5c8]">
                  {activePlan.postRecoveryMetrics
                    ? `${(activePlan.postRecoveryMetrics.stabilityIndex * 100).toFixed(0)}%`
                    : `${(activePlan.preRecoveryMetrics.stabilityIndex * 100).toFixed(0)}%`}
                </span>
                <span className="text-[7px] text-[#3a5568]">
                  {activePlan.postRecoveryMetrics
                    ? `Was ${(activePlan.preRecoveryMetrics.stabilityIndex * 100).toFixed(0)}%`
                    : 'Target > 80%'}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[7px] uppercase tracking-wider text-[#5a7a8f]">Unserved Load</span>
                <span className="font-mono text-[10px] font-bold text-[#ff3b5c]">
                  {activePlan.postRecoveryMetrics
                    ? `${activePlan.postRecoveryMetrics.unservedLoadMW.toFixed(1)} MW`
                    : `${activePlan.preRecoveryMetrics.unservedLoadMW.toFixed(1)} MW`}
                </span>
                <span className="text-[7px] text-[#3a5568]">
                  {activePlan.postRecoveryMetrics
                    ? `Before: ${activePlan.preRecoveryMetrics.unservedLoadMW.toFixed(1)} MW`
                    : 'Goal: 0 MW'}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[7px] uppercase tracking-wider text-[#5a7a8f]">Critical Served</span>
                <span className="font-mono text-[10px] font-bold text-[#00d68f]">
                  {activePlan.postRecoveryMetrics
                    ? `${activePlan.postRecoveryMetrics.criticalLoadsServed}/${activePlan.postRecoveryMetrics.totalCriticalLoads}`
                    : `${activePlan.preRecoveryMetrics.criticalLoadsServed}/${activePlan.preRecoveryMetrics.totalCriticalLoads}`}
                </span>
                <span className="text-[7px] text-[#3a5568]">Critical Assets</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded border border-dashed border-[#1a3348] p-4 text-center">
            <span className="text-[9px] text-[#3a5568]">
              {hasDamagedGrid
                ? 'Fault detected. Click "Generate Plan" to calculate optimal restoration sequence.'
                : 'Grid running smoothly. No recovery intervention needed.'}
            </span>
          </div>
        )}

        {/* Snapshot Summary Indicator */}
        {(snapshots.before || snapshots.after) && (
          <div className="flex items-center justify-between border-t border-[#1a3348]/40 pt-1.5 text-[8px] text-[#3a5568]">
            <span>
              Baseline Snapshot:{' '}
              <span className="font-mono text-[#5a7a8f]">{snapshots.before ? 'Captured' : 'None'}</span>
            </span>
            <span>
              Restoration Snapshot:{' '}
              <span className="font-mono text-[#00d68f]">{snapshots.after ? 'Verified' : 'Pending'}</span>
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}
