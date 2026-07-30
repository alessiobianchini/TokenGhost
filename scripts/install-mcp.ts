import fs from 'fs';
import path from 'path';
import os from 'os';

function installAll() {
    console.log('👻 TokenGhost All-In-One Universal Installer');
    console.log('---------------------------------------------');

    const homedir = os.homedir();
    const appData = process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming');
    const currentDir = process.cwd().replace(/\\/g, '/');
    const scriptPath = path.join(currentDir, 'dist', 'index.js').replace(/\\/g, '/');

    let totalConfigured = 0;

    // 1. Antigravity Configuration (~/.gemini/config/mcp_config.json)
    const antigravityPath = path.join(homedir, '.gemini', 'config', 'mcp_config.json');
    if (fs.existsSync(antigravityPath)) {
        try {
            const raw = fs.readFileSync(antigravityPath, 'utf8');
            let config = JSON.parse(raw);
            if (!config.mcpServers) config.mcpServers = {};
            config.mcpServers['tokenghost'] = {
                command: 'node',
                args: [scriptPath, '--mcp']
            };
            fs.writeFileSync(antigravityPath, JSON.stringify(config, null, 2));
            console.log('✅ Installed TokenGhost MCP into Antigravity config');
            totalConfigured++;
        } catch (e: any) {
            console.error('⚠️ Could not update Antigravity config:', e.message);
        }
    }

    // 2. Workspace .vscode/mcp.json
    try {
        const vscodeFolder = path.join(process.cwd(), '.vscode');
        if (!fs.existsSync(vscodeFolder)) {
            fs.mkdirSync(vscodeFolder, { recursive: true });
        }
        const workspaceMcpPath = path.join(vscodeFolder, 'mcp.json');
        const workspaceConfig = {
            mcpServers: {
                tokenghost: {
                    command: 'node',
                    args: [scriptPath, '--mcp']
                }
            }
        };
        fs.writeFileSync(workspaceMcpPath, JSON.stringify(workspaceConfig, null, 2));
        console.log('✅ Installed TokenGhost MCP into Workspace (.vscode/mcp.json)');
        totalConfigured++;
    } catch (e: any) {
        console.error('⚠️ Could not update .vscode/mcp.json:', e.message);
    }

    // 3. Global VS Code Settings & Copilot Instructions
    const vscodeSettingsPath = path.join(appData, 'Code', 'User', 'settings.json');
    if (fs.existsSync(vscodeSettingsPath)) {
        try {
            const raw = fs.readFileSync(vscodeSettingsPath, 'utf8');
            let settings = JSON.parse(raw);

            // Copilot Instructions
            if (!settings['github.copilot.chat.codeGeneration.instructions']) {
                settings['github.copilot.chat.codeGeneration.instructions'] = [];
            }
            const existing = settings['github.copilot.chat.codeGeneration.instructions'];
            const tokenGhostInstruction = "Mandatory Token Auto-Logging: TokenGhost is active. Use the TokenGhost MCP tool `get_token_stats` to query stats, and `log_token_usage` to record token consumption.";
            
            const exists = existing.some((item: any) => 
                (typeof item === 'string' && item.includes('TokenGhost')) || 
                (item.text && item.text.includes('TokenGhost'))
            );
            if (!exists) {
                existing.push({ text: tokenGhostInstruction });
            }

            // VS Code Native MCP Registration
            if (!settings['mcp.servers']) settings['mcp.servers'] = {};
            settings['mcp.servers']['tokenghost'] = { command: 'node', args: [scriptPath, '--mcp'] };

            if (!settings['mcpServers']) settings['mcpServers'] = {};
            settings['mcpServers']['tokenghost'] = { command: 'node', args: [scriptPath, '--mcp'] };

            fs.writeFileSync(vscodeSettingsPath, JSON.stringify(settings, null, 2));
            console.log('✅ Installed TokenGhost MCP & Copilot instructions into VS Code Global Settings');
            totalConfigured++;
        } catch (e: any) {
            console.error('⚠️ Could not update VS Code Settings:', e.message);
        }
    }

    // 4. Cursor User Settings (if present)
    const cursorSettingsPath = path.join(appData, 'Cursor', 'User', 'settings.json');
    if (fs.existsSync(cursorSettingsPath)) {
        try {
            const raw = fs.readFileSync(cursorSettingsPath, 'utf8');
            let settings = JSON.parse(raw);
            if (!settings['mcp.servers']) settings['mcp.servers'] = {};
            settings['mcp.servers']['tokenghost'] = { command: 'node', args: [scriptPath, '--mcp'] };
            fs.writeFileSync(cursorSettingsPath, JSON.stringify(settings, null, 2));
            console.log('✅ Installed TokenGhost MCP into Cursor Settings');
            totalConfigured++;
        } catch (e: any) {}
    }

    console.log('\n✨ Universal Auto-Installation Complete! Configured ' + totalConfigured + ' targets.');
    console.log('💡 Tip: Reload your IDE window (F1 -> Developer: Reload Window) for changes to take effect.');
}

installAll();
