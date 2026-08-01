# Operating Guide: Building Products with Coding Agents

A working reference for how to run product development when an agent writes most of the code.
Written to be portable — the principles apply to any project, the examples happen to come from a
card-game scorekeeper.

**The one-sentence version:** generating code got cheap, verifying intent did not, and every
practice in this guide is a consequence of that asymmetry.

---

## Part 1 — What actually changed

Before agents, the bottleneck was typing. Producing a working feature took hours of implementation,
so the expensive step was writing it and the cheap step was deciding what to write.

That inverted. An agent produces a plausible implementation in minutes. The expensive step is now
**knowing whether what came back is what you meant**, and that cost didn't fall at all — it rose,
because output arrives faster than you can review it and reads more confidently than it deserves.

Three consequences follow, and everything else in this guide descends from them:

1. **Ambiguity you don't resolve upstream gets resolved by the agent, silently, in your code.**
   It will pick something reasonable and never tell you it chose.
2. **Fluency is not correctness.** A confident explanation and a passing test suite can both
   accompany broken output. Neither is evidence.
3. **Volume outpaces review.** When changes are nearly free to generate, the constraint becomes
   your ability to check them — so work has to arrive in reviewable units.

> **A real example, from this project.** A CSS fix for a landscape layout was reasoned through
> carefully, shipped with passing tests, and clipped content on the actual phone. The reasoning was
> fluent. The tests passed. The output was wrong. Nothing short of running it on a device would
> have caught it.

Hold onto that: **the practices below exist to convert confidence into evidence.** Any practice
that doesn't end in something checkable is ceremony.

---

## Part 2 — The four artifacts

A healthy project maintains four kinds of durable artifact. They have different lifecycles, and
mixing them is the most common cause of documentation rot.

| Artifact | Answers | Lifecycle | Rot signal |
|---|---|---|---|
| **Intent** (specs) | What should this do, and how will we know? | Point-in-time | Retro-edited after shipping |
| **Decisions** (ADRs) | Why is it like this? | Immutable, append-only | Bloated with trivia |
| **Context** (agent files) | What must the agent know? | Living, tightly budgeted | Grows without bound |
| **Evidence** (tests) | Is it actually right? | Living, runs constantly | Passes while product breaks |

### Intent — specs

A spec is worth writing when a feature has real decisions in it. Its most valuable section is not
the description — it's the **acceptance criteria**, because that's the part that becomes checkable.

Structure that works:

- **Summary, goals, scope.** Reviewable by anyone. Scope should say what's *out* and why.
- **Behaviour.** States, triggers, edge cases. What must be true.
- **Technical design.** Owned by whoever implements. Separable from the above.
- **Open questions.** The most important section. A spec that reads as uniformly confident is
  hiding its hard part.
- **Acceptance criteria.** Concrete enough to check off.

Two habits that matter more than format:

**Quarantine the uncertainty.** Name the single riskiest unknown explicitly and gate work on
resolving it first. A short spike before the build is always cheaper than a retrofit after it.

**Once shipped, a spec is a record, not a maintenance burden.** Don't retro-edit it to match what
you built — that destroys the audit trail. Changes go in a new spec or a decision record.

For acceptance criteria, **EARS notation** (Easy Approach to Requirements Syntax) is worth
learning. It forces a when/then shape that's inherently testable:

```
WHEN a side crosses 500
THE SYSTEM SHALL display the real total rather than a value clamped at 500
```

versus the prose version — "the score should show correctly after a win" — which reads fine and
verifies nothing.

### Decisions — ADRs

An Architecture Decision Record captures why something is the way it is. Format is deliberately
rigid and short: **Context, Decision, Consequences**, plus a status and a date.

The rules that make it work:

- **Immutable.** Never edit an accepted ADR. When one is reversed, write a new one that supersedes
  it and mark the old one Superseded. The trail is the point.
- **Numbered and append-only.** `0001`, `0002`, and so on.
- **Consequences must include the costs.** An ADR listing only benefits is marketing.

