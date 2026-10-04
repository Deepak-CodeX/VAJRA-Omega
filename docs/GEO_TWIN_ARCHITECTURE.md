# VAJRA-Ω — Geo-Twin Architecture & Domain Specification

## 1. Geo-Twin Purpose & Mission

VAJRA-Ω is an intelligent digital twin for power grids. Prior to Task 14, the digital twin provided an abstract single-line diagram (SLD) schematic topology. While essential for power engineering and mathematical flow analysis, grid operations in megacities require physical and spatial situational awareness.

The **Geo-Twin** extends VAJRA-Ω to represent real-world geographic environments—from country and regional transmission corridors down to city street blocks, substations, and critical civic facilities (hospitals, water treatment plants, airports, metro rail hubs).

The Geo-Twin is **not** a decorative map overlay or a fake futuristic dashboard. Every spatial entity is anchored in authoritative state and explicitly linked (or decoupled) from electrical network assets and physics.

---

## 2. Core Architectural Principle: Graph Separation

A foundational invariant of VAJRA-Ω is that **geographic proximity does NOT equal electrical connectivity**:

```
                GEOGRAPHIC WORLD
                       │
                       ↓
                 GEO-TWIN MODEL
                       │
             ┌─────────┴─────────┐
             ↓                   ↓
      PHYSICAL ENTITIES     POWER ENTITIES
             │                   │
             └─────────┬─────────┘
                       ↓
                RELATIONSHIP LAYER
                       ↓
              ELECTRICAL NETWORK
                       ↓
              SIMULATION ENGINE
                       ↓
                 DIGITAL TWIN
                       ↓
                HUMAN INTERFACE
```

Three distinct graphs are maintained:

1. **Graph A: Geographic Spatial Graph (`GeoRelationship`)**
   - Captures physical relationships: `CONTAINS`, `WITHIN`, `ADJACENT_TO`, `PROXIMATE_TO`, `INTERSECTS`.
   - Example: *AIIMS Hospital is located within the Central District, 55 meters from the 400kV Substation.*

2. **Graph B: Electrical Network Graph (`ElectricalRelationship`)**
   - Captures circuit topology: `TRANSMITS_TO`, `STEPS_DOWN_TO`, `FEEDS_LOAD`, `BACKS_UP`.
   - Example: *Substation S01 steps down 400kV to 66kV and feeds Distribution Substation S02 via Line L01.*

3. **Graph C: Simulation Physics State (`SimulationState`)**
   - Authoritative solver state: real and reactive power flows (MW, MVAR), bus voltages (p.u.), frequencies (Hz), branch loadings (%), breaker states (`CLOSED`/`TRIPPED`), thermal overload counters, cascade sequences, and restoration plans.

**Critical Invariant:**
A geographic line between two buildings or a visual corridor on a map MUST NOT automatically create an electrical edge. Spatial relations and circuit topology reference one another through stable identifiers (`electricalAssetId`), but their graphs remain strictly decoupled.

---

## 3. Coordinate System Standard

VAJRA-Ω standardizes on **WGS84 (EPSG:4326) Decimal Degrees**:

- **Latitude**: `[-90.0, +90.0]` (North positive, South negative).
- **Longitude**: `[-180.0, +180.0]` (East positive, West negative).
- **Elevation (optional)**: Plausible terrestrial range `[-500m, +15000m]` above Mean Sea Level (MSL).

```typescript
export interface GeoCoordinate {
  latitude: number;
  longitude: number;
  elevationMeters?: number;
}
```

### Coordinate Separation

VAJRA-Ω strictly enforces separation between coordinate domains:

- **Geographic Coordinates (`GeoCoordinate`)**: Real-world WGS84 lat/lng.
- **Screen Pixel Coordinates (`{ x, y }`)**: Dynamic SVG/Canvas projection coordinates within the current viewport.
- **Simulation Schematic Coordinates (`GridPosition`)**: Abstract visual coordinates used in Task 12 single-line diagrams.

