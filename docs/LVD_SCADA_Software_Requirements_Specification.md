# Software Requirements Specification (SRS)

## Lake Victoria to Dodoma (LVD) Water Transmission Scheme — SCADA Dashboard

---

| | |
|---|---|
| **Document title** | Software Requirements Specification — LVD SCADA Dashboard |
| **Project** | Lake Victoria to Dodoma (LVD) Bulk Water Transmission Scheme |
| **Client (Employer)** | Ministry of Water (MoW), United Republic of Tanzania |
| **Consultant** | Don Consult Ltd |
| **Document reference** | LVD-SCADA-SRS-001 |
| **Version** | 1.0 |
| **Status** | Issued for Hand-over / Go-Live Acceptance |
| **Date** | 23 July 2026 |
| **Classification** | Confidential — Client and Consultant only |

### Revision history

| Version | Date | Author | Description |
|---|---|---|---|
| 0.1 | — | Don Consult Ltd | Internal draft |
| 1.0 | 23 Jul 2026 | Don Consult Ltd | Issued for hand-over and acceptance |

### Distribution

| Copy | Holder | Organisation |
|---|---|---|
| 1 | Project Director | Ministry of Water (MoW) |
| 2 | SCADA / ICT Lead | Ministry of Water (MoW) |
| 3 | Project Manager | Don Consult Ltd |
| 4 | Project file | Don Consult Ltd |

---

## How to use this document (acceptance sign-off)

This SRS is a **verifiable requirements register**. Each requirement has two tick boxes:

- **Consultant** — ticked by Don Consult Ltd to confirm the requirement has been **implemented and internally verified**.
- **Client** — ticked by the Ministry of Water to confirm the requirement has been **demonstrated and accepted**.

Marking convention:

- `☐` = not yet fulfilled / not yet accepted (default)
- `☑` = fulfilled / accepted (replace the empty box, or place an `X` inside it)
- Use the **Comments** column to record deficiencies, conditions, dates, or references to defect reports.

At the end of the document (Section 10) is a formal **acceptance sign-off** block. A requirement is considered **closed** only when both the Consultant and Client boxes are ticked. Any requirement left open at hand-over must be listed in the **Outstanding Items Register (Section 9)**.

> **Editing note:** This Markdown file is the master. A Microsoft Word version will be generated from it (e.g. via Pandoc). Tables, headings and the `☐` / `☑` ballot-box characters convert directly to Word. Do not delete rows when converting; strike through or annotate instead.

---

## Table of contents

1. Introduction
2. Overall Description
3. Functional Requirements
4. External Interface Requirements
5. Non-Functional Requirements
6. Data Requirements
7. Standards & Compliance
8. Acceptance Criteria Summary
9. Outstanding Items Register
10. Acceptance & Sign-off
11. Appendices

---

## 1. Introduction

### 1.1 Purpose

This document specifies the software requirements for the **LVD SCADA Dashboard** (hereafter "the System"), a web-based supervisory visualisation and demonstration platform for the Lake Victoria to Dodoma bulk water transmission scheme. It is the reference against which the System is verified by the Consultant and accepted by the Client at hand-over / go-live.

### 1.2 Scope

The System is a **read-and-visualise demonstrator and stakeholder communications tool** that presents the LVD scheme — its GIS network, hydraulic behaviour, pumping and valving, water balance, energy, alarms and cybersecurity architecture — through an integrated browser-based Human-Machine Interface (HMI).

**In scope:**

- Interactive GIS route overview of the transmission main and all major infrastructure.
- Import and visualisation of the project EPANET hydraulic model (MBALIKA 2068).
- Hydraulic long-section (profile) with model-vs-measured comparison.
- 3D pump-station mimic screens with per-pump status and simulated control.
- Valve register and simulated valve control from intake to UDOM.
- Water balance / Non-Revenue Water (NRW) tracking.
- Alarms & events, trends, and energy dashboards.
- Cybersecurity architecture (IEC 62443) with live device-health telemetry.
- A physics-based data simulator and operational scenario injection.

**Out of scope (this release):**

