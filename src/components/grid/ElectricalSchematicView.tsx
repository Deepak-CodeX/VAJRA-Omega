'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useVajraStore } from '@/store/vajraStore';
import { CANONICAL_POWER_ASSETS } from '@/data/canonicalCitiesData';
import type { PowerAsset } from '@/types/powerAsset';

interface SchematicNode {
  id: string;
  name: string;
  assetType: 'GENERATOR' | 'SUBSTATION' | 'LINE' | 'LOAD' | 'CRITICAL';
  voltageKV: number;
  capacityMVA: number;
  status: 'ONLINE' | 'DEGRADED' | 'TRIPPED';
  tier: number; // 0 = Gen, 1 = 400kV, 2 = 220kV, 3 = 66/33kV, 4 = Load
  tierLabel: string;
  x: number;
  y: number;
  connectedTo: string[];
  operator?: string;
  loadingPercent: number;
}

interface SchematicEdge {
  id: string;
  fromId: string;
  toId: string;
  voltageKV: number;
  status: 'ONLINE' | 'DEGRADED' | 'TRIPPED';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export default function ElectricalSchematicView({
  onAssetSelect,
  onFlyToGeo,
}: {
  onAssetSelect?: (asset: PowerAsset | null) => void;
  onFlyToGeo?: (asset: PowerAsset) => void;
}) {
  const currentCity = useVajraStore((s) => s.geoTwin?.selectedCity);
  const selectedEntityId = useVajraStore((s) => s.geoTwin?.selectedEntityId);
  const selectGeoEntity = useVajraStore((s) => s.selectGeoEntity);
  const activeCascade = useVajraStore((s) => s.activeCascade);

  // Schematic Controls State
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [voltageFilter, setVoltageFilter] = useState<'ALL' | '400' | '220' | '66' | '33'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'GENERATOR' | 'SUBSTATION' | 'LOAD'>('ALL');
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Canonical assets for the currently active city
  const cityId = currentCity?.id ?? 'city-delhi';
  const canonicalAssets = useMemo(() => {
    return CANONICAL_POWER_ASSETS[cityId] || CANONICAL_POWER_ASSETS['city-delhi'] || [];
  }, [cityId]);

  // Construct Voltage-Tiered Hierarchical Schematic Layout
  const { nodes, edges, tierYPositions } = useMemo(() => {
    const calculatedNodes: SchematicNode[] = [];
    const calculatedEdges: SchematicEdge[] = [];

    // Tiers definition:
    // Tier 0: Bulk Generation (Thermal, Solar, Hydro, Gas)
    // Tier 1: 400kV Bulk Transmission Grid
    // Tier 2: 220kV Regional Sub-Transmission
    // Tier 3: 66kV / 33kV City Distribution Substations
    // Tier 4: Critical Municipal Loads & Load Zones
    const tierMap: Record<number, SchematicNode[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    const tierY = { 0: 60, 1: 180, 2: 300, 3: 420, 4: 540 };

    canonicalAssets.forEach((asset) => {
      let tier = 2;
      let tierLabel = '220 kV Sub-Transmission';
      const kv = asset.voltageKV ?? 220;

      if (asset.assetType === 'POWER_PLANT' || asset.assetType === 'GENERATOR') {
        tier = 0;
        tierLabel = 'Bulk Generation Hub';
      } else if (kv >= 400) {
        tier = 1;
        tierLabel = '400 kV Extra High Voltage (EHV)';
      } else if (kv >= 220) {
        tier = 2;
        tierLabel = '220 kV Sub-Transmission Grid';
      } else if (kv >= 33) {
        tier = 3;
        tierLabel = `${kv} kV Distribution Substation`;
      } else {
        tier = 4;
        tierLabel = 'Municipal Load Zone';
      }

      const isTripped = activeCascade?.affectedAssetIds?.includes(asset.id) || asset.status === 'TRIPPED';
      const isDegraded = asset.status === 'DEGRADED' || (asset.loadingPercent ?? 0) > 90;

      const node: SchematicNode = {
        id: asset.id,
        name: asset.name,
        assetType: asset.assetType === 'POWER_PLANT' ? 'GENERATOR' : 'SUBSTATION',
        voltageKV: kv,
        capacityMVA: asset.nominalCapacityMVA ?? 100,
        status: isTripped ? 'TRIPPED' : isDegraded ? 'DEGRADED' : 'ONLINE',
        tier,
        tierLabel,
        x: 0, // Assigned below
        y: tierY[tier as keyof typeof tierY],
        connectedTo: asset.connectedAssetIds,
        operator: asset.operator,
        loadingPercent: asset.loadingPercent ?? 65,
      };

      tierMap[tier].push(node);
    });

    // Add inferred downstream load node if none exists
    if (tierMap[4].length === 0) {
      tierMap[4].push({
        id: `${cityId}-load-zone-metro`,
        name: `${currentCity?.name ?? 'City'} Metro Primary Load Center`,
        assetType: 'LOAD',
        voltageKV: 11,
        capacityMVA: 350,
        status: activeCascade?.affectedAssetIds?.length ? 'DEGRADED' : 'ONLINE',
        tier: 4,
        tierLabel: '11 kV Urban Distribution & Load',
        x: 0,
        y: tierY[4],
        connectedTo: [],
        operator: 'Municipal DISCOM',
        loadingPercent: 78,
      });
    }

    // Compute deterministic horizontal positions across tier columns
    const width = 900;
    Object.keys(tierMap).forEach((tierStr) => {
      const tierNum = parseInt(tierStr, 10);
      const row = tierMap[tierNum];
      const count = row.length;
      row.forEach((n, idx) => {
        const spacing = width / (count + 1);
        n.x = Math.round(spacing * (idx + 1));
        calculatedNodes.push(n);
      });
    });

    // Create schematic bus lines and connections
    const nodeLookup = new Map<string, SchematicNode>();
    calculatedNodes.forEach((n) => nodeLookup.set(n.id, n));

    calculatedNodes.forEach((fromNode) => {
      fromNode.connectedTo.forEach((targetId) => {
        const toNode = nodeLookup.get(targetId);
        if (toNode) {
          const edgeId = `edge-${fromNode.id}-${toNode.id}`;
          const reverseId = `edge-${toNode.id}-${fromNode.id}`;
          if (!calculatedEdges.some((e) => e.id === edgeId || e.id === reverseId)) {
            const isLineTripped = fromNode.status === 'TRIPPED' || toNode.status === 'TRIPPED';
            calculatedEdges.push({
              id: edgeId,
              fromId: fromNode.id,
              toId: toNode.id,
              voltageKV: Math.max(fromNode.voltageKV, toNode.voltageKV),
              status: isLineTripped ? 'TRIPPED' : 'ONLINE',
              fromX: fromNode.x,
              fromY: fromNode.y,
              toX: toNode.x,
              toY: toNode.y,
            });
          }
        }
      });
    });

    return { nodes: calculatedNodes, edges: calculatedEdges, tierYPositions: tierY };
  }, [canonicalAssets, cityId, currentCity, activeCascade]);

  // Filtered nodes based on search & filter buttons
  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      if (searchQuery && !n.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (voltageFilter !== 'ALL' && n.voltageKV.toString() !== voltageFilter) {
        return false;
      }
      if (typeFilter !== 'ALL' && n.assetType !== typeFilter) {
        return false;
      }
      return true;
    });
  }, [nodes, searchQuery, voltageFilter, typeFilter]);

  // Selected asset lookup
  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedEntityId);
  }, [nodes, selectedEntityId]);

  // Node Click handler: selects asset & highlights both in schematic and opens inspector
  const handleNodeClick = (node: SchematicNode) => {
    selectGeoEntity(node.id);
    const asset = canonicalAssets.find((a) => a.id === node.id) || null;
    onAssetSelect?.(asset);
  };

  // Node Double Click: fly camera to physical Geo coordinates
  const handleNodeDoubleClick = (node: SchematicNode) => {
    const asset = canonicalAssets.find((a) => a.id === node.id);
    if (asset) {
      onFlyToGeo?.(asset);
    }
  };

  // Pan & Zoom handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((z) => Math.max(0.4, Math.min(2.5, z * factor)));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-[#1b2a38] bg-[#070d17]">
      {/* ─── Top Control Toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1b2a38] bg-[#09131f]/90 px-4 py-2.5 backdrop-blur">
        {/* Left: Title & Active City Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#00e5c8]" />
            <h2 className="font-mono text-xs font-bold tracking-wider text-[#e0edf5] uppercase">
              Electrical Bus Schematic
            </h2>
          </div>
          <span className="rounded border border-[#1b2a38] bg-[#0c1824] px-2 py-0.5 font-mono text-[10px] text-[#5a7a8f]">
            {currentCity?.name ?? 'National Capital Region'}
          </span>
          <span className="rounded bg-[#00e5c8]/10 px-2 py-0.5 font-mono text-[10px] text-[#00e5c8]">
            VOLTAGE-TIER HIERARCHY
          </span>
        </div>

        {/* Center: Search & Filters */}
        <div className="flex items-center gap-2">
          {/* Quick Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search Substation / Plant..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 w-48 rounded border border-[#1b2a38] bg-[#050a12] px-2.5 pl-6 font-mono text-[11px] text-[#e0edf5] placeholder-[#415a77] focus:border-[#00e5c8] focus:outline-none"
            />
            <span className="absolute top-1.5 left-2 text-[10px] text-[#415a77]">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute top-1.5 right-2 text-[10px] text-[#5a7a8f] hover:text-[#e0edf5]"
              >
                ✕
              </button>
            )}
          </div>

          {/* Voltage Filter Dropdown */}
          <select
            value={voltageFilter}
            onChange={(e) => setVoltageFilter(e.target.value as any)}
            className="h-7 rounded border border-[#1b2a38] bg-[#050a12] px-2 font-mono text-[11px] text-[#e0edf5] focus:border-[#00e5c8] focus:outline-none"
          >
            <option value="ALL">All Voltages</option>
            <option value="400">400 kV (EHV)</option>
            <option value="220">220 kV (Sub-Tx)</option>
            <option value="66">66 kV (Dist)</option>
          </select>

          {/* Labels Toggle */}
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`h-7 rounded border px-2.5 font-mono text-[11px] transition ${
              showLabels
                ? 'border-[#00e5c8]/50 bg-[#00e5c8]/10 text-[#00e5c8]'
                : 'border-[#1b2a38] bg-[#0c1824] text-[#5a7a8f]'
            }`}
          >
            {showLabels ? '🏷️ Labels ON' : '🏷️ Labels OFF'}
          </button>
        </div>

        {/* Right: Zoom & Layout Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
            title="Zoom In"
            className="flex h-7 w-7 items-center justify-center rounded border border-[#1b2a38] bg-[#0c1824] font-mono text-xs text-[#e0edf5] hover:border-[#00e5c8]"
          >
            +
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
            title="Zoom Out"
            className="flex h-7 w-7 items-center justify-center rounded border border-[#1b2a38] bg-[#0c1824] font-mono text-xs text-[#e0edf5] hover:border-[#00e5c8]"
          >
            −
          </button>
          <button
            onClick={resetView}
            title="Reset Pan & Zoom"
            className="flex h-7 items-center rounded border border-[#1b2a38] bg-[#0c1824] px-2 font-mono text-[11px] text-[#5a7a8f] hover:text-[#e0edf5]"
          >
            Fit Network
          </button>
        </div>
      </div>

      {/* ─── Main SVG Schematic Canvas ───────────────────────────────────── */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className={`relative flex-1 cursor-grab overflow-hidden select-none ${
          isDragging ? 'cursor-grabbing' : ''
        }`}
      >
        <svg
          width="100%"
          height="100%"
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '50% 50%',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          {/* Subtle Grid Pattern */}
          <defs>
            <pattern id="schematic-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#101d2c" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#schematic-grid)" />

          {/* Voltage Tier Horizontal Bus Lines & Labels */}
          {Object.entries(tierYPositions).map(([tierStr, yPos]) => {
            const tierNum = parseInt(tierStr, 10);
            const labels = [
              'GENERATION TIER (Bulk Power Plants)',
              '400 kV TRANSMISSION BUS (National Interconnects)',
              '220 kV SUB-TRANSMISSION RING',
              '66 kV / 33 kV PRIMARY DISTRIBUTION BUS',
              'CONSUMER LOAD & CRITICAL INFRASTRUCTURE ZONES',
            ];
            const colors = ['#f5a623', '#d9383a', '#00e5c8', '#3a86ff', '#8338ec'];

            return (
              <g key={`tier-${tierNum}`}>
                <line
                  x1="20"
                  y1={yPos}
                  x2="900"
                  y2={yPos}
                  stroke={colors[tierNum]}
                  strokeWidth="1"
                  strokeDasharray="6 4"
                  strokeOpacity="0.25"
                />
                <text
                  x="30"
                  y={yPos - 12}
                  fill={colors[tierNum]}
                  fillOpacity="0.7"
                  fontFamily="monospace"
                  fontSize="9"
                  fontWeight="bold"
                  letterSpacing="1"
                >
                  {labels[tierNum]}
                </text>
              </g>
            );
          })}

          {/* Electrical Edges (Lines & Corridors) */}
          {edges.map((edge) => {
            const isHighlighted =
              selectedEntityId === edge.fromId ||
              selectedEntityId === edge.toId ||
              hoveredNodeId === edge.fromId ||
              hoveredNodeId === edge.toId;
            const isTripped = edge.status === 'TRIPPED';

            const strokeColor = isTripped
              ? '#d9383a'
              : edge.voltageKV >= 400
              ? '#d9383a'
              : edge.voltageKV >= 220
              ? '#00e5c8'
              : '#3a86ff';

            // Orthogonal stepped bus path: fromX, fromY -> fromX, midY -> toX, midY -> toX, toY
            const midY = (edge.fromY + edge.toY) / 2;
            const pathD = `M ${edge.fromX} ${edge.fromY} L ${edge.fromX} ${midY} L ${edge.toX} ${midY} L ${edge.toX} ${edge.toY}`;

            return (
              <g key={edge.id}>
                {/* Glow layer when highlighted */}
                {isHighlighted && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="6"
                    strokeOpacity="0.4"
                    strokeLinecap="round"
                  />
                )}
                {/* Main line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isHighlighted ? 2.5 : 1.5}
                  strokeDasharray={isTripped ? '4 3' : undefined}
                  strokeOpacity={isHighlighted ? 1 : 0.65}
                />
              </g>
            );
          })}

          {/* Electrical Nodes (Substations, Power Plants, Loads) */}
          {filteredNodes.map((node) => {
            const isSelected = selectedEntityId === node.id;
            const isHovered = hoveredNodeId === node.id;
            const isTripped = node.status === 'TRIPPED';

            // Colors based on voltage & status
            const nodeFill = isTripped
              ? '#d9383a'
              : node.voltageKV >= 400
              ? '#ff6b6b'
              : node.voltageKV >= 220
              ? '#00e5c8'
              : '#3a86ff';

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => handleNodeClick(node)}
                onDoubleClick={() => handleNodeDoubleClick(node)}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                className="cursor-pointer transition-transform"
              >
                {/* Outer Selection Pulsing Halo */}
                {isSelected && (
                  <circle
                    r="24"
                    fill="none"
                    stroke="#00e5c8"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                    className="animate-spin"
                    style={{ animationDuration: '6s' }}
                  />
                )}

                {/* Substation Base Shape */}
                {node.assetType === 'GENERATOR' ? (
                  // Generator: Circle with Sine wave
                  <g>
                    <circle
                      r="16"
                      fill="#0c1824"
                      stroke={nodeFill}
                      strokeWidth={isSelected || isHovered ? 2.5 : 1.5}
                    />
                    <path
                      d="M -7 0 Q -3.5 -5, 0 0 T 7 0"
                      fill="none"
                      stroke={nodeFill}
                      strokeWidth="2"
                    />
                  </g>
                ) : node.assetType === 'LOAD' ? (
                  // Load: Downward Triangle
                  <polygon
                    points="0,16 -14,-10 14,-10"
                    fill="#0c1824"
                    stroke={nodeFill}
                    strokeWidth={isSelected || isHovered ? 2.5 : 1.5}
                  />
                ) : (
                  // Substation: Square/Hexagon with internal bus bars
                  <g>
                    <rect
                      x="-14"
                      y="-14"
                      width="28"
                      height="28"
                      rx="4"
                      fill="#0c1824"
                      stroke={nodeFill}
                      strokeWidth={isSelected || isHovered ? 2.5 : 1.5}
                    />
                    {/* Transformer coils symbol inside */}
                    <circle cx="-3" cy="0" r="5" fill="none" stroke={nodeFill} strokeWidth="1.2" />
                    <circle cx="3" cy="0" r="5" fill="none" stroke={nodeFill} strokeWidth="1.2" />
                  </g>
                )}

                {/* Status Indicator Pip */}
                <circle
                  cx="12"
                  cy="-12"
                  r="4"
                  fill={isTripped ? '#d9383a' : node.status === 'DEGRADED' ? '#f5a623' : '#00e5c8'}
                  stroke="#050a12"
                  strokeWidth="1.5"
                />

                {/* Labels */}
                {showLabels && (
                  <g>
                    <text
                      x="0"
                      y="26"
                      textAnchor="middle"
                      fill="#e0edf5"
                      fontFamily="monospace"
                      fontSize="9.5"
                      fontWeight={isSelected ? 'bold' : 'normal'}
                      className="pointer-events-none"
                    >
                      {node.name.length > 24 ? node.name.slice(0, 22) + '…' : node.name}
                    </text>
                    <text
                      x="0"
                      y="37"
                      textAnchor="middle"
                      fill="#5a7a8f"
                      fontFamily="monospace"
                      fontSize="8"
                      className="pointer-events-none"
                    >
                      {node.voltageKV} kV • {node.capacityMVA} MVA • {node.loadingPercent}% Load
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* ─── Bottom Legend Overlay ────────────────────────────────────── */}
        <div className="pointer-events-none absolute right-4 bottom-4 flex items-center gap-4 rounded-lg border border-[#1b2a38] bg-[#050a12]/90 px-3.5 py-2 font-mono text-[10px] text-[#e0edf5] backdrop-blur">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#ff6b6b]" />
            <span>400 kV (EHV)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#00e5c8]" />
            <span>220 kV (Sub-Tx)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#3a86ff]" />
            <span>66/33 kV (Dist)</span>
          </div>
          <div className="h-3 w-px bg-[#1b2a38]" />
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#00e5c8]" />
            <span>Online</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#d9383a]" />
            <span>Tripped</span>
          </div>
        </div>
      </div>
    </div>
  );
}
