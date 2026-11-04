# Good experiment practice in N1 Lab

_What makes a self-experiment trustworthy, and what that means for the app. Written
2026-11-04, revised the same day around the principle **automatic first, input optional**.
CLAUDE.md points here; read this before changing a protocol, a wizard gate or the
statistics._

## 0. The governing constraint

Users will not fill in a diary every day. Assume the worst case for every design
decision: **a first-time user, no surveys answered, nothing but their Oura history and the
one adherence signal.** Everything that improves rigor must work in that case. Surveys and
diaries are optional extras that can *raise* confidence, never requirements the analysis
depends on.

## 1. The honest starting point

A person's life is not a laboratory. Work stress, season, illness, travel, alcohol,
training load: all of it moves sleep and HRV, and none of it holds still for weeks. We
cannot isolate caffeine perfectly, and neither can a clinic. The useful question is:

> How do we design and analyse the experiment so that **it is unlikely that something other
> than the behaviour explains the result**, and so that **when something else probably
> does, the app says so instead of claiming an effect?**

Three levers, all of them available without user input:

1. **Design** so that confounders cannot line up with the condition (reversal, crossover,
   run-in after every switch).
2. **Measure** confounders from the ring itself, exclude or adjust for them, and check that
   they were balanced between conditions.
3. **Report** with calibrated confidence from the person's own noise, and treat one
   experiment as evidence, not proof. Replication is the real answer.

## 2. How a researcher tests caffeine → sleep in one person

The clinical gold standard is the **randomised, blinded, multiple-crossover N-of-1 trial**:
caffeine or placebo capsules, switched several times in random order, a discarded run-in
after every switch, a pre-registered primary outcome, covariates recorded, analysis that
respects autocorrelation, and a repeat of the whole trial later. Blinding is impossible with
coffee, which is why N1 Lab uses **objective ring outcomes only**, never "how did you
sleep?". Every other element translates, and most of it needs no input.

## 3. Lever 1: design (zero input)

- **Default design: one block.** Run-in, then a set intervention length, then an optional
  washout (owner decision 2026-11-04: most users will not alternate on/off blocks, and the
  exact protocol settings are to be decided later). **Crossover is an option**, offered
  for behaviours with short carry-over: on / off / on / off in blocks of about two weeks,
  order randomised, the first 5–7 days after every switch excluded as run-in. It is the
  strongest zero-input defence against slow confounders, so the report should state which
  design was used and tier the verdict accordingly.
- **Reversal (ABA) is the minimum** for reversible behaviours. The washout phase is not
  decoration: the metric is expected to return towards baseline, and that return is
  reported as evidence.
- **Run-in after every switch**, not only at the start. Withdrawal and adaptation are
  excluded each time.
- **Block length must exceed carry-over time.** Caffeine: ≥ 10 days per block. Sauna:
  ≥ 10 days. Morning light: 1 week is enough.
- **One experiment at a time** and **one data source per metric** (both enforced) are the
  same principle: nothing else is allowed to change.

## 4. Lever 2: measure confounders automatically

The ring sees more of the confounders than we have used so far. Pull them, store them as
readings or flags, and use them in three ways: exclude extreme days, adjust in the model,
and check balance between conditions.

| Confounder | Automatic signal (Oura API v2) | Use |
|---|---|---|
| Illness | temperature deviation spike, raised resting HR, raised respiratory rate, HRV drop together (daily_readiness, sleep) | Auto-flag `illness`; exclude those nights |
| Travel / jet lag | time zone offset in sleep record timestamps changes; bedtime shift > 2 h | Auto-flag `travel`; exclude |
| Daytime stress | `daily_stress` endpoint (stress_high, recovery_high minutes) — **requires the `stress` scope, not yet requested** | Covariate: adjust and balance-check |
| Training load | daily_activity (active calories, high-activity minutes), workouts | Covariate |
| Sleep regularity | bedtime_start variance from sleep records | Covariate; also a baseline-cleanliness signal |
| Alcohol, late meals, sickness | Oura app tags (`tag` scope, already requested) when the user tags there | Flags, free when present |
| Late nights, social jet lag | bedtime_start vs personal norm | Covariate / flag |
| Menstrual cycle | Oura cycle insights where tracked | Later |
| Season | the calendar | Already modelled as local trend; crossover makes it harmless |

The first-experiment user gives none of this and still gets most of the table.

## 5. Lever 3: analysis calibrated on the person's own data

1. **Pre-registered primary outcome** with direction; secondaries exploratory.
2. **Trend + weekday adjustment** (current), extended with the automatic covariates above.
3. **Placebo start dates.** Re-run the whole analysis pretending the experiment started on
   many other days inside the baseline, and report how often a fake start produces an
   effect as large as the real one. This is an empirical p-value that inherits the person's
   own autocorrelation and noise without modelling either. The most honest single number
   we can show.
4. **Reversal check** for ABA and every "off" block in a crossover.
5. **Mechanistic signature.** Caffeine should lengthen sleep latency, raise early-night heart
   rate, increase awake time and cut efficiency *together*; all are in Oura's sleep
   records. The expected pattern moving together is stronger evidence than one metric
   alone, and one metric moving alone against the pattern is a warning. Each protocol
   declares its signature.
6. **Balance check**: baseline vs intervention on every automatic covariate and flag
   count. Any imbalance is printed next to the verdict and lowers the tier.