Converters and projectors (e.g. `computeGeoDistanceMeters`, `isCoordinateInBoundingBox`, `projectCoords`) transform between domains without mutating underlying domain models.

---

## 4. Geographic Scale Hierarchy

The spatial model natively accommodates zoom and navigation across seven hierarchical levels without city-specific branching:

```
WORLD
  ↓
COUNTRY
  ↓
STATE / REGION
  ↓
CITY
  ↓
DISTRICT / LOCALITY
  ↓
SITE
  ↓
BUILDING / INFRASTRUCTURE
```

Every `GeoEntity` declares its `scaleLevel` (`GeoScaleLevel`) and optional `parentId` pointing to its enclosing spatial entity.

---

## 5. Domain Model Reference

The domain model is defined in `src/types/geo.ts`:

- **`GeoEntity`**: Base interface for all physical assets with stable `id`, `name`, `entityType`, `scaleLevel`, `coordinates`, optional `boundingBox`, `parentId`, and mandatory `provenance`.
- **`City`**: Administrative urban center with population, bounding box, center coordinates, and `regionalGridInterconnect`.
- **`Region`**: State or administrative power balancing area (e.g., Northern Regional Grid).
- **`Building`**: Structural consumer with `usageType` (COMMERCIAL, RESIDENTIAL, INDUSTRIAL, etc.), `estimatedPeakDemandMW`, `isCriticalPowerCustomer`, and inferred feeder ID.
- **`CriticalInfrastructure`**: Essential civil facility with `infraType` (HOSPITAL, AIRPORT, WATER_TREATMENT, METRO_TRANSIT, etc.), `emergencyBackupGenerationMW`, `requiresDualFeed`, and `priorityTier` (`TIER_1_LIFE_SAFETY`, `TIER_2_CIVIL_OPERATIONS`, `TIER_3_ECONOMIC`).
- **`GeoPowerAsset`**: Geographic representation of a power grid asset linking directly to `electricalAssetId`.
- **`GeoLayerConfig`**: Declarative configuration for 14 independently togglable layers (`BASE_MAP`, `BUILDINGS`, `ROADS`, `POWER_GENERATION`, `SUBSTATIONS`, `TRANSMISSION`, `DISTRIBUTION`, `CRITICAL_INFRASTRUCTURE`, `FAILURES`, `CASCADE_PROPAGATION`, etc.).
- **`GeoTwinState`**: Authoritative store state tracking active city, selected entity, viewport camera, visible layers, search state, and loaded entity counts.

---

## 6. Data Provenance & Synthetic Data Policy

Every entity carries explicit provenance metadata:

```typescript
export type DataProvenanceType =
  | 'VERIFIED_EXTERNAL' // Ground-truthed public or utility data (e.g., surveyed utility SLD)
  | 'MODELED'           // Engineering estimation, building footprint heuristics, spatial interpolation
  | 'SYNTHETIC'         // Procedurally generated for architecture validation and testing
  | 'USER_DEFINED';     // Injected by simulation operator

export interface DataProvenance {
  sourceType: DataProvenanceType;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  sourceReference: string;
  lastUpdated: string;
  isVerifiedRealWorld: boolean;
  methodologyNotes?: string;
}
```

### Strict Policy

1. **Never fabricate ground truth:** Synthetic or modeled assets must never be presented as verified utility infrastructure.
2. **Mandatory flags:** All demo assets have `isVerifiedRealWorld: false`. Power assets have `isSurveyVerified: false`. Electrical relationships have `isTopologicallyVerified: false`.
3. **Transparent UI:** The Geo-Twin interface displays a prominent Provenance Banner indicating whether the active dataset is `SYNTHETIC`, `MODELED`, or `VERIFIED_EXTERNAL`.

---

## 7. Provider Abstraction & Offline Guarantee

The system abstracts data acquisition behind `IGeoDataProvider` and `CityResolver`:

