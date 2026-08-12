# Product Roadmap - Solar Operating System (SolarAssist)

This document outlines the planned long-term product vision and feature roadmap for the SolarAssist platform.

---

## Phase 1: Operational Telemetry Foundation (Completed)
- Establish a normalized, database-driven telemetry mapping schema for inverters, sites, strings, and alarms.
- Modularize alarms definitions into individual OEM registries (`alarm_mappings/`).
- Standardize technician field logging workflows on tickets (before/after photos, remarks).
- Launch the Inverter digital twin detail page with live metrics, strings analytics, and historical charting.

---

## Phase 2: Extensible OEM Adapters (Q3 2026)
- **Growatt Integration**: Create `adapters/growatt.py` and register Growatt alarms in `alarm_mappings/growatt.py`.
- **Sungrow Integration**: Create `adapters/sungrow.py` and register Sungrow alarms in `alarm_mappings/sungrow.py`.
- **Huawei & Fronius Integration**: Create corresponding adapter and alarm registries.
- **Auto-Discovery**: Automate station and device mapping when linking new OEM accounts.

---

## Phase 3: Technical Document Management (Q4 2026)
- **Tech Manuals Repository**: Allow uploading and hosting device-specific user manuals, safety sheets, and warranty certificates.
- **Smart Associations**: Automatically display links to specific troubleshooting guides on the Inverter page when a related alert is active.
- **Factory Certificates**: Link test records and single-line diagrams directly to site commissioning fields.

---

## Phase 4: Control & Command API (Q1 2027)
- **Active Power Control**: Expose remote settings limits for grid feed-in limits via OEM APIs.
- **Reactive Power Settings**: Remotely set power factor and reactive power parameters on-demand.
- **Firmware Upgrades**: Track and request firmware upgrades remotely through the device adapter layer.

---

## Phase 5: Intelligent Operations & AI Diagnostics (Q2 2027)
- **SLA Ticket Escalations**: Implement background logic to automatically escalate ticket priorities and alert dispatchers if technician visits are delayed.
- **Anomaly Detection**: Use historical string telemetry trends to flag panel micro-cracks or shading issues.
