# SOLAR ASSIST MASTER DEVELOPMENT ROADMAP

## A. Product North Star
The fundamental objective of Solar Assist is to become a **human-supervised O&M operating system**, not merely software that helps an O&M team run solar plants.

The product principle is: **POWERFUL UNDERNEATH. SIMPLE ON TOP.**

Solar Assist should automatically answer:
1. What is happening?
2. Is anything wrong?
3. What does it mean?
4. Does anyone need to act?
5. What exactly needs to happen?
6. Who should do it?
7. When should it happen?
8. What information does the person need?
9. Has the work happened?
10. Did it actually solve the problem?
11. Does the client need to know?
12. What should happen next?

Admins primarily supervise, review, approve, override, investigate, and handle exceptions. They do NOT manually stitch together operational actions.

## B. Current State
Solar Assist currently combines telemetry aggregation, fault detection, alerts, tickets, field jobs/work orders, cleaning planning, workforce management, route planning, technician execution, client reporting, and multi-tenant access (RLS). 

However, much of the orchestration is manual:
- **Alerts/Tickets**: Generated automatically, but converting tickets to jobs requires manual admin dispatch.
- **Cleaning**: Deterministic planner exists, but generating daily routes and team assignments still requires manual admin steps.
- **Command Center**: Currently acts as an analytics dashboard rather than an exception-driven operational control room.
- **Routing**: Straight-line geographic (Haversine) based, not production-grade road-network based.
- **Technician App**: Basic mobile views exist, but offline/PWA capability is missing.

## C. OEM Status
- **Solis**: OPERATIONAL (The current proving ground).
- **Growatt**: NOT OPERATIONAL (Code exists, but not operationally ready).
- **Sungrow**: NOT OPERATIONAL (Code exists, but not operationally ready).
- **Other OEMs**: NOT OPERATIONAL.
*Note: Do not expand to other OEMs until the OEM-independent operating system is fully built against Solis.*

## D. Architecture / Operating Model
The system operates on a reactive O&M loop:
`Telemetry/Event -> Detection -> Interpretation -> Action Decision Engine (Monitor/Notify/Investigate/Schedule/Dispatch/Escalate) -> Job (if physical work needed) -> Assignment -> Route -> Execution -> Evidence -> Telemetry Verification -> Resolution -> Client Communication -> Learning`

## E. Phase Roadmap & F. Status Table

| Item | Status | Phase | Dependencies | Acceptance Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 0: Operating Model + UX Foundation** | DONE | None | Admin can understand fleet state immediately; critical issues are prominent; primary navigation is simplified; internal concepts hidden. |
| **Phase 1: Reactive O&M Automation** | REFINED & VERIFIED | Phase 0 | Action Decision Engine automates response (MONITOR/NOTIFY/INVESTIGATE/SCHEDULE/DISPATCH/ESCALATE); workload-balanced tech assignment; strict priority sorting (P1 > P2 > P3 > P4); zero 404/broken links; Ack vs Resolve separation; 5-stage ticket lifecycle; macro-technical client descriptions. |
| **Phase 2: Cleaning Automation** | REFINED & VERIFIED | Phase 0, 1 | Automatic monthly planning, team allocation, route generation, and job creation with admin supervision. |
| **Phase 3: Field Execution** | REFINED & VERIFIED | Phase 1, 2 | Technician can execute daily work offline (PWA) with check-in without admin help. |
| **Phase 4: Production-Grade Routing** | REFINED & VERIFIED | Phase 2, 3 | Generated routes use actual road-network travel times, distances, working hours, and capacity. |
| **Phase 5: Technical Intelligence** | REFINED & VERIFIED | Phase 1 | O&M engineer can investigate technical problems (string anomalies, multi-inverter comparisons, utility meter loss) via UI. |
| **Phase 6: Resolution / Verification Engine** | REFINED & VERIFIED | Phase 1, 3 | System verifies if physical intervention fixed the problem using telemetry, auto-reopens/escalates if failed. |
| **Phase 7: Premium Client Experience** | REFINED & VERIFIED | Phase 1, 6 | Client understands performance, health score, maintenance history, and savings via a premium portal. |
| **Phase 8: Scale + Hardening** | PROVISIONALLY HARDENED (MOCK VALIDATED) | Phases 1-7 | Hardened in code & verified across 100/500/1000 synthetic mock tiers (batched ingestion, composite indexes, bounded queries, starvation-free cron). Database-backed EXPLAIN/Postgres load-test gate remains OPEN pending isolated Supabase test project. |
| **Phase 9: Operational Infrastructure** | NOT STARTED | Phases 1-8 | Supports onboarding, spares, SLAs, billing, contracts. |
| **Phase 10: OEM Expansion** | NOT STARTED | Phases 1-9 | Growatt, Sungrow, and others plug into the normalized engine successfully. |