```typescript
export interface IGeoDataProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly isOfflineCapable: boolean;

  searchCities(query: string): Promise<CitySearchResult[]>;
  resolveCity(cityId: string): Promise<City | null>;
  loadCityTwin(cityId: string): Promise<CityTwinPackage | null>;
  loadBuildings(cityId: string, bounds?: GeoBoundingBox): Promise<Building[]>;
  loadCriticalInfrastructure(cityId: string): Promise<CriticalInfrastructure[]>;
  loadPowerInfrastructure(cityId: string): Promise<GeoPowerAsset[]>;
}
```

### CityResolver

- Dispatches user queries through registered providers.
- Normalizes input queries (trimming, lowercase folding, Unicode diacritic stripping).
- Avoids city-specific conditional branches (`if (city === 'Delhi')`). Any city supported by any provider can be resolved cleanly.

### Deterministic Development Provider (`DeterministicGeoDataProvider`)

- 100% offline, zero external network dependency for startup or testing.
- Ships with modeled demonstration datasets for **Delhi**, **Mumbai**, **Bengaluru**, and **Bhopal**.
- Validates coordinates, boundaries, spatial indexing, layer filtering, and failure visualization.

---

## 8. Electrical-Geographic Bridge (`ElectricalGeoBridge`)

The `ElectricalGeoBridge` binds simulation electrical asset IDs to geographic entities:

```typescript
export class ElectricalGeoBridge {
  public bindAssetToGeo(reference: ElectricalGeoReference): void;
  public getGeoReference(electricalAssetId: string): ElectricalGeoReference | undefined;
  public getElectricalAssetId(geoEntityId: string): string | undefined;
  public resolveFusedAsset(topology: GridTopology, electricalAssetId: string): FusedGeoElectricalAsset | undefined;
}
```

- **Single source of truth:** The simulation engine owns electrical physics; the Geo-Twin references assets by ID.
- **Dynamic state reflection:** When a transmission line trips in the cascade engine (`line.status === 'FAILED'`), the Geo-Twin SVG renderer queries the line's live status via `electricalAssetId` and instantly renders it as tripped (flashing red, 0 MW flow), preserving complete synchronization across Schematic and Geographic views.

---

## 9. Real Geographic Data Integration & Map Engine (Task 15)

### Map Engine Selection & Architecture

VAJRA-Ω integrates **MapLibre GL JS** via a dedicated `MapEngineAdapter`:

- **Why MapLibre GL**: High-performance WebGL-accelerated vector and raster tile rendering. Rather than rendering thousands of buildings or roads as React DOM nodes or a giant SVG (which causes severe DOM thrashing and O(N²) layout reflows), MapLibre renders directly to a single hardware-accelerated WebGL `<canvas>`.
- **Decoupling**: The application store and domain model never interact directly with MapLibre APIs. `MapEngineAdapter` provides an isolated bridge (`initialize`, `flyToCity`, `fitBounds`, `setLayerVisibility`, `setCityBoundary`, `setPowerAssets`, `setCriticalInfrastructure`).
- **Resilient Fallback**: If WebGL is unavailable (e.g., in headless test environments or restricted browsers), `MapEngineAdapter.isWebGLSupported()` detects this gracefully and transitions to SVG fallback mode without crashing.

### Dark Technical Theme

- Built on Carto Dark Matter raster tiles (`https://*.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`) with background `#070c12`.
- High contrast, dark technical aesthetic aligned with the VAJRA command center design system (`#00e5c8` cyan, `#f5a623` amber, `#d9383a` red).
- Zero neon clutter: real map geography (streets, water bodies, landmarks) remains legible.

### City Resolution Flow & Nominatim Policy

