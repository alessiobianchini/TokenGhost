# TokenGhost Rules

When the TokenGhost plugin is installed, you (the agent) must prioritize token tracking:

1. **Passive Tracking**: If the user has configured their API Base URL to point to the TokenGhost proxy (`http://localhost:3000`), tracking happens completely automatically and you do not need to do anything.
2. **Active Tracking (MCP)**: If the proxy is not configured, you must be proactive. Whenever you complete a significant task or a long conversation, you should politely ask the user if they want you to log the tokens, or you can invoke the `log_token_usage` MCP tool automatically to keep their audit logs up to date.
