import fs from 'fs';
import path from 'path';
import os from 'os';

async function configureIDE() {
    console.log('🤖 TokenGhost IDE Auto-Configuration Utility\n');

    const homeDir = os.homedir();
    const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
    const projectDistPath = path.join(__dirname, '..', 'dist', 'index.js').replace(/\\/g, '/');

    // 1. Workspace .vscode/mcp.json
    const vscodeFolder = path.join(__dirname, '..', '.vscode');
    if (!fs.existsSync(vscodeFolder)) {
        fs.mkdirSync(vscodeFolder, { recursive: true });
    }
    const workspaceMcpPath = path.join(vscodeFolder, 'mcp.json');
    const workspaceMcpConfig = {
        servers: {
            tokenghost: {
                type: "stdio",
                command: "node",
                args: [projectDistPath, "--mcp"]
            }
        }
    };
    fs.writeFileSync(workspaceMcpPath, JSON.stringify(workspaceMcpConfig, null, 2), 'utf-8');
    console.log(`✅ Created workspace MCP configuration at ${workspaceMcpPath}`);

    // 2. VS Code User-level mcp.json (read by VS Code MCP panel)
    const vscodeMcpJsonPath = path.join(appData, 'Code', 'User', 'mcp.json');
    try {
        let mcpJson: any = { servers: {}, inputs: [] };
        if (fs.existsSync(vscodeMcpJsonPath)) {
            mcpJson = JSON.parse(fs.readFileSync(vscodeMcpJsonPath, 'utf-8'));
        }
        if (!mcpJson.servers) mcpJson.servers = {};
        mcpJson.servers['tokenghost'] = { type: 'stdio', command: 'node', args: [projectDistPath, '--mcp'] };
        fs.writeFileSync(vscodeMcpJsonPath, JSON.stringify(mcpJson, null, '\t'), 'utf-8');
        console.log(`✅ Installed TokenGhost MCP into VS Code User mcp.json (${vscodeMcpJsonPath})`);
    } catch (err: any) {
        console.error(`⚠️ Could not update VS Code User mcp.json: ${err.message}`);
    }

    // 2b. Global VS Code Settings Path
    const vscodeSettingsPath = path.join(appData, 'Code', 'User', 'settings.json');

    if (fs.existsSync(vscodeSettingsPath)) {
        try {
            const raw = fs.readFileSync(vscodeSettingsPath, 'utf-8');
            const settings = JSON.parse(raw);

            // Enable Chat MCP flags
            settings['chat.mcp.enabled'] = true;
            settings['github.copilot.chat.mcp.enabled'] = true;

            // Route GitHub Copilot traffic through TokenGhost Proxy
            if (!settings['github.copilot.advanced']) {
                settings['github.copilot.advanced'] = {};
            }
            settings['github.copilot.advanced']['debug.overrideCapiUrl'] = 'http://localhost:8338/openai';

            // Inject Copilot Instructions
            if (!settings['github.copilot.chat.codeGeneration.instructions']) {
                settings['github.copilot.chat.codeGeneration.instructions'] = [];
            }

            const existingInstructions = settings['github.copilot.chat.codeGeneration.instructions'];
            const tokenGhostInstructionText = "Mandatory Token Auto-Logging: TokenGhost is active. Use the TokenGhost MCP tool `get_token_stats` to query stats, and `log_token_usage` to record token consumption.";

            const exists = existingInstructions.some((item: any) => 
                (typeof item === 'string' && item.includes('TokenGhost')) || 
                (item.text && item.text.includes('TokenGhost'))
            );

            if (!exists) {
                existingInstructions.push({ text: tokenGhostInstructionText });
            }

            // Inject Global VS Code MCP Server Configuration
            if (!settings['mcp.servers']) {
                settings['mcp.servers'] = {};
            }
            settings['mcp.servers']['tokenghost'] = {
                type: "stdio",
                command: "node",
                args: [projectDistPath, "--mcp"]
            };

            if (!settings['mcpServers']) {
                settings['mcpServers'] = {};
            }
            settings['mcpServers']['tokenghost'] = {
                type: "stdio",
                command: "node",
                args: [projectDistPath, "--mcp"]
            };

            fs.writeFileSync(vscodeSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');
            console.log(`✅ Injected TokenGhost Proxy & MCP Server into VS Code Settings (${vscodeSettingsPath})`);

        } catch (err: any) {
            console.error(`⚠️ Could not update VS Code Settings: ${err.message}`);
        }
    } else {
        console.log(`ℹ️ VS Code settings.json not found at ${vscodeSettingsPath}`);
    }

    console.log('\n👻 IDE Auto-Configuration Complete!');
}

configureIDE().catch(console.error);