1. **User Submission Only**: No keystroke-by-keystroke autocomplete or rapid-fire background requests against public Nominatim.
2. **Three-Tier Resolution**:
   - **Tier 1 (In-Memory Cache)**: Past queries are normalized (`normalizeQuery`) and stored in a query map for instant 0ms return.
   - **Tier 2 (Verified Registry)**: Precomputed verified Indian metropolitan registry (`VERIFIED_INDIAN_CITIES`) covers Delhi, Mumbai, Bengaluru, Chennai, Kolkata, Pune, Surat, Ahmedabad, Hyderabad, and Bhopal with surveyed centroids and administrative bounding boxes.
   - **Tier 3 (OpenStreetMap Nominatim)**: Outbound requests adhere to Nominatim usage policies:
     - Strict rate limiter enforcing $\ge 1000$ms gap between external HTTP requests.
     - Custom User-Agent header: `VAJRA-Omega-PowerGrid-DigitalTwin/1.0`.
     - Output validation via `isValidCoordinate` and `isValidBoundingBox`.
3. **Stale-Request & Race-Condition Protection**:
   - Monotonic generation tokens (`requestGenerationToken`) track every search dispatch.
   - If an asynchronous response arrives after a newer query has been dispatched, the stale response is discarded.
   - In-flight requests are aborted via `AbortController` when a new search starts.

### Mandatory Attribution

OpenStreetMap and CARTO attribution is persistently and visibly exposed on the map interface:
`© OpenStreetMap contributors © CARTO`

---

---

## 10. Geographic ↔ Electrical Network Mapping (Task 16)

### Three Separate Graphs Architecture

VAJRA-Ω rigorously isolates the physical, electrical, and computational models into three separate graphs:

- **Graph A: Geographic Graph** (`GeoEntity`, `Building`, `CriticalInfrastructure`, `GeoPowerAsset`): Coordinates, physical geometries, corridors, spatial containment, and proximity.
- **Graph B: Electrical Network Graph** (`Substation`, `Generator`, `TransmissionLine`, `Battery`, `Load`): Bus admittance matrix, branch impedances, transformer tap ratios, generator limits, and circuit topology.
- **Graph C: Simulation Physics State** (`SimulationState`, `CascadeRecord`): Instantaneous MW/MVAR flows, bus voltages, frequencies, dynamic thermal overloads, cascade propagation, and recovery dispatch.

These graphs communicate through explicit, non-destructive mapping references (`ElectricalGeoReference`, `ElectricalGeoBridge`). They are **never** collapsed into a single monolithic graph.

### Asset Mapping Classifications & Types

Every geographic-to-electrical mapping carries explicit classification and confidence metrics:

- `VERIFIED_MAPPING` (`mappingType: 'VERIFIED'`, `confidence: 'HIGH'`, `isVerified: true`): Established only when physical coordinates and electrical identity are corroborated by surveyor/utility ground truth.
- `HIGH_CONFIDENCE_MATCH` (`mappingType: 'SOURCE_MATCHED'`, `confidence: 'HIGH'`): Established by exact identifier or normalized name matching against structured dataset records.
- `INFERRED_MATCH` (`mappingType: 'SPATIAL_INFERENCE'`, `confidence: 'LOW' | 'MEDIUM'`): Algorithmic spatial proximity projection into the active study area. **Crucial Rule:** Inferred matches are NEVER silently elevated to verified status.
- `UNMATCHED`: Kept strictly separate when no reliable match exists.

### Multi-Segment Transmission Corridor Mapping

A transmission line feature on a map is a physical polyline across terrain (`pathCoordinates`). In VAJRA-Ω:

- The electrical branch remains an edge between bus `fromId` and bus `toId` in the electrical solver.
- Geographic line coordinates represent real physical right-of-ways or inferred corridors between substation locations without altering branch admittance or line capacities.

### Voronoi Service-Region Inference

Given geographically located substations within a bounded study area, `ServiceRegionGenerator` partitions the city boundary into deterministic proximity regions:

- **Algorithm**: Sutherland-Hodgman convex polygon clipping against linear half-planes formed by perpendicular bisectors in metric projection.
- **Corner Cases Handled**:
  - $N=0$: Returns empty array `[]`.
  - $N=1$: Returns sole region spanning the full study bounding box (`BOUNDED_PERIMETER`).
  - $N=2$: Bisects the bounding box cleanly across the bisector line.
  - $N \ge 3$: Full convex clipping against all substation neighbor bisectors.
  - **Duplicate coordinates**: Filtered deterministically to avoid degenerate zero-norm half-planes.
  - **Invalid coordinates**: Coordinates violating WGS84 bounds are rejected before tessellation.
  - **Study Area Clipping**: Unbounded Voronoi rays are strictly clipped to the active metropolitan bounding box.
- **Mandatory Scientific Invariant**:
  - Nearest-neighbor proximity does **NOT** equal utility feeder territory. Real distribution feeders weave across neighborhoods and streets irrespective of geometric proximity.
  - Every region carries `isVerifiedFeederTerritory: false` and the explicit disclaimer:
    `"Estimated nearest-substation spatial proximity region. Does NOT represent verified electrical feeder boundary."`

### Deterministic Spatial Load Clustering

`LoadClusterer` provides explainable, deterministic grouping of electrical loads:

- **Algorithm**: Greedy radius-binning with stable sorting by load ID.
- **Outputs**: Centroid coordinate, cluster radius in meters, aggregate demand MW, dominant load category (`RESIDENTIAL`, `COMMERCIAL`, `INDUSTRIAL`, `EV`, `CRITICAL`, `MIXED`).
- **Critical Load Preservation**: Loads marked `priority: 'critical'` or associated with critical infrastructure (hospitals, water treatment, airports, metro transit) trigger `containsCriticalLoad: true` and escalate cluster category to `CRITICAL`.
- **Explainability**: Every cluster carries an explainable metric string (e.g. `Deterministic spatial proximity (radius <= 2500m)`).

### Spatial Failure Impact Estimation

`GeoElectricalMapper.getPotentiallyAffectedAreasForFailure(failedAssetId)` non-destructively answers:
$$\text{Asset Failed} \to \text{Geographic Location} \to \text{Estimated Spatial Region} \to \text{Associated Load Zones} \to \text{Unserved MW} \to \text{Critical Facilities Impacted}$$
Without modifying the authoritative Task 13 cascade engine or electrical solver physics.

---

## 11. Geo-Aware City-Scale Simulation Integration (Task 17)

Task 17 connects the Geographic Twin with VAJRA's authoritative electrical simulation engine so that simulation events become geographically meaningful:

$$\text{Geographic Twin} \to \text{Geographic Context} \to \text{Mapping/Association} \to \text{VAJRA Electrical Model} \to \text{Existing Simulation} \to \text{Simulation State} \to \text{Geo-Aware Impact} \to \text{Geographic Visual}$$

### Key Capabilities & Invariants

1. **Authoritative Physics Invariant**:
   - The existing simulation engine remains the sole authoritative source of truth for all electrical quantities (real/reactive power, bus voltage, frequency, line thermal limits, cascading failure progression, and restoration).
   - The geo-twin never alters or duplicates power flow math; it observes and projects the electrical state into geographic space.

2. **GeoSimulationCoordinator (`GeoSimulationCoordinator`)**:
   - **`computeGeoSimulationImpact(topology, geoTwin, criticalInfra, cascadeRecord, tick)`**:
     - Computes per-service-region unserved demand, blackout fraction, consumer counts, and power quality index ($PQI = V_{\text{p.u.}} \times (1 - \min(0.5, |\Delta f| / 5.0))$).
     - Categorizes regional blackout states: `NORMAL`, `PARTIAL_CURTAILMENT`, or `TOTAL_BLACKOUT`.
     - Tracks critical civic infrastructure power supply status (`NORMAL_GRID`, `BACKUP_ACTIVE`, or `ISOLATED_BLACKOUT`), prioritizing dual-feed requirements and evaluating emergency backup generation against facility demand.
     - Monitors transmission corridor loading, overload status ($>100\%$), and trip status (`FAILED`).
     - Projects dynamic cascading failure steps (`GeoCascadeSpatialStep`) onto geographic coordinates for spatial progression tracking.
   - **`resolveGeoFaultTarget(geoEntityId, geoTwin, topology)`**:
     - Resolves user interactions on the geographic map (substations, lines, or service regions) to the corresponding electrical asset IDs for deterministic fault injection.

