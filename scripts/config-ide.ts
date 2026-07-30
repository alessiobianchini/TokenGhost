import fs from 'fs';
import path from 'path';
import os from 'os';

async function configureIDE() {
    console.log('🤖 TokenGhost IDE Auto-Configuration Utility\n');

    const homeDir = os.homedir();
    const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
    const projectDistPath = path.join(__dirname, '..', 'dist', 'index.js').replace(/\\/g, '/');

    // 1. VS Code Settings Path
    const vscodeSettingsPath = path.join(appData, 'Code', 'User', 'settings.json');

    if (fs.existsSync(vscodeSettingsPath)) {
        try {
            const raw = fs.readFileSync(vscodeSettingsPath, 'utf-8');
            const settings = JSON.parse(raw);

            // A. Inject Copilot Instructions
            if (!settings['github.copilot.chat.codeGeneration.instructions']) {
                settings['github.copilot.chat.codeGeneration.instructions'] = [];
            }

            const existingInstructions = settings['github.copilot.chat.codeGeneration.instructions'];
            const tokenGhostInstructionText = "Mandatory Token Auto-Logging: TokenGhost is active. You MUST automatically invoke the `log_token_usage` MCP tool at the end of every response/task to log estimated token consumption.";

            const exists = existingInstructions.some((item: any) => 
                (typeof item === 'string' && item.includes('TokenGhost')) || 
                (item.text && item.text.includes('TokenGhost'))
            );

            if (!exists) {
                existingInstructions.push({ text: tokenGhostInstructionText });
            }

            // B. Inject Native VS Code MCP Server Configuration
            if (!settings['mcp.servers']) {
                settings['mcp.servers'] = {};
            }

            settings['mcp.servers']['tokenghost'] = {
                command: "node",
                args: [projectDistPath, "--mcp"]
            };

            if (!settings['mcpServers']) {
                settings['mcpServers'] = {};
            }
            settings['mcpServers']['tokenghost'] = {
                command: "node",
                args: [projectDistPath, "--mcp"]
            };

            fs.writeFileSync(vscodeSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');
            console.log(`✅ Injected TokenGhost MCP Server and Copilot Instructions into VS Code Settings (${vscodeSettingsPath})`);

        } catch (err: any) {
            console.error(`⚠️ Could not update VS Code Settings: ${err.message}`);
        }
    } else {
        console.log(`ℹ️ VS Code settings.json not found at ${vscodeSettingsPath}`);
    }

    console.log('\n👻 IDE Auto-Configuration Complete!');
}

configureIDE().catch(console.error);