- Connection to real field instrumentation, RTUs/PLCs, or a live SCADA historian.
- Real, safety-related plant control. **No requirement in this document authorises control of physical plant.**
- User authentication against a live directory (LDAP/OAuth2) — the role model is demonstrated structurally.
- A genuine EPANET solver running in the browser.

### 1.3 System nature and disclaimer

> **The System is a NON-OPERATIONAL DEMONSTRATOR.** At the time of this release the LVD scheme is in detailed design; **no plant has been constructed and no live SCADA exists.** Every "measured", "live" or "telemetry" value presented by the System is **synthetic (simulated)** and is labelled as such within the user interface. The System is intended for stakeholder demonstration, design communication, training familiarisation and as the architectural blueprint for the future operational SCADA. The requirements below are written on that basis.

### 1.4 Definitions, acronyms and abbreviations

| Term | Definition |
|---|---|
| BR | Balancing Reservoir |
| CWPS | Clear Water Pumping Station |
| DDR | Detailed Design Report |
| DN / PN | Nominal Diameter / Nominal Pressure rating |
| DSV | Double Suction Volute (pump) |
| EPANET | US EPA public-domain hydraulic network solver / model format |
| FCV / PRV / PSV / ARV | Flow Control / Pressure Reducing / Pressure Relief (Surge) / Air Release Valve |
| HGL | Hydraulic Grade Line |
| HMI | Human-Machine Interface |
| IBPS | Intermediate Booster Pump Station |
| ICS / OT | Industrial Control System / Operational Technology |
| LVD | Lake Victoria to Dodoma |
| MoW | Ministry of Water |
| NRW | Non-Revenue Water |
| PR | Primary Reservoir |
| RTU / PLC | Remote Terminal Unit / Programmable Logic Controller |
| RWPS | Raw Water Pumping Station |
| SCADA | Supervisory Control and Data Acquisition |
| VFD | Variable Frequency Drive |
| VTP | Vertical Turbine Pump |
| WTP | Water Treatment Plant |

### 1.5 References

| Ref | Document / Standard |
|---|---|
| R1 | LVD Draft Detailed Design Report (20260310, Rev.) |
| R2 | LVD SCADA Dashboard Master Prompt (project brief) |
| R3 | MBALIKA 2068 EPANET model (shapefile export, WGS84 / UTM Zone 36S) |
| R4 | MBALIKA site identification register (node-to-site mapping, with confidence) |
| R5 | IEC 62443 — Industrial communication networks — IT security for networks and systems |
| R6 | BS EN ISO 20456:2019 — Measurement of conductive liquid flow in closed conduits (electromagnetic meters) |
| R7 | BS 6739:2024 — Instrumentation in process control systems |
| R8 | NIST Cybersecurity Framework (CSF) |

### 1.6 Overview

Section 2 gives the overall description and context. Section 3 lists functional requirements by module, each with acceptance tick boxes. Sections 4–7 cover interface, non-functional, data and standards requirements. Sections 8–10 provide the acceptance summary, outstanding-items register and formal sign-off.

---

## 2. Overall Description

### 2.1 Product perspective

The System is a self-contained single-page web application. It reads pre-processed project data (EPANET network, site register, design specifications) bundled at build time and animates it with an internal simulation engine. It has no external run-time dependencies beyond a modern web browser and a static web server, and can run fully offline on a laptop for presentations.

### 2.2 System architecture (summary)

| Layer | Technology / Content |
|---|---|
| Presentation | React 18+, TypeScript, Tailwind CSS; HTML5 Canvas and SVG for high-density graphics |
| Mapping | Leaflet with dark CARTO basemap; canvas-rendered pipe network |
| Charting | Recharts (trends/energy); bespoke canvas long-section (hydraulic profile) |
| State | React Context + reducer; publish/subscribe simulation feed |
| Simulation | In-browser physics-based simulator (5-second tick), synthetic SCADA source |
| Build tooling | Vite; Node.js data-conversion scripts (shapefile → JSON, profile pipeline) |
| Source data | MBALIKA 2068 EPANET export; DDR design tables; site identification register |

### 2.3 User classes and roles

The System presents four operational role views, selectable from the header:

