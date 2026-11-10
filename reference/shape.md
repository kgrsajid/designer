# shape — plan the UX, not the pixels

The verb for planning a feature's experience before it exists: flows, structure, and a surface brief. **No code, no styling** — shape is the bridge between "we should build X" and the verbs that build it.

## 1. Round 1 — purpose / people / outcome

Ask before assuming, in rounds of ≤3 questions (never a questionnaire dump — the `init.md` law):

- **Purpose** — what is this feature *for*? One sentence. Two purposes = two features; split or pick.
- **People** — who meets this surface, in what situation? Situations, not demographics (PRODUCT.md's Audience is the input; update it if it's stale, don't contradict it).
- **Outcome** — what must be true when the user leaves? The success state, verifiable.

If PRODUCT.md exists, round 1 starts from it and only asks for the gaps. If the codebase already half-implements the feature, read it first — mandate 4: code can be the brand record, and it can also be the intent record.

## 2. Round 2 — material / behavior / boundaries

**Assert the likely reading and invite correction.** State your interpretation as fact-with-a-question-mark — "The flow is: list → detail → act, because your users reconcile in batches?" — never "what do you want?" Assertions surface disagreement cheaply; open questions outsource your job to the user.

- **Material** — what is the content, really? (fields, entities, worst-case counts, empty states, who authors what)
- **Behavior** — the flow. Entry points, the happy path, the recovery paths, what happens on error and on empty. Every screen named for its job.
- **Boundaries** — what this feature is *not*; what stays out of scope this pass; hard constraints (platform, performance, existing patterns it must not break — mandate 2 applies to flows too).

## 3. Output — the 7-part surface brief

The deliverable is a brief, one per surface, written down:

| Part | Content |
|---|---|
| Audience | the situation the visitor arrives in |
| Job | the one thing this surface must accomplish |
| Success state | what "done" looks like, verifiable |
| Constraints | technical, content, platform, hard deadlines |
| Must-keep | existing patterns/flows that may not break (refinement preserves) |
| Open questions | labeled `(open)`, with owners where known |
| Surface mode | Convince / Work / Read / Showcase (SKILL.md's modes — per surface, never per product) |

The brief is the contract every later verb reads (the context protocol in SKILL.md). A brief that isn't written didn't happen.

## 4. Confirm & stop

Present the brief, get the nod, **stop**. Shape plans; it does not build. The hand-offs:

- Identity is open (no established visual world) → `new-work` *(lands M4)* owns the visual decisions.
- Identity exists → the steering and refine verbs (`bolder.md`, `quieter.md`, `distill.md`, `typeset.md`, `layout.md`, `animate.md`) build under it, with `operate.md` loaded for Work/Read surfaces.
- The shape pass revealed the flow itself is wrong on an existing surface → re-shape before polishing; polish on a broken flow is set dressing.

## What shape is not

- **Not wireframes-as-art.** Structure sketches may communicate the flow; pixel-perfect mockups are the build verbs' job.
- **Not requirements theater.** A brief full of "should consider potentially" decided nothing. Every line commits or is marked `(open)`.
- **Not scope creep with a diploma.** Boundaries are a deliverable, not a formality.
- **Not silent.** Assumptions are labeled, questions are asked, misreadings are invited.

## Verify

The brief exists in writing with all 7 parts; every non-`(open)` line is a decision someone could build from; the user has confirmed it (or the run is explicitly unattended — then say so in the brief); zero code was written; the mode is set per surface. Then stop.