3. **Map Engine Adapter Dynamic Simulation Overlays**:
   - Interactive MapLibre/Mapbox GL JS layer styling reflects live simulation state:
     - Regions: Colored dynamically by blackout state (Emerald/Healthy $\to$ Amber/Curtailment $\to$ Crimson/Total Blackout with dynamic opacity).
     - Corridors: Colored and weighted by live loading percent ($<80\%$ Cyan, $80-100\%$ Orange, $>100\%$ Red, Tripped Dashed/Dimmed).
     - Critical Facilities: Highlighted with green/amber/red halo markers indicating grid health, backup status, or blackout risk.

4. **Preserved Invariant**:
   - Voronoi service regions remain explicitly `isVerifiedFeederTerritory: false` with the mandatory disclaimer:
     `"Estimated nearest-substation spatial proximity region. Does NOT represent verified electrical feeder boundary."`
   - All 8 Indian cities (Delhi, Mumbai, Bengaluru, Chennai, Kolkata, Pune, Surat, Bhopal) operate with zero city-specific algorithmic branches.

---

## 12. Geo-Twin Command Center + Synchronized City Visualization (Task 18)

Task 18 establishes the primary operator command center for VAJRA-Ω, unifying geographic exploration with live electrical telemetry, cascade progression, scenario execution, and recovery.

### Command Center Topology & Architecture

1. **Top Operator Bar**:
   - VAJRA-Ω identity and dynamic health status indicator.
   - Prominent city/location search with real-time suggestion dropdown matching across verified Indian metropolises.
   - Quick validation city selector for the 8 validated metropolitan regions: Delhi, Mumbai, Bengaluru, Chennai, Kolkata, Pune, Surat, Bhopal.
   - Authoritative simulation controls: Status badge (`RUNNING`/`PAUSED`), Monotonic clock display (`T+tick`, `HH:MM:SS`), speed multipliers (0.5× to 10×), and Run, Pause, Step, and Reset triggers.
   - View Mode Switcher: Seamless toggling between `[⚡ Schematic Topology]` and `[🌍 Geo-Twin View]`, maintaining 100% electrical state equivalence across views.