| Role | Intended user | Privilege in demonstrator |
|---|---|---|
| Field Operator | Site-based operator | View only |
| Site Engineer | Station engineer | View + simulated local control |
| Control Room | Central operator | View + simulated supervisory control |
| Management | Executive / stakeholder | View, KPIs, dashboards |

### 2.4 Operating environment

| Item | Requirement |
|---|---|
| Client device | Desktop/laptop, minimum 1366×768; 1920×1080 recommended |
| Browser | Current Chrome, Edge or Firefox (evergreen); JavaScript enabled |
| Server | Any static HTTP server (or `npm run dev` for local demonstration) |
| Network | None required at run time (offline-capable); internet only for basemap tiles |

### 2.5 Design and implementation constraints

- The System **must not** present any control affordance that could be mistaken for live plant control; all control is simulated and labelled.
- All synthetic data **must** be visibly flagged as synthetic/simulated.
- Source hydraulic geometry **must** trace to real model nodes; no fabricated coordinates or elevations for plotted primary data.
- The architecture must allow a future real SCADA driver (DNP3 / Modbus TCP / OPC-UA historian) to replace the synthetic source at the adapter layer without UI change.

### 2.6 Assumptions and dependencies

- The MBALIKA 2068 EPANET export (R3) and site register (R4) are the authoritative network source for this release.
- Design flows, heads and equipment counts derive from the DDR (R1).
- Transducer/instrument survey elevations are **not yet available**; the System handles this gap explicitly (see FR-HP-09).

---

## 3. Functional Requirements

> Priority key: **M** = Mandatory, **H** = High, **D** = Desirable.

### 3.1 Application shell, navigation and framing

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| FR-SH-01 | The System shall present a single integrated dashboard with persistent top navigation to all modules. | M | ☐ | ☐ | |
| FR-SH-02 | The header shall display project branding, a live clock, and connection status indicator. | M | ☐ | ☐ | |
| FR-SH-03 | The System shall provide a role selector (Field Operator, Site Engineer, Control Room, Management) that governs control privileges. | M | ☐ | ☐ | |
| FR-SH-04 | The System shall provide a design-horizon toggle (Phase 1 – 2048, Phase 2 – 2068) affecting equipment counts and design figures. | H | ☐ | ☐ | |
| FR-SH-05 | The System shall display a persistent "DEMONSTRATOR — SIMULATED" indicator at all times. | M | ☐ | ☐ | |
| FR-SH-06 | A system-wide KPI strip shall show intake level, raw inflow, UDOM level and energy intensity. | H | ☐ | ☐ | |
| FR-SH-07 | An unacknowledged-alarm indicator shall be visible from every screen and link to the Alarms module. | H | ☐ | ☐ | |

### 3.2 Route Overview (GIS map)

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| FR-OV-01 | The map shall render the real transmission network geometry imported from the MBALIKA 2068 EPANET model (approx. 34,400 pipes, 1,092 km). | M | ☐ | ☐ | |
| FR-OV-02 | Pipes shall be colour-classified by diameter class, each layer independently toggleable. | H | ☐ | ☐ | |
| FR-OV-03 | The map shall display all 22 operational SCADA sites with class-based symbols and live status rings (normal / warning / alarm / comms). | M | ☐ | ☐ | |
| FR-OV-04 | The map shall display EPANET model assets — pumps, control valves (FCV/PRV), tanks, source reservoirs and demand nodes — as toggleable layers with live pop-up data. | H | ☐ | ☐ | |
| FR-OV-05 | Pipeline fittings (PRV, surge-relief, air-release, washout valves) and bulk billing flowmeters shall be shown at their correct locations along the network. | M | ☐ | ☐ | |
| FR-OV-06 | The legend shall be interactive: filtering by node class, fitting type, status, and network layer. | H | ☐ | ☐ | |
| FR-OV-07 | With a filter active, each visible item shall display two lines of critical live data without the operator clicking it; with no filter, hover shows a summary and click opens a detail pop-up. | H | ☐ | ☐ | |
| FR-OV-08 | Clicking a pump-enabled site shall open its 3D pump-station screen (see 3.5). | M | ☐ | ☐ | |
| FR-OV-09 | The map shall support pan, zoom and a reset-to-extent control. | M | ☐ | ☐ | |

