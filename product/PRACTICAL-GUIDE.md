# Practical Guide: Working in This System

The companion to `OPERATING-GUIDE.md`. That document explains *why*; this one is what to actually
do, in order.

Two paths. Pick the one that matches you.

---

# Path A — You're contributing to an existing project

## First hour: orient before you touch anything

**1. Read three files, in this order.**

| File | What you're looking for |
|---|---|
| `README.md` | What this is and how to run it |
| `AGENTS.md` / `CLAUDE.md` | Conventions, gotchas, how tests run |
| `product/BACKLOG.md` | What's known-but-not-done — so you don't propose it as new |

Skim `product/decisions/` if it exists. You don't need to read every ADR, but knowing what's
*there* tells you which questions are already settled. Re-litigating a decided question is the most
common way a new contributor wastes a day.

**2. Get the project running and the tests passing — before changing anything.**

```bash
# whatever the README says, then:
<test command from AGENTS.md>
```

This is not a formality. You need a known-good baseline, because the first time tests fail you must
be able to tell "I broke this" from "this was already broken." Establish that now, when it's free.

**If the tests don't pass on a clean checkout, stop and fix that first.** That is the whole
contribution until it's done. A project without a green baseline has no verification loop, and
nothing else in this system works without one.

**3. Confirm you can run the actual product.** Not just tests — the real thing, on the real target.
Some categories of bug are invisible to a test suite, and you need to know how to see them.

**4. Check the agent's permissions before your first session.** What can it do without asking?
Anything that writes outside the working tree, touches credentials, reaches the network, or pushes
to a shared branch should require an explicit grant. Confirm no agent is wired to fire
automatically on issues or PRs from outside contributors — that configuration is what produced the
documented supply chain attacks. This takes two minutes and you only do it once.

## First change: make it small and boring

**5. Pick one item.** A backlog entry or a single spec milestone. Not two. If it looks like two
things, it is two things — do the first.

**6. Plan before executing.** Have the agent propose an approach and read it. You're checking for
misunderstanding, unrequested scope, and any place it's about to invent a decision that should be
yours. This costs a minute and is the highest-return habit available.

**7. Write or update the check first**, where the change is checkable. A test for logic, an
acceptance criterion for behaviour. If you can't state how you'd know it worked, you don't yet
understand the task well enough to hand it off.

**8. Execute in one session, one concern.** When it starts sprawling into a second thing, stop.
Commit what's green, open a new session. Sprawl is the signal, not a reason to push on.

**9. Review the diff — not the summary.** The explanation comes from the same process as the code
and shares its blind spots. Read what actually changed.

For anything visual, device-specific, timing-related, or animated: **run it on the real thing.**
No test suite catches clipping, jank, or "technically correct but feels wrong."

**10. Commit at green.** Message says what changed and why. Push.

## Ongoing: keep the system honest

**11. Route new knowledge to the right place.** When you learn something durable, it goes:

- A gotcha that applies every session → agent memory file (keep it under ~200 lines)
- Something needed only occasionally → a skill, loaded on demand
- Something that must happen regardless → a hook or permission rule, not a hopeful instruction
- An idea that isn't now → the backlog
- A choice that's expensive to reverse → an ADR

**12. Guard scope actively.** When the agent proposes something adjacent — and it will, often
sensibly — that's a backlog entry, not a session expansion.

**13. Leave the docs true.** If you found the agent file wrong, fix it in the same PR. A stale
memory file is worse than none, because the agent trusts it.

---

# Path B — You're starting a new product

## The most important thing: don't front-load the process

The failure mode here is setting up specs, ADRs, agent files, and folder structure before you know
whether the thing is worth building. That's not discipline, it's procrastination with good posture.

**Build the smallest real version first.** No spec, no ADRs, minimal ceremony. You're answering
"is this worth existing?" — and process cannot answer that question.

Add each practice below at the moment it starts paying for itself. The trigger column is the point.

| Add this | When |
|---|---|
| Version control + a remote | Immediately. Non-negotiable. |
| A running test command | As soon as there's logic worth being wrong about |
| Agent memory file | The second time you explain the same thing |
| Backlog file | The first good idea you can't do now |
| A spec | The first feature with a decision you'd argue about |
| ADRs | The first choice that's expensive to reverse |
| Hooks | The first rule you've forgotten twice |
| Scoped permissions + secret scanning | Before the first agent session on a repo with a remote |
| A measurement habit | Once you're shipping regularly enough to have a trend |

