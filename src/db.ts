import fs from 'fs';
import path from 'path';

const dbPath = path.join(__dirname, '..', 'token_logs.jsonl');
const configPath = path.join(__dirname, '..', 'budget_config.json');

export interface TokenLog {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd?: number;
  cached_tokens?: number;
  saved_cost_usd?: number;
  has_security_warning?: boolean;
  security_warning_type?: string;
  timestamp?: string;
  agent?: string;
}

interface ModelPrice {
  input: number;
  output: number;
}

const PRICING: Record<string, ModelPrice> = {
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'claude-3-opus': { input: 15.00, output: 75.00 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'o1': { input: 15.00, output: 60.00 },
  'o3-mini': { input: 1.10, output: 4.40 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-3.1-pro': { input: 1.25, output: 5.00 },
  'gemini-3.6-flash': { input: 0.10, output: 0.40 },
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  'llama-3.3-70b': { input: 0.59, output: 0.79 },
};

export interface BudgetConfig {
  global_daily_budget_usd: number; // -1 or <= 0 means Unlimited by default
  provider_budgets: Record<string, number>; // provider -> budget_usd (-1 = unlimited)
  agent_budgets: Record<string, number>;    // agent -> budget_usd (-1 = unlimited)
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number, cachedTokens: number = 0): { cost: number; saved: number } {
  const modelLower = (model || '').toLowerCase();
  let matchedPrice: ModelPrice = { input: 1.00, output: 3.00 };

  for (const [key, price] of Object.entries(PRICING)) {
    if (modelLower.includes(key)) {
      matchedPrice = price;
      break;
    }
  }

  const normalInputTokens = Math.max(0, inputTokens - cachedTokens);
  const inputCost = (normalInputTokens / 1_000_000) * matchedPrice.input;
  const cachedCost = (cachedTokens / 1_000_000) * (matchedPrice.input * 0.10);
  const outputCost = (outputTokens / 1_000_000) * matchedPrice.output;
  const savedCost = (cachedTokens / 1_000_000) * (matchedPrice.input * 0.90);

  return {
    cost: Number((inputCost + cachedCost + outputCost).toFixed(6)),
    saved: Number(savedCost.toFixed(6))
  };
}

export function getBudgetConfig(): BudgetConfig {
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        global_daily_budget_usd: typeof data.global_daily_budget_usd === 'number' ? data.global_daily_budget_usd : -1,
        provider_budgets: data.provider_budgets || {},
        agent_budgets: data.agent_budgets || {}
      };
    }
  } catch (e) {}
  return { global_daily_budget_usd: -1, provider_budgets: {}, agent_budgets: {} };
}

