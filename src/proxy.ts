import http from 'http';
import httpProxy from 'http-proxy';
import { logTokenUsage, getLogsAsCsv, getLogsAsJson, getTokenStats, getRecentLogs, getTimeSeriesStats } from './db';
import { handleDashboard } from './dashboard';

let activeProxyPort = 8338;
let currentServerInstance: http.Server | null = null;
let proxyResListenerRegistered = false;
const recentLogFingerprints = new Map<string, number>();
const LOG_DEDUP_WINDOW_MS = 1500;

export function getActivePort(): number {
  return activeProxyPort;
}

const proxy = httpProxy.createProxyServer({
  secure: false,
  changeOrigin: true
});

proxy.on('error', (err, req, res) => {
  console.error('[TokenGhost Proxy] Error:', err.message);
  if (res && 'writeHead' in res && !res.headersSent) {
    (res as http.ServerResponse).writeHead(502, { 'Content-Type': 'text/plain' });
  }
  if (res && 'end' in res) {
    res.end('Proxy error: ' + err.message);
  }
});

function scanForSecrets(content: string): { hasSecret: boolean; type?: string } {
  if (!content) return { hasSecret: false };

  if (/AKIA[0-9A-Z]{16}/.test(content)) return { hasSecret: true, type: 'AWS Key' };
  if (/sk-[a-zA-Z0-9]{32,}/.test(content)) return { hasSecret: true, type: 'OpenAI/API Key' };
  if (/BEGIN (RSA |EC |PGP )?PRIVATE KEY/.test(content)) return { hasSecret: true, type: 'Private Key' };
  if (/"password"\s*:\s*"[^"]+"/.test(content)) return { hasSecret: true, type: 'Password' };
  if (/Bearer\s+eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/.test(content)) return { hasSecret: true, type: 'JWT Token' };

  return { hasSecret: false };
}

function shouldLogFingerprint(fingerprint: string): boolean {
  const now = Date.now();

  for (const [fp, ts] of recentLogFingerprints) {
    if (now - ts > LOG_DEDUP_WINDOW_MS) {
      recentLogFingerprints.delete(fp);
    }
  }

  const prev = recentLogFingerprints.get(fingerprint);
  if (prev && now - prev <= LOG_DEDUP_WINDOW_MS) {
    return false;
  }

  recentLogFingerprints.set(fingerprint, now);
  return true;
}

function targetFromProvider(provider: string): string {
  switch ((provider || '').toLowerCase()) {
    case 'copilot':
      return 'https://api.githubcopilot.com';
    case 'openai':
      return 'https://api.openai.com';
    case 'anthropic':
      return 'https://api.anthropic.com';
    case 'gemini':
      return 'https://generativelanguage.googleapis.com';
    case 'deepseek':
      return 'https://api.deepseek.com';
    case 'openrouter':
      return 'https://openrouter.ai/api';
    case 'groq':
      return 'https://api.groq.com/openai';
    case 'ollama':
      return 'http://localhost:11434';
    default:
      return 'https://api.anthropic.com';
  }
}

