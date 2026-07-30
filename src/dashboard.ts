import http from 'http';
import { getTokenStats, getRecentLogs } from './db';

export function handleDashboard(req: http.IncomingMessage, res: http.ServerResponse) {
    const today = getTokenStats('today');
    const yesterday = getTokenStats('yesterday');
    const all = getTokenStats('all');
    const recentLogs = getRecentLogs(100);

    const providersSet = new Set<string>();
    Object.keys(all.providers).forEach(p => providersSet.add(p));
    
    let filterButtonsHtml = `<button class="filter-btn active" data-provider="all">All Providers</button>`;
    for (const p of Array.from(providersSet).sort()) {
        filterButtonsHtml += `<button class="filter-btn" data-provider="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</button>`;
    }

    // Prepare Activity Log rows
    let logsHtml = '';
    for (const log of recentLogs) {
        const rawTimestamp = log.timestamp || new Date().toISOString();
        const p = log.provider.toLowerCase();
        const cost = (log.estimated_cost_usd || 0).toFixed(4);
        
        let badgeColor = '#555';
        if (p.includes('anthropic') || p.includes('claude')) badgeColor = '#d97757';
        else if (p.includes('openai') || p.includes('gpt')) badgeColor = '#10a37f';
        else if (p.includes('gemini') || p.includes('google')) badgeColor = '#1a73e8';
        else if (p.includes('deepseek')) badgeColor = '#4d6bfe';
        else if (p.includes('openrouter')) badgeColor = '#ff6b00';
        else if (p.includes('groq')) badgeColor = '#f55036';
        else if (p.includes('ollama')) badgeColor = '#888888';

        logsHtml += `
            <tr class="log-row" data-provider="${log.provider}">
                <td class="local-time" data-timestamp="${rawTimestamp}">-</td>
                <td><span class="badge" style="background:${badgeColor}">${log.provider}</span></td>
                <td style="color:#bbb; font-weight: 500;">${log.model || 'unknown'}</td>
                <td class="num">${log.input_tokens.toLocaleString()}</td>
                <td class="num">${log.output_tokens.toLocaleString()}</td>
                <td class="num total-col">${log.total_tokens.toLocaleString()}</td>
                <td class="num cost-col">$${cost}</td>
            </tr>
        `;
    }

    if (logsHtml === '') {
        logsHtml = '<tr id="no-logs"><td colspan="7" style="text-align: center; color: #888; padding: 2.5rem;">No logs recorded yet. Start interacting with AI models!</td></tr>';
    }

    // Prepare Model Breakdown rows for All-Time
    let modelsHtml = '';
    const sortedModels = Object.entries(all.models).sort((a, b) => b[1].total_tokens - a[1].total_tokens);
    for (const [modelName, mData] of sortedModels) {
        modelsHtml += `
            <tr>
                <td style="color: #03dac6; font-weight: 600;">${modelName}</td>
                <td class="num">${mData.input_tokens.toLocaleString()}</td>
                <td class="num">${mData.output_tokens.toLocaleString()}</td>
                <td class="num total-col">${mData.total_tokens.toLocaleString()}</td>
                <td class="num cost-col">$${mData.estimated_cost_usd.toFixed(4)} USD</td>
            </tr>
        `;
    }
    if (modelsHtml === '') {
        modelsHtml = '<tr><td colspan="5" style="text-align: center; color: #888; padding: 2rem;">No model data available yet.</td></tr>';
    }

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
            :root {
                --bg-color: #121214;
                --surface-color: #1a1a1e;
                --surface-border: #2a2a30;
                --primary: #bb86fc;
                --secondary: #03dac6;
                --text-main: #e0e0e6;
                --text-muted: #888894;
            }
            * { box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: var(--bg-color); color: var(--text-main); margin: 0; padding: 0; }
            
            /* Navbar */
            .navbar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background-color: var(--surface-color);
                border-bottom: 1px solid var(--surface-border);
                padding: 0.8rem 2rem;
                position: sticky;
                top: 0;
                z-index: 100;
                backdrop-filter: blur(10px);
            }
            .nav-brand {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                font-size: 1.3rem;
                font-weight: 700;
                color: var(--primary);
            }
            .nav-brand span.subtitle {
                font-size: 0.85rem;
                font-weight: 400;
                color: var(--text-muted);
                border-left: 1px solid var(--surface-border);
                padding-left: 0.75rem;
            }
            .nav-links {
                display: flex;
                gap: 0.5rem;
            }
            .nav-tab {
                background: transparent;
                border: none;
                color: var(--text-muted);
                padding: 0.6rem 1.2rem;
                border-radius: 6px;
                font-weight: 600;
                font-size: 0.95rem;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 0.4rem;
            }
            .nav-tab:hover {
                color: var(--text-main);
                background: rgba(255, 255, 255, 0.05);
            }
            .nav-tab.active {
                color: var(--primary);
                background: rgba(187, 134, 252, 0.12);
            }
            .status-badge {
                display: flex;
                align-items: center;
                gap: 0.4rem;
                font-size: 0.8rem;
                color: var(--secondary);
                background: rgba(3, 218, 198, 0.1);
                border: 1px solid rgba(3, 218, 198, 0.3);
                padding: 0.3rem 0.7rem;
                border-radius: 20px;
                font-weight: 600;
            }
            .status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background-color: var(--secondary);
                box-shadow: 0 0 8px var(--secondary);
            }

            /* Container & Tab Views */
            .main-container {
                max-width: 1200px;
                margin: 2rem auto;
                padding: 0 1.5rem;
            }
            .tab-content {
                display: none;
                animation: fadeIn 0.25s ease;
            }
            .tab-content.active {
                display: block;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(6px); }
                to { opacity: 1; transform: translateY(0); }
            }

            /* Filters */
            .filters { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
            .filter-btn { background: var(--surface-color); border: 1px solid var(--surface-border); color: var(--text-muted); padding: 0.5rem 1rem; border-radius: 20px; cursor: pointer; transition: all 0.2s; font-size: 0.85rem; font-weight: 600; text-transform: capitalize; }
            .filter-btn:hover { background: #25252b; color: var(--text-main); }
            .filter-btn.active { background: var(--primary); color: #000; border-color: var(--primary); }

            /* Cards */
            .card-container { display: flex; gap: 1.25rem; margin-bottom: 2rem; flex-wrap: wrap; }
            .card { background: var(--surface-color); padding: 1.5rem; border-radius: 12px; flex: 1; min-width: 220px; border: 1px solid var(--surface-border); transition: transform 0.2s; }
            .card:hover { transform: translateY(-2px); }
            .card h3 { margin: 0 0 0.8rem 0; font-size: 1.1rem; color: var(--secondary); }
            .stat { font-size: 2.2rem; font-weight: 700; margin: 0; color: #fff; }
            .cost { font-size: 1.2rem; font-weight: 700; color: var(--secondary); margin-top: 0.4rem; }
            .sub-stats { font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem; }

            /* Tables */
            .table-wrapper { background: var(--surface-color); border-radius: 12px; overflow: hidden; border: 1px solid var(--surface-border); }
            table { width: 100%; border-collapse: collapse; text-align: left; }
            th, td { padding: 1rem 1.25rem; border-bottom: 1px solid var(--surface-border); }
            th { background: #202026; color: var(--text-muted); font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.8px; }
            tr:last-child td { border-bottom: none; }
            tr:hover { background: rgba(255, 255, 255, 0.02); }
            .num { text-align: right; font-family: monospace; font-size: 1rem; }
            .total-col { color: var(--primary); font-weight: 700; }
            .cost-col { color: var(--secondary); font-weight: 700; }
            .badge { padding: 0.25rem 0.65rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; color: white; text-transform: uppercase; }

            /* Guide */
            .instructions { background: var(--surface-color); padding: 2rem; border-radius: 12px; border: 1px solid var(--surface-border); }
            .instructions h3 { margin-top: 0; color: var(--primary); }
            .endpoint-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-top: 1rem; }
            .endpoint-card { background: #121214; padding: 1rem; border-radius: 8px; border: 1px solid var(--surface-border); }
            .endpoint-card label { display: block; font-weight: 600; font-size: 0.9rem; margin-bottom: 0.4rem; color: var(--secondary); }
            code { background: #000; padding: 0.3rem 0.6rem; border-radius: 4px; color: var(--primary); font-family: monospace; font-size: 0.9rem; word-break: break-all; display: block; }
        </style>
    </head>
    <body>

        <!-- Navbar -->
        <nav class="navbar">
            <div class="nav-brand">
                👻 TokenGhost
                <span class="subtitle">Zero-latency token auditing</span>
            </div>

            <div class="nav-links">
                <button class="nav-tab active" onclick="switchTab('overview')">📊 Overview</button>
                <button class="nav-tab" onclick="switchTab('models')">🤖 Models</button>
                <button class="nav-tab" onclick="switchTab('logs')">📋 Activity Log</button>
                <button class="nav-tab" onclick="switchTab('guide')">⚙️ Setup Guide</button>
            </div>

            <div class="status-badge">
                <div class="status-dot"></div>
                Proxy Active
            </div>
        </nav>

        <div class="main-container">

            <!-- TAB 1: OVERVIEW -->
            <div id="tab-overview" class="tab-content active">
                <div class="filters" id="provider-filters">
                    ${filterButtonsHtml}
                </div>

                <div class="card-container">
                    <div class="card">
                        <h3>Today</h3>
                        <div class="stat" id="stat-today-total">${today.global.total_tokens.toLocaleString()}</div>
                        <div class="cost" id="stat-today-cost">$${today.global.estimated_cost_usd.toFixed(4)} USD</div>
                        <div class="sub-stats" id="stat-today-sub">In: ${today.global.input_tokens.toLocaleString()} | Out: ${today.global.output_tokens.toLocaleString()}</div>
                    </div>
                    <div class="card">
                        <h3>Yesterday</h3>
                        <div class="stat" id="stat-yesterday-total">${yesterday.global.total_tokens.toLocaleString()}</div>
                        <div class="cost" id="stat-yesterday-cost">$${yesterday.global.estimated_cost_usd.toFixed(4)} USD</div>
                        <div class="sub-stats" id="stat-yesterday-sub">In: ${yesterday.global.input_tokens.toLocaleString()} | Out: ${yesterday.global.output_tokens.toLocaleString()}</div>
                    </div>
                    <div class="card">
                        <h3>All Time</h3>
                        <div class="stat" id="stat-all-total">${all.global.total_tokens.toLocaleString()}</div>
                        <div class="cost" id="stat-all-cost">$${all.global.estimated_cost_usd.toFixed(4)} USD</div>
                        <div class="sub-stats" id="stat-all-sub">In: ${all.global.input_tokens.toLocaleString()} | Out: ${all.global.output_tokens.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            <!-- TAB 2: MODELS -->
            <div id="tab-models" class="tab-content">
                <h2 style="margin-top:0;">🤖 Model Consumption & Costs</h2>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Model</th>
                                <th style="text-align: right;">Input Tokens</th>
                                <th style="text-align: right;">Output Tokens</th>
                                <th style="text-align: right;">Total Tokens</th>
                                <th style="text-align: right;">Estimated Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${modelsHtml}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- TAB 3: LOGS -->
            <div id="tab-logs" class="tab-content">
                <h2 style="margin-top:0;">📋 Recent Activity Logs</h2>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Provider</th>
                                <th>Model</th>
                                <th style="text-align: right;">Input</th>
                                <th style="text-align: right;">Output</th>
                                <th style="text-align: right;">Total Tokens</th>
                                <th style="text-align: right;">Est. Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${logsHtml}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- TAB 4: GUIDE -->
            <div id="tab-guide" class="tab-content">
                <div class="instructions">
                    <h3>⚙️ How to configure your IDE or Client</h3>
                    <p>Change your IDE's API Base URL to point to TokenGhost for transparent token auditing:</p>
                    
                    <div class="endpoint-grid">
                        <div class="endpoint-card">
                            <label>Anthropic (Claude)</label>
                            <code>http://localhost:8338/anthropic</code>
                        </div>
                        <div class="endpoint-card">
                            <label>OpenAI (GPT)</label>
                            <code>http://localhost:8338/openai</code>
                        </div>
                        <div class="endpoint-card">
                            <label>Google (Gemini)</label>
                            <code>http://localhost:8338/gemini</code>
                        </div>
                        <div class="endpoint-card">
                            <label>DeepSeek</label>
                            <code>http://localhost:8338/deepseek</code>
                        </div>
                        <div class="endpoint-card">
                            <label>OpenRouter</label>
                            <code>http://localhost:8338/openrouter</code>
                        </div>
                        <div class="endpoint-card">
                            <label>Groq</label>
                            <code>http://localhost:8338/groq</code>
                        </div>
                        <div class="endpoint-card">
                            <label>Ollama (Local)</label>
                            <code>http://localhost:8338/ollama</code>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <script>
            const statsData = ${statsData};

            // Switch Top Navigation Tabs
            function switchTab(tabId) {
                document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

                const targetTab = Array.from(document.querySelectorAll('.nav-tab')).find(t => t.getAttribute('onclick').includes(tabId));
                if (targetTab) targetTab.classList.add('active');

                const targetContent = document.getElementById('tab-' + tabId);
                if (targetContent) targetContent.classList.add('active');
            }

            // Provider filtering logic
            function updateUI(provider) {
                const periods = ['today', 'yesterday', 'all'];
                periods.forEach(p => {
                    let data;
                    if (provider === 'all') {
                        data = statsData[p].global;
                    } else {
                        data = statsData[p].providers[provider] || { input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: 0 };
                    }
                    document.getElementById('stat-' + p + '-total').innerText = data.total_tokens.toLocaleString();
                    document.getElementById('stat-' + p + '-cost').innerText = '$' + (data.estimated_cost_usd || 0).toFixed(4) + ' USD';
                    document.getElementById('stat-' + p + '-sub').innerText = 'In: ' + data.input_tokens.toLocaleString() + ' | Out: ' + data.output_tokens.toLocaleString();
                });

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

            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    updateUI(e.target.getAttribute('data-provider'));
                });
            });

            // Local Time conversion
            document.querySelectorAll('.local-time').forEach(el => {
                const ts = el.getAttribute('data-timestamp');
                if (ts) {
                    const d = new Date(ts);
                    if (!isNaN(d.getTime())) {
                        const date = d.toLocaleDateString();
                        const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        el.innerHTML = date + ' <span style="color:#888; font-size:0.85em">' + time + '</span>';
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
