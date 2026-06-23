import fs from 'fs';
import path from 'path';
import os from 'os';

function installMcpForAntigravity() {
    const homedir = os.homedir();
    // Il percorso tipico per Antigravity su Windows è ~/.gemini/config/mcp_config.json
    // Su MacOS/Linux è sempre ~/.gemini/config/mcp_config.json
    const configPath = path.join(homedir, '.gemini', 'config', 'mcp_config.json');

    if (!fs.existsSync(configPath)) {
        console.log('⚠️ Antigravity config not found at ' + configPath);
        return false;
    }

    try {
        const raw = fs.readFileSync(configPath, 'utf8');
        let config = JSON.parse(raw);
        
        if (!config.mcpServers) {
            config.mcpServers = {};
        }

        // Calcoliamo il percorso assoluto in cui si trova TokenGhost in questo momento
        const currentDir = process.cwd();
        const scriptPath = path.join(currentDir, 'src', 'index.ts');

        config.mcpServers['tokenghost'] = {
            command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
            args: [
                'tsx',
                scriptPath,
                '--mcp'
            ]
        };

        // Scriviamo il file formattato
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('✅ Successfully installed TokenGhost MCP Server into Antigravity!');
        return true;
    } catch (e: any) {
        console.error('❌ Failed to update Antigravity config:', e.message);
        return false;
    }
}

console.log('👻 TokenGhost MCP Installer');
console.log('---------------------------');
const success = installMcpForAntigravity();

if (success) {
    console.log('\nPlease restart your IDE for the changes to take effect.');
} else {
    console.log('\nCould not automatically install. Please refer to the README to install manually.');
}
