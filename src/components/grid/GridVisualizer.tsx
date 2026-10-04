'use client';

import React, { useState, useRef, useMemo } from 'react';
import { useVajraStore } from '@/store/vajraStore';
import Panel from '@/components/ui/Panel';
import AssetDetailPanel from './AssetDetailPanel';
import {
  type SelectedAsset,
  type VisualState,
  deriveNodeVisualState,
  deriveLineVisualState,
  STATE_THEMES,
  ASSET_TYPE_COLORS,
  getConnectedAssetIds,
} from './gridVisualizerUtils';
import type {
  Generator,
  Substation,
  Battery,
  Load,
  TransmissionLine,
} from '@/types';

export default function GridVisualizer() {
  const topology = useVajraStore((s) => s.topology);
  const metrics = useVajraStore((s) => s.metrics);
  const clock = useVajraStore((s) => s.clock);

  // Pan & Zoom state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Filter / Display toggles
  const [showFeeders, setShowFeeders] = useState<boolean>(true);
  const [showFlowAnim, setShowFlowAnim] = useState<boolean>(true);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'gens' | 'subs' | 'bats' | 'loads'>('all');

  // Selected asset for telemetry inspection
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fast substation position lookup
  const subMap = useMemo(() => {
    const map = new Map<string, Substation>();
    for (const s of topology.substations) map.set(s.id, s);
    return map;
  }, [topology.substations]);

  // Connected assets for active selection highlight
  const highlightedIds = useMemo(() => {
    if (!selectedAsset) return new Set<string>();
    const ids = getConnectedAssetIds(selectedAsset, topology);
    ids.push(selectedAsset.data.id);
    return new Set(ids);
  }, [selectedAsset, topology]);

  // Handle Zoom
  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.25, 0.6));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag when clicking background
    if ((e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).id === 'grid-bg') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <Panel title="Digital Twin — 2D Grid Topology" accent="cyan" className="relative">
      <div className="flex flex-col gap-2">
        {/* Visualizer Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1a3348]/60 pb-2 text-[10px]">
          {/* Layer Filters */}
          <div className="flex items-center gap-1">
            <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Filter:</span>
            {[
              { id: 'all', label: 'All Assets' },
              { id: 'gens', label: 'Generators' },
              { id: 'subs', label: 'Substations' },
              { id: 'bats', label: 'Batteries' },
              { id: 'loads', label: 'Loads' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setCategoryFilter(f.id as typeof categoryFilter)}
                className={`rounded px-1.5 py-0.5 text-[8px] font-medium transition ${
                  categoryFilter === f.id
                    ? 'bg-[#00e5c8]/20 text-[#00e5c8] border border-[#00e5c8]/40'
                    : 'text-[#5a7a8f] hover:bg-[#1a3348] hover:text-[#e0edf5]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Toggle Switches & Zoom Controls */}
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-[9px] text-[#5a7a8f] hover:text-[#e0edf5]">
              <input
                type="checkbox"
                checked={showFeeders}
                onChange={(e) => setShowFeeders(e.target.checked)}
                className="rounded accent-[#00e5c8]"
              />
              <span>Feeders</span>
            </label>

            <label className="flex cursor-pointer items-center gap-1.5 text-[9px] text-[#5a7a8f] hover:text-[#e0edf5]">
              <input
                type="checkbox"
                checked={showFlowAnim}
                onChange={(e) => setShowFlowAnim(e.target.checked)}
                className="rounded accent-[#00e5c8]"
              />
              <span>Flow Animation</span>
            </label>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 border-l border-[#1a3348] pl-2">
              <button
                onClick={handleZoomIn}
                className="rounded border border-[#1a3348] bg-[#050a12] px-1.5 py-0.5 text-[10px] text-[#e0edf5] hover:border-[#00e5c8]"
                title="Zoom In"
              >
                +
              </button>
              <button
                onClick={handleZoomOut}
                className="rounded border border-[#1a3348] bg-[#050a12] px-1.5 py-0.5 text-[10px] text-[#e0edf5] hover:border-[#00e5c8]"
                title="Zoom Out"
              >
                −
              </button>
              <button
                onClick={handleResetView}
                className="rounded border border-[#1a3348] bg-[#050a12] px-1.5 py-0.5 text-[9px] text-[#5a7a8f] hover:text-[#e0edf5]"
                title="Reset View"
              >
                {(zoom * 100).toFixed(0)}%
              </button>
            </div>
          </div>
        </div>

        {/* Main Canvas & Detail Overlay Container */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="relative h-[480px] w-full cursor-grab overflow-hidden rounded border border-[#1a3348]/60 bg-[#050a12] active:cursor-grabbing"
        >
          {/* SVG Grid Canvas */}
          <svg
            viewBox="0 0 800 600"
            className="h-full w-full select-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 100ms ease-out',
            }}
          >
            <defs>
              {/* Background pattern */}
              <pattern id="grid-dots" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="0.75" fill="#1a3348" />
              </pattern>

              {/* Glowing filters */}
              <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-red" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-amber" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Background Rect */}
            <rect id="grid-bg" width="800" height="600" fill="url(#grid-dots)" />

            {/* ─── Layer 1: Distribution Feeder Lines (Substation ↔ Loads/Gens/Bats) ─── */}
            {showFeeders && (
              <g id="feeders-layer" opacity={0.6}>
                {/* Generator Ties */}
                {topology.generators.map((gen) =>
                  gen.connectedTo.map((subId) => {
                    const sub = subMap.get(subId);
                    if (!sub) return null;
                    const isSelected = selectedAsset?.data.id === gen.id || selectedAsset?.data.id === sub.id;
                    return (
                      <line
                        key={`gen-feed-${gen.id}-${sub.id}`}
                        x1={gen.position.x}
                        y1={gen.position.y}
                        x2={sub.position.x}
                        y2={sub.position.y}
                        stroke={isSelected ? '#00e5c8' : '#1a3348'}
                        strokeWidth={isSelected ? 1.5 : 0.8}
                        strokeDasharray="3 3"
                      />
                    );
                  }),
                )}

                {/* Battery Ties */}
                {topology.batteries.map((bat) => {
                  const sub = subMap.get(bat.connectedTo);
                  if (!sub) return null;
                  const isSelected = selectedAsset?.data.id === bat.id || selectedAsset?.data.id === sub.id;
                  return (
                    <line
                      key={`bat-feed-${bat.id}-${sub.id}`}
                      x1={bat.position.x}
                      y1={bat.position.y}
                      x2={sub.position.x}
                      y2={sub.position.y}
                      stroke={isSelected ? '#a855f7' : '#1a3348'}
                      strokeWidth={isSelected ? 1.5 : 0.8}
                      strokeDasharray="3 3"
                    />
                  );
                })}

                {/* Load Feeders */}
                {topology.loads.map((load) => {
                  const sub = subMap.get(load.connectedTo);
                  if (!sub) return null;
                  const isSelected = selectedAsset?.data.id === load.id || selectedAsset?.data.id === sub.id;
                  const isLoadOut = !load.connected || load.status === 'ISOLATED';
                  return (
                    <line
                      key={`load-feed-${load.id}-${sub.id}`}
                      x1={load.position.x}
                      y1={load.position.y}
                      x2={sub.position.x}
                      y2={sub.position.y}
                      stroke={isLoadOut ? '#ff3b5c30' : isSelected ? '#38bdf8' : '#142738'}
                      strokeWidth={isSelected ? 1.5 : 0.8}
                      strokeDasharray={isLoadOut ? '2 2' : '3 3'}
                    />
                  );
                })}
              </g>
            )}

            {/* ─── Layer 2: Backbone Transmission Lines ─── */}
            <g id="transmission-lines-layer">
              {topology.transmissionLines.map((line) => {
                const fromSub = subMap.get(line.fromId);
                const toSub = subMap.get(line.toId);
                if (!fromSub || !toSub) return null;

                const lineState = deriveLineVisualState(line);
                const theme = STATE_THEMES[lineState];
                const isSelected = selectedAsset?.kind === 'line' && selectedAsset.data.id === line.id;
                const isHighlighted = highlightedIds.has(line.id);

                // Line stroke width scaled by capacity (1.8 to 4.5px)
                const strokeWidth = Math.max(1.8, Math.min(4.5, (line.capacityMW / 500) * 4));

                // Midpoint for flow indicator or click hit area
                const midX = (fromSub.position.x + toSub.position.x) / 2;
                const midY = (fromSub.position.y + toSub.position.y) / 2;

                // Animated flow pulse position calculation
                const flowSpeed = Math.max(0.5, Math.abs(line.currentFlowMW) / 100);
                const animT = (clock.tick * flowSpeed * 0.05) % 1;
                // Flow direction
                const tFlow = line.currentFlowMW >= 0 ? animT : 1 - animT;
                const pulseX = fromSub.position.x + (toSub.position.x - fromSub.position.x) * tFlow;
                const pulseY = fromSub.position.y + (toSub.position.y - fromSub.position.y) * tFlow;

                return (
                  <g
                    key={line.id}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAsset({ kind: 'line', data: line });
                    }}
                  >
                    {/* Invisible wider hit area for easy clicking */}
                    <line
                      x1={fromSub.position.x}
                      y1={fromSub.position.y}
                      x2={toSub.position.x}
                      y2={toSub.position.y}
                      stroke="transparent"
                      strokeWidth={14}
                    />

                    {/* Main Line Stroke */}
                    <line
                      x1={fromSub.position.x}
                      y1={fromSub.position.y}
                      x2={toSub.position.x}
                      y2={toSub.position.y}
                      stroke={lineState === 'FAILED' ? '#ff3b5c' : isSelected ? '#ffffff' : theme.primary}
                      strokeWidth={isSelected ? strokeWidth + 2 : strokeWidth}
                      strokeDasharray={lineState === 'FAILED' ? '5 5' : 'none'}
                      opacity={lineState === 'FAILED' ? 0.4 : isSelected || isHighlighted ? 1 : 0.85}
                      filter={lineState === 'OVERLOADED' ? 'url(#glow-red)' : isSelected ? 'url(#glow-cyan)' : 'none'}
                    />

                    {/* Live Dynamic Flow Pulse */}
                    {showFlowAnim && lineState !== 'FAILED' && Math.abs(line.currentFlowMW) > 0.5 && (
                      <circle
                        cx={pulseX}
                        cy={pulseY}
                        r={strokeWidth + 1}
                        fill={lineState === 'OVERLOADED' ? '#ff3b5c' : '#00e5c8'}
                        filter="url(#glow-cyan)"
                      />
                    )}

                    {/* Loading % Pill on hover or selection */}
                    {(isSelected || lineState === 'OVERLOADED' || lineState === 'WARNING') && (
                      <g transform={`translate(${midX}, ${midY})`}>
                        <rect
                          x={-24}
                          y={-9}
                          width={48}
                          height={16}
                          rx={3}
                          fill="#050a12"
                          stroke={theme.border}
                          strokeWidth={1}
                        />
                        <text
                          x={0}
                          y={2}
                          textAnchor="middle"
                          fill={theme.text}
                          fontSize={8}
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {line.loadingPercent.toFixed(0)}%
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>

            {/* ─── Layer 3: Substations (Hexagons & Diamonds) ─── */}
            {(categoryFilter === 'all' || categoryFilter === 'subs') && (
              <g id="substations-layer">
                {topology.substations.map((sub) => {
                  const subState = deriveNodeVisualState(sub.status, {
                    loadingPercent: sub.capacityMW > 0 ? (sub.currentLoadMW / sub.capacityMW) * 100 : 0,
                  });
                  const theme = STATE_THEMES[subState];
                  const isSelected = selectedAsset?.kind === 'substation' && selectedAsset.data.id === sub.id;
                  const isHighlighted = highlightedIds.has(sub.id);
                  const isTransmission = sub.type === 'transmission';
                  const radius = isTransmission ? 16 : 13;

                  return (
                    <g
                      key={sub.id}
                      transform={`translate(${sub.position.x}, ${sub.position.y})`}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAsset({ kind: 'substation', data: sub });
                      }}
                    >
                      {/* Selection / Status Glowing Ring */}
                      {(isSelected || subState === 'FAILED' || subState === 'OVERLOADED' || subState === 'WARNING') && (
                        <circle
                          r={radius + 6}
                          fill="none"
                          stroke={theme.border}
                          strokeWidth={1.5}
                          strokeDasharray={subState === 'FAILED' ? '4 2' : 'none'}
                          filter={subState === 'FAILED' ? 'url(#glow-red)' : 'url(#glow-cyan)'}
                          className={subState === 'FAILED' || isSelected ? 'animate-pulse' : ''}
                        />
                      )}

                      {/* Substation Shape: Transmission = Hexagon, Distribution = Diamond/Square */}
                      {isTransmission ? (
                        <polygon
                          points="0,-16 14,-8 14,8 0,16 -14,8 -14,-8"
                          fill={theme.fill}
                          stroke={isSelected ? '#ffffff' : theme.border}
                          strokeWidth={isSelected ? 2.5 : 1.8}
                        />
                      ) : (
                        <rect
                          x={-radius}
                          y={-radius}
                          width={radius * 2}
                          height={radius * 2}
                          rx={3}
                          fill={theme.fill}
                          stroke={isSelected ? '#ffffff' : theme.border}
                          strokeWidth={isSelected ? 2.5 : 1.5}
                        />
                      )}

                      {/* Substation Icon Graphic */}
                      <text
                        x={0}
                        y={4}
                        textAnchor="middle"
                        fill={theme.text}
                        fontSize={isTransmission ? 10 : 8}
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {isTransmission ? 'TX' : 'DX'}
                      </text>

                      {/* Substation Name Label */}
                      <text
                        x={0}
                        y={radius + 11}
                        textAnchor="middle"
                        fill="#e0edf5"
                        fontSize={8}
                        fontWeight={isSelected ? 'bold' : 'normal'}
                        className="pointer-events-none"
                      >
                        {sub.name}
                      </text>

                      {/* Status Tag Pill if FAILED */}
                      {subState === 'FAILED' && (
                        <g transform={`translate(0, ${-radius - 10})`}>
                          <rect x={-20} y={-6} width={40} height={12} rx={2} fill="#ff3b5c" />
                          <text x={0} y={2.5} textAnchor="middle" fill="#ffffff" fontSize={7} fontWeight="bold">
                            FAILED
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* ─── Layer 4: Generators (Solar, Wind, Thermal) ─── */}
            {(categoryFilter === 'all' || categoryFilter === 'gens') && (
              <g id="generators-layer">
                {topology.generators.map((gen) => {
                  const genState = deriveNodeVisualState(gen.status);
                  const theme = STATE_THEMES[genState];
                  const isSelected = selectedAsset?.kind === 'generator' && selectedAsset.data.id === gen.id;
                  const isHighlighted = highlightedIds.has(gen.id);
                  const radius = 12;

                  return (
                    <g
                      key={gen.id}
                      transform={`translate(${gen.position.x}, ${gen.position.y})`}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAsset({ kind: 'generator', data: gen });
                      }}
                    >
                      {/* Selection Ring */}
                      {isSelected && (
                        <circle
                          r={radius + 5}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth={2}
                          filter="url(#glow-cyan)"
                        />
                      )}

                      {/* Base Circle */}
                      <circle
                        r={radius}
                        fill={theme.fill}
                        stroke={isSelected ? '#ffffff' : ASSET_TYPE_COLORS[gen.type]}
                        strokeWidth={1.8}
                      />

                      {/* Output Indicator Arc / Ring */}
                      {gen.capacityMW > 0 && genState !== 'FAILED' && (
                        <circle
                          r={radius - 2}
                          fill="none"
                          stroke={ASSET_TYPE_COLORS[gen.type]}
                          strokeWidth={2}
                          strokeDasharray={`${(gen.currentOutputMW / gen.capacityMW) * 60} 100`}
                          transform="rotate(-90)"
                        />
                      )}

                      {/* Icon */}
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        fill={theme.text}
                        fontSize={9}
                      >
                        {gen.type === 'solar' ? '☀' : gen.type === 'wind' ? '〰' : '⚡'}
                      </text>

                      {/* Label */}
                      <text
                        x={0}
                        y={radius + 10}
                        textAnchor="middle"
                        fill="#5a7a8f"
                        fontSize={7.5}
                        className="pointer-events-none"
                      >
                        {gen.name}
                      </text>

                      {/* Failure Badge */}
                      {genState === 'FAILED' && (
                        <g transform={`translate(0, ${-radius - 8})`}>
                          <rect x={-16} y={-5} width={32} height={10} rx={2} fill="#ff3b5c" />
                          <text x={0} y={2.5} textAnchor="middle" fill="#ffffff" fontSize={6.5} fontWeight="bold">
                            TRIPPED
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* ─── Layer 5: Battery Storage Units ─── */}
            {(categoryFilter === 'all' || categoryFilter === 'bats') && (
              <g id="batteries-layer">
                {topology.batteries.map((bat) => {
                  const batState = deriveNodeVisualState(bat.status);
                  const theme = STATE_THEMES[batState];
                  const isSelected = selectedAsset?.kind === 'battery' && selectedAsset.data.id === bat.id;
                  const isHighlighted = highlightedIds.has(bat.id);

                  return (
                    <g
                      key={bat.id}
                      transform={`translate(${bat.position.x}, ${bat.position.y})`}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAsset({ kind: 'battery', data: bat });
                      }}
                    >
                      {isSelected && (
                        <circle r={16} fill="none" stroke="#ffffff" strokeWidth={2} filter="url(#glow-cyan)" />
                      )}

                      {/* Battery capsule shape */}
                      <rect
                        x={-10}
                        y={-12}
                        width={20}
                        height={24}
                        rx={4}
                        fill={theme.fill}
                        stroke={isSelected ? '#ffffff' : ASSET_TYPE_COLORS.battery}
                        strokeWidth={1.5}
                      />
                      {/* Battery terminal */}
                      <rect x={-4} y={-15} width={8} height={3} rx={1} fill={ASSET_TYPE_COLORS.battery} />

                      {/* SOC Level Fill Bar */}
                      <rect
                        x={-7}
                        y={9 - bat.socPercent * 18}
                        width={14}
                        height={bat.socPercent * 18}
                        rx={2}
                        fill={bat.socPercent < 0.2 ? '#ff3b5c' : '#00d68f'}
                        opacity={0.85}
                      />

                      <text x={0} y={2} textAnchor="middle" fill="#ffffff" fontSize={7} fontWeight="bold">
                        B
                      </text>

                      {/* Battery Name */}
                      <text x={0} y={20} textAnchor="middle" fill="#5a7a8f" fontSize={7.5} className="pointer-events-none">
                        {bat.name}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}

            {/* ─── Layer 6: Loads (Consumers) ─── */}
            {(categoryFilter === 'all' || categoryFilter === 'loads') && (
              <g id="loads-layer">
                {topology.loads.map((load) => {
                  const loadState = deriveNodeVisualState(load.status, { isConnected: load.connected });
                  const theme = STATE_THEMES[loadState];
                  const isSelected = selectedAsset?.kind === 'load' && selectedAsset.data.id === load.id;
                  const isHighlighted = highlightedIds.has(load.id);
                  const isIsolated = !load.connected || load.status === 'ISOLATED';

                  return (
                    <g
                      key={load.id}
                      transform={`translate(${load.position.x}, ${load.position.y})`}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAsset({ kind: 'load', data: load });
                      }}
                    >
                      {isSelected && (
                        <circle r={12} fill="none" stroke="#ffffff" strokeWidth={2} filter="url(#glow-cyan)" />
                      )}

                      {/* Load Pin / Dot */}
                      <circle
                        r={8}
                        fill={theme.fill}
                        stroke={isIsolated ? '#5a7a8f' : isSelected ? '#ffffff' : ASSET_TYPE_COLORS[load.type]}
                        strokeWidth={1.4}
                        opacity={isIsolated ? 0.5 : 1}
                      />

                      {/* Priority dot inside */}
                      <circle
                        r={3}
                        fill={
                          load.priority === 'critical'
                            ? '#ff3b5c'
                            : load.priority === 'high'
                              ? '#f5a623'
                              : '#00e5c8'
                        }
                      />

                      {/* If isolated / shed, show strike-through mark */}
                      {isIsolated && (
                        <path d="M-5,-5 L5,5 M5,-5 L-5,5" stroke="#ff3b5c" strokeWidth={1.5} />
                      )}

                      {/* Load Label */}
                      <text x={0} y={15} textAnchor="middle" fill="#5a7a8f" fontSize={7} className="pointer-events-none">
                        {load.name}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
          </svg>

          {/* Interactive Asset Detail Inspector Overlay Drawer */}
          {selectedAsset && (
            <div className="absolute bottom-2 right-2 top-2 z-10 w-80 shadow-2xl">
              <AssetDetailPanel
                selected={selectedAsset}
                onClose={() => setSelectedAsset(null)}
                topology={topology}
                onSelectRelated={(target) => setSelectedAsset(target)}
              />
            </div>
          )}

          {/* Canvas Floating Quick Stats Pill */}
          <div className="absolute left-3 top-3 pointer-events-none flex items-center gap-2 rounded border border-[#1a3348]/80 bg-[#0a1220]/90 px-2.5 py-1 text-[9px] backdrop-blur-sm">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00e5c8]" />
              <span className="text-[#5a7a8f]">Active Substations:</span>
              <span className="font-mono font-bold text-[#e0edf5]">
                {topology.substations.filter((s) => s.status !== 'FAILED').length}/{topology.substations.length}
              </span>
            </span>

            <span className="text-[#3a5568]">|</span>

            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3b9eff]" />
              <span className="text-[#5a7a8f]">Transmission Lines:</span>
              <span className="font-mono font-bold text-[#e0edf5]">
                {topology.transmissionLines.filter((l) => l.status !== 'FAILED').length}/{topology.transmissionLines.length}
              </span>
            </span>

            {metrics.failedAssetCount > 0 && (
              <>
                <span className="text-[#3a5568]">|</span>
                <span className="flex items-center gap-1 text-[#ff3b5c]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff3b5c]" />
                  <span className="font-bold">{metrics.failedAssetCount} Faulted</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Topology Legend Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1a3348]/60 pt-2 text-[9px]">
          {/* Node Types */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Assets:</span>
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: ASSET_TYPE_COLORS.solar }} />
              <span className="text-[#e0edf5]">Solar</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: ASSET_TYPE_COLORS.wind }} />
              <span className="text-[#e0edf5]">Wind</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: ASSET_TYPE_COLORS.thermal }} />
              <span className="text-[#e0edf5]">Thermal</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: ASSET_TYPE_COLORS.transmissionSub }} />
              <span className="text-[#e0edf5]">TX Sub</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: ASSET_TYPE_COLORS.distributionSub }} />
              <span className="text-[#e0edf5]">DX Sub</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: ASSET_TYPE_COLORS.battery }} />
              <span className="text-[#e0edf5]">BESS</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: ASSET_TYPE_COLORS.residential }} />
              <span className="text-[#e0edf5]">Load</span>
            </div>
          </div>

          {/* Status Colors */}
          <div className="flex items-center gap-2.5">
            <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Status:</span>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00e5c8]" />
              <span className="text-[#5a7a8f]">Normal</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f5a623]" />
              <span className="text-[#5a7a8f]">Warning</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b5c]" />
              <span className="text-[#5a7a8f]">Overloaded/Trip</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#5a7a8f]" />
              <span className="text-[#5a7a8f]">Isolated</span>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
