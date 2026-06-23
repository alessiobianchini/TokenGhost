import http from 'http';
import httpProxy from 'http-proxy';
import { logTokenUsage } from './db';
import { handleDashboard } from './dashboard';

// Create the proxy server
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
  const server = http.createServer((req, res) => {
    // 1. Dashboard Endpoint
    if (req.url === '/' || req.url === '/stats') {
        return handleDashboard(req, res);
    }

    // 2. Proxy Routing
    let target = '';
    let provider = 'unknown';
    
    // Support URL routing (e.g. IDE points to http://localhost:3000/anthropic/v1/messages)
    if (req.url?.startsWith('/openai/')) {
      target = 'https://api.openai.com';
      req.url = req.url.replace('/openai', ''); // strip prefix
      provider = 'openai';
    } else if (req.url?.startsWith('/anthropic/')) {
      target = 'https://api.anthropic.com';
      req.url = req.url.replace('/anthropic', '');
      provider = 'anthropic';
    } else if (req.url?.startsWith('/gemini/')) {
      target = 'https://generativelanguage.googleapis.com';
      req.url = req.url.replace('/gemini', '');
      provider = 'gemini';
    } else if (req.headers['x-provider']) {
      target = 'https://api.anthropic.com';
      provider = req.headers['x-provider'] as string;
    } else {
      // Default fallback
      target = 'https://api.anthropic.com';
      provider = 'anthropic';
    }

    // Inject our provider info into the request object for the response handler
    (req as any).__provider = provider;

    // Handle CORS preflight explicitly so the IDE doesn't complain
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*'
        });
        res.end();
        return;
    }

    // Add CORS headers to all responses
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Forward the request
    proxy.web(req, res, { target });
  });

  // 3. The Zero-Latency Sniffer
  proxy.on('proxyRes', (proxyRes, req, res) => {
    const provider = (req as any).__provider || 'unknown';
    let buffer = '';

    // Passively spy on the stream without consuming it
    proxyRes.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
    });

    // Parse the tokens asymmetrically on completion
    proxyRes.on('end', () => {
        try {
           let input_tokens = 0;
           let output_tokens = 0;

           // Try to extract the model
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

           } else if (provider === 'openai') {
               const promptMatches = [...buffer.matchAll(/"prompt_tokens"\s*:\s*(\d+)/g)];
               const compMatches = [...buffer.matchAll(/"completion_tokens"\s*:\s*(\d+)/g)];
               if (promptMatches.length > 0) input_tokens = parseInt(promptMatches[promptMatches.length - 1][1]);
               if (compMatches.length > 0) output_tokens = parseInt(compMatches[compMatches.length - 1][1]);
           } else if (provider === 'gemini') {
               // Gemini format: usageMetadata: { promptTokenCount: X, candidatesTokenCount: Y }
               const promptMatches = [...buffer.matchAll(/"promptTokenCount"\s*:\s*(\d+)/g)];
               const compMatches = [...buffer.matchAll(/"candidatesTokenCount"\s*:\s*(\d+)/g)];
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
        } catch(e) {
            // Fails gracefully
        }
    });
  });

  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[TokenGhost] ⚠️ Port ${port} is already in use. Retrying on a random available port...`);
      // Close the server and try again on port 0
      server.close();
      server.listen(0);
    } else {
      console.error('[TokenGhost Proxy] Server error:', e);
    }
  });

  server.on('listening', () => {
    const address = server.address();
    const boundPort = typeof address === 'object' && address ? address.port : port;
    const portLabel = boundPort === port ? `${boundPort}` : `${boundPort} (Dynamic Port)`;
    console.log(`\n👻 TokenGhost Proxy running on http://localhost:${portLabel}`);
    console.log(`📊 Dashboard available at http://localhost:${portLabel}/stats\n`);
  });

  server.listen(port);

  return server;
}