**The filter is the hard part.** The failure mode is logging everything, which buries the decisions
that matter. A workable test: *is this expensive to reverse, and does it have broad impact?* If
it's easy to undo and narrow in scope, it belongs in a commit message or a ticket.

Most projects should have far fewer ADRs than they think. A small app might have four or five that
genuinely qualify.

### Context — agent files

This is where most people go wrong, because the intuition ("more context is better") is backwards.

**Context is a budget, not a container.** Every line in a persistent agent file is re-read on every
turn and competes with the actual work for the same window. Chroma's 2025 benchmark found that all
eighteen frontier models tested lost accuracy as input grew — in some cases from around 95% down to
60% past a threshold. This is usually called *context rot*.

Practical limits:

- **Keep the always-on file under ~200 lines.** Shorter is better.
- Models reliably follow roughly 150–200 instructions, and the agent's own system prompt already
  consumes a meaningful share of that.
- HTML block comments (`<!-- ... -->`) are stripped before the file reaches the model, so notes for
  human maintainers cost nothing.

**The routing decision** is what separates a good setup from a bloated one. Modern agent tooling
gives you several surfaces, and each rule belongs to exactly one:

| If the thing is... | It belongs in... |
|---|---|
| Always-on project guidance | The memory file (`CLAUDE.md` / `AGENTS.md`) |
| Needed only sometimes | A skill, loaded on demand |
| Something that *must* happen regardless | A hook or a permission rule |
| A job that would flood context with noise | A subagent with its own window |

The instinct "I explained this twice, so it goes in the memory file" is how these files bloat.
Explaining twice means it belongs *somewhere* — usually not there.

**On the file-name question:** `AGENTS.md` is an open, tool-agnostic standard now stewarded under
the Linux Foundation, with adoption across tens of thousands of repositories and support from most
major agent tools. Claude Code is the notable exception — it reads `CLAUDE.md` and, as of mid-2026,
does not read `AGENTS.md` natively. The recommended arrangement is `AGENTS.md` as the shared source
of truth with a thin `CLAUDE.md` that imports or symlinks to it. If you use a single tool, one file
is fine — just know which way the standard is moving.

**A stale agent file is worse than none**, because the agent trusts it. Review it periodically.

### Evidence — tests

Tests are the highest-leverage asset in an agentic codebase, and it isn't close. They're what turns
"I think this is right" into "this passes." An agent that can run your tests can verify its own
work; one that can't is guessing, and so are you.

Priorities:

- **Pure logic first.** Scoring engines, state machines, data migrations — cheap to test, and where
  subtle bugs hide.
- **Migrations especially.** Any code that transforms stored user data deserves tests for the happy
  path, empty input, corrupt input, and running twice (idempotence).
- **Know what tests can't cover.** Visual layout, device behaviour, animation, and anything
  orientation- or hardware-specific. For those, the only evidence is running it on the thing.

---

## Part 3 — The operating loop

### One session, one reviewable unit

Scope each agent session to a single concern that ends in a single commit you can read, verify, and
revert.

This is often justified by context limits, but that's the lesser reason. The real reason is
**reviewability**. A session that touches four unrelated things produces a diff nobody can
meaningfully check, and unreviewable changes are how bugs enter a codebase that has tests.

Your spec's milestones are natural session boundaries. When a session starts sprawling into a
second concern, that's the signal to commit and start fresh — not to push on.

### Plan before executing

Have the agent propose an approach before it writes anything. Reviewing a plan costs a minute and
catches misunderstanding *before* code exists, which is the cheapest possible moment.

This is near-universal advice across practitioners, and it's the highest-return habit on this list.
Exploratory prompting works for throwaway experiments; anything you intend to keep deserves a plan
you actually read.

### Commit at every green state

Frequent commits are your undo. When generating changes is nearly free, the ability to bisect what
broke becomes the scarce resource. A clean commit at each working state preserves it.

