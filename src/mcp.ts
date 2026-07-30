import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getTokenStats, getRecentLogs, logTokenUsage, clearTokenLogs } from "./db";
import { getActivePort } from "./proxy";

export async function startMcpServer() {
    const server = new McpServer({
        name: "TokenGhost",
        version: "1.1.0"
    });

    // 1. Tool: get_token_stats
    server.tool(
        "get_token_stats",
        "Get AI token consumption stats, model breakdowns, and estimated USD costs.",
        {
            period: z.enum(["today", "yesterday", "all"]).describe("The period to get stats for.")
        },
        async ({ period }) => {
            try {
                const stats = getTokenStats(period);
                
                let text = `👻 Token Usage Stats for ${period.toUpperCase()}:\n`;
                text += `• Total Cost: $${stats.global.estimated_cost_usd.toFixed(4)} USD\n`;
                text += `• Input Tokens: ${stats.global.input_tokens.toLocaleString()}\n`;
                text += `• Output Tokens: ${stats.global.output_tokens.toLocaleString()}\n`;
                text += `• Total Tokens: ${stats.global.total_tokens.toLocaleString()}\n\n`;

                if (Object.keys(stats.providers).length > 0) {
                    text += `📦 Breakdown by Provider:\n`;
                    for (const [provider, pStats] of Object.entries(stats.providers)) {
                        text += `  - ${provider.toUpperCase()}: ${pStats.total_tokens.toLocaleString()} tokens ($${pStats.estimated_cost_usd.toFixed(4)})\n`;
                    }
                    text += `\n`;
                }

                if (Object.keys(stats.models).length > 0) {
                    text += `🤖 Breakdown by Model:\n`;
                    for (const [model, mStats] of Object.entries(stats.models)) {
                        text += `  - ${model}: ${mStats.total_tokens.toLocaleString()} tokens ($${mStats.estimated_cost_usd.toFixed(4)})\n`;
                    }
                }
                
                return {
                    content: [{ type: "text", text }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }]
                };
            }
        }
    );

    // 2. Tool: log_token_usage
    server.tool(
        "log_token_usage",
        "Log estimated tokens used in an interaction.",
        {
            input_tokens: z.number().describe("Number of input tokens"),
            output_tokens: z.number().describe("Number of output tokens"),
            provider: z.string().optional().default("gemini").describe("Provider name"),
            model: z.string().optional().default("antigravity").describe("Model name")
        },
        async ({ input_tokens, output_tokens, provider, model }) => {
            try {
                logTokenUsage({
                    provider,
                    model,
                    input_tokens,
                    output_tokens,
                    total_tokens: input_tokens + output_tokens
                });
                return {
                    content: [{ type: "text", text: "👻 Tokens logged successfully." }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }]
                };
            }
        }
    );

    // 3. Tool: get_recent_logs
    server.tool(
        "get_recent_logs",
        "Get the most recent individual token consumption logs.",
        {
            limit: z.number().optional().default(10).describe("Number of recent logs to fetch.")
        },
        async ({ limit }) => {
            try {
                const logs = getRecentLogs(limit);
                const text = logs.map(l => 
                    `[${l.timestamp}] Provider: ${l.provider} | Model: ${l.model} | In: ${l.input_tokens} | Out: ${l.output_tokens} | Total: ${l.total_tokens} | Cost: $${(l.estimated_cost_usd || 0).toFixed(4)}`
                ).join('\n') || "No logs found.";

                return {
                    content: [{ type: "text", text }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }]
                };
            }
        }
    );

    // 4. Tool: open_dashboard
    server.tool(
        "open_dashboard",
        "Open the TokenGhost dashboard GUI in the user's default web browser.",
        {},
        async () => {
            try {
                const port = getActivePort();
                const url = `http://localhost:${port}/stats`;
                const { exec } = await import("child_process");
                let command = '';
                switch (process.platform) {
                    case 'darwin': command = `open "${url}"`; break;
                    case 'win32': command = `start "" "${url}"`; break;
                    default: command = `xdg-open "${url}"`; break;
                }
                exec(command);
                return {
                    content: [{ type: "text", text: `👻 Dashboard opened in your browser at ${url}` }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }]
                };
            }
        }
    );

    // 5. Tool: clear_token_logs
    server.tool(
        "clear_token_logs",
        "Clear all logged token usage data.",
        {},
        async () => {
            try {
                clearTokenLogs();
                return {
                    content: [{ type: "text", text: "🧹 Token logs have been cleared successfully." }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }]
                };
            }
        }
    );

    // MCP Resource: Today's Stats
    server.resource(
        "today-stats",
        "tokenghost://stats/today",
        async (uri) => {
            const stats = getTokenStats("today");
            return {
                contents: [{
                    uri: uri.href,
                    text: `Token Usage (Today): ${stats.global.total_tokens.toLocaleString()} tokens | Est. Cost: $${stats.global.estimated_cost_usd.toFixed(4)} USD`
                }]
            };
        }
    );

    // Connect it to stdio
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
