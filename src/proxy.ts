import http from 'http';
import httpProxy from 'http-proxy';
import { logTokenUsage, getLogsAsCsv, getLogsAsJson, getTokenStats, getRecentLogs, getTimeSeriesStats } from './db';
import { handleDashboard } from './dashboard';

let activeProxyPort = 8338;

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

export function startProxy(port: number) {
  activeProxyPort = port;

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

    // 3. Export Endpoints
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

    // 4. Proxy Routing
    let target = '';
    let provider = 'unknown';
    
    if (req.url?.startsWith('/openai/')) {
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
      target = 'https://api.anthropic.com';
      provider = req.headers['x-provider'] as string;
    } else {
      target = 'https://api.anthropic.com';
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

  proxy.on('proxyRes', (proxyRes, req, res) => {
    const provider = (req as any).__provider || 'unknown';
    let buffer = '';

    proxyRes.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
    });

    proxyRes.on('end', () => {
        try {
           let input_tokens = 0;
           let output_tokens = 0;

           const modelMatch = buffer.match(/"model"\s*:\s*"([^"]+)"/);
           const model = modelMatch ? modelMatch[1] : 'unknown';

           if (provider === 'anthropic') {
               const inMatches = [...buffer.matchAll(/"input_tokens"\s*:\s*(\d+)/g)];
               const outMatches = [...buffer.matchAll(/"output_tokens"\s*:\s*(\d+)/g)];
               if (inMatches.length > 0) input_tokens = parseInt(inMatches[inMatches.length - 1][1]);
               let maxOut = 0;
               for (const m of outMatches) {
                   const val = parseInt(m[1]);
                   if (val > maxOut) maxOut = val;
               }
               output_tokens = maxOut;

           } else if (provider === 'openai' || provider === 'deepseek' || provider === 'openrouter' || provider === 'groq') {
               const promptMatches = [...buffer.matchAll(/"prompt_tokens"\s*:\s*(\d+)/g)];
               const compMatches = [...buffer.matchAll(/"completion_tokens"\s*:\s*(\d+)/g)];
               if (promptMatches.length > 0) input_tokens = parseInt(promptMatches[promptMatches.length - 1][1]);
               if (compMatches.length > 0) output_tokens = parseInt(compMatches[compMatches.length - 1][1]);
           } else if (provider === 'gemini') {
               const promptMatches = [...buffer.matchAll(/"promptTokenCount"\s*:\s*(\d+)/g)];
               const compMatches = [...buffer.matchAll(/"candidatesTokenCount"\s*:\s*(\d+)/g)];
               if (promptMatches.length > 0) input_tokens = parseInt(promptMatches[promptMatches.length - 1][1]);
               if (compMatches.length > 0) output_tokens = parseInt(compMatches[compMatches.length - 1][1]);
           } else if (provider === 'ollama') {
               const promptMatches = [...buffer.matchAll(/"prompt_eval_count"\s*:\s*(\d+)/g)];
               const compMatches = [...buffer.matchAll(/"eval_count"\s*:\s*(\d+)/g)];
               if (promptMatches.length > 0) input_tokens = parseInt(promptMatches[promptMatches.length - 1][1]);
               if (compMatches.length > 0) output_tokens = parseInt(compMatches[compMatches.length - 1][1]);
           }

           if (input_tokens > 0 || output_tokens > 0) {
               logTokenUsage({
                   provider,
                   model,
                   input_tokens,
                   output_tokens,
                   total_tokens: input_tokens + output_tokens
               });
               console.log(`[TokenGhost] 👻 Logged ${input_tokens} In, ${output_tokens} Out | Model: ${model} | Provider: ${provider}`);
           }
        } catch(e) {}
    });
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

  server.listen(port);

  return server;
}
