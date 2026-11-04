# N1 Lab

Mobile-first app that guides a person through scientifically rigorous self-experiments
(N-of-1 trials) using their wearable data. The owner is a beginner developer on Windows:
explain what you are doing in plain terms as you go, and say what you install and why.

## Product vision

1. **Connect wearables** (Oura first, later Health Connect and Terra). The app builds a
   *personal baseline model* from as much history as it can pull (a year or more): typical
   values, night-to-night variability, weekday pattern, long-term trend per metric.
2. **Design an experiment** with a wizard: behaviour change (presets + free text) → how
   adherence is tracked (daily yes/no for now) → proposed outcome metrics the user confirms
   → duration → review → Start. Starting builds a proper N-of-1 structure: a *baseline
   phase* taken from existing data, an *intervention phase*, and optionally a *washout*.
3. **Daily loop** (the heart of the app): reminder, "did you do it today?" yes/no, optional
   journal note. Past days stay editable.
4. **Several experiments at once** are allowed; the app flags confounds (overlapping dates
   with shared outcome metrics).
5. **Honest report** at the end: effect vs. baseline, adjusted for trend and day-of-week,
   with an uncertainty band.

### Two different "baselines" (important design decision)

- The **personal baseline model** (`src/domain/stats.ts`, `buildBaselineModel`) uses *all*
  history. It drives variability estimates, weekday correction, trend detection and the
  duration recommendation.
- The **baseline phase of an experiment** is the 4–8 week comparison window right before
  the intervention (`recommendBaselineDays` in `src/domain/phases.ts`): 8 weeks when the
  data is clean (≥ 90 % coverage, ≤ 3 flagged days), otherwise 6 or 4. Reaching further
  back would compare against a different life (season, job, illness), so it stays short.
- Seasonality cannot be estimated from one person-year, so the app defends against it by
  (a) modelling a slow local trend and testing for a *step* at the start date,
  (b) encouraging washout/reversal designs, and (c) flagging illness/travel days.

## Stack

- Expo SDK 58, React Native 0.88, React 19, TypeScript 6, **Expo Router** (file-based routes).
- `@react-native-async-storage/async-storage` for local persistence (localStorage on web).
- `react-native-svg` + `d3-shape` + `d3-scale` for hand-drawn charts (no chart library; it
  keeps full control and works identically on web and native).
- `date-fns` for date math, `expo-crypto` for UUIDs, `@expo/vector-icons` (Ionicons).
- Planned, not wired yet: Supabase (Postgres, Auth, Edge Functions), Oura API v2 OAuth2,
  Health Connect, Terra, push reminders.

## Running the app

```bash
npm install            # once
npm run web            # = npx expo start --web, opens http://localhost:8081
npm run typecheck      # tsc --noEmit
npm run lint           # eslint (eslint-config-expo, flat config in eslint.config.js)
npm test               # jest (jest-expo preset), unit tests live in __tests__ folders
npx expo start --clear # if Metro cache misbehaves

Run typecheck, lint and tests before declaring work done. All three pass as of 2026-11-04.
```

Browser preview renders inside a phone-width frame (`PhoneFrame`) so the layout stays
honest about mobile sizing. No phone, account or backend is needed. "Reset demo data" at
the bottom of Home wipes local storage and re-seeds.

## Project structure

```
src/app/                    screens; one file = one route (Expo Router)
  _layout.tsx               providers + PhoneFrame + root Stack
  (tabs)/                   Home (index), trends, checkin, experiments
  experiment/new.tsx        5-step wizard
  experiment/[id].tsx       detail: timeline, adherence calendar, outcome charts, effect
src/domain/                 pure TypeScript, no React, no storage
  types.ts                  data model mirroring future DB tables
  metrics.ts                metric catalog + formatting
  behaviors.ts              presets + suggested outcome metrics
  phases.ts                 phase builder, baseline-window recommendation, duration copy
  stats.ts                  rolling mean, baseline model, effect estimate, confounds
src/data/
  repository.ts             the Repository interface — the ONLY door to data
  LocalMockRepository.ts    AsyncStorage implementation, seeds a year of fake Oura data
  seed/generateReadings.ts  deterministic generator (seasonal wave, trend, weekday,
                            shared recovery noise, illness/travel episodes with flags,
                            fake effects during preset-based interventions)
  RepositoryProvider.tsx    React context + useRepoQuery (invalidate() after mutations)
src/hooks/useData.ts        named hooks: useReadings, useActiveExperiments, …
src/components/ui/          Screen, Card, Button, Chip, SegmentedControl, Badge, Stat…
src/components/charts/      MetricLineChart (hover/drag readout, bands, markers, flagged
                            days), AdherenceCalendar, PhaseTimeline, WeekdayBars
src/components/experiments/ SourceCard, ExperimentCard, CheckInCard, EffectSummary
src/theme/                  colours, spacing, typography, phase colours
src/utils/dates.ts          'YYYY-MM-DD' helpers (never pass Date objects around)
src/**/__tests__/           jest unit tests (dates, stats, phases, seed generator, repository)
supabase/migrations/        0001_init.sql — schema + RLS, written but NOT applied yet
jest.setup.js               mocks AsyncStorage (in-memory) and expo-crypto for tests
```

