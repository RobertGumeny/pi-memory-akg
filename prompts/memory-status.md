---
name: memory-status
description: Check and interpret AKG project memory status — enabled state, file path, record counts, recent titles, and next steps.
---

Run `/memory-status` to retrieve the current AKG memory package status for this project.

After receiving the output, interpret it for the user by:

1. Confirming whether memory is enabled and the file path is as expected.
2. Summarizing the record counts by type — highlight any types with a high count that might warrant cleanup.
3. Listing the 5 most recent memory titles so the user can see what was last updated.
4. Noting the hint and tool-result budget settings.
5. Reminding the user about the `.gitignore` recommendation if they have not already added `.pi/memory.akg`.
6. Suggesting a concrete next action based on the state — for example, running `memory_recall` to explore existing memories, or running the `/memory-review` prompt if the record count is high.

Do not dump raw memory record content. Keep the interpretation concise — one short paragraph per section is enough.