export function setDailyBudget(limitUsd: number, target?: { provider?: string; agent?: string }): BudgetConfig {
  const config = getBudgetConfig();
  const cleanLimit = limitUsd <= 0 ? -1 : Math.max(0.1, Number(limitUsd.toFixed(2)));

  if (target?.provider && target.provider.trim()) {
    config.provider_budgets[target.provider.toLowerCase().trim()] = cleanLimit;
  } else if (target?.agent && target.agent.trim()) {
    config.agent_budgets[target.agent.toLowerCase().trim()] = cleanLimit;
  } else {
    config.global_daily_budget_usd = cleanLimit;
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return config;
}

export function logTokenUsage(log: TokenLog) {
  log.timestamp = new Date().toISOString();
  log.model = (log.model || 'unknown').toLowerCase().trim();
  log.provider = (log.provider || 'unknown').toLowerCase().trim();
  if (log.estimated_cost_usd === undefined || log.saved_cost_usd === undefined) {
    const calculated = calculateCost(log.model, log.input_tokens, log.output_tokens, log.cached_tokens || 0);
    log.estimated_cost_usd = calculated.cost;
    log.saved_cost_usd = calculated.saved;
  }
  const line = JSON.stringify(log) + '\n';
  
  fs.appendFile(dbPath, line, (err) => {
    if (err) console.error('[TokenGhost] Error saving log:', err);
  });
}

export interface StatsGroup {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  estimated_cost_usd: number;
  saved_cost_usd: number;
}

export function getTokenStats(period: 'today' | 'yesterday' | 'all') {
  const config = getBudgetConfig();
  const stats = {
    global: { input_tokens: 0, output_tokens: 0, total_tokens: 0, cached_tokens: 0, estimated_cost_usd: 0, saved_cost_usd: 0, security_warnings_count: 0 },
    providers: {} as Record<string, StatsGroup>,
    models: {} as Record<string, StatsGroup>,
    agents: {} as Record<string, StatsGroup>,
    budget: {
      global_daily_usd: config.global_daily_budget_usd,
      is_unlimited: config.global_daily_budget_usd <= 0,
      used_percent: 0,
      provider_budgets: config.provider_budgets,
      agent_budgets: config.agent_budgets
    }
  };

  if (!fs.existsSync(dbPath)) {
    return stats;
  }

  const lines = fs.readFileSync(dbPath, 'utf-8').split('\n');
  
  const getLocalDateStr = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
  };

  const now = new Date();
  const todayDate = getLocalDateStr(now);
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = getLocalDateStr(yesterday);

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const log: TokenLog = JSON.parse(line);
      const logDateObj = log.timestamp ? new Date(log.timestamp) : new Date();
      const logDate = getLocalDateStr(logDateObj);

      let include = false;
      if (period === 'all') {
          include = true;
      } else if (period === 'today' && logDate === todayDate) {
          include = true;
      } else if (period === 'yesterday' && logDate === yesterdayDate) {
          include = true;
      }

      if (include) {
          const provider = log.provider || 'unknown';
          const model = log.model || 'unknown';
          const cached = log.cached_tokens || 0;
          const calculated = calculateCost(model, log.input_tokens || 0, log.output_tokens || 0, cached);
          const cost = log.estimated_cost_usd ?? calculated.cost;
          const saved = log.saved_cost_usd ?? calculated.saved;

          stats.global.input_tokens += log.input_tokens || 0;
          stats.global.output_tokens += log.output_tokens || 0;
          stats.global.total_tokens += log.total_tokens || 0;
          stats.global.cached_tokens += cached;
          stats.global.estimated_cost_usd += cost;
          stats.global.saved_cost_usd += saved;
          if (log.has_security_warning) {
            stats.global.security_warnings_count += 1;
          }
          
          if (!stats.providers[provider]) {
              stats.providers[provider] = { input_tokens: 0, output_tokens: 0, total_tokens: 0, cached_tokens: 0, estimated_cost_usd: 0, saved_cost_usd: 0 };
          }
          stats.providers[provider].input_tokens += log.input_tokens || 0;
          stats.providers[provider].output_tokens += log.output_tokens || 0;
          stats.providers[provider].total_tokens += log.total_tokens || 0;
          stats.providers[provider].cached_tokens += cached;
          stats.providers[provider].estimated_cost_usd += cost;
          stats.providers[provider].saved_cost_usd += saved;

          if (!stats.models[model]) {
              stats.models[model] = { input_tokens: 0, output_tokens: 0, total_tokens: 0, cached_tokens: 0, estimated_cost_usd: 0, saved_cost_usd: 0 };
          }
          stats.models[model].input_tokens += log.input_tokens || 0;
          stats.models[model].output_tokens += log.output_tokens || 0;
          stats.models[model].total_tokens += log.total_tokens || 0;
          stats.models[model].cached_tokens += cached;
          stats.models[model].estimated_cost_usd += cost;
          stats.models[model].saved_cost_usd += saved;

          const agent = log.agent || 'unknown';
          if (!stats.agents[agent]) {
              stats.agents[agent] = { input_tokens: 0, output_tokens: 0, total_tokens: 0, cached_tokens: 0, estimated_cost_usd: 0, saved_cost_usd: 0 };
          }
          stats.agents[agent].input_tokens += log.input_tokens || 0;
          stats.agents[agent].output_tokens += log.output_tokens || 0;
          stats.agents[agent].total_tokens += log.total_tokens || 0;
          stats.agents[agent].cached_tokens += cached;
          stats.agents[agent].estimated_cost_usd += cost;
          stats.agents[agent].saved_cost_usd += saved;
      }
    } catch (e) {}
  }

  stats.global.estimated_cost_usd = Number(stats.global.estimated_cost_usd.toFixed(4));
  stats.global.saved_cost_usd = Number(stats.global.saved_cost_usd.toFixed(4));
  
  for (const p of Object.keys(stats.providers)) {
    stats.providers[p].estimated_cost_usd = Number(stats.providers[p].estimated_cost_usd.toFixed(4));
    stats.providers[p].saved_cost_usd = Number(stats.providers[p].saved_cost_usd.toFixed(4));
  }
  for (const m of Object.keys(stats.models)) {
    stats.models[m].estimated_cost_usd = Number(stats.models[m].estimated_cost_usd.toFixed(4));
    stats.models[m].saved_cost_usd = Number(stats.models[m].saved_cost_usd.toFixed(4));
  }
  for (const a of Object.keys(stats.agents)) {
    stats.agents[a].estimated_cost_usd = Number(stats.agents[a].estimated_cost_usd.toFixed(4));
    stats.agents[a].saved_cost_usd = Number(stats.agents[a].saved_cost_usd.toFixed(4));
  }

  if (period === 'today' && config.global_daily_budget_usd > 0) {
    stats.budget.used_percent = Number(((stats.global.estimated_cost_usd / config.global_daily_budget_usd) * 100).toFixed(1));
  }

  return stats;
}

