import { startProxy } from './proxy';
import { startMcpServer } from './mcp';

async function main() {
    // If the process is launched with --mcp, it enables the MCP protocol on stdio
    const isMcp = process.argv.includes('--mcp');

    // If running in MCP mode, stdout MUST be reserved for JSON-RPC. 
    // We redirect normal console.log to console.error (stderr) so we don't break the protocol.
    // Stderr is perfectly fine and IDEs show it in their logs.
    if (isMcp) {
        const originalLog = console.log;
        console.log = (...args) => {
            console.error(...args);
        };
    }

    const port = parseInt(process.env.PORT || '3000', 10);
    
    // Start the Zero-Latency Proxy & Dashboard
    startProxy(port);

    // Start the MCP Server if requested
    if (isMcp) {
        await startMcpServer();
        console.error('[TokenGhost] 👻 MCP Server connected on stdio.');
    }
}

main().catch(console.error);