function registerProxyResHandlerOnce() {
  if (proxyResListenerRegistered) {
    return;
  }

  proxy.on('proxyRes', (proxyRes, req, res) => {
    const provider = (req as any).__provider || 'unknown';
    const securityWarning = (req as any).__securityWarning || { hasSecret: false };
    let buffer = '';

    proxyRes.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
    });

    proxyRes.on('end', () => {
      try {
        let input_tokens = 0;
        let output_tokens = 0;
        let cached_tokens = 0;

        const modelMatch = buffer.match(/"model"\s*:\s*"([^"]+)"/);
        const model = modelMatch ? modelMatch[1] : 'unknown';

        if (provider === 'anthropic') {
          const inMatches = [...buffer.matchAll(/"input_tokens"\s*:\s*(\d+)/g)];
          const outMatches = [...buffer.matchAll(/"output_tokens"\s*:\s*(\d+)/g)];
          const cacheMatches = [...buffer.matchAll(/"cache_read_input_tokens"\s*:\s*(\d+)/g)];

          if (inMatches.length > 0) input_tokens = parseInt(inMatches[inMatches.length - 1][1]);
          if (cacheMatches.length > 0) cached_tokens = parseInt(cacheMatches[cacheMatches.length - 1][1]);

          let maxOut = 0;
          for (const m of outMatches) {
            const val = parseInt(m[1]);
            if (val > maxOut) maxOut = val;
          }
          output_tokens = maxOut;
        } else if (provider === 'copilot' || provider === 'openai' || provider === 'deepseek' || provider === 'openrouter' || provider === 'groq') {
          const promptMatches = [...buffer.matchAll(/"prompt_tokens"\s*:\s*(\d+)/g)];
          const compMatches = [...buffer.matchAll(/"completion_tokens"\s*:\s*(\d+)/g)];
          const cachedMatches = [...buffer.matchAll(/"cached_tokens"\s*:\s*(\d+)/g)];
          const hitMatches = [...buffer.matchAll(/"prompt_cache_hit_tokens"\s*:\s*(\d+)/g)];

          if (promptMatches.length > 0) input_tokens = parseInt(promptMatches[promptMatches.length - 1][1]);
          if (compMatches.length > 0) output_tokens = parseInt(compMatches[compMatches.length - 1][1]);
          if (cachedMatches.length > 0) cached_tokens = parseInt(cachedMatches[cachedMatches.length - 1][1]);
          if (hitMatches.length > 0) cached_tokens = parseInt(hitMatches[hitMatches.length - 1][1]);
        } else if (provider === 'gemini') {
          const promptMatches = [...buffer.matchAll(/"promptTokenCount"\s*:\s*(\d+)/g)];
          const compMatches = [...buffer.matchAll(/"candidatesTokenCount"\s*:\s*(\d+)/g)];
          const cachedMatches = [...buffer.matchAll(/"cachedContentTokenCount"\s*:\s*(\d+)/g)];

          if (promptMatches.length > 0) input_tokens = parseInt(promptMatches[promptMatches.length - 1][1]);
          if (compMatches.length > 0) output_tokens = parseInt(compMatches[compMatches.length - 1][1]);
          if (cachedMatches.length > 0) cached_tokens = parseInt(cachedMatches[cachedMatches.length - 1][1]);
        } else if (provider === 'ollama') {
          const promptMatches = [...buffer.matchAll(/"prompt_eval_count"\s*:\s*(\d+)/g)];
          const compMatches = [...buffer.matchAll(/"eval_count"\s*:\s*(\d+)/g)];
          if (promptMatches.length > 0) input_tokens = parseInt(promptMatches[promptMatches.length - 1][1]);
          if (compMatches.length > 0) output_tokens = parseInt(compMatches[compMatches.length - 1][1]);
        }

        if (input_tokens > 0 || output_tokens > 0) {
          const fingerprint = [provider, model, input_tokens, output_tokens, cached_tokens].join('|');
          if (!shouldLogFingerprint(fingerprint)) {
            return;
          }

          logTokenUsage({
            provider,
            model,
            input_tokens,
            output_tokens,
            total_tokens: input_tokens + output_tokens,
            cached_tokens,
            has_security_warning: securityWarning.hasSecret,
            security_warning_type: securityWarning.type
          });
          console.log(`[TokenGhost] 👻 Logged ${input_tokens} In (${cached_tokens} Cached), ${output_tokens} Out | Model: ${model} | Provider: ${provider}`);
        }
      } catch (e) {}
    });
  });

  proxyResListenerRegistered = true;
}

