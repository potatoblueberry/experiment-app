# Good experiment practice in N1 Lab

_What makes a self-experiment trustworthy, and what that means for the app. Written
2026-11-04. This is the reference for every protocol and analysis decision; CLAUDE.md
points here._

## 1. The honest starting point

A person's life is not a laboratory. Work stress, season, illness, travel, alcohol,
training load, a new mattress: all of it moves sleep and HRV, and none of it holds still
for six weeks. So the question is never "can we isolate caffeine perfectly?" The answer to
that is no. The useful question is:

> How do we design and analyse the experiment so that **it is unlikely that something other
> than the behaviour explains the result**, and so that **when something else probably
> does, the app says so instead of claiming an effect?**

Three levers exist, and the app needs all three:

1. **Design** so that confounders cannot line up with the phases (randomisation,
   reversal, repetition).
2. **Measure** the confounders we cannot control, then exclude or adjust for them, and
   check whether they were balanced between phases.
3. **Report** with calibrated confidence, and treat one experiment as evidence, not proof.
   Replication is the real answer to "was it the caffeine?"

## 2. How a researcher would test caffeine → sleep in one person

The gold standard for one person is the **randomised, blinded, multiple-crossover N-of-1
trial**, the design used in clinical N-of-1 medicine:

- **Blinding**: identical capsules, caffeine or placebo, prepared by someone else. Removes
  expectation effects. We cannot do this in an app with coffee, so expectation stays as a
  known weakness; it is why N1 Lab uses **objective outcomes only** (ring data), never "how
  did you sleep?".
- **Multiple crossovers**: not one block of "off", but several alternations, for example
  on/off/on/off in blocks of 1–2 weeks, with the order randomised. This is the single most
  powerful defence against slow-moving confounders such as a stressful month: if caffeine
  status flips several times while stress drifts slowly, the two cannot stay correlated.
- **Run-in and washout at every switch**: caffeine withdrawal lasts about a week and
  tolerance rebuilds in days, so the first days after each switch are discarded. This is
  why block lengths must exceed the carry-over time.
- **Pre-registration**: primary outcome, expected direction, duration, and the analysis are
  fixed before the first day. No peeking, no changing the outcome once the data is in.
- **Covariate diary**: alcohol, late exercise, illness, travel, unusual stress, late meals,
  sleep aids: recorded daily so they can be excluded or adjusted for, and so the two
  conditions can be compared on them afterwards.
- **Analysis** that respects the data: a within-person model with period effects,
  weekday effects and autocorrelation, and a **minimal important difference** decided in
  advance (e.g. "+15 minutes of sleep or +3 ms HRV is worth knowing about"). Effects below
  it are reported as "too small to matter even if real".
- **Replication**: the same person repeats the trial months later. Two agreeing trials
  in different seasons are far stronger than one long one.

Everything below is the app's translation of that list.

## 3. The stress problem, concretely

"They had a stressful month at work while testing caffeine." Four defences, in order of
strength:

1. **Reversal and crossover designs.** With ABA, the washout shows whether sleep returns to
   baseline when caffeine returns. With ABAB blocks, stress would have to flip in time with
   the blocks to fake an effect. The app should prefer ABA by default and offer ABAB for
   behaviours with short carry-over.
2. **Measure stress.** A one-tap daily stress rating (1–5) in the check-in costs five
   seconds. With it we can (a) **check balance**: was mean stress during the intervention
   different from baseline? If yes, say so prominently; (b) **adjust**: include stress as a
   covariate in the trend model; (c) **flag** very high-stress days like illness days.
3. **Exclude extreme days** rather than pretend they are normal: illness, travel, alcohol,
   a night shift, a sick child. Flags already exist in the data model.
4. **Downgrade the verdict** when the comparison is unbalanced. "Likely effect, but stress
   was higher during the intervention; this may explain part or all of it" is the correct
   output, not a green badge.

## 4. A clean baseline

The baseline phase (4–8 weeks before the start) must represent the person's **normal life
right now**. It is clean when:

| Check | Rule | What to do if it fails |
|---|---|---|
| Coverage | ≥ 85–90 % of nights recorded for the primary metric | Shorten the window to the covered part, or ask for 2 more weeks of wearing the ring |
| Flagged days | ≤ 3 illness/travel days in 8 weeks, ≤ 2 in 4 weeks | Shorten the window to exclude them, or wait |
| No overlap | Not inside an earlier experiment's intervention or washout | Already enforced (`findBaselineContamination`) |
| Stability | No strong trend (e.g. HRV drifting > 1 SD over the window) and no variance explosion compared with the person's long-term model | Wait until stable, or warn that the trend model will carry more uncertainty |
| No life change | No change in medication, job, schedule, training block, diet, or another habit started in that window | Ask the user; if yes, shorten to after the change or wait |
| Season sanity | Ideally the whole experiment sits inside one season | Prefer ABA; warn if the plan crosses a season boundary |

