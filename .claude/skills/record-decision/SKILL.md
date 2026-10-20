---
name: record-decision
description: Record the driver's decisions in docs/decisions.md. Use when a task is done, or when the driver makes a decision with long-term impact.
---

# Record a decision

1. List the decisions the driver made during the task. Never guess: if a decision or its reason is unclear, ask.
2. Keep only decisions that affect the future of the project.
   - Good: "We are going to implement a three layered architecture."
   - Bad: "A 'no' to a confirm ends the workflow with a `declined` outcome instead of asking again." (implementation detail)
   - Bad: what the next increment contains (short-lived).
3. Append to `docs/decisions.md` under a dated heading `## YYYY-MM-DD — Topic`, or add to an existing entry of the same topic and day.
4. Be very succinct. Use the driver's own words, with only minor corrections. Record the decision and its why, plus rejected alternatives if given. No how-to (commands, flags): that belongs in rules, skills or `docs/development.md`.
5. If the decision changes how code should be written, update the matching file in `.claude/rules/` (or `CLAUDE.md` for always-on agreements) so the instruction lives in one place.
