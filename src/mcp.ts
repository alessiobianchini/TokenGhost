import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getTokenStats, getRecentLogs, logTokenUsage, clearTokenLogs, setDailyBudget, getLogsAsCsv, getLogsAsJson } from "./db";
import { getActivePort } from "./proxy";
import fs from 'fs';
import path from 'path';

export async function startMcpServer() {
    const server = new McpServer({
        name: "TokenGhost",
        version: "1.3.0"
    });

    // 1. Tool: get_token_stats
    server.tool(
        "get_token_stats",
        "Get AI token consumption stats, model breakdowns, estimated USD costs, and per-agent budget status.",
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
                text += `• Total Tokens: ${stats.global.total_tokens.toLocaleString()}\n`;

                if (period === 'today') {
                    if (stats.budget.is_unlimited) {
                        text += `• Daily Budget: ♾️ Unlimited\n`;
                    } else {
                        text += `• Daily Budget: $${stats.budget.global_daily_usd.toFixed(2)} USD (${stats.budget.used_percent}% used)\n`;
                        if (stats.budget.used_percent >= 100) {
                            text += `🚨 WARNING: Daily spending budget EXCEEDED! ($${stats.global.estimated_cost_usd.toFixed(4)} / $${stats.budget.global_daily_usd.toFixed(2)})\n`;
                        } else if (stats.budget.used_percent >= 80) {
                            text += `⚠️ ALERT: 80%+ of daily spending budget reached! ($${stats.global.estimated_cost_usd.toFixed(4)} / $${stats.budget.global_daily_usd.toFixed(2)})\n`;
                        }
                    }

                    if (Object.keys(stats.budget.agent_budgets).length > 0) {
                        text += `🎯 Agent Budget Configurations:\n`;
                        for (const [ag, b] of Object.entries(stats.budget.agent_budgets)) {
                            const label = b <= 0 ? "♾️ Unlimited" : `$${b.toFixed(2)} USD`;
                            text += `  - ${ag.toUpperCase()}: ${label}\n`;
                        }
                    }
                }
                text += `\n`;

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

    // 2. Tool: set_daily_budget
    server.tool(
        "set_daily_budget",
        "Set the daily USD spending budget limit globally or per agent (use -1 or 0 for Unlimited).",
        {
            limit_usd: z.number().describe("The daily USD spend limit (-1 or 0 for Unlimited)"),
            agent: z.string().optional().describe("Optional agent/client name (e.g. antigravity, copilot, cursor, windsurf)")
        },
        async ({ limit_usd, agent }) => {
            try {
                const config = setDailyBudget(limit_usd, agent);
                const targetName = agent ? `for agent '${agent}'` : "globally";
                const label = limit_usd <= 0 ? "♾️ Unlimited" : `$${Math.max(0.1, limit_usd).toFixed(2)} USD`;
                return {
                    content: [{ type: "text", text: `🎯 Daily spending budget ${targetName} updated to ${label}.` }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }]
                };
            }
        }
    );

    // 3. Tool: export_token_logs
    server.tool(
        "export_token_logs",
        "Export token logs to CSV or JSON format.",
        {
            format: z.enum(["csv", "json"]).optional().default("csv").describe("Export format (csv or json)")
        },
        async ({ format }) => {
            try {
                const exportDir = process.cwd();
                const fileName = `tokenghost_export_${Date.now()}.${format}`;
                const filePath = path.join(exportDir, fileName);
                const content = format === 'csv' ? getLogsAsCsv() : getLogsAsJson();
                
                fs.writeFileSync(filePath, content, 'utf-8');
                return {
                    content: [{ type: "text", text: `📥 Token logs successfully exported to ${filePath}` }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }]
                };
            }
        }
    );

    // 4. Tool: restart_server
    server.tool(
        "restart_server",
        "Restart the TokenGhost proxy server process.",
        {},
        async () => {
            try {
                setTimeout(() => {
                    process.exit(0);
                }, 500);
                return {
                    content: [{ type: "text", text: "⚡ TokenGhost proxy server restart initiated." }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }]
                };
            }
        }
    );

    // 5. Tool: log_token_usage
    server.tool(
        "log_token_usage",
        "Log estimated tokens used in an interaction.",
        {
            input_tokens: z.number().describe("Number of input tokens"),
            output_tokens: z.number().describe("Number of output tokens"),
            provider: z.string().optional().default("gemini").describe("Provider name"),
            model: z.string().optional().default("antigravity").describe("Model name"),
            agent: z.string().optional().describe("Agent or client name")
        },
        async ({ input_tokens, output_tokens, provider, model, agent }) => {
            try {
                logTokenUsage({
                    provider,
                    model,
                    agent,
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

    // 6. Tool: get_recent_logs
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

    // 7. Tool: open_dashboard
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

    // 8. Tool: clear_token_logs
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

    // MCP Resource: Today's Stats & Budget
    server.resource(
        "today-stats",
        "tokenghost://stats/today",
        async (uri) => {
            const stats = getTokenStats("today");
            const budgetLabel = stats.budget.is_unlimited ? "♾️ Unlimited" : `$${stats.budget.global_daily_usd.toFixed(2)} USD (${stats.budget.used_percent}% used)`;
            return {
                contents: [{
                    uri: uri.href,
                    text: `Token Usage (Today): ${stats.global.total_tokens.toLocaleString()} tokens | Cost: $${stats.global.estimated_cost_usd.toFixed(4)} USD | Budget: ${budgetLabel}`
                }]
            };
        }
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
}