The last two cannot be read from the data. They need a **short pre-start checklist** in
the wizard ("In the last 6 weeks, did any of these happen?") whose answers set flags or
shorten the window. A **prospective baseline** (keep wearing the ring for two more weeks
before starting, changing nothing) is the fallback whenever the retrospective window is not
clean. Waiting is a feature, not a failure.

## 5. Keeping everything else constant during the experiment

The user cannot freeze life, but they can commit to not **adding** changes:

- **Hold-constant pledge at start**: no new supplements, habits, diets or training blocks
  for the duration; keep the usual bedtime window; keep wearing the ring every night.
- **Weekly "did anything change?" prompt**: one question, with free text. Answers become
  flags or, for big changes (new medication, moved house), a recommendation to stop and
  restart later.
- **One experiment at a time** (already enforced) is the same principle.
- **Same device, same settings**: a metric comes from exactly one source for the whole
  experiment (already enforced); switching rings mid-trial invalidates it.

## 6. Analysis rules

1. **Pre-registered primary outcome** with a direction; secondaries are exploratory and
   reported with a visible "grain of salt".
2. **Model**: baseline trend + weekday pattern projected into the intervention, step effect
   estimated as the mean gap (current). Next steps: add measured covariates (stress,
   alcohol), account for **autocorrelation** (night-to-night readings are not independent,
   so the effective sample size is smaller than the day count; uncertainty bands must widen
   accordingly), and use robust statistics against outlier nights.
3. **Minimal important difference per metric**, decided in advance and shown on the
   duration step together with the **minimal detectable effect** for the chosen length.
   If the length cannot detect a meaningful effect, say so before the start.
4. **Per-protocol and as-planned** estimates side by side (current). A large gap means
   adherence, not the behaviour, is the story.
5. **Balance check**: for every flag and covariate, compare baseline vs intervention
   (counts and means). Any imbalance appears in the report next to the verdict.
6. **Reversal check** for ABA: did the metric move back during washout? Report it as its own
   line; an effect that does not reverse is suspicious for a reversible behaviour.
7. **Verdict tiers** rather than one badge:
   - **Strong**: crossover or ABA with reversal, clean baseline, covariates balanced.
   - **Moderate**: AB or ABA without clear reversal, baseline clean, covariates balanced.
   - **Weak**: any imbalance, dirty baseline, or adherence < 70 %.
   The tier is printed with the reason.
8. **Replication prompt**: after a "strong" or "moderate" result, suggest repeating the
   experiment in a different season. Two trials are the standard of evidence; one is a hint.

## 7. What this means for the app, in priority order

| # | Feature | Why | Status |
|---|---|---|---|
| 1 | **Daily context in the check-in**: stress 1–5, alcohol yes/no, illness, travel, unusual day (free text) | Turns the biggest confounders into data we can exclude, adjust and balance-check | Planned |
| 2 | **Baseline cleanliness gate** in the wizard: coverage, flags, stability, pre-start checklist; offer a prospective 2-week baseline when it fails | Garbage baseline, garbage result | Partly (coverage/flags/overlap); checklist and stability missing |
| 3 | **Balance check and verdict tiers** in the report | Says "stress was higher" instead of a misleading green badge | Planned |
| 4 | **Reversal check line** for ABA | Makes washout earn its keep | Planned |
| 5 | **Crossover design option (ABAB)** with run-in after every switch, for short carry-over behaviours | Strongest defence against slow confounders | Planned; needs block randomisation UI and phase builder support |
| 6 | **Hold-constant pledge + weekly change prompt** | Prevents the user from adding confounders | Planned |
| 7 | **Minimal detectable effect** on the duration step, per metric, from the personal SD | Stops under-powered experiments before they start | Planned |
| 8 | **Autocorrelation-aware uncertainty** and robust estimates | Current bands are too narrow for autocorrelated nights | Planned |
| 9 | **Blinded preliminary results** option (hide the verdict until the end) | Reduces expectation and behaviour drift | Later |
| 10 | **Replication prompt** and combining two trials | The real test | Later |
| 11 | **Automatic flags** from the ring: illness from temperature deviation, travel from time zone | Less diary burden | Later (Oura session roadmap item) |

Already in place: objective outcomes only, one experiment at a time, run-in phases,
retrospective baseline limited to 4–8 weeks, overlap check against earlier experiments,
trend + weekday adjustment, per-protocol vs as-planned, washout designs, flagged-day
exclusion.

## 8. Writing for the user

Every result screen should pass this test: a sceptical friend reads it and cannot say "but
that could just be X" without the screen having already mentioned X. Use "consistent with",
"likely", "cannot be distinguished from", never "proves". Show the number of nights, the
uncertainty band, the balance check and the tier together, always.