2. **Central Workspace**:
   - **Left Control Deck (Collapsible)**:
     - **Organized Layer Manager**: Categorized into `GEOGRAPHY` (Buildings, Base Map, Service Regions), `POWER` (Substations, Transmission, Load Clusters, Load Zones), and `ANALYTICS` (Grid Health, Critical Infra, Cascade Impact). Unsupported layers are strictly omitted from functional controls.
     - **Scenario Control Lab**: Direct activation of authoritative simulation scenarios (`NORMAL_OPERATION`, `SUBSTATION_FAILURE`, `TRANSMISSION_FAILURE`, `GENERATOR_OUTAGE`, `EXTREME_DEMAND`, `RENEWABLE_DROP`, `MULTI_FAULT_CASCADE`, `EV_SURGE`, `BATTERY_UNAVAILABLE`).
     - **Recovery Operations**: Trigger and execution of automated contingency recovery plans.
   - **Main Map Viewport**:
     - Large interactive MapLibre WebGL canvas (or resilient SVG fallback).
     - In-map navigation controls: Zoom In (`+`), Zoom Out (`-`), Fit City Bounds (`⛶`), Reset North (`🧭`), and 2D/3D Pitch toggle (`3D`/`2D`).
     - Multi-dimensional technical legend communicating state through icons, tags, and patterns without relying on color alone:
       - Electrical State: Normal (`●` [OK]), Overloaded (`▲` [HIGH]), Failed (`■` [TRIP]), Isolated (`⊘` [ISOL]), Recovered (`⟳` [REST]).
       - Mapping Status: Verified (`✓`), Source-Matched (`◉`), Inferred (`◇`), Synthetic (`□`).
       - Spatial Impact: Estimated Service Region (`⬡`), Affected Load Zone (`⚠️`), Critical Impact (`🚨`).
     - Mandatory OpenStreetMap & CARTO cartographic attribution.
   - **Right Telemetry Inspector (Collapsible)**:
     - Displays comprehensive entity details: ID, Name, Entity Type, WGS84 coordinates, Provenance, and Mapping Classification.
     - Live substation telemetry: Per-unit voltage ($V_{\text{p.u.}}$), frequency ($f$), operating status, capacity MW, and active load MW.
     - Live corridor telemetry: Active flow MW, thermal capacity MW, and loading percentage.
     - Critical civic infrastructure: Dual feed requirements, backup generation MW, and live power status (`NORMAL_GRID`, `BACKUP_ACTIVE`, `ISOLATED_BLACKOUT`).
     - Explicit uncertainty notices: `SPATIAL PROXIMITY ASSOCIATION — Nearest-neighbor proximity does NOT prove electrical connectivity.`
     - Interactive **[⚡ SIMULATE ASSET FAULT / TRIP]** button directly dispatching failures into the authoritative simulation engine.

3. **Bottom Telemetry & Timeline Deck**:
   - **Authoritative KPI Grid**: 10 real-time metrics derived from simulation state (Total Generation, Demand, Delivered MW, Blackout Deficit MW, System Frequency, Voltage Health Index, Renewable Fraction, Failed Assets, Blackout Zones, and Critical Facilities at Risk).
   - **Cascading Failure & Event Timeline**: Chronological, step-by-step audit of active cascade propagations (`T+00`, `T+02`, `T+04`...) displaying trigger and affected assets, redistributed power, unserved MW, and consumer impacts, complete with manual step advancement and reset capabilities.

4. **Data Honesty Invariant Preserved**:
   - `isVerifiedFeederTerritory` strictly remains `false` across all service regions.
   - Proximity is never presented as verified electrical connectivity.
   - All 8 cities execute through unified, city-independent algorithms with zero city-specific branches.

---

## 13. High-Fidelity 3D City Visualization & Dynamic Grid Blackout Shading (Task 19)

Task 19 evolves the geographic city representation into an immersive 3D digital twin with deterministic building extrusion, camera pitch/bearing controls, night city mode, and simulation-driven dynamic blackout shading.

```
       AUTHORITATIVE SIMULATION ENGINE (Graph C)
                          │
                          ↓
          GEO IMPACT DERIVER (Task 17)
      - Regional Blackout Fractions (0..1)
      - Unserved Demand Deficits (MW)
      - Power Quality / Voltage Depressions
      - Critical Infra Backup Status
                          │
                          ↓
      BUILDING 3D EXTRUDER & SHADING ENGINE (Task 19)
      - Height Extraction & Provenance Tracking
      - 2D Footprint to 3D Extrusion Ring Generation
      - Authoritative Blackout Category Derivation
                          │
                          ↓
         MAPLIBRE GL WEBGL RENDERING ADAPTER
      - fill-extrusion Layer (vajra-buildings-extrusion)
      - Dynamic Height, Base, Color, and Opacity
      - Level of Detail (LOD) & Night Mode Ambience
```

### 13.1 Building Height Provenance & Fallback Hierarchy

Building heights are determined using a rigorous hierarchy to prevent presenting synthetic approximations as verified survey data:

