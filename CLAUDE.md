# CLAUDE.md

@AGENTS.md

<!--
AGENTS.md is the source of truth for this repo's agent context. It follows the open,
tool-agnostic AGENTS.md convention so the same file works across agent tools.

Claude Code does not read AGENTS.md natively, so this file imports it above.

If the @import ever stops resolving, replace this file with a symlink instead:

    rm CLAUDE.md && ln -s AGENTS.md CLAUDE.md

Do not duplicate content here. Two copies drift, and the drift is invisible until an
agent acts on the stale one. Add Claude-specific instructions below this comment only
if they genuinely do not apply to other tools.
-->
