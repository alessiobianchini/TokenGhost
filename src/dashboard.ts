import http from 'http';
import { getTokenStats, getRecentLogs, getTimeSeriesStats } from './db';

export function handleDashboard(req: http.IncomingMessage, res: http.ServerResponse) {
    const today = getTokenStats('today');
    const yesterday = getTokenStats('yesterday');
    const all = getTokenStats('all');
    const recentLogs = getRecentLogs(100);
    const timeSeriesData = getTimeSeriesStats();

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
        const cost = (log.estimated_cost_usd || 0).toFixed(4);
        
        let badgeColor = '#555';
        if (p.includes('anthropic') || p.includes('claude')) badgeColor = '#d97757';
        else if (p.includes('openai') || p.includes('gpt')) badgeColor = '#10a37f';
        else if (p.includes('gemini') || p.includes('google')) badgeColor = '#1a73e8';
        else if (p.includes('deepseek')) badgeColor = '#4d6bfe';
        else if (p.includes('openrouter')) badgeColor = '#ff6b00';
        else if (p.includes('groq')) badgeColor = '#f55036';
        else if (p.includes('ollama')) badgeColor = '#888888';

        let securityBadge = '';
        if (log.has_security_warning) {
            securityBadge = ` <span class="badge" style="background:#ff5252; color:#fff;" title="Secrets/PII pattern detected in prompt payload">⚠️ ${log.security_warning_type || 'EXPOSED SECRET'}</span>`;
        }

        let cacheBadge = '';
        if (log.cached_tokens && log.cached_tokens > 0) {
            cacheBadge = `<br><span style="font-size:0.75rem; color:#03dac6;">⚡ ${log.cached_tokens.toLocaleString()} cached</span>`;
        }

        logsHtml += `
            <tr class="log-row" data-provider="${log.provider}" data-search="${log.provider} ${log.model} ${rawTimestamp}">
                <td class="local-time" data-timestamp="${rawTimestamp}">-</td>
                <td><span class="badge" style="background:${badgeColor}">${log.provider}</span>${securityBadge}</td>
                <td style="color:#bbb; font-weight: 500;">${log.model || 'unknown'}</td>
                <td class="num">${log.input_tokens.toLocaleString()}${cacheBadge}</td>
                <td class="num">${log.output_tokens.toLocaleString()}</td>
                <td class="num total-col">${log.total_tokens.toLocaleString()}</td>
                <td class="num cost-col">$${cost}</td>
            </tr>
        `;
    }

    if (logsHtml === '') {
        logsHtml = '<tr id="no-logs"><td colspan="7" style="text-align: center; color: #888; padding: 2.5rem;">No logs recorded yet. Start interacting with AI models!</td></tr>';
    }

    let modelsHtml = '';
    const sortedModels = Object.entries(all.models).sort((a, b) => b[1].total_tokens - a[1].total_tokens);
    for (const [modelName, mData] of sortedModels) {
        const costPer1MOutput = mData.output_tokens > 0 ? (mData.estimated_cost_usd / mData.output_tokens) * 1_000_000 : 0;
        let valueTier = '<span class="badge" style="background:#03dac6; color:#000;">⚡ High Value</span>';
        if (costPer1MOutput > 10) {
            valueTier = '<span class="badge" style="background:#ff79c6; color:#000;">💎 Premium</span>';
        } else if (costPer1MOutput > 2) {
            valueTier = '<span class="badge" style="background:#bb86fc; color:#000;">⚖️ Balanced</span>';
        }

        modelsHtml += `
            <tr>
                <td style="color: #03dac6; font-weight: 600;">${modelName}</td>
                <td>${valueTier}</td>
                <td class="num">${mData.input_tokens.toLocaleString()}</td>
                <td class="num">${mData.output_tokens.toLocaleString()}</td>
                <td class="num total-col">${mData.total_tokens.toLocaleString()}</td>
                <td class="num cost-col">$${mData.estimated_cost_usd.toFixed(4)} USD</td>
            </tr>
        `;
    }
    if (modelsHtml === '') {
        modelsHtml = '<tr><td colspan="6" style="text-align: center; color: #888; padding: 2rem;">No model data available yet.</td></tr>';
    }
    
    let agentsHtml = '';
    const sortedAgents = Object.entries(all.agents || {}).sort((a, b) => b[1].total_tokens - a[1].total_tokens);
    for (const [agentName, aData] of sortedAgents) {
        agentsHtml += `
            <tr>
                <td style="color: #bb86fc; font-weight: 600;">${agentName}</td>
                <td class="num">${aData.input_tokens.toLocaleString()}</td>
                <td class="num">${aData.output_tokens.toLocaleString()}</td>
                <td class="num total-col">${aData.total_tokens.toLocaleString()}</td>
                <td class="num cost-col">$${aData.estimated_cost_usd.toFixed(4)} USD</td>
            </tr>
        `;
    }
    if (agentsHtml === '') {
        agentsHtml = '<tr><td colspan="5" style="text-align: center; color: #888; padding: 2rem;">No agent/project data available yet.</td></tr>';
    }

    const statsData = JSON.stringify({
        today: today,
        yesterday: yesterday,
        all: all,
        timeSeries: timeSeriesData
    });

    const isUnlimited = today.budget.is_unlimited;
    let budgetColor = '#03dac6';
    if (!isUnlimited) {
        if (today.budget.used_percent >= 100) budgetColor = '#ff5252';
        else if (today.budget.used_percent >= 80) budgetColor = '#ffb300';
    }

    const budgetDisplayLabel = isUnlimited 
        ? `$${today.global.estimated_cost_usd.toFixed(4)} USD (♾️ Unlimited Budget)` 
        : `$${today.global.estimated_cost_usd.toFixed(4)} / $${today.budget.global_daily_usd.toFixed(2)} USD (${today.budget.used_percent}%)`;

    const budgetFillWidth = isUnlimited ? 100 : Math.min(100, today.budget.used_percent);

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>TokenGhost Dashboard</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
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
            .nav-links { display: flex; gap: 0.5rem; }
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
            .nav-tab:hover { color: var(--text-main); background: rgba(255, 255, 255, 0.05); }
            .nav-tab.active { color: var(--primary); background: rgba(187, 134, 252, 0.12); }
            
            .actions-group { display: flex; align-items: center; gap: 0.6rem; }
            .btn-action {
                background: #25252b;
                border: 1px solid var(--surface-border);
                color: var(--text-main);
                padding: 0.45rem 0.85rem;
                border-radius: 6px;
                font-weight: 600;
                font-size: 0.85rem;
                cursor: pointer;
                text-decoration: none;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 0.4rem;
            }
            .btn-action:hover { background: var(--primary); color: #000; border-color: var(--primary); }
            .btn-restart { border-color: #ff5252; color: #ff8080; }
            .btn-restart:hover { background: #ff5252; color: #fff; }

            .status-badge {
                display: flex;
                align-items: center;
                gap: 0.4rem;
                font-size: 0.8rem;
                color: var(--secondary);
                background: rgba(3, 218, 198, 0.1);
                border: 1px solid rgba(3, 218, 198, 0.3);
                padding: 0.35rem 0.75rem;
                border-radius: 20px;
                font-weight: 600;
            }
            .status-dot { width: 8px; height: 8px; border-radius: 50%; background-color: var(--secondary); box-shadow: 0 0 8px var(--secondary); }

            .svg-icon {
                width: 14px;
                height: 14px;
                fill: currentColor;
                display: inline-block;
                vertical-align: middle;
                transform-origin: center center;
            }
            .spinning .svg-icon {
                animation: spinSvg 0.8s linear infinite;
            }
            @keyframes spinSvg {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            .main-container { max-width: 1200px; margin: 2rem auto; padding: 0 1.5rem; }
            .tab-content { display: none; animation: fadeIn 0.25s ease; }
            .tab-content.active { display: block; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

            .filters { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
            .filter-btn { background: var(--surface-color); border: 1px solid var(--surface-border); color: var(--text-muted); padding: 0.5rem 1rem; border-radius: 20px; cursor: pointer; transition: all 0.2s; font-size: 0.85rem; font-weight: 600; text-transform: capitalize; }
            .filter-btn:hover { background: #25252b; color: var(--text-main); }
            .filter-btn.active { background: var(--primary); color: #000; border-color: var(--primary); }

            .card-container { display: flex; gap: 1.25rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
            .card { background: var(--surface-color); padding: 1.5rem; border-radius: 12px; flex: 1; min-width: 220px; border: 1px solid var(--surface-border); }
            .card h3 { margin: 0 0 0.8rem 0; font-size: 1.1rem; color: var(--secondary); }
            .stat { font-size: 2.2rem; font-weight: 700; margin: 0; color: #fff; }
            .cost { font-size: 1.2rem; font-weight: 700; color: var(--secondary); margin-top: 0.4rem; }
            .sub-stats { font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem; }

            .budget-box { background: var(--surface-color); border: 1px solid var(--surface-border); border-radius: 12px; padding: 1.25rem; margin-bottom: 2rem; }
            .budget-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; font-weight: 600; font-size: 0.95rem; }
            .budget-track { background: #121214; height: 12px; border-radius: 6px; overflow: hidden; border: 1px solid var(--surface-border); }
            .budget-fill { height: 100%; transition: width 0.4s ease, background-color 0.4s ease; }

            .chart-card { background: var(--surface-color); border: 1px solid var(--surface-border); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; }
            .chart-card h3 { margin: 0 0 1rem 0; font-size: 1.1rem; color: var(--primary); }

            .table-header-tools { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem; }
            .search-input { background: var(--surface-color); border: 1px solid var(--surface-border); color: var(--text-main); padding: 0.6rem 1rem; border-radius: 20px; font-size: 0.9rem; min-width: 280px; outline: none; transition: border-color 0.2s; }
            .search-input:focus { border-color: var(--primary); }

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
                <button class="nav-tab" onclick="switchTab('models')">🤖 Models & Projects</button>
                <button class="nav-tab" onclick="switchTab('logs')">📋 Activity Log</button>
                <button class="nav-tab" onclick="switchTab('guide')">⚙️ Setup Guide</button>
            </div>

            <div class="actions-group">
                <button id="btn-refresh" class="btn-action" onclick="fetchLiveStats(true)">
                    <svg class="svg-icon" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg> Refresh
                </button>
                <button class="btn-action btn-restart" onclick="restartServerUI()">⚡ Restart Proxy</button>
                <a href="/export/csv" class="btn-action">📥 CSV</a>
                <a href="/export/json" class="btn-action">📥 JSON</a>
                <div class="status-badge">
                    <div class="status-dot"></div>
                    Proxy Active
                </div>
            </div>
        </nav>

        <div class="main-container">

            <!-- TAB 1: OVERVIEW -->
            <div id="tab-overview" class="tab-content active">
                
                <div class="budget-box">
                    <div class="budget-header">
                        <span>🎯 Daily Spending Budget</span>
                        <span id="budget-text" style="color: ${budgetColor}">${budgetDisplayLabel}</span>
                    </div>
                    <div class="budget-track">
                        <div id="budget-bar-fill" class="budget-fill" style="width: ${budgetFillWidth}%; background-color: ${budgetColor};"></div>
                    </div>
                </div>

                <div class="card-container">
                    <div class="card" style="border-color: #03dac6;">
                        <h3 style="color: #03dac6;">⚡ Prompt Cache Savings</h3>
                        <div class="stat" id="stat-cache-saved">$${all.global.saved_cost_usd.toFixed(4)} USD</div>
                        <div class="cost" style="color:#03dac6;" id="stat-cache-tokens">${all.global.cached_tokens.toLocaleString()} Cached Tokens</div>
                        <div class="sub-stats">90% discount applied on cached prompt tokens</div>
                    </div>
                    <div class="card" style="border-color: ${all.global.security_warnings_count > 0 ? '#ff5252' : 'var(--surface-border)'}">
                        <h3 style="color: ${all.global.security_warnings_count > 0 ? '#ff5252' : 'var(--primary)'}">🛡️ Security Sniffer</h3>
                        <div class="stat" style="color: ${all.global.security_warnings_count > 0 ? '#ff5252' : '#fff'}" id="stat-secrets-count">${all.global.security_warnings_count}</div>
                        <div class="cost" style="color: ${all.global.security_warnings_count > 0 ? '#ff5252' : 'var(--text-muted)'}">Exposed Secrets Detected</div>
                        <div class="sub-stats">Local memory scan for API Keys, Passwords & JWT</div>
                    </div>
                </div>

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

                <div class="chart-card">
                    <h3>📈 Hourly Token Usage (Last 24 Hours)</h3>
                    <canvas id="usageChart" height="90"></canvas>
                </div>
            </div>

            <!-- TAB 2: MODELS & PROJECTS -->
            <div id="tab-models" class="tab-content">
                <h2 style="margin-top:0;">🤖 Model Consumption & Value Benchmark</h2>
                <div class="table-wrapper" style="margin-bottom: 2rem;">
                    <table>
                        <thead>
                            <tr>
                                <th>Model</th>
                                <th>Value Ranking</th>
                                <th style="text-align: right;">Input Tokens</th>
                                <th style="text-align: right;">Output Tokens</th>
                                <th style="text-align: right;">Total Tokens</th>
                                <th style="text-align: right;">Estimated Cost</th>
                            </tr>
                        </thead>
                        <tbody id="models-body">
                            ${modelsHtml}
                        </tbody>
                    </table>
                </div>

                <h2>🏢 Top Projects / Agents by Cost</h2>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Project / Agent</th>
                                <th style="text-align: right;">Input Tokens</th>
                                <th style="text-align: right;">Output Tokens</th>
                                <th style="text-align: right;">Total Tokens</th>
                                <th style="text-align: right;">Estimated Cost</th>
                            </tr>
                        </thead>
                        <tbody id="agents-body">
                            ${agentsHtml}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- TAB 3: LOGS -->
            <div id="tab-logs" class="tab-content">
                <div class="table-header-tools">
                    <h2 style="margin:0;">📋 Recent Activity Logs</h2>
                    <input type="text" id="search-input" class="search-input" placeholder="🔍 Search model, provider, date, warnings...">
                </div>

                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Provider & Security</th>
                                <th>Model</th>
                                <th style="text-align: right;">Input</th>
                                <th style="text-align: right;">Output</th>
                                <th style="text-align: right;">Total Tokens</th>
                                <th style="text-align: right;">Est. Cost</th>
                            </tr>
                        </thead>
                        <tbody id="logs-body">
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
            let statsData = ${statsData};
            let chartInstance = null;

            function switchTab(tabId) {
                document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

                const targetTab = Array.from(document.querySelectorAll('.nav-tab')).find(t => t.getAttribute('onclick').includes(tabId));
                if (targetTab) targetTab.classList.add('active');

                const targetContent = document.getElementById('tab-' + tabId);
                if (targetContent) targetContent.classList.add('active');
            }

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

                const todayData = statsData.today;
                const isUnlimited = todayData.budget ? todayData.budget.is_unlimited : false;
                let budgetColor = '#03dac6';
                if (!isUnlimited) {
                    if (todayData.budget.used_percent >= 100) budgetColor = '#ff5252';
                    else if (todayData.budget.used_percent >= 80) budgetColor = '#ffb300';
                }

                const budgetText = document.getElementById('budget-text');
                const budgetFill = document.getElementById('budget-bar-fill');
                if (budgetText) {
                    budgetText.style.color = budgetColor;
                    if (isUnlimited) {
                        budgetText.innerText = '$' + todayData.global.estimated_cost_usd.toFixed(4) + ' USD (♾️ Unlimited Budget)';
                    } else {
                        budgetText.innerText = '$' + todayData.global.estimated_cost_usd.toFixed(4) + ' / $' + todayData.budget.global_daily_usd.toFixed(2) + ' USD (' + todayData.budget.used_percent + '%)';
                    }
                }
                if (budgetFill) {
                    budgetFill.style.width = isUnlimited ? '100%' : Math.min(100, todayData.budget.used_percent) + '%';
                    budgetFill.style.backgroundColor = budgetColor;
                }

                filterLogs();
            }

            function filterLogs() {
                const query = (document.getElementById('search-input')?.value || '').toLowerCase();
                const activeBtn = document.querySelector('.filter-btn.active');
                const selectedProvider = activeBtn ? activeBtn.getAttribute('data-provider') : 'all';

                const rows = document.querySelectorAll('.log-row');
                let visibleCount = 0;
                rows.forEach(row => {
                    const rowProvider = row.getAttribute('data-provider') || '';
                    const searchData = (row.getAttribute('data-search') || '').toLowerCase();

                    const matchesProvider = (selectedProvider === 'all' || rowProvider === selectedProvider);
                    const matchesSearch = query === '' || searchData.includes(query);

                    if (matchesProvider && matchesSearch) {
                        row.style.display = '';
                        visibleCount++;
                    } else {
                        row.style.display = 'none';
                    }
                });

                const noLogs = document.getElementById('no-logs');
                if (noLogs) {
                    noLogs.style.display = visibleCount === 0 ? '' : 'none';
                }
            }

            async function fetchLiveStats(isManual = false) {
                const btn = document.getElementById('btn-refresh');
                if (btn) btn.classList.add('spinning');

                try {
                    const res = await fetch('/api/stats');
                    if (res.ok) {
                        const fresh = await res.json();
                        statsData = fresh;
                        
                        const activeBtn = document.querySelector('.filter-btn.active');
                        updateUI(activeBtn ? activeBtn.getAttribute('data-provider') : 'all');

                        if (chartInstance && fresh.timeSeriesData) {
                            chartInstance.data.labels = fresh.timeSeriesData.labels;
                            chartInstance.data.datasets[0].data = fresh.timeSeriesData.tokens;
                            chartInstance.update('none');
                        }
                    }
                } catch (e) {
                    console.error('Failed to fetch live stats:', e);
                } finally {
                    setTimeout(() => {
                        if (btn) btn.classList.remove('spinning');
                    }, 500);
                }
            }

            async function restartServerUI() {
                if (!confirm('Are you sure you want to restart the TokenGhost proxy server?')) return;
                try {
                    const res = await fetch('/api/restart', { method: 'POST' });
                    if (res.ok) {
                        alert('⚡ Proxy server restart initiated. The page will reload in 2 seconds.');
                        setTimeout(() => window.location.reload(), 2000);
                    }
                } catch (e) {
                    alert('Server restarted or connection closed.');
                    setTimeout(() => window.location.reload(), 2000);
                }
            }

            setInterval(() => fetchLiveStats(false), 5000);

            document.getElementById('search-input')?.addEventListener('input', filterLogs);

            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    updateUI(e.target.getAttribute('data-provider'));
                });
            });

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

            if (window.Chart && statsData.timeSeries) {
                const ctx = document.getElementById('usageChart').getContext('2d');
                chartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: statsData.timeSeries.labels,
                        datasets: [{
                            label: 'Total Tokens',
                            data: statsData.timeSeries.tokens,
                            borderColor: '#bb86fc',
                            backgroundColor: 'rgba(187, 134, 252, 0.1)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.3
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { labels: { color: '#e0e0e6' } }
                        },
                        scales: {
                            x: { ticks: { color: '#888894' }, grid: { color: '#2a2a30' } },
                            y: { ticks: { color: '#888894' }, grid: { color: '#2a2a30' } }
                        }
                    }
                });
            }
        </script>
    </body>
    </html>
    `;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
}