### 3.3 Network Model (EPANET inventory)

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| FR-NM-01 | The System shall present an inventory of the EPANET model: junction, pipe, pump, valve, tank and reservoir counts and total pipe length. | M | ☐ | ☐ | |
| FR-NM-02 | Pipe classes shall be tabulated by diameter band with count and length. | H | ☐ | ☐ | |
| FR-NM-03 | Source reservoirs, demand nodes, pumps, tanks and control valves shall be listed with their model attributes and live simulated values (flow, head, level, position). | H | ☐ | ☐ | |
| FR-NM-04 | The screen shall state that hydraulic values are demonstrator simulations, not a live EPANET solve. | M | ☐ | ☐ | |

### 3.4 Hydraulic Profile & Model-vs-Measured comparison

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| FR-HP-01 | The System shall render a hydraulic long-section from Mbalika Intake to UDOM (approx. 621 km) derived from the EPANET model, on a high-performance canvas. | M | ☐ | ☐ | |
| FR-HP-02 | The profile shall show ground/pipe elevation, model hydraulic grade line (HGL), pressure-head fill, and a diameter band ribbon. | M | ☐ | ☐ | |
| FR-HP-03 | All major infrastructure (Intake, WTP, IBPS boosters, reservoirs, offtakes/PRs) shall carry fixed, colour-coded name labels on the profile. | M | ☐ | ☐ | |
| FR-HP-04 | Sites of low positional confidence shall be visually distinguished (dashed leaders and a warning mark). | H | ☐ | ☐ | |
| FR-HP-05 | Local high points (air-valve candidates) shall be marked along the profile. | H | ☐ | ☐ | |
| FR-HP-06 | A hover crosshair shall report chainage, ground elevation, model HGL, pressure head, flow and diameter; over a site it shall additionally show the site name and type. | M | ☐ | ☐ | |
| FR-HP-07 | The profile shall support zoom, pan, adjustable vertical exaggeration (factor always displayed), jump-to-site, and export to PNG and CSV. | H | ☐ | ☐ | |
| FR-HP-08 | The System shall overlay synthetic measured SCADA readings against the model and compute deviation metrics (head error in metres, flow error in %), classified by uncertainty band. | M | ☐ | ☐ | |
| FR-HP-09 | Where a surveyed transducer elevation is unavailable, the System shall report "awaiting survey" and shall **not** compute or display a head error, nor substitute the model elevation silently. | M | ☐ | ☐ | |
| FR-HP-10 | A Model Performance table shall list every instrument with model value, measured value, deviation, band, data quality, freshness age and a 24-hour deviation sparkline; sortable and filterable, with summary statistics (RMSE, MAE, counts). | H | ☐ | ☐ | |
| FR-HP-11 | Readings whose quality is not "good" (stale, comms-fail, drift, out-of-range) shall be excluded from statistics and shown as explicit gaps with the reason. | M | ☐ | ☐ | |
| FR-HP-12 | The screen shall persistently state which solve is in use (design steady-state vs live-boundary), the datum conversion constant, the data cadence (5 min), and the synthetic nature of measured values. | M | ☐ | ☐ | |

