# TokenGhost Auditing & Auto-Logging Rules

You have access to the TokenGhost token auditing system.

## Mandatory Auto-Logging Protocol

1. **Passive Tracking**: If the IDE is configured to route API traffic through `http://localhost:8338`, token logging happens automatically via proxy.
2. **Active Auto-Logging**: For all chat interactions and tasks, you MUST automatically invoke the `log_token_usage` MCP tool at the end of your response to log estimated token consumption.

## Available Tools
- `get_token_stats`: Report token usage, model costs, and budget status.
- `log_token_usage`: Automatically log tokens at the end of each turn.
- `set_daily_budget`: Set daily spend limit or Unlimited (-1).
- `open_dashboard`: Open the TokenGhost web dashboard GUI.
- `restart_server`: Restart TokenGhost proxy server process.
- `export_token_logs`: Export logs to CSV/JSON format.