export function startProxy(port: number) {
  registerProxyResHandlerOnce();
  activeProxyPort = port;

  if (currentServerInstance) {
    try {
      currentServerInstance.close();
    } catch (e) {}
  }

  const server = http.createServer((req, res) => {
    // 1. Dashboard Endpoint
    if (req.url === '/' || req.url === '/stats') {
        return handleDashboard(req, res);
    }

    // 2. JSON Stats API for Live Auto-Refresh
    if (req.url === '/api/stats') {
      const today = getTokenStats('today');
      const yesterday = getTokenStats('yesterday');
      const all = getTokenStats('all');
      const recentLogs = getRecentLogs(100);
      const timeSeriesData = getTimeSeriesStats();

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ today, yesterday, all, recentLogs, timeSeriesData }));
      return;
    }

    // 3. Restart Proxy API Endpoint (In-Memory Hot Reload)
    if (req.url === '/api/restart' && (req.method === 'POST' || req.method === 'GET')) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ success: true, message: 'TokenGhost proxy server successfully restarted in-memory.' }));
      console.log('[TokenGhost] ⚡ Restart request received. Hot-reloading server instance in-memory...');
      setTimeout(() => {
        try {
          server.close(() => {
            startProxy(port);
          });
        } catch (e) {
          startProxy(port);
        }
      }, 500);
      return;
    }

    // 4. Export Endpoints
    if (req.url === '/export/csv') {
      const csv = getLogsAsCsv();
      res.writeHead(200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="tokenghost_logs.csv"'
      });
      res.end(csv);
      return;
    }

    if (req.url === '/export/json') {
      const json = getLogsAsJson();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="tokenghost_logs.json"'
      });
      res.end(json);
      return;
    }

    // 5. Proxy Routing & Secret Scanning
    let target = '';
    let provider = 'unknown';

    let requestBodyBuffer = '';
    req.on('data', (chunk) => {
      requestBodyBuffer += chunk.toString('utf8');
    });

    req.on('end', () => {
      const secretCheck = scanForSecrets(requestBodyBuffer);
      (req as any).__securityWarning = secretCheck;
    });
    
    if (req.url?.startsWith('/copilot/')) {
      target = 'https://api.githubcopilot.com';
      req.url = req.url.replace('/copilot', '');
      provider = 'copilot';
    } else if (req.url?.startsWith('/openai/')) {
      target = 'https://api.openai.com';
      req.url = req.url.replace('/openai', '');
      provider = 'openai';
    } else if (req.url?.startsWith('/anthropic/')) {
      target = 'https://api.anthropic.com';
      req.url = req.url.replace('/anthropic', '');
      provider = 'anthropic';
    } else if (req.url?.startsWith('/gemini/')) {
      target = 'https://generativelanguage.googleapis.com';
      req.url = req.url.replace('/gemini', '');
      provider = 'gemini';
    } else if (req.url?.startsWith('/deepseek/')) {
      target = 'https://api.deepseek.com';
      req.url = req.url.replace('/deepseek', '');
      provider = 'deepseek';
    } else if (req.url?.startsWith('/openrouter/')) {
      target = 'https://openrouter.ai/api';
      req.url = req.url.replace('/openrouter', '');
      provider = 'openrouter';
    } else if (req.url?.startsWith('/groq/')) {
      target = 'https://api.groq.com/openai';
      req.url = req.url.replace('/groq', '');
      provider = 'groq';
    } else if (req.url?.startsWith('/ollama/')) {
      target = 'http://localhost:11434';
      req.url = req.url.replace('/ollama', '');
      provider = 'ollama';
    } else if (req.headers['x-provider']) {
      provider = String(req.headers['x-provider']).toLowerCase();
      target = targetFromProvider(provider);
    } else {
      target = targetFromProvider('anthropic');
      provider = 'anthropic';
    }

    (req as any).__provider = provider;

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*'
        });
        res.end();
        return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    proxy.web(req, res, { target });
  });

  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[TokenGhost] ⚠️ Port ${port} is already in use. Retrying on a random available port...`);
      server.close();
      server.listen(0);
    } else {
      console.error('[TokenGhost Proxy] Server error:', e);
    }
  });

  server.on('listening', () => {
    const address = server.address();
    const boundPort = typeof address === 'object' && address ? address.port : port;
    activeProxyPort = boundPort;
    const portLabel = boundPort === port ? `${boundPort}` : `${boundPort} (Dynamic Port)`;
    console.log(`\n👻 TokenGhost Proxy running on http://localhost:${portLabel}`);
    console.log(`📊 Dashboard available at http://localhost:${portLabel}/stats\n`);
  });

  currentServerInstance = server;
  server.requestTimeout = 60_000;
  server.headersTimeout = 65_000;
  server.listen(port);

  return server;
}
