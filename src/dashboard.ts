import http from 'http';
import { getTokenStats, getRecentLogs } from './db';

export function handleDashboard(req: http.IncomingMessage, res: http.ServerResponse) {
    const today = getTokenStats('today');
    const yesterday = getTokenStats('yesterday');
    const all = getTokenStats('all');
    const recentLogs = getRecentLogs(50);

    // Raccogliamo tutti i provider unici per creare i filtri
    const providersSet = new Set<string>();
    Object.keys(all.providers).forEach(p => providersSet.add(p));
    
    let filterButtonsHtml = `<button class="filter-btn active" data-provider="all">All Providers</button>`;
    for (const p of Array.from(providersSet).sort()) {
        filterButtonsHtml += `<button class="filter-btn" data-provider="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</button>`;
    }

    let logsHtml = '';
    for (const log of recentLogs) {
        const rawTimestamp = log.timestamp || new Date().toISOString();
        const p = log.provider.toLowerCase();
        
        let badgeColor = '#555';
        if (p.includes('anthropic') || p.includes('claude')) badgeColor = '#d97757';
        else if (p.includes('openai') || p.includes('gpt')) badgeColor = '#10a37f';
        else if (p.includes('gemini') || p.includes('google')) badgeColor = '#1a73e8';

        logsHtml += `
            <tr class="log-row" data-provider="${log.provider}">
                <td class="local-time" data-timestamp="${rawTimestamp}">-</td>
                <td><span class="badge" style="background:${badgeColor}">${log.provider}</span></td>
                <td style="color:#bbb">${log.model || 'unknown'}</td>
                <td class="num">${log.input_tokens.toLocaleString()}</td>
                <td class="num">${log.output_tokens.toLocaleString()}</td>
                <td class="num total-col">${log.total_tokens.toLocaleString()}</td>
            </tr>
        `;
    }

    if (logsHtml === '') {
        logsHtml = '<tr id="no-logs"><td colspan="6" style="text-align: center; color: #888; padding: 2rem;">No logs found yet. Start sending messages!</td></tr>';
    }

    // Inseriamo i dati JSON nel template per farli leggere allo script lato client
    const statsData = JSON.stringify({
        today: today,
        yesterday: yesterday,
        all: all
    });

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>TokenGhost Dashboard</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #121212; color: #e0e0e0; margin: 0; padding: 2rem; max-width: 1200px; margin: 0 auto; }
            h1 { color: #bb86fc; margin-bottom: 0.5rem; }
            h1 span { font-size: 1rem; font-weight: normal; color: #888; margin-left: 1rem; }
            h2 { color: #03dac6; margin-top: 3rem; margin-bottom: 1rem; }
            
            .filters { display: flex; gap: 0.5rem; margin-top: 1.5rem; }
            .filter-btn { background: #252525; border: 1px solid #444; color: #aaa; padding: 0.5rem 1rem; border-radius: 20px; cursor: pointer; transition: all 0.2s; font-size: 0.9rem; font-weight: bold; text-transform: capitalize; }
            .filter-btn:hover { background: #333; color: #fff; }
            .filter-btn.active { background: #bb86fc; color: #000; border-color: #bb86fc; }
            
            .card-container { display: flex; gap: 1rem; margin-top: 1.5rem; flex-wrap: wrap; }
            .card { background: #1e1e1e; padding: 1.5rem; border-radius: 8px; flex: 1; min-width: 200px; border: 1px solid #333; transition: all 0.3s ease; }
            .card h3 { margin: 0 0 1rem 0; font-size: 1.2rem; color: #03dac6; }
            .stat { font-size: 2.5rem; font-weight: bold; margin: 0; color: #fff; }
            .sub-stats { font-size: 0.9rem; color: #aaa; margin-top: 0.5rem; }
            
            table { width: 100%; border-collapse: collapse; margin-top: 0; background: #1e1e1e; border-radius: 8px; overflow: hidden; border: 1px solid #333; }
            th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #2a2a2a; }
            th { background: #252525; color: #aaa; font-weight: normal; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; }
            tr:last-child td { border-bottom: none; }
            tr:hover { background: #252525; }
            .num { text-align: right; font-family: monospace; font-size: 1.1rem; }
            .total-col { color: #bb86fc; font-weight: bold; }
            .badge { padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: bold; color: white; text-transform: uppercase; }
            
            .instructions { margin-top: 3rem; background: #1e1e1e; padding: 1.5rem; border-radius: 8px; border: 1px solid #333; }
            code { background: #000; padding: 0.2rem 0.4rem; border-radius: 4px; color: #03dac6; }
        </style>
    </head>
    <body>
        <h1>👻 TokenGhost <span>Zero-latency token auditing proxy</span></h1>
        
        <div class="filters" id="provider-filters">
            ${filterButtonsHtml}
        </div>
        
        <div class="card-container">
            <div class="card">
                <h3>Today</h3>
                <div class="stat" id="stat-today-total">${today.global.total_tokens.toLocaleString()}</div>
                <div class="sub-stats" id="stat-today-sub">In: ${today.global.input_tokens.toLocaleString()} | Out: ${today.global.output_tokens.toLocaleString()}</div>
            </div>
            <div class="card">
                <h3>Yesterday</h3>
                <div class="stat" id="stat-yesterday-total">${yesterday.global.total_tokens.toLocaleString()}</div>
                <div class="sub-stats" id="stat-yesterday-sub">In: ${yesterday.global.input_tokens.toLocaleString()} | Out: ${yesterday.global.output_tokens.toLocaleString()}</div>
            </div>
            <div class="card">
                <h3>All Time</h3>
                <div class="stat" id="stat-all-total">${all.global.total_tokens.toLocaleString()}</div>
                <div class="sub-stats" id="stat-all-sub">In: ${all.global.input_tokens.toLocaleString()} | Out: ${all.global.output_tokens.toLocaleString()}</div>
            </div>
        </div>

        <h2>Activity Log</h2>
        <table>
            <thead>
                <tr>
                    <th>Timestamp</th>
                    <th>Provider</th>
                    <th>Model</th>
                    <th style="text-align: right;">Input</th>
                    <th style="text-align: right;">Output</th>
                    <th style="text-align: right;">Total Tokens</th>
                </tr>
            </thead>
            <tbody>
                ${logsHtml}
            </tbody>
        </table>

        <div class="instructions">
            <h3>How to use in your IDE</h3>
            <p>1. Change your IDE's API Base URL to the proxy:</p>
            <ul>
                <li>For Anthropic (Claude): <code>http://localhost:3000/anthropic</code></li>
                <li>For OpenAI (GPT): <code>http://localhost:3000/openai</code></li>
                <li>For Gemini (Google): <code>http://localhost:3000/gemini</code></li>
            </ul>
            <p>2. Keep using your IDE normally. Tokens will be logged silently without adding latency.</p>
        </div>

        <script>
            const statsData = ${statsData};

            // Aggiorna interfaccia UI quando si cambia provider
            function updateUI(provider) {
                // Aggiorna le Card dei totali
                const periods = ['today', 'yesterday', 'all'];
                periods.forEach(p => {
                    let data;
                    if (provider === 'all') {
                        data = statsData[p].global;
                    } else {
                        data = statsData[p].providers[provider] || { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
                    }
                    document.getElementById('stat-' + p + '-total').innerText = data.total_tokens.toLocaleString();
                    document.getElementById('stat-' + p + '-sub').innerText = 'In: ' + data.input_tokens.toLocaleString() + ' | Out: ' + data.output_tokens.toLocaleString();
                });

                // Filtra la tabella Activity Log
                const rows = document.querySelectorAll('.log-row');
                let visibleCount = 0;
                rows.forEach(row => {
                    if (provider === 'all' || row.getAttribute('data-provider') === provider) {
                        row.style.display = '';
                        visibleCount++;
                    } else {
                        row.style.display = 'none';
                    }
                });
                
                const noLogs = document.getElementById('no-logs');
                if (noLogs) {
                    if (visibleCount === 0 && rows.length > 0) {
                        noLogs.style.display = '';
                    } else {
                        noLogs.style.display = 'none';
                    }
                }
            }

            // Aggiungi eventi ai bottoni dei filtri
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    updateUI(e.target.getAttribute('data-provider'));
                });
            });

            // Converte i timestamp UTC nell'orario locale esatto del browser
            document.querySelectorAll('.local-time').forEach(el => {
                const ts = el.getAttribute('data-timestamp');
                if (ts) {
                    const d = new Date(ts);
                    if (!isNaN(d.getTime())) {
                        const date = d.toLocaleDateString();
                        const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        el.innerHTML = date + ' <span style="color:#888; font-size:0.9em">' + time + '</span>';
                    }
                }
            });
        </script>
    </body>
    </html>
    `;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
}