### Review the diff, not the explanation

The explanation is generated by the same process that generated the code, and shares its blind
spots. Read what changed. For anything visual or device-dependent, run it.

### Keep durable state in files, not conversation

Conversation is lossy and gets summarized. The filesystem doesn't. Anything that must survive —
decisions, plans, open questions — belongs in a committed file, not in scrollback.

### Guard the scope

The backlog is the scope. When an agent proposes something adjacent — and it will, often
sensibly — that's a backlog entry, not a session expansion.

---

## Part 4 — Containment

Everything so far assumes the agent is merely fallible. It is also a **security surface**, and this
is the part most process guides omit entirely.

A coding agent reads your files, runs shell commands, and pushes to your repositories. It also
reads content it did not write — issues, pull request descriptions, dependency READMEs, web pages,
API responses. A model cannot reliably distinguish instructions it was given from instructions
embedded in the data it reads. That gap is **prompt injection**, and as of 2026 it is OWASP's
number-one risk for agentic applications and is treated by researchers as unsolved: filters that
try to detect malicious instructions are not reliable enough to depend on.

Coding agents are the worst case because they combine all three legs of what Simon Willison named
the **lethal trifecta**:

1. Access to private data (your repo, your environment, your credentials)
2. Exposure to untrusted content (issues, dependencies, fetched pages)
3. The ability to communicate externally (network calls, git push)

Any system with all three can be induced by an attacker who controls *any* untrusted input to read
private data and send it out. This is not hypothetical: a 2026 disclosure documented an attack
chain that began with opening a public GitHub issue and ended with malicious code pushed into a
repository — establishing prompt injection via repository metadata as a class-level supply chain
risk. Audits in the same period found a large majority of assessed AI systems vulnerable, with
attack success rates well above half depending on configuration.

**Because detection is unreliable, defense is containment.** Assume an injection will land
eventually and design so that it cannot do much.

### The practices

**Least privilege by default.** Grant the narrowest permission that lets the work happen. Read-only
operations can run freely; anything that writes outside the working tree, touches credentials, or
reaches the network deserves an explicit grant. The common failure is the opposite: broad
permissions set once and never revisited.

**Human approval before irreversible actions.** Pushes to shared branches, deletions, dependency
installs, anything that spends money or touches production. The approval gate is the control that
survives when detection fails. Note the tension — an agent that demands approval for every
read-only `git status` becomes an obstacle rather than an accelerator, so put the gates where
reversal is expensive, not everywhere.

**Treat all fetched content as data, never as instructions.** Issue text, PR descriptions, README
files from dependencies, web pages, and tool output are inputs to reason about — not commands to
follow. When an agent reports that a file "asked" it to do something, that is an incident, not a
feature.

**Keep secrets out of reach.** No credentials in files the agent reads, no long-lived tokens in the
environment when a scoped one would do. Enable secret scanning and push protection on any repo an
agent touches, and treat an alert as an incident rather than a warning.

**Sandbox when the blast radius is real.** Containers and disposable working copies convert a
catastrophic outcome into an annoying one. A repo with a remote is already partly this — you can
delete the local copy and re-clone.

**Log what the agent did.** Not for compliance theatre — for the moment you need to answer "when
did this change, and what asked for it?" Most AI-built applications assessed in 2026 had no
meaningful security logging at all.

**Be deliberate about automation triggers.** Agents wired to fire automatically on issues, comments,
or PRs from outside contributors are the specific configuration that produced the documented supply
chain attacks. Human-initiated sessions have a much smaller surface than event-triggered ones.

### Proportionality

A solo project on a public repo with no secrets needs: scoped permissions, approval before push,
no auto-triggers, and secret scanning on. That is a short afternoon.

Regulated data, production access, or third-party contributors move you into a genuinely different
regime — gateway-level enforcement, tool allow-lists, audit trails. Know which one you are in.

---

## Part 5 — Knowing whether it's working