### 3.5 Pump Stations (3D mimic screens)

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| FR-PS-01 | Each pumping station (Intake RWPS, WTP CWPS, and every IBPS) shall present a 3D mimic screen showing the correct number of pumpsets per DDR (working + standby). | M | ☐ | ☐ | |
| FR-PS-02 | Pumps shall be rendered as 3D illustrations appropriate to type (Vertical Turbine / Double Suction Volute) with animated running indication and status colour (running / stopped / standby / fault). | H | ☐ | ☐ | |
| FR-PS-03 | Running pumps shall show live current and power; stopped or tripped pumps shall show zero current/power (de-energised) and no trend. | M | ☐ | ☐ | |
| FR-PS-04 | Pump-flow animation shall correctly indicate direction (upward for vertical turbine pumps). | D | ☐ | ☐ | |
| FR-PS-05 | Each pump shall provide simulated START / STOP controls, and RESET for a faulted pump, subject to role privilege. | M | ☐ | ☐ | |
| FR-PS-06 | The station screen shall show KPI totals (running count, faults, flow, head, station power, phase), design specifications (Phase 1 & 2) from the DDR, station energy, process values and active alarms. | H | ☐ | ☐ | |
| FR-PS-07 | The WTP screen shall additionally show the filtration plant with all rapid gravity filter beds (12), each with headloss, filtrate turbidity, backwash state, and dosing/quality values. | H | ☐ | ☐ | |
| FR-PS-08 | The station screen shall provide SCADA control of the station valves (suction/discharge isolation, filter outlet, backwash, etc.), subject to role privilege. | H | ☐ | ☐ | |
| FR-PS-09 | Pop-ups shall use a modern glass/transparent style with clear alarm and status presentation. | D | ☐ | ☐ | |

### 3.6 Valve Control

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| FR-VC-01 | The System shall maintain a register of all critical valves from Intake to UDOM — isolation, control/butterfly, pressure-reducing, surge-relief, air-release and washout valves — grouped by pipeline segment. | M | ☐ | ☐ | |
| FR-VC-02 | Each valve shall display type, size (DN/PN), actuation, live position, upstream/downstream pressure, flow and status. | M | ☐ | ☐ | |
| FR-VC-03 | Motorised valves shall be operable via SCADA (OPEN / CLOSE / part-open), with valve travel simulated; self-acting valves (check, surge-relief, air) shall be marked non-operable. | M | ☐ | ☐ | |
| FR-VC-04 | Valve control shall be gated by operator role (Control Room / Site Engineer may operate; other roles view only). | M | ☐ | ☐ | |
| FR-VC-05 | Every offtake shall have a SCADA-operable isolation valve and a bulk billing flowmeter, both accessible from the offtake faceplate and the map. | M | ☐ | ☐ | |
| FR-VC-06 | Pressure-relief / air-release / washout valves and pressure reducers shall be shown at their correct network locations with relevant pop-up data. | M | ☐ | ☐ | |
| FR-VC-07 | Operator commands shall be recorded as events in the Alarms & Events log. | H | ☐ | ☐ | |

### 3.7 Water Balance / Non-Revenue Water

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| FR-WB-01 | The System shall present a system water balance: abstraction, treatment output, total offtake, terminal inflow and system balance %. | H | ☐ | ☐ | |
| FR-WB-02 | Per-offtake billing shall be shown (instantaneous, daily and monthly volumes). | H | ☐ | ☐ | |
| FR-WB-03 | An NRW indicator shall flag losses against a threshold. | H | ☐ | ☐ | |
| FR-WB-04 | A daily energy-cost estimate shall be shown with a configurable tariff. | D | ☐ | ☐ | |

### 3.8 Alarms & Events

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| FR-AL-01 | The System shall generate alarms from tag threshold excursions with priority classification. | M | ☐ | ☐ | |
| FR-AL-02 | Alarms shall be filterable by site, priority and acknowledgement state. | H | ☐ | ☐ | |
| FR-AL-03 | Operators shall be able to acknowledge alarms with name and comment. | H | ☐ | ☐ | |
| FR-AL-04 | Process alarms shall be suppressed for de-energised (stopped) pumps to avoid false alarms. | H | ☐ | ☐ | |

### 3.9 Trends

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| FR-TR-01 | The System shall plot historical trends of selected tags with time-series charts. | H | ☐ | ☐ | |
| FR-TR-02 | Trends shall update live at the simulation cadence. | H | ☐ | ☐ | |

### 3.10 Energy

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| FR-EN-01 | The System shall present station power consumption and energy intensity (kWh/m³). | H | ☐ | ☐ | |
| FR-EN-02 | A configurable electricity tariff (off-peak / standard / peak) shall drive cost estimates. | D | ☐ | ☐ | |

