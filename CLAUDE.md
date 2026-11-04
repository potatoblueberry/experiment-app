# N1 Lab

Mobile-first app that guides a person through scientifically rigorous self-experiments
(N-of-1 trials) using their wearable data. The owner is a beginner developer on Windows:
explain what you are doing in plain terms as you go, and say what you install and why.

## Product vision

1. **Connect wearables** (Oura first, later Health Connect and Terra). The app builds a
   *personal baseline model* from as much history as it can pull (a year or more): typical
   values, night-to-night variability, weekday pattern, long-term trend per metric.
2. **Design an experiment** from a **curated protocol** (decision 2026-11-04: the app sets
   the scientific boundaries, the user chooses within them; no free-form behaviours).
   A protocol (`src/domain/behaviors.ts`) fixes: an optional **run-in** (adaptation /
   withdrawal days that are logged but not counted, e.g. 7 days for caffeine), a
   **minimum length** in weeks, a **washout rule** (required / recommended / optional) and
   the **primary outcome**. The user picks the length at or above the minimum, secondary
   metrics, the start date, and washout unless required. Phases: *baseline* (from existing
   data) → *run-in* (optional) → *intervention* → *washout* (optional). `startDate` is the
   first behaviour day (run-in start if any). In the outcomes step every metric shows the
   one connected source it will come from (`metricProvider` in `src/domain/metrics.ts`);
   metrics without a source cannot be chosen and the experiment cannot start if the
   primary has none.
3. **Daily loop** (the heart of the app): reminder, "did you do it today?" yes/no, optional
   journal note. Past days stay editable.
4. **One experiment at a time** (decision 2026-11-04). The app exists to attribute a change
   in the data to one behaviour, so a second active experiment is refused by the wizard,
   both repositories (`ActiveExperimentExistsError` in `src/domain/rules.ts`) and the
   database (partial unique index, migration 0002). During an experiment the app focuses
   on keeping the user on protocol and on that experiment's data. The remaining overlap
   risk, a comparison window that reaches back into an earlier experiment's intervention
   or washout, is flagged on the review step (`findBaselineContamination`).
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
- **Supabase** (`@supabase/supabase-js`): Postgres + Auth. Client in `src/lib/supabase.ts`,
  keys from `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, see
  `.env.example`). Without keys the app silently runs in demo mode. The Supabase CLI is a
  dev dependency (`npx supabase ...`), config in `supabase/config.toml`.
- **Oura API v2** via three Edge Functions (Deno) in `supabase/functions/`: `oura-connect`
  (returns the authorize URL, stores a single-use state row), `oura-callback` (code → tokens,
  server-side only), `oura-sync` (pulls sleep / daily_readiness / daily_activity, upserts
  `metric_readings`). Secrets `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET` live only in
  Supabase (`npx supabase secrets set ...`). Scopes: daily heartrate tag.
- Planned, not wired yet: Health Connect, Terra, push reminders.

## Running the app

```bash
npm install            # once
npm run web            # = npx expo start --web, opens http://localhost:8081
npm run typecheck      # tsc --noEmit
npm run lint           # eslint (eslint-config-expo, flat config in eslint.config.js)
npm test               # jest (jest-expo preset), unit tests live in __tests__ folders
npx expo start --clear # if Metro cache misbehaves

# Supabase (one-time per machine; the first two prompt interactively, run them in a terminal)
npx supabase login
npx supabase link --project-ref cwayywolbegqsfepkfux
npx supabase db push --remote   # applies supabase/migrations/*.sql not yet applied to the hosted project
npx supabase functions deploy --use-api --remote=cwayywolbegqsfepkfux        # all Edge Functions
npx supabase secrets set --remote=cwayywolbegqsfepkfux OURA_CLIENT_ID=... OURA_CLIENT_SECRET=...
# Hosted changes ask for confirmation; the CLI refuses to answer it in an agent run, so the
# owner runs these three in a terminal (or re-runs with --yes after agreeing).

The Deno code under `supabase/functions/` is excluded from the app's tsc and eslint runs
(different runtime); `_shared/mapReadings.ts` has no imports so Jest tests it directly.
Run typecheck, lint and tests before declaring work done. All three pass as of 2026-11-04.
```

Browser preview renders inside a phone-width frame (`PhoneFrame`) so the layout stays
honest about mobile sizing. Two data modes, chosen in `src/app/_layout.tsx` from the auth
state: **demo** (LocalMockRepository, fake data on the device, no account needed) and
**signed in** (SupabaseRepository, the user's own rows). "Reset demo data" on Home re-seeds
the local store; in a signed-in account the same button becomes "Load demo data into my
account" (deletes the account's rows, inserts the demo set) so the real backend can be
exercised before Oura is connected. `.env` changes need a dev-server restart.

## Project structure

```
src/app/                    screens; one file = one route (Expo Router)
  _layout.tsx               AuthProvider -> picks repository -> PhoneFrame + guarded Stack
  sign-in.tsx               e-mail/password sign in, create account, or continue in demo mode
  (tabs)/                   Home (index), trends, checkin, experiments
  experiment/new.tsx        5-step wizard
  experiment/[id].tsx       detail: timeline, adherence calendar, outcome charts, effect
