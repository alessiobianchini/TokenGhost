import fs from 'fs';
import os from 'os';
import path from 'path';

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function ok(message: string) {
  console.log(`✅ ${message}`);
}

function main() {
  const cwd = process.cwd();
  const distPath = path.join(cwd, 'dist', 'index.js');
  const workspaceMcpPath = path.join(cwd, '.vscode', 'mcp.json');
  const userMcpPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'mcp.json');

  if (!fs.existsSync(distPath)) {
    fail(`Missing build artifact: ${distPath}`);
  }
  ok('Build artifact exists (dist/index.js)');

  if (!fs.existsSync(workspaceMcpPath)) {
    fail(`Missing workspace MCP config: ${workspaceMcpPath}`);
  }

  const workspaceMcp = JSON.parse(fs.readFileSync(workspaceMcpPath, 'utf8'));
  const wsServer = workspaceMcp?.servers?.tokenghost;
  if (!wsServer) {
    fail('Workspace MCP config does not contain servers.tokenghost');
  }
  if (wsServer.type !== 'stdio') {
    fail('Workspace tokenghost server type must be "stdio"');
  }
  ok('Workspace MCP config is valid');

  if (!fs.existsSync(userMcpPath)) {
    fail(`Missing VS Code user MCP config: ${userMcpPath}`);
  }

  const userMcp = JSON.parse(fs.readFileSync(userMcpPath, 'utf8'));
  const userServer = userMcp?.servers?.tokenghost;
  if (!userServer) {
    fail('User MCP config does not contain servers.tokenghost');
  }
  if (userServer.type !== 'stdio') {
    fail('User tokenghost server type must be "stdio"');
  }
  ok('User MCP config is valid');

  console.log('🎉 TokenGhost setup verification completed successfully.');
}

main();
