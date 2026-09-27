# SOLARASSIST MASTER DEVELOPMENT ROADMAP

## A. Product North Star
The fundamental objective of SolarAssist is to become a **human-supervised O&M operating system**, not merely software that helps an O&M team run solar plants.

The product principle is: **POWERFUL UNDERNEATH. SIMPLE ON TOP.**

SolarAssist should automatically answer:
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
SolarAssist currently combines telemetry aggregation, fault detection, alerts, tickets, field jobs/work orders, cleaning planning, workforce management, route planning, technician execution, client reporting, and multi-tenant access (RLS). 

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
| **Phase 2: Cleaning Automation** | NEXT | Phase 0, 1 | Automatic monthly planning, team allocation, route generation, and job creation with admin supervision. |
| **Phase 3: Field Execution** | NOT STARTED | Phase 1, 2 | Technician can execute daily work offline (PWA) with GPS/check-in without admin help. |
| **Phase 4: Production-Grade Routing** | NOT STARTED | Phase 2, 3 | Generated routes use actual road-network travel times, distances, working hours, and capacity. |
| **Phase 5: Technical Intelligence** | NOT STARTED | Phase 1 | O&M engineer can investigate technical problems (string anomalies, multi-inverter comparisons) via UI. |
| **Phase 6: Resolution / Verification Engine** | NOT STARTED | Phase 1, 3 | System verifies if physical intervention fixed the problem using telemetry, auto-reopens/escalates if failed. |
| **Phase 7: Premium Client Experience** | NOT STARTED | Phase 1, 6 | Client understands performance, health score, maintenance history, and savings via a premium portal. |
| **Phase 8: Scale + Hardening** | NOT STARTED | Phases 1-7 | System handles 100/500/1000+ sites with predictable DB/ingestion/UI performance. |
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
- [ ] Generate automatic monthly plan taking capacity/geography/workload into account.
- [ ] Allocate teams automatically based on historical continuity and capacity.
- [ ] Generate daily routes automatically.
- [ ] Create Jobs automatically.
- [ ] Build admin review/approve/override UI for the generated plan.

### Phase 3: Field Execution
- [ ] Simplify daily workflow UI (Today's Work).
- [ ] Add GPS/check-in capability.
- [ ] Add offline/PWA capability for poor connectivity.
- [ ] Support evidence capture and site context natively.

### Phase 4: Production-Grade Routing
- [ ] Integrate road-network routing provider (e.g., Mapbox/Google).
- [ ] Factor in actual travel time, distance, and working hours.
- [ ] Optimize route sequence and appointment windows.

### Phase 5: Technical Intelligence
- [ ] Implement historical string analysis with multi-string comparison.
- [ ] Implement string anomaly detection (sustained underperformance vs transients).
- [ ] Implement multi-inverter diagnostic comparison.
- [ ] Compare against physical meter readings.

### Phase 6: Resolution / Verification Engine
- [ ] Implement telemetry-based verification post-Job completion.
- [ ] Track recovery windows and persistent recovery.
- [ ] Detect failed repairs and trigger automatic reopening/escalation.

### Phase 7: Premium Client Experience
- [ ] Overhaul client portal UI to premium standard.
- [ ] Implement explainable health score.
- [ ] Show transparent maintenance history and sanitized technician evidence.
- [ ] Implement automatic incident communications and recurring reporting.

### Phase 8: Scale + Hardening
- [ ] Create 100/500/1000+ site load testing scenarios.
- [ ] Optimize telemetry ingestion scaling and background processing.
- [ ] Optimize DB queries, RLS, and pagination for scale.

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

## J. Change Log
*(To be updated as phases are completed)*

- **YYYY-MM-DD**: Document created.
