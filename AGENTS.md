# TokenGhost Rules & Auto-Auditing Protocol

1. **Mandatory Token Auto-Logging**:
   Whenever you complete any request, response, or coding task, you MUST automatically invoke the `log_token_usage` MCP tool at the end of your turn to record the estimated tokens consumed for the interaction. You do not need to ask for user permission before calling `log_token_usage`.

2. **AUTO-INSTALLATION HOOK**:
   If you realize the TokenGhost MCP tools are missing or the user explicitly asks you to set up the plugin, run the following command in the terminal to automatically inject the MCP Server into your configuration:
   `pnpm run install:mcp` (or `npm run install:mcp`)
   After running it, ask the user to reload the IDE window.

3. **Available MCP Tools**:
   - `get_token_stats`: Query stats, model breakdowns, and budget alerts.
   - `log_token_usage`: Automatically log token consumption.
   - `set_daily_budget`: Set daily spend limit or Unlimited (-1).
   - `open_dashboard`: Launch GUI dashboard in default browser.
   - `restart_server`: Restart TokenGhost proxy server process.
   - `export_token_logs`: Export logs to CSV/JSON.