export function getTimeSeriesStats() {
  const result = {
    labels: [] as string[],
    tokens: [] as number[],
    costs: [] as number[]
  };

  if (!fs.existsSync(dbPath)) {
    return result;
  }

  const lines = fs.readFileSync(dbPath, 'utf-8').split('\n');
  const hourlyBucket: Record<string, { tokens: number, cost: number }> = {};

  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600 * 1000);
    const hourKey = `${String(d.getHours()).padStart(2, '0')}:00`;
    hourlyBucket[hourKey] = { tokens: 0, cost: 0 };
    result.labels.push(hourKey);
  }

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const log: TokenLog = JSON.parse(line);
      if (!log.timestamp) continue;
      const logDate = new Date(log.timestamp);
      if (now.getTime() - logDate.getTime() <= 24 * 3600 * 1000) {
        const hourKey = `${String(logDate.getHours()).padStart(2, '0')}:00`;
        if (hourlyBucket[hourKey]) {
          hourlyBucket[hourKey].tokens += log.total_tokens || 0;
          hourlyBucket[hourKey].cost += log.estimated_cost_usd || calculateCost(log.model, log.input_tokens, log.output_tokens, log.cached_tokens || 0).cost;
        }
      }
    } catch (e) {}
  }

  for (const label of result.labels) {
    result.tokens.push(hourlyBucket[label]?.tokens || 0);
    result.costs.push(Number((hourlyBucket[label]?.cost || 0).toFixed(4)));
  }

  return result;
}

export function getRecentLogs(limit: number = 50): TokenLog[] {
  if (!fs.existsSync(dbPath)) {
    return [];
  }

  const lines = fs.readFileSync(dbPath, 'utf-8').split('\n').filter(l => l.trim() !== '');
  const logs: TokenLog[] = [];
  
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - limit); i--) {
    try {
      const log: TokenLog = JSON.parse(lines[i]);
      if (log.estimated_cost_usd === undefined) {
        const calculated = calculateCost(log.model || 'unknown', log.input_tokens || 0, log.output_tokens || 0, log.cached_tokens || 0);
        log.estimated_cost_usd = calculated.cost;
        log.saved_cost_usd = calculated.saved;
      }
      logs.push(log);
    } catch (e) {}
  }

  return logs;
}

export function getLogsAsCsv(): string {
  if (!fs.existsSync(dbPath)) {
    return 'Timestamp,Provider,Model,InputTokens,OutputTokens,TotalTokens,CachedTokens,EstimatedCostUSD,SavedCostUSD,SecurityWarning\n';
  }

  const lines = fs.readFileSync(dbPath, 'utf-8').split('\n').filter(l => l.trim() !== '');
  let csv = 'Timestamp,Provider,Model,InputTokens,OutputTokens,TotalTokens,CachedTokens,EstimatedCostUSD,SavedCostUSD,SecurityWarning\n';
  
  for (const line of lines) {
    try {
      const log: TokenLog = JSON.parse(line);
      const calculated = calculateCost(log.model || 'unknown', log.input_tokens || 0, log.output_tokens || 0, log.cached_tokens || 0);
      const cost = log.estimated_cost_usd ?? calculated.cost;
      const saved = log.saved_cost_usd ?? calculated.saved;
      const warn = log.has_security_warning ? (log.security_warning_type || 'WARNING') : 'NONE';

      csv += `"${log.timestamp || ''}","${log.provider || ''}","${log.model || ''}",${log.input_tokens || 0},${log.output_tokens || 0},${log.total_tokens || 0},${log.cached_tokens || 0},${cost.toFixed(6)},${saved.toFixed(6)},"${warn}"\n`;
    } catch (e) {}
  }

  return csv;
}

export function getLogsAsJson(): string {
  const logs = getRecentLogs(1000);
  return JSON.stringify(logs, null, 2);
}

export function clearTokenLogs() {
  if (fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, '');
  }
}