src/domain/                 pure TypeScript, no React, no storage
  types.ts                  data model mirroring future DB tables
  metrics.ts                metric catalog, formatting, provider→metric map (metricProvider)
  behaviors.ts              curated protocols (run-in, min weeks, washout rule, metrics)
  phases.ts                 phase builder, baseline-window recommendation, duration copy
  stats.ts                  rolling mean, baseline model, effect estimate, baseline contamination
  rules.ts                  product rules shared by UI and repositories (one active experiment)
src/auth/AuthProvider.tsx   session state: loading | signed_out | signed_in | demo
src/lib/supabase.ts         the Supabase client (null when .env has no keys)
src/lib/oura.ts             startOuraConnect() / syncOura() -> Edge Functions
src/components/sources/     OuraPanel: connect, sync now, first import after ?oura=connected
supabase/functions/         Deno Edge Functions: _shared (oura.ts, mapReadings.ts),
                            oura-connect, oura-callback, oura-sync
src/data/
  repository.ts             the Repository interface — the ONLY door to data
  LocalMockRepository.ts    AsyncStorage implementation, seeds the demo set on first run
  SupabaseRepository.ts     Postgres implementation (paginates reads, chunks inserts)
  supabase/mappers.ts       the ONLY place rows (snake_case) meet domain types (camelCase)
  seed/demoSeed.ts          the demo data set as plain objects, shared by both repositories
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
supabase/migrations/        timestamped SQL files applied with `npx supabase db push`
supabase/config.toml        Supabase CLI config (local stack settings; we use the hosted project)
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

TypeScript is camelCase; the database is snake_case; `src/data/supabase/mappers.ts` is the
only translation point. Every row carries `user_id` (or reaches it through
`experiments`), and row-level security limits every query to `auth.uid()`.

## Conventions

- Screens never touch storage. Screen → hook → `Repository` → implementation. Screens
  must work identically on both implementations; test new features in demo mode first.
- Secrets never enter the repo or the chat: the anon key is public by design and lives in
  `.env` (git-ignored); the Oura client secret and the service-role key live only in the
  Supabase dashboard (Edge Function secrets). Schema changes are new files in
  `supabase/migrations/`, never edits to applied ones.
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

1. **Supabase wiring** (project ref `cwayywolbegqsfepkfux`, EU region, created 2026-11-04;
   Oura redirect URI = `https://cwayywolbegqsfepkfux.supabase.co/functions/v1/oura-callback`).
   Done 2026-11-04: SupabaseRepository, mappers, AuthProvider, sign-in screen, demo-data
   loader. First migration applied and the whole app verified against the live project
   on 2026-11-04 (sign-up, demo loader, check-in upsert, wizard create, sign-out).
   E-mail confirmation is OFF in the project's auth settings for development; turn it on
   before anyone else uses the app. A throwaway test user (tester@n1lab.test) exists; its
   password is in the owner's local `.env`, never in the repo. Remaining: the
   service-role-only token table in the next migration.
2. **Oura OAuth2** (API v2; app registered 2026-11-04 with scopes daily, heartrate, tag).
   Built 2026-11-04: migration 0003 (`oura_tokens`, `oauth_states`, sync columns), the three
   Edge Functions, OuraPanel in the app. Flow: Connect Oura → oura-connect → Oura login →
   oura-callback stores tokens and redirects to the app with `?oura=connected` → the app
   runs the sync. Each sync call does a forward window (7 days before `synced_through` →
   today) and then imports older 120-day chunks backwards within a 45 s budget, saving
   `synced_from` / `empty_streak` / `backfill_done` after every chunk (migration 0004,
   planning in `_shared/backfill.ts`). The app keeps calling while `backfillDone` is false,
   so any length of history imports in rounds; it stops after ~1 year of empty chunks or at
   15 years. Still to do: a scheduled nightly sync (pg_cron or a cron-triggered function),
   `heartrate` time series, Oura tags → `flags`.
3. **Real sync + flags**: detect illness (temperature deviation spike) and travel
   automatically and set `MetricReading.flags`; let the user mark/unmark days.
4. **Push reminders**: `expo-notifications`, one evening reminder per day while any
   experiment is in intervention/washout; deep-link into the Check-in tab.
5. **Report v2**: replace the simple trend+weekday model in `estimateEffect` with a
   Bayesian or mixed model, add adherence-aware analysis (per-protocol vs. as-planned),
   and export/share a report.
6. Health Connect (Android) and Terra as additional `DataSourceProvider`s.
7. **Option, not scheduled (owner's idea, 2026-11-04): bundled behaviour changes.** Let the
   wizard select several behaviours for one experiment, with a clear note that the result
   then describes the *combination*, never any single behaviour; to isolate one, run it
   alone later. Design sketch when the time comes: an `experiment_behaviors` table
   (experiment_id, preset_id nullable, title, description, order) backfilled from the
   current single fields; title = behaviours joined with " + "; suggested outcome metrics =
   union in order, primary from the first; washout recommended if any has carry-over;
   adherence stays one daily yes/no for the whole bundle ("did you do all of them?");
   fake demo effects sum per preset. The one-active-experiment rule is unchanged.
