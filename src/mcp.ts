import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getTokenStats } from "./db";

export async function startMcpServer() {
    // Create an MCP server
    const server = new McpServer({
        name: "TokenGhost",
        version: "1.0.0"
    });

    // Add tool for getting stats
    server.tool(
        "get_token_stats",
        "Get the AI token consumption stats logged by the proxy.",
        {
            period: z.enum(["today", "yesterday", "all"]).describe("The period to get stats for.")
        },
        async ({ period }) => {
            try {
                const stats = getTokenStats(period);
                
                return {
                    content: [{
                        type: "text",
                        text: `Token usage for ${period}:\nInput Tokens: ${stats.global.input_tokens.toLocaleString()}\nOutput Tokens: ${stats.global.output_tokens.toLocaleString()}\nTotal Tokens: ${stats.global.total_tokens.toLocaleString()}`
                    }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }]
                };
            }
        }
    );

    // Add tool for logging tokens
    server.tool(
        "log_token_usage",
        "Log the estimated tokens used in this interaction.",
        {
            input_tokens: z.number().describe("Number of input tokens"),
            output_tokens: z.number().describe("Number of output tokens"),
            provider: z.string().optional().default("gemini").describe("Provider name"),
            model: z.string().optional().default("antigravity").describe("Model name")
        },
        async ({ input_tokens, output_tokens, provider, model }) => {
            try {
                const { logTokenUsage } = await import("./db");
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

    // Add tool for getting recent individual logs
    server.tool(
        "get_recent_logs",
        "Get the most recent individual token consumption logs.",
        {
            limit: z.number().optional().default(10).describe("Number of recent logs to fetch.")
        },
        async ({ limit }) => {
            try {
                const { getRecentLogs } = await import("./db");
                const logs = getRecentLogs(limit);
                return {
                    content: [{
                        type: "text",
                        text: logs.map(l => `[${l.timestamp}] Provider: ${l.provider}, Model: ${l.model}, Input: ${l.input_tokens}, Output: ${l.output_tokens}, Total: ${l.total_tokens}`).join('\n') || "No logs found."
                    }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }]
                };
            }
        }
    );

    // Add tool for opening the dashboard GUI
    server.tool(
        "open_dashboard",
        "Open the TokenGhost dashboard GUI in the user's default web browser.",
        {},
        async () => {
            try {
                const port = process.env.PORT || '8338';
                const url = `http://localhost:${port}/stats`;
                const { exec } = await import("child_process");
                let command = '';
                switch (process.platform) {
                    case 'darwin': command = `open ${url}`; break;
                    case 'win32': command = `start "" "${url}"`; break;
                    default: command = `xdg-open ${url}`; break;
                }
                exec(command);
                return {
                    content: [{ type: "text", text: `👻 Dashboard opened in the browser at ${url}` }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error: ${error.message}` }]
                };
            }
        }
    );

    // Connect it to stdio
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