## Sequenced start

**1. Get something running end to end.** Ugly is fine. You're proving the idea, not the
architecture.

**2. Put it in git with a remote, today.** Once there's a remote, your local folder is disposable —
which is what makes everything after this low-risk. Turn on secret scanning and push protection
while you're there, and scope what the agent may do without asking.

**3. Add tests as soon as there's real logic.** Not UI polish — the parts that are subtly wrong in
ways you won't see: calculations, state transitions, data transformations. This is the single
highest-leverage asset in an agent-heavy codebase, because it's what lets the agent check its own
work instead of guessing.

**4. Write the agent memory file when you notice repetition.** Under 200 lines: what this is, how
to run tests, where things live, and the three or four non-obvious gotchas. Every line is re-read
every turn, so it competes with actual work for the same budget.

**5. Start a backlog the first time you have a good idea you shouldn't do now.** This is what makes
saying "not yet" possible without losing the thought.

**6. Write your first spec when you hit a feature with real decisions in it.** Signals: you're
weighing options, there are edge cases you keep re-deriving, or you'd need to explain the same
reasoning twice. Its most valuable section is the acceptance criteria, because that's the part that
becomes checkable.

Skip specs for obvious work. Pretending a one-line change needs a spec is how methodology becomes
ceremony.

**7. Write ADRs retroactively for choices already made.** You'll have made three or four
expensive-to-reverse decisions before you thought to record any. Writing them now is far easier
than reconstructing them in six months. Filter: *hard to reverse, broad impact.* Everything else
belongs in a commit message.

**8. Add hooks for what must not be forgotten.** The rules you've already forgotten twice. Guidance
belongs in memory; enforcement belongs in a hook.

---

# Quick reference

## Before starting work
- [ ] Tests pass on a clean checkout
- [ ] I can run the real product, not just the tests
- [ ] I've read the backlog and the decision log
- [ ] Agent permissions are scoped; nothing irreversible runs unattended
- [ ] I have exactly one concern for this session

## During
- [ ] Plan reviewed before execution
- [ ] The check exists before the change, where checkable
- [ ] Scope held — new ideas went to the backlog

## Before committing
- [ ] I read the diff, not the summary
- [ ] I ran it on the real target if it's visual or device-specific
- [ ] Tests pass
- [ ] Docs I invalidated are updated in this same change

## When you learn something durable
- [ ] Routed to the right surface: memory / skill / hook / backlog / ADR

## Monthly
- [ ] How often am I rewriting code from the last two weeks? (churn)
- [ ] Am I reading diffs, or approving them?
- [ ] What broke that tests didn't catch?

---

# Signals you've drifted

Each of these has a specific fix.

| Signal | What it means | Fix |
|---|---|---|
| Approving diffs without reading | Review has become a formality | Smaller sessions |
| Sessions ending without a commit | No checkpoints, can't bisect | Commit at every green state |
| Agent memory file over two screens | Paying context cost every turn | Move things to skills and hooks |
| A rule keeps getting ignored | It's in the wrong surface | Move it to a hook |
| Tests green, product broken | Coverage is logic-only | Add device and integration checks |
| Same debate twice | No decision record | Write the ADR |
| Every change needs a spec | Over-corrected | Reserve specs for real decisions |
| Docs contradict code | Living docs drifted | Fix in the same PR that broke them |
| Agent can act without asking | Permissions set broadly once | Re-scope; gate irreversible actions |
| Rewriting recent code often | Churn — generated faster than reasoned about | Slow down; smaller sessions |
| Can't say if any of this helps | No measurement loop | Pick two signals, check monthly |

---

# The three that matter most

If you remember nothing else:

1. **Establish a green baseline before you change anything.** Without it you have no verification
   loop, and everything else is guessing with extra steps.
2. **One session, one concern, one reviewable commit.** Unreviewable changes are how bugs enter a
   codebase that has tests.
3. **Read the diff and run the thing.** Fluent explanations and passing tests are both compatible
   with broken output. Only evidence is evidence.