### 3.11 Cybersecurity architecture

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| FR-CS-01 | The System shall present the ICS network segmentation aligned to IEC 62443 (Internet → NGFW → IT DMZ → IT/OT firewall → OT network → field level). | M | ☐ | ☐ | |
| FR-CS-02 | Each device box in the segmentation diagram shall display live status and 3–4 lines of critical data (CPU, sessions, sync lag, throughput, etc.) without operator interaction. | M | ☐ | ☐ | |
| FR-CS-03 | The System shall present health of all network switches and gateways (uptime, CPU, temperature, ports, throughput, packet loss). | H | ☐ | ☐ | |
| FR-CS-04 | Access-control, network-control and standards-compliance status shall be summarised. | H | ☐ | ☐ | |
| FR-CS-05 | The screen shall state that device telemetry is simulated. | M | ☐ | ☐ | |

### 3.12 Simulation engine and scenarios

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| FR-SIM-01 | The System shall run a physics-based simulator on a 5-second tick with a diurnal demand curve. | M | ☐ | ☐ | |
| FR-SIM-02 | The System shall generate tags programmatically per site class from instrument templates (ISA-style tag naming). | H | ☐ | ☐ | |
| FR-SIM-03 | The System shall support operator injection of scenarios: pump trip, pipe burst, comms failure and turbidity excursion, with corresponding alarms and effects. | H | ☐ | ☐ | |
| FR-SIM-04 | Scenario effects shall propagate consistently across affected screens (e.g. comms-fail degrades network/RTU health). | D | ☐ | ☐ | |

---

## 4. External Interface Requirements

### 4.1 User interfaces

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| IR-UI-01 | The UI shall use a consistent dark SCADA theme with legible typography and colour-blind-considerate status colours. | H | ☐ | ☐ | |
| IR-UI-02 | The UI shall be responsive to the target display resolutions. | H | ☐ | ☐ | |
| IR-UI-03 | Tooltips, labels and fonts shall be sized to avoid clutter and remain readable. | H | ☐ | ☐ | |

### 4.2 Hardware interfaces

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| IR-HW-01 | The System shall run on a standard laptop/desktop without specialised hardware or GPU beyond a modern browser. | M | ☐ | ☐ | |

### 4.3 Software interfaces

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| IR-SW-01 | The System shall consume pre-processed project data (EPANET network, site register, design tables) bundled at build time. | M | ☐ | ☐ | |
| IR-SW-02 | Build-time scripts shall convert the EPANET shapefile export (UTM 36S) to application data (WGS84), reproducibly. | H | ☐ | ☐ | |

### 4.4 Communications interfaces (future integration)

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| IR-CM-01 | The System shall define a single data-source interface (`ScadaSource`) so a future real driver (DNP3 / Modbus TCP / OPC-UA / historian) can replace the synthetic source without UI change. | M | ☐ | ☐ | |
| IR-CM-02 | The interface shall carry reading quality (good / stale / uncertain / comms-fail / out-of-range) and timestamps. | H | ☐ | ☐ | |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| NFR-PF-01 | The GIS map and hydraulic profile shall remain interactive (target 60 fps) while panning/zooming with all layers visible. | H | ☐ | ☐ | |
| NFR-PF-02 | Screen transitions shall occur within 1 second on the target hardware. | H | ☐ | ☐ | |
| NFR-PF-03 | Live values shall refresh at the 5-second simulation cadence without UI stalls. | H | ☐ | ☐ | |

### 5.2 Usability

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| NFR-US-01 | A first-time operator shall navigate all modules without training within a short guided walkthrough. | H | ☐ | ☐ | |
| NFR-US-02 | Synthetic/demonstration status shall be unambiguous on every screen. | M | ☐ | ☐ | |

### 5.3 Reliability & availability

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| NFR-RL-01 | The System shall run offline for the full duration of a presentation without external service dependency (except optional basemap tiles). | H | ☐ | ☐ | |
| NFR-RL-02 | The System shall degrade gracefully (e.g. missing basemap tiles) without crashing. | H | ☐ | ☐ | |

