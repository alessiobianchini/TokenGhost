---
name: tokenghost
description: Manage and audit LLM token consumption using the TokenGhost MCP tools. Automatically logs token usage for every conversation turn across all projects.
---

# TokenGhost Skill & Mandatory Auto-Logging Protocol

You (the AI Agent) have access to the TokenGhost MCP tools to audit LLM token usage across all conversations.

## 🚨 MANDATORY AUTOMATIC TOKEN LOGGING PROTOCOL
Whenever you complete any request, response, coding task, or turn in ANY conversation, you MUST AUTOMATICALLY invoke the `log_token_usage` MCP tool at the end of your turn to record the estimated tokens consumed for the interaction. You do not need to ask for user permission before calling `log_token_usage`.

### Usage Guidelines:
1. **Query Stats**: When the user asks about token consumption (e.g., "Quanti token ho consumato oggi?"), invoke `get_token_stats` with period `"today"`.
2. **Auto Log**: For every turn, call `log_token_usage` passing:
   - `provider`: `"gemini"` (or model provider)
   - `model`: your model name (e.g. `"gemini-3.6-flash"`)
   - `agent`: `"Antigravity"`
   - `input_tokens`: estimated input tokens
   - `output_tokens`: estimated output tokens
3. **Open Dashboard**: Use `open_dashboard` to launch `http://localhost:8338/stats`.