7. **Minimal important difference** per metric, fixed in advance, and the **minimal
   detectable effect** for the chosen length shown on the duration step.
8. **Autocorrelation-aware uncertainty** (block bootstrap) so bands are not too narrow.
9. **Verdict tiers**, always with the reason:
   - **Strong**: crossover with reversal in each off block, clean baseline, covariates
     balanced, placebo-date probability small.
   - **Moderate**: ABA with reversal, or AB with clean baseline and balanced covariates.
   - **Weak**: any imbalance, dirty baseline, missing reversal, adherence < 70 %.
10. **Replication prompt** after any non-weak result: repeat in another season. Two
    agreeing trials are the standard; one is a hint.

## 6. A baseline that proves its own cleanliness

We cannot know about a new job. We can test whether the 4–8 week window is **typical of
this person**, entirely from data:

| Check | Signal | If it fails |
|---|---|---|
| Coverage | ≥ 85–90 % nights for the primary metric | Shorten window; else prospective baseline |
| Flagged nights | ≤ 3 auto-flagged (illness/travel) in 8 weeks, ≤ 2 in 4 | Shorten to exclude; else wait |
| No overlap | Not inside an earlier experiment's active phases (enforced) | Shift start |
| Representativeness | Window mean within ~0.5 SD of the long-term model, variance not inflated, no strong trend | Prospective baseline |
| No hidden life change | No change-point in the preceding months in resting HR level, bedtime regularity, activity level, sleep duration | Start the window after the change-point, or wait |
| Season | Whole plan inside one season, or crossover design | Prefer crossover; warn |

**Prospective baseline** is the universal fallback: keep wearing the ring for two more
weeks, change nothing, then start. Waiting is a feature. An optional pre-start checklist
(medication, job, moving, another habit) can tighten this further for users willing to
answer, but the gate must work without it.

## 7. Adherence: the one input that stays, made as light as possible

- **Exception reporting**: assume the protocol was followed; one button for "I broke it
  today"; one weekly confirmation ("all good this week?"). Silence means yes.
- Weeks without a confirmation count as adhered but lower the tier one notch, which is
  stated in the report.
- Per-protocol vs as-planned estimates remain side by side.
- Optional, never required: a note, a stress rating, tags. Any such answer is stored as a
  flag or covariate and improves the balance check.

## 8. What this means for the app, in priority order

| # | Feature | Why | Status |
|---|---|---|---|
| 1 | **Oura: add the `stress` scope; import daily_stress, sleep latency, awake time, average sleep HR, bedtime_start, respiratory rate, time zone offset** | Raw material for every automatic confounder and signature check | **Done 2026-11-04** |
| 2 | **Automatic flags**: illness (temperature + HR + respiratory rate + HRV), travel (time zone offset / bedtime shift) | Exclusion without a diary | **Done 2026-11-04** (thresholds in `_shared/flags.ts`, to be tuned on real data) |
| 3 | **Crossover design** as an optional alternative with randomised blocks and run-in after every switch (not the default) | Strongest zero-input defence against slow confounders, for users who accept it | Planned (phase builder + wizard + estimator per block) |
| 4 | **Balance check + verdict tiers** in the report | "Stress was higher during the intervention" instead of a green badge | Planned |
| 5 | **Placebo start-date test** | Calibrated probability from the person's own noise | Planned (pure function in stats.ts) |
| 6 | **Baseline representativeness + change-point gate**, prospective-baseline fallback | Clean baseline without questions | Partly (coverage/flags/overlap exist) |
| 7 | **Reversal check line** and **mechanistic signature per protocol** | Makes washout and secondaries earn their keep | Planned |
| 8 | **Exception-only adherence** with weekly confirmation | Realistic input burden | Planned (replaces daily yes/no as the default UI) |
| 9 | **Minimal detectable effect** on the duration step | Stops under-powered experiments before they start | Planned |
| 10 | **Autocorrelation-aware uncertainty** (block bootstrap) | Current bands are too narrow | Planned |
| 11 | Optional pre-start checklist, optional stress rating / notes | Raise confidence for users who want to | Later, always optional |
| 12 | Blinded preliminary results; replication prompt and combining two trials | Expectation control; the real test | Later |
| 13 | **Design chooser with validity ranking** (owner's idea, 2026-11-04, not scheduled): offer the ways a protocol can be run (one block; one block + washout; crossover; rotating/alternating blocks) and give each a validity score computed from the protocol's carry-over time, the user's data (noise, coverage, autocorrelation), the chosen length and the expected minimal effect, then rank them best to worst with the burden of each spelled out | Lets the user trade rigor for convenience with eyes open; the score also feeds the verdict tier | Idea only |

Already in place: objective outcomes only, one experiment at a time, one source per
metric, run-in phases, 4–8 week retrospective baseline, overlap check against earlier
experiments, trend + weekday adjustment, per-protocol vs as-planned, washout designs,
flagged-day exclusion.

## 9. Writing for the user

Every result screen must pass this test: a sceptical friend reads it and cannot say "but
that could just be X" without the screen having already mentioned X. Use "consistent with",
"likely", "cannot be distinguished from", never "proves". Show the number of nights, the
uncertainty band, the balance check and the tier together, always. When the honest answer
is "we cannot tell", say that in those words.