### 5.4 Security

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| NFR-SC-01 | The System shall not issue any command to real plant; all control is simulated. | M | ☐ | ☐ | |
| NFR-SC-02 | The architecture shall be designed so real authentication (LDAP/OAuth2) and role-based access control drop in at the adapter layer for the operational deployment. | H | ☐ | ☐ | |
| NFR-SC-03 | The demonstrated architecture shall align to IEC 62443 IT/OT segmentation principles. | H | ☐ | ☐ | |

### 5.5 Maintainability

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| NFR-MT-01 | Source shall be modular (per-screen components, isolated simulation and data layers) and typed (TypeScript). | H | ☐ | ☐ | |
| NFR-MT-02 | Data ingestion shall be script-driven and repeatable when the model or site register is revised. | H | ☐ | ☐ | |
| NFR-MT-03 | Source shall be version-controlled with a documented build (`npm install`, `npm run dev` / `npm run build`). | M | ☐ | ☐ | |

### 5.6 Portability

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| NFR-PT-01 | The System shall run in any current evergreen browser on Windows, macOS or Linux. | H | ☐ | ☐ | |

### 5.7 Data integrity / honesty

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| NFR-DI-01 | Primary plotted values shall trace to a real model node or a tagged instrument; the System shall not fabricate or silently interpolate elevations, heads or measured values. | M | ☐ | ☐ | |
| NFR-DI-02 | The derivation method of computed quantities (e.g. HGL) shall be stated in the UI/metadata. | M | ☐ | ☐ | |

---

## 6. Data Requirements

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| DR-01 | The System shall incorporate the MBALIKA 2068 EPANET network (junctions, pipes, pumps, valves, tanks, reservoirs) with correct georeferencing. | M | ☐ | ☐ | |
| DR-02 | The System shall incorporate the site identification register mapping model nodes to named sites with confidence ratings. | M | ☐ | ☐ | |
| DR-03 | Pump-station design data (pumpsets, duty flow/head, motor rating, VFD) shall follow the DDR for Phase 1 and Phase 2. | M | ☐ | ☐ | |
| DR-04 | An instrument register shall map physical tags to model nodes, with surveyed transducer elevation left null until surveyed. | H | ☐ | ☐ | |
| DR-05 | Billing flowmeters shall be specified to BS EN ISO 20456:2019. | H | ☐ | ☐ | |

---

## 7. Standards & Compliance

| ID | Requirement | Pri. | Consultant | Client | Comments |
|---|---|---|---|---|---|
| ST-01 | ICS security architecture aligned to IEC 62443. | H | ☐ | ☐ | |
| ST-02 | Flow measurement aligned to BS EN ISO 20456:2019. | H | ☐ | ☐ | |
| ST-03 | Instrumentation practice aligned to BS 6739:2024. | D | ☐ | ☐ | |
| ST-04 | Cyber posture aligned to NIST CSF. | D | ☐ | ☐ | |
| ST-05 | Field communications architected for DNP3 / Modbus TCP. | H | ☐ | ☐ | |

---

## 8. Acceptance Criteria Summary

The System is accepted for go-live/hand-over when:

| ID | Acceptance criterion | Consultant | Client | Comments |
|---|---|---|---|---|
| AC-01 | All **Mandatory (M)** requirements are ticked by both parties. | ☐ | ☐ | |
| AC-02 | All **High (H)** requirements are ticked, or listed with agreed remediation in Section 9. | ☐ | ☐ | |
| AC-03 | The System has been demonstrated end-to-end to MoW on the target hardware. | ☐ | ☐ | |
| AC-04 | Hand-over pack delivered: source repository, build instructions, data-conversion scripts, and this SRS. | ☐ | ☐ | |
| AC-05 | A walkthrough/training session has been delivered to nominated MoW staff. | ☐ | ☐ | |
| AC-06 | The demonstrator/synthetic-data nature is clearly represented throughout, to the Client's satisfaction. | ☐ | ☐ | |

---

## 9. Outstanding Items Register

List any requirement not fully accepted at hand-over. A requirement is **closed** only when both boxes in Section 3–7 are ticked.