This guide's own thesis is that any practice not ending in something verifiable is ceremony. That
applies to the practices themselves. If you cannot tell whether your system is helping, you have
built a belief system.

**Start by calibrating expectations downward.** The honest read of the evidence is uncomfortable.
Telemetry across thousands of developers found what has been called the **AI productivity
paradox**: individual output rises sharply — on the order of 21% more tasks completed and roughly
double the pull requests merged — while organizational delivery metrics stay flat. Separately,
despite adoption above 90%, measured end-to-end gains have stalled near 10%, against marketed
claims of 2–3x.

Two findings matter more than the headline numbers:

- **AI amplifies existing conditions rather than universally improving them.** A team with weak
  review, unclear ownership, or a slow pipeline gets more of that, faster.
- **Engineering maturity does not appear to protect you.** Telemetry across thousands of teams
  found no evidence that strong pre-AI performers are insulated from quality degradation at high
  adoption. Being good already is not a defense.

**Watch quality signals as closely as speed signals.** The specific leading indicators:

| Signal | What it tells you | Why it matters |
|---|---|---|
| **Two-week code churn** | How much recently written code is being rewritten | Rising churn means code is being generated faster than it is being reasoned about |
| **Code duplication** | Whether patterns are being copied rather than factored | Same root cause, different symptom |
| **Review latency and PR size** | Whether review has become the bottleneck | AI-driven volume has been associated with substantially longer review times and much larger PRs |
| **Change failure rate** | Whether speed is costing stability | The classic balance metric |
| **Rework rate** | How often shipped work comes back | The honest measure of "done" |

If churn and duplication are climbing, **the apparent speed gain is borrowed from future
maintenance.** That is the single most useful early warning available.

**Beware the 30-to-90 day lag.** AI-generated code frequently passes initial review and produces
maintenance burden a month or two later. Point-in-time delivery metrics miss this entirely and can
manufacture false confidence. Anything you assess only at merge time is measuring the wrong moment.

**Never read a speed metric alone.** Pair every speed metric with a quality metric and every
quantitative one with a qualitative one. Shipping more features faster is not a win if they are the
wrong features or buggy ones.

**Fix the actual bottleneck.** If work is waiting at review or planning, an agent that writes code
faster will not help — it will lengthen the queue. Invest in review tooling, smaller change sets,
and clearer specs instead.

### For a solo project

Full metrics tooling is overkill. Three questions, asked monthly, get most of the value:

1. **How often am I rewriting code I wrote in the last two weeks?** Rising churn is the warning.
2. **Am I reading diffs, or approving them?** The moment approval becomes reflex, the loop is
   broken.
3. **What broke that tests did not catch?** That gap tells you where to add evidence.

---

## Part 6 — Contested ground

Anyone claiming this is settled is selling something. Two live debates worth understanding, because
you'll be asked about both.

### Is spec-driven development just waterfall again?

**The critique has teeth.** Writing detailed specifications before implementation is precisely what
Agile spent two decades arguing against. Critics — including a widely-shared piece titled "The
Waterfall Strikes Back" — argue it reinstates the assumption that requirements can be fully known
up front, which experience says they can't.

**The defense** distinguishes *decision* autonomy from *implementation* autonomy. Agents can
execute; they can't resolve ambiguity that was never resolved. Handing an agent an underspecified
task doesn't remove the ambiguity, it just relocates where the wrong guess gets made.

**Where to land.** Think of it as a spectrum of rigor:

- **Spec-first** — write a spec, then build. Light.
- **Spec-anchored** — spec drives decisions and acceptance criteria; code remains source of truth;
  tests enforce. **This is the defensible middle, and where most successful practice sits.**
- **Spec-as-source** — the spec is authoritative and code is regenerated from it. Heaviest, most
  waterfall-shaped, and the version the critique actually lands against.

The overhead only pays off for work with real decisions in it. Small, obvious changes don't need a
spec, and pretending otherwise is how methodology becomes ceremony.

### Do multi-agent orchestrations beat a single focused session?

