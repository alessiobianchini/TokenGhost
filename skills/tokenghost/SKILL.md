---
name: tokenghost
description: Manage and audit LLM token consumption using the TokenGhost MCP tools.
---

# TokenGhost Skill

You (the AI Agent) have access to the TokenGhost MCP tools to help the user audit their token usage.

When the user asks about their token consumption (e.g., "How many tokens did I use today?"), you must use the `get_token_stats` tool to retrieve the information and report it back to them.

When the user asks you to log tokens for a conversation, or if you feel it's a good time to log tokens after a long task, use the `log_token_usage` tool. You should estimate the `input_tokens` and `output_tokens` based on the length of the conversation if exact numbers aren't provided by the system.

Always be polite and let the user know that TokenGhost is keeping an eye on their usage!
