# ExpenseManager — Project Audit Master Index

## 01 · Current Analysis
| Document | Description |
|----------|-------------|
| [codebase-overview.md](01-current-analysis/codebase-overview.md) | High-level codebase walkthrough and file inventory |
| [tech-stack.md](01-current-analysis/tech-stack.md) | Frontend, backend, and tooling stack audit |
| [pain-points.md](01-current-analysis/pain-points.md) | Known issues, TODOs, and rough edges found in current code |

## 02 · Architecture
| Document | Description |
|----------|-------------|
| [system-diagram.md](02-architecture/system-diagram.md) | Component and data-flow diagrams |
| [frontend-structure.md](02-architecture/frontend-structure.md) | React Native app structure and navigation |
| [backend-structure.md](02-architecture/backend-structure.md) | Express API structure and route map |
| [state-management.md](02-architecture/state-management.md) | How app state is managed (hooks, context, storage) |

## 03 · Database
| Document | Description |
|----------|-------------|
| [schema.md](03-database/schema.md) | Current SQLite schema with table and column definitions |
| [queries.md](03-database/queries.md) | Key queries — performance, correctness, coverage |
| [repo-layer.md](03-database/repo-layer.md) | Repository pattern audit (items.js and peers) |

## 04 · OCR
| Document | Description |
|----------|-------------|
| [ocr-pipeline.md](04-ocr/ocr-pipeline.md) | End-to-end receipt scanning and parsing flow |
| [format-detection.md](04-ocr/format-detection.md) | detectFormat logic and supported receipt layouts |
| [normalization.md](04-ocr/normalization.md) | Name normalization and deduplication strategy |
| [confidence-scoring.md](04-ocr/confidence-scoring.md) | Confidence model — how scores are computed and used |
| [patterns.md](04-ocr/patterns.md) | Regex and heuristic patterns catalog |

## 05 · Analytics
| Document | Description |
|----------|-------------|
| [metrics-catalog.md](05-analytics/metrics-catalog.md) | Every metric surfaced in the app, with derivation logic |
| [trend-screens.md](05-analytics/trend-screens.md) | ItemTrend and related screens — data flow and UX |
| [gaps.md](05-analytics/gaps.md) | Missing analytics, blind spots, and improvement ideas |

## 06 · Features
| Document | Description |
|----------|-------------|
| [feature-inventory.md](06-features/feature-inventory.md) | Complete list of implemented features with status |
| [add-edit-flow.md](06-features/add-edit-flow.md) | Manual add and edit expense flows |
| [scan-flow.md](06-features/scan-flow.md) | Camera → OCR → confirm → save flow |
| [backlog.md](06-features/backlog.md) | Desired features not yet implemented |

## 07 · UX
| Document | Description |
|----------|-------------|
| [ux_audit.md](07-ux/ux_audit.md) | Full UX audit — navigation, entry speed, OCR, search, dashboard, accessibility, power-user gaps |
| [navigation.md](07-ux/navigation.md) | Navigation redesign — tab bar, modal sheets, gestures, keyboard shortcuts |
| [missing_screens.md](07-ux/missing_screens.md) | 20 missing screens and features ranked P0–P3 |
| [user_journeys.md](07-ux/user_journeys.md) | 7 user journey maps with friction hotspots and proposed improvements |

## 08 · Performance
| Document | Description |
|----------|-------------|
| [render-audit.md](08-performance/render-audit.md) | Unnecessary re-renders and memo opportunities |
| [db-performance.md](08-performance/db-performance.md) | Query performance and indexing review |
| [bundle-size.md](08-performance/bundle-size.md) | JS bundle and asset weight |
| [ocr-latency.md](08-performance/ocr-latency.md) | OCR pipeline latency breakdown |

## 09 · Roadmap
| Document | Description |
|----------|-------------|
| [priorities.md](09-roadmap/priorities.md) | Ranked list of improvements by impact vs effort |
| [quick-wins.md](09-roadmap/quick-wins.md) | Changes that are small but high-value |
| [major-initiatives.md](09-roadmap/major-initiatives.md) | Larger refactors or new capabilities |
| [android-plan.md](09-roadmap/android-plan.md) | Plan for Android build and release |

## 10 · Final
| Document | Description |
|----------|-------------|
| [audit-summary.md](10-final/audit-summary.md) | Executive summary of the full audit |
| [recommendations.md](10-final/recommendations.md) | Consolidated, prioritized recommendations |
| [decisions-log.md](10-final/decisions-log.md) | Key architectural and product decisions made during audit |