| # | Req ID | Description of shortfall | Severity | Agreed action / owner | Target date | Status |
|---|---|---|---|---|---|---|
| 1 | | | | | | ☐ Open / ☐ Closed |
| 2 | | | | | | ☐ Open / ☐ Closed |
| 3 | | | | | | ☐ Open / ☐ Closed |
| 4 | | | | | | ☐ Open / ☐ Closed |
| 5 | | | | | | ☐ Open / ☐ Closed |

### Known limitations at this release (declared by Consultant)

| Ref | Limitation | Impact | Planned resolution |
|---|---|---|---|
| L-01 | The EPANET `.INP` solver files were not available; hydraulic HGL is **computed** (piecewise hydraulic-gradient, feasibility-clamped) rather than produced by a full EPANET solve, and only the 2068 horizon is modelled. | Head figures are indicative, not solved; single horizon on the profile. | Wire in `wntr`/EPANET solve and 2058 horizon when `.INP` files are provided. |
| L-02 | Transducer/instrument survey elevations are unavailable; head-error comparison shows "awaiting survey". | Head deviation not computed for pressure/level instruments. | Populate surveyed elevations; comparison then computes automatically. |
| L-03 | All "measured"/telemetry data is synthetic. | Not an operational system. | Replace synthetic source with real SCADA driver at the adapter layer. |
| L-04 | User authentication is demonstrated structurally (role selector), not enforced against a directory. | No real access control. | Integrate LDAP/OAuth2 + RBAC for operational deployment. |

---

## 10. Acceptance & Sign-off

By signing below, the parties confirm that the requirements marked as fulfilled/accepted in this SRS have been verified and demonstrated, and that outstanding items are recorded in Section 9.

### 10.1 Consultant — Don Consult Ltd

| Field | Entry |
|---|---|
| Name | |
| Position | |
| Signature | |
| Date | |

### 10.2 Client — Ministry of Water (MoW)

| Field | Entry |
|---|---|
| Name | |
| Position | |
| Signature | |
| Date | |

### 10.3 Witness (optional)

| Field | Entry |
|---|---|
| Name | |
| Position | |
| Signature | |
| Date | |

---

## 11. Appendices

### Appendix A — Module-to-requirement index

| Module | Requirement range |
|---|---|
| Application shell / navigation | FR-SH-01 … FR-SH-07 |
| Route Overview (GIS) | FR-OV-01 … FR-OV-09 |
| Network Model | FR-NM-01 … FR-NM-04 |
| Hydraulic Profile | FR-HP-01 … FR-HP-12 |
| Pump Stations | FR-PS-01 … FR-PS-09 |
| Valve Control | FR-VC-01 … FR-VC-07 |
| Water Balance | FR-WB-01 … FR-WB-04 |
| Alarms & Events | FR-AL-01 … FR-AL-04 |
| Trends | FR-TR-01 … FR-TR-02 |
| Energy | FR-EN-01 … FR-EN-02 |
| Cybersecurity | FR-CS-01 … FR-CS-05 |
| Simulation & scenarios | FR-SIM-01 … FR-SIM-04 |
| Interfaces | IR-UI/HW/SW/CM |
| Non-functional | NFR-PF/US/RL/SC/MT/PT/DI |
| Data | DR-01 … DR-05 |
| Standards | ST-01 … ST-05 |

### Appendix B — Deployment & build (hand-over)

| Step | Command / action |
|---|---|
| Install dependencies | `npm install` (in the `lvd-scada` project folder) |
| Run for demonstration | `npm run dev` → open `http://localhost:5173` |
| Production build | `npm run build` → serve the `dist/` folder on any static HTTP server |
| Regenerate network data | `node scripts/convert-shapefiles.mjs` then `node scripts/build-network.mjs` |
| Regenerate hydraulic profile | `node scripts/build-profile.mjs` and `node scripts/build-instruments.mjs` |
| Source repository | Git repository provided at hand-over (branch `main`) |

### Appendix C — Requirement count summary

| Category | Count |
|---|---|
| Functional (FR-*) | 69 |
| Interface (IR-*) | 8 |
| Non-functional (NFR-*) | 16 |
| Data (DR-*) | 5 |
| Standards (ST-*) | 5 |
| Acceptance criteria (AC-*) | 6 |

*— End of Software Requirements Specification —*