## Data model (mirrors future Postgres tables)

| TS type                   | table                      | notes                                        |
|---------------------------|----------------------------|----------------------------------------------|
| `MetricDefinition`        | metric_definitions         | reference data, see `METRICS`                |
| `MetricReading`           | metric_readings            | UNIQUE (user_id, metric_id, date); `flags[]` |
| `Experiment`              | experiments                | `startDate` = first intervention day         |
| `ExperimentPhase`         | experiment_phases          | baseline / intervention / washout, ordered   |
| `ExperimentOutcomeMetric` | experiment_outcome_metrics | one `isPrimary`                              |
| `AdherenceLog`            | adherence_logs             | UNIQUE (experiment_id, date); upsert         |
| `DataSourceConnection`    | data_source_connections    |                                              |

TypeScript is camelCase; the database will be snake_case. The SupabaseRepository does the
mapping in one place. Every record already carries `userId` so row-level security is a
drop-in later.

## Conventions

- Screens never touch storage. Screen → hook → `Repository` → implementation.
- Dates are `ISODate` strings in local time. One reading per metric per calendar day
  (Oura semantics: the night ending on that morning belongs to that day).
- Statistics live in `src/domain/stats.ts` as pure functions so they can move to a server
  function unchanged. Flagged days (illness, travel) are excluded from baseline stats and
  effect estimates. `estimateEffect` takes `{ upTo, onlyInterventionDates }`; the detail
  screen shows both the as-planned estimate and a per-protocol one (adhered days only).
- Hooks: `useRepoQuery` keys a request by `JSON.stringify([version, tick, ...deps])`, keeps
  previous data while refetching, and never sets state synchronously inside an effect
  (the React Compiler lint rules in eslint-config-expo enforce this). Prefer the
  "adjust state while rendering" pattern over effects that sync props to state.
- Design tokens come from `src/theme`; no hard-coded colours in components.
- No `Alert.alert` for confirmations (does not work well on web); use inline confirm UI.
- Run `npm run typecheck` before finishing a task. Use `npx expo install <pkg>` for any
  package that touches Expo/React Native so versions match the SDK.
- Git: branch `main`, remote `origin` = https://github.com/potatoblueberry/experiment-app. Commit and push only when asked.

## Later sessions (roadmap)

1. **Supabase wiring**: apply `supabase/migrations/0001_init.sql` (tables, enums, RLS),
   add a service-role-only token table in 0002, write `SupabaseRepository implements
   Repository` (camelCase ↔ snake_case mapping in one place), swap it in
   `RepositoryProvider`. Keep `LocalMockRepository` for demo mode and tests.
2. **Oura OAuth2** (API v2): Edge Function handles the OAuth code exchange and token
   refresh; store tokens server-side only. Initial backfill pulls as much history as the
   account has (daily_sleep, daily_readiness, daily_activity, heartrate/HRV summaries,
   temperature deviation), then a scheduled incremental sync.
3. **Real sync + flags**: detect illness (temperature deviation spike) and travel
   automatically and set `MetricReading.flags`; let the user mark/unmark days.
4. **Push reminders**: `expo-notifications`, one evening reminder per day while any
   experiment is in intervention/washout; deep-link into the Check-in tab.
5. **Report v2**: replace the simple trend+weekday model in `estimateEffect` with a
   Bayesian or mixed model, add adherence-aware analysis (per-protocol vs. as-planned),
   and export/share a report.
6. Health Connect (Android) and Terra as additional `DataSourceProvider`s.
