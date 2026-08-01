# System Backlog

Improvements to *how we build*, not to any particular product. Sourced from a review of
`OPERATING-GUIDE.md` and `PRACTICAL-GUIDE.md` against current practice.

Separate from a product backlog on purpose: these compete for different time and have a different
payback shape. Product items ship features; these change the rate at which every future feature
ships.

**Already incorporated (not backlog):** a security/containment model and a measurement section —
the two gaps judged blocking. Both are now in `OPERATING-GUIDE.md` (Parts 4 and 5) with matching
steps in `PRACTICAL-GUIDE.md`.

---

## Significant

### Multi-person operation
Both guides assume one person and one agent. A team introduces problems the current text does not
address: who owns the agent memory file, how merge conflicts in it get resolved, how a new joiner
is onboarded, and how review holds up at volume. Industry guidance is to measure by actual
collaboration units rather than tool groupings, and that different team shapes need different
approaches — so this is not a single section but a variant of the whole guide.

*Trigger: anyone other than me starts contributing.*

### Name review as the bottleneck
The guides treat review as a step, not as the constraint. Evidence suggests AI-driven volume
substantially lengthens review time and inflates PR size, and that acceleration at the coding step
does nothing for a queue at the review step. "One session, one concern" helps by accident; the
guide should say plainly that review capacity is the limiting factor and prescribe how to protect
it — change-set size limits, review-first ordering, what to do when the queue grows.

*Trigger: reviewing starts to feel like the slow part.*

### Rules for tests when an agent writes them
"Get tests running" treats tests as neutral. They are not, when the thing writing them also wants
them to pass. Missing guidance on: tests asserting implementation rather than behaviour, tests that
pass trivially, and the worst case — a failing test edited until it passes. Needs explicit rules on
who may change a test, when, and how to recognise a suite that has become decorative.

*Trigger: before delegating test authorship broadly.*

### The quality lag
Both guides are entirely about the moment of change. AI-generated code often clears initial review
and produces maintenance burden 30–90 days later, which point-in-time delivery metrics miss
entirely. Part 5 flags the lag; it does not say what to *do* about it. Needs a practice — a
retro-review cadence, or a way to sample recent AI-heavy changes after they have aged.

*Trigger: the project is old enough to have a 90-day tail.*

---

## Worth doing

### Calibrate ROI expectations explicitly
The guides imply large wins. Measured end-to-end gains have stalled near 10% despite adoption above
90%, against marketed claims of 2–3x. Part 5 now says this, but a short standalone framing would
make the document more credible rather than less, and inoculate a reader against disappointment.

### Label evidence confidence
Some claims are studied (context degradation with input length, the productivity paradox). Most are
practitioner folklore with an eighteen-month shelf life. A serious reader wants to know which is
which. Cheap fix: mark claims as *measured*, *observed*, or *opinion*.

### Add proportionality tiers
There is one line about ceremony but no explicit tiering. A weekend project needs version control
and tests and nothing else. Without stated tiers, readers either over-apply the system or dismiss
it wholesale. Proposed: throwaway / solo real / shared / regulated.

### Separate durable principles from 2026 mechanics
File names, tool surfaces, and specific line limits will age within a year. The verification thesis
will not. Splitting the two — or marking the perishable parts — would extend shelf life
considerably. Relevant if the guide is published.

### Address skill atrophy
Raised directly by the spec-driven-development debate: if specifying replaces coding as the primary
activity, how do practitioners build the judgement that makes them good at specifying? Unaddressed
in both guides. Matters most when evaluating this for a team rather than for oneself.

---

## Open questions

- Should the guides live in the product repo, or in a shared system repo referenced by many
  projects? Duplication versus drift.
- Is there a lightweight way to actually measure churn on a solo project, short of adopting a
  metrics platform?
- What is the review cadence for the guides themselves? A stale operating guide has the same
  problem as a stale agent memory file.

---

## Parked: a reusable product-building system

The longer-term intent is a portable system — best practices, templates, and skills — that makes
starting a new project fast and can be adopted into existing ones. Deliberately **not** being built
yet: the practices here are drawn from one project that has not shipped, and abstractions extracted
from a single instance encode that instance's accidents as if they were principles.

*Trigger: after project two, extract what was actually reached for — that list will be shorter and
different than what would be guessed today.*

**Distribution decision, when the time comes.** Cross-project reuse and zero drift are in tension,
and the choice is between mechanisms, not file formats:

| Approach | Drift |
|---|---|
| Skills committed to a project repo (`.claude/skills/`) | None — git is the sync. But scoped to that one repo. |
| Plugin from a versioned marketplace | Detectable and fixable in one step, but requires running the update. |
| Copied files | Invisible. No source of truth, no way to know you're stale. |

While there is one project, committed project skills are strictly better — no drift, no
distribution machinery. The plugin question only becomes worth answering when there are two or
three projects and the copying pain is real.