There's a lot of enthusiasm for elaborate setups — parallel agents, orchestrator patterns, worktree
fleets. The consistent finding in practitioner write-ups is that **simple control loops tend to
outperform complex multi-agent systems** for most work. Isolation is genuinely useful for a
specific job — sending a research task to a subagent so exploration doesn't pollute your main
context — but that's targeted delegation, not orchestration for its own sake.

Default to one focused session. Add machinery when you have a specific problem it solves.

---

## Part 7 — Failure modes

Diagnostic list. If you recognize several, the system needs attention.

**The agent file grew past two screens.** You're paying for it every session and diluting the rules
that matter. Move things to skills and hooks.

**A rule keeps getting ignored.** It's in the wrong surface. Guidance the agent *should* follow
belongs in memory; things that *must* happen belong in hooks or permissions.

**Docs contradict the code.** Usually means specs are being retro-edited or the agent file drifted.
Specs should be historical records; living docs need a review cadence.

**Sessions end without a commit.** Work is accumulating faster than it's being checkpointed. You've
lost the ability to bisect.

**You're approving diffs without reading them.** The most dangerous state on this list, and the
easiest to slip into, because approving is one keystroke and reading is not.

**Tests pass but the product is broken.** Your tests cover logic and your bugs are in
presentation. Add device checks; stop treating green as proof.

**The same decision gets re-litigated.** No decision record exists. Write the ADR.

**Every change needs a spec.** Over-correction. Methodology is now overhead.

**The agent has standing permission to do things you'd want to approve.** Permissions were set
broadly once and never revisited. Re-scope them.

**You can't answer "is this actually helping?"** No measurement loop. Start with churn and review
latency.

**Churn is rising and nobody noticed.** Code is being generated faster than it's being reasoned
about. The speed is borrowed against future maintenance.

---

## Part 8 — Adopting this

Ordered by return on effort.

1. **Get tests running and committed.** Nothing else works as well without this.
2. **Write the agent memory file** — under 200 lines: what the project is, how to run tests, where
   the docs live, and the three or four non-obvious gotchas that would otherwise bite.
3. **Set session discipline** — one concern, plan first, commit at green.
4. **Add a backlog file.** A place for good ideas that aren't now is what keeps scope honest.
5. **Write specs for features with real decisions in them.** Not for everything.
6. **Write ADRs retroactively for the handful of expensive-to-reverse choices you've already made.**
   Easier now than reconstructing them in six months.
7. **Add hooks for rules that must not be forgotten.** The ones you've already forgotten twice.
8. **Scope agent permissions and turn on secret scanning.** An afternoon, and it's the difference
   between a contained incident and an uncontained one.
9. **Pick two or three signals and check them monthly.** Churn and review latency are the cheapest
   pair that will actually tell you something.

### A suggested repo layout

```
/product/
  BACKLOG.md              living — ideas not scheduled
  specs/                  point-in-time — one per feature
  decisions/              immutable — numbered ADRs
  SCHEMA.md               living — data model
AGENTS.md                 agent context (source of truth)
CLAUDE.md                 thin import of AGENTS.md
README.md                 humans arriving cold
```

Adjust names to taste; keep the lifecycle separation.

---

## The short version

- Generating code is cheap. Verifying intent is not. Optimize for the second.
- Resolve ambiguity before the agent does it for you.
- Context is a budget. Every always-on line costs you on every turn.
- Each rule has exactly one correct surface. Memory, skill, hook, or subagent.
- One session, one concern, one reviewable commit.
- Plan before executing. It's the cheapest intervention available.
- Read the diff. Run the thing. Fluency isn't correctness.
- Specs and records earn their place by producing something checkable.
- Detection of prompt injection is unreliable; contain instead. Least privilege, approval before
  irreversible actions, fetched content is data and never instructions.
- Measure, or you're running on faith. Watch churn and review latency, not just speed.
- **Any practice that doesn't end in something verifiable is ceremony. Cut it.**
