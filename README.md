# 👻 TokenGhost

Zero-latency token auditing proxy and MCP server for **Antigravity Agentic**, **Gemini CLI**, **Claude Code**, and any OpenAI/Anthropic compatible IDE.

## 📦 Installation

You can install TokenGhost directly via the Antigravity or Gemini CLI with a single command!

**For Antigravity CLI (agy):**
```bash
agy plugin install https://github.com/alessiobianchini/TokenGhost
```

**For Gemini CLI (legacy):**
```bash
gemini extensions install https://github.com/alessiobianchini/TokenGhost
```

*Don't have the CLI? You can also clone this repository manually into your plugins folder.*

## 🚀 How to Use

After installing the plugin, TokenGhost provides two ways to track your tokens:

### 1. The Zero-Latency Proxy (Recommended)
Start the proxy in the background:
```bash
pnpm start
```
Then change your IDE's `Base URL` (or Custom API Endpoint) to `http://localhost:3000/gemini` (or `/anthropic`, `/openai`). Tokens will be tracked silently with **zero overhead** and **zero extra token cost**.

Check your stats anytime at [http://localhost:3000/stats](http://localhost:3000/stats).

### 2. The MCP Server (Fallback)
If you can't change your Base URL, don't worry! The installation automatically registers TokenGhost as an MCP server in your IDE.

Simply ask the AI in your chat:
> *"Log the tokens for this conversation"*
> *"How many tokens did I use today?"*

The AI will automatically use the TokenGhost tools to log and retrieve your stats.