1. **`VERIFIED_SURVEY`**: Real measured height from official municipal LiDAR / geodetic survey (`isVerifiedRealWorld: true`).
2. **`REAL_METADATA`**: Explicit `heightMeters` attribute present in source metadata.
3. **`FLOOR_COUNT_ESTIMATE`**: Derived deterministically as $\text{height} = \text{floorCount} \times 3.5\text{ m}$ (`isHeightEstimated: true`).
4. **`USAGE_TYPE_FALLBACK`**: Standardized structural heights by architectural category:
   - `COMMERCIAL`: 28.0 m
   - `GOVERNMENT`: 35.0 m
   - `HEALTHCARE`: 25.0 m
   - `DATA_CENTER`: 18.0 m
   - `RESIDENTIAL`: 20.0 m
   - `INDUSTRIAL`: 14.0 m
   - `EDUCATIONAL`: 18.0 m
   - `MIXED_USE`: 24.0 m
5. **`SYNTHETIC`**: Baseline default height of 15.0 m.

### 13.2 Dynamic Grid Blackout Semantics & Mapping

Blackout visualization is 100% driven by authoritative simulation state (never random decorative timers or fake building flickers):

- **`ILLUMINATED` (Normal Operations)**:
  - Trigger: Stable power quality index ($\ge 0.92$), substation online, 0% deficit.
  - Visual: 0% dimming factor, nocturnal blue illumination (`#1e3a5f`), opacity 0.88.
- **`GRID_STRESS` (Voltage Depression / Congestion)**:
  - Trigger: Voltage depression ($V < 0.95$ p.u.) or line loading $> 85\%$ or power quality $< 0.92$.
  - Visual: 25% dimming factor, amber warning glow (`#6b5314`), opacity 0.80.
- **`ESTIMATED_OUTAGE` (Partial Curtailment / Load Shedding)**:
  - Trigger: Associated service region in `PARTIAL_CURTAILMENT` ($15\% \le \text{blackoutFraction} < 85\%$).
  - Visual: 60% dimming factor, dimmed navy facade (`#131b26`), opacity 0.45.
- **`SEVERE_BLACKOUT` (Total Blackout)**:
  - Trigger: Associated service region in `TOTAL_BLACKOUT` ($\text{blackoutFraction} \ge 85\%$).
  - Visual: 90% dimming factor, deep dark charcoal blackout (`#060a0f`), opacity 0.20.
- **`RECOVERING` (Restoration In Progress)**:
  - Trigger: Substation status `RECOVERING` during recovery plan execution.
  - Visual: 15% dimming factor, regenerative cyan glow (`#0e7490`), opacity 0.85.

### 13.3 Critical Infrastructure Uncertainty & Emergency Backup

Critical infrastructure buildings (e.g. AIIMS Hospital, Water Treatment Facilities) are not automatically blacked out simply because their geographic polygon falls inside an affected load zone:

- If `emergencyBackupGenerationMW > 0` and backup status is `BACKUP_ACTIVE`, the building retains emergency amber lighting (`#b45309`, dimming 0.10) labeled `CRITICAL INFRASTRUCTURE AT RISK (EMERGENCY BACKUP ACTIVE)`.
- Only if the facility is completely isolated without backup (`ISOLATED_BLACKOUT`) does it transition to dark blackout shading.

### 13.4 Level of Detail (LOD) & Rendering Performance

- **City Zoom ($z < 11$)**: Micro-buildings are suppressed or rendered as flat footprints (`fill` layer) to maintain 60 FPS across dense metropolitan areas.
- **District Zoom ($11 \le z < 14$)**: GPU-accelerated `fill-extrusion` renders medium-detail prisms.
- **Site Zoom ($z \ge 14$)**: High-detail extruded polygons with complete base, height, and edge definitions.
- Avoids rendering individual buildings as React DOM elements; all 3D geometries are streamed as GeoJSON FeatureCollections directly to MapLibre GL's WebGL buffer.

### 13.5 Accessibility & Reduced Motion

- When the operating system or browser requests `prefers-reduced-motion`, all dynamic lighting transitions apply discretely without interpolated easing or visual pulsing.
- High-contrast color scales and non-color textual tags ensure full WCAG accessibility.