## G. Detailed Checklists

### Phase 0: Operating Model + UX Foundation
- [x] Simplify primary information architecture (Command Center, Operations, Assets, Clients, Configuration).
- [x] Build exception-driven Command Center (surface critical/high priority, offline sites, overdue work).
- [x] Update terminology: Use "Job" instead of Work Order across UI where appropriate.
- [x] Map out Action Decision Engine architecture.
- [x] Hide unnecessary internal database concepts from primary navigation.

### Phase 1: Reactive O&M Automation
- [x] Implement response classification (Monitor, Notify, Investigate, Schedule, Dispatch Immediately, Escalate).
- [x] Implement automatic Job creation based on rules.
- [x] Implement recommended/automatic team assignment.
- [x] Implement recurrence handling.
- [x] Implement escalation paths.
- [x] Test permissions and RLS.

### Phase 2: Cleaning Automation
- [x] Generate automatic monthly plan taking capacity/geography/workload into account.
- [x] Allocate teams automatically based on historical continuity and capacity.
- [x] Generate daily routes automatically.
- [x] Create Jobs automatically.
- [x] Build admin review/approve/override UI for the generated plan.

### Phase 3: Field Execution
- [x] Simplify daily workflow UI (Today's Work).
- [x] Add check-in capability.
- [x] Add offline/PWA capability for poor connectivity.
- [x] Support evidence capture and site context natively.

### Phase 4: Production-Grade Routing
- [x] Integrate road-network routing provider (Composite OSRM + Haversine Road Factor fallback engine).
- [x] Factor in actual travel time, distance, working hours, and shift capacity feasibility.
- [x] Optimize route sequence preserving physical-location batching.

### Phase 5: Technical Intelligence
- [x] Implement historical string analysis with multi-string comparison.
- [x] Implement string anomaly detection (sustained underperformance vs transients).
- [x] Implement multi-inverter diagnostic comparison.
- [x] Compare against physical meter readings.

### Phase 6: Resolution / Verification Engine
- [x] Implement telemetry-based verification post-Job completion (`verification-engine.ts`).
- [x] Track recovery windows and persistent recovery (30m grace period & `verified_recovered` status).
- [x] Detect failed repairs and trigger automatic reopening/escalation (reopens ticket, increments `reopened_count`, upgrades priority P3 -> P2 -> P1, surfaces in Needs Attention Queue).

### Phase 7: Premium Client Experience
- [x] Overhaul client portal UI to premium standard.
- [x] Implement explainable health score.
- [x] Show transparent maintenance history and sanitized technician evidence.
- [x] Implement automatic incident communications and recurring reporting.

### Phase 8: Scale + Hardening
- [x] Create 100/500/1000+ site load testing scenarios.
- [x] Optimize telemetry ingestion scaling and background processing.
- [x] Optimize DB queries, RLS, and pagination for scale.

### Phase 9: Operational Infrastructure
- [ ] Complete automated onboarding workflows.
- [ ] Build inventory/spares tracking.
- [ ] Build SLA tracking, contracts, and billing integrations.

### Phase 10: OEM Expansion
- [ ] Finalize Growatt integration and validate telemetry normalization.
- [ ] Finalize Sungrow integration and validate telemetry normalization.
- [ ] Build additional OEM adapters as required.

## H. Validation Requirements
For each phase:
- **Unit/Integration Tests**: Validate business logic and edge cases.
- **Workflow Tests**: Validate end-to-end user journeys (e.g., alert -> job -> completion).
- **Permissions/RLS Tests**: Ensure strict multi-tenant isolation.
- **Build/Type Checks**: 100% passing TypeScript and Next.js builds.
- **Real-Fleet Validation**: Test against the real Solis proving ground before marking DONE.

## I. Explicitly Parked Items
- Growatt & Sungrow OEM implementations (Parked until Phase 10).
- Deep financial / billing logic (Parked until Phase 9).
- Predictive Machine Learning / AI Degradation Modeling (Long-term, parked).
- Third-party ERP integrations (Parked).
- Client-Initiated Cleaning Requests (Explicitly deferred to V2).
- Client-Initiated Technical Issue Reporting (Explicitly deferred to V2).

## J. Change Log
*(To be updated as phases are completed)*

- **2026-09-30**: Completed and verified Phase 2 (Cleaning Automation). Added historical team continuity to macro-scheduler, verified automatic monthly planning, team allocation, route generation, job creation, and admin review matrix UI.
- **2026-09-30**: Completed Phase 3 (Field Execution). Built PWA offline sync engine (`offline-sync.ts`), camera photo capture integration (`capture="environment"`), and mobile-first Today's Work task workflow (`/technician/route`).
- **2026-10-01**: Completed Phase 4 (Production-Grade Routing). Built composite server-side routing provider (`CompositeRoutingProvider` with OSRM and Haversine Road Factor fallback), physical-location batching TSP optimization, working shift feasibility validation, route unpublish/re-edit safety rules, and admin/technician route management UI. Verified against October 2026 real 35-site proving ground without schedule corruption.
- **2026-10-06**: Completed Phase 5 (Technical Intelligence). Created DB schema for utility meters and meter readings (`0009_technical_intelligence.sql`), built automated string anomaly detection engine (`string-anomaly-engine.ts`) classifying transient vs sustained underperformance vs disconnected strings with 1-click ticket dispatching, multi-inverter comparative diagnostic engine (`inverter-diagnostic-engine.ts`) ranking yield, efficiency & thermal clipping, utility export meter vs inverter loss balance calculator (`meter-comparison-engine.ts`), and unified Technical Intelligence Control Hub (`/diagnostics`).
- **2026-10-09**: Completed Phase 6 (Resolution / Verification Engine). Created migration `0010_verification_engine.sql` adding verification status & pre/post repair metrics, built automated telemetry verification engine (`verification-engine.ts`), automated resolution verification cron sweep API (`app/api/cron/verify-resolutions/route.ts`), UI verification status cards (`TelemetryVerificationCard`), and Needs Attention Queue integration for reopening failed repairs with priority escalation. Verified via unit tests (`test:phase6`).
- **2026-10-16**: Completed and verified Phase 7 (Premium Client Experience). Overhauled client portal to executive premium standard with explainable health score breakdown (40/35/25 point distribution across inverters, operational incidents, and preventive cleaning), integrated Phase 6 telemetry verification states into incident communication, built 5-stage Service Request progress tracker with technician findings, photographic evidence lightbox modal with Before/After/Safety proofs, canonical upcoming cleaning visit schedules, recurring professional client reports with PDF export capability, and strict multi-tenant isolation. Verified via unit tests (`test:phase7`), TypeScript check, Next.js production build, and browser testing.
- **2026-10-21**: Completed Approved Product Refinement:
  1. Workstream 1: Cleaning & Operations Separation (top-level Cleaning navigation, dedicated Cleaning Overview, Policies, Visits/History, and Teams/Capacity views; Operations filtered to reactive technical work; shared Routes & Dispatch; 5 teams including Pune-isolated Team E with 10 total technicians).
  2. Workstream 2: Client Portal Information Hierarchy & UX Refinement (reorganised around 5 customer questions, canonical cleaning visit dates, customer-friendly status/alarms, progressive disclosure).
  3. Client Operational History UX Polish: Moved the extensive "System Operational Log & Service Care" section towards the end of the client portal (`#operational-history`), configured it to be collapsable and collapsed by default (showing only the single active/most recent record when collapsed), and kept Question 2 compact with instant zero-issue reassurance or single-active-issue card.
  4. Client-initiated requests (cleaning & issue reporting) explicitly recorded as deferred to V2.
- **2026-10-22**: Completed and verified Phase 8 (Scale + Hardening):
  1. **Safety Guard & Branch**: Isolated testing executed on dedicated branch `phase8-scale-hardening` using safety guard `scale-test-guard.ts` ensuring zero mutation of production Supabase (`ylnmjvgnjootrkywbcsj.supabase.co`).
  2. **Scale Benchmark Harness**: Created synthetic multi-tier load test suite (`scripts/scale-test-harness.ts`, `scripts/run-scale-benchmarks.ts`) executing across 100, 500, and 1,000 site tiers (up to 3,000 inverters, 24,000 strings, 27,000 telemetry rows).
  3. **Work Package 1 (DB Indexing & Schema Hardening)**: Created `0013_scale_hardening_indexes.sql` adding composite indexes on `string_telemetry(string_id, timestamp DESC)`, `inverters(oem, oem_device_id)`, `inverters(site_id, status)`, `alerts(site_id, code, status)`, `alerts(inverter_id, status)`, `tickets(org_id, status, created_at DESC)`, `work_orders(site_id, status)`, `sync_runs(started_at DESC)`, `cleaning_logs(performed_at DESC)`, and `cleaning_visits(site_id, cycle_period, status)`.
  4. **Work Package 2 (Telemetry Ingestion & Background Processing)**: Batched string telemetry writes into a single bulk HTTP request per inverter in `sync_service.py` (94% reduction in HTTP requests, 250x ingestion speedup delivering 7,143 rows/sec). Added 60s AbortSignal timeout to `poll-oem` cron route and batch limit of 50 to `verify-resolutions` cron route. Chunked cleaning planner canonical visit upserts into batches of 250 in `cleaning/planner/generate/route.ts` to prevent payload timeouts at 1,000 sites.
  5. **Work Package 3 (Query Optimization, Pagination & Bounded UI Payloads)**: Bounded dashboard ticket and work order queries with `.limit(100)` (reducing payload by 80.1% at 1,000 sites). Implemented chunked `.in()` querying (`fetchChunkedIn` in chunks of 50) in `/diagnostics` to eliminate HTTP 414 URI Too Long errors when querying 1,000 site IDs. Added active status filters and `.limit(100)` on alerts in `/client` and `/client/sites`.
  6. **Multi-Tenant Isolation & Verification**: Zero cross-tenant data leaks across all tiers. 100% passing regression tests (`test:phase5`, `test:phase6`, `test:phase7`), TypeScript check (`tsc --noEmit`), scale benchmarks (`benchmark:scale`), and production Next.js build (`npm run build`).
- **2026-10-23**: Conducted Phase 8 Final Production Validation Gate Audit:
  1. **Production Guard**: Verified absolute production protection (`ylnmjvgnjootrkywbcsj` guard intact).
  2. **Cron Hardening Fixes**: Added secret-based endpoint protection to `/api/cron/verify-resolutions`, eliminated ticket starvation by ordering by `updated_at ASC` and filtering to active states (`['pending', 'under_verification']`), and scoped telemetry queries to the ticket's inverter strings.
  3. **Queue Transparency**: Added active status filtering + priority sorting on dashboard queries before the 100-record cap, and added an explicit UI banner linking to `/operations` when displaying the 100-item cap.
  4. **Postgres Validation Status**: Host environment lacks local Docker, Supabase CLI, and secondary dev database. Pursuant to data safety directives, migration `0013_scale_hardening_indexes.sql` and `EXPLAIN (ANALYZE, BUFFERS)` testing are paused until an isolated test project is provided. Phase 8 kept **OPEN (Provisionally Hardened)**.

