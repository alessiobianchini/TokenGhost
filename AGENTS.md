# TokenGhost Rules

If you need to log token usage or query statistics, you must use the TokenGhost MCP tools (`log_token_usage`, `get_token_stats`).
If the tools are not available, it means the user hasn't configured the MCP Server yet. 

**AUTO-INSTALLATION HOOK:**
If you realize the tools are missing or the user explicitly asks you to set up the plugin, run the following command in the terminal to automatically inject the MCP Server into your own configuration:
`npm run install:mcp` (or `pnpm run install:mcp`)
After running it, ask the user to reload the IDE window.

2. **Active Tracking (MCP)**: If the proxy is not configured, you must be proactive. Whenever you complete a significant task or a long conversation, you should politely ask the user if they want you to log the tokens, or you can invoke the `log_token_usage` MCP tool automatically to keep their audit logs up to date.
