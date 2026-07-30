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
  global_daily_budget_usd: number; // -1 or 0 means Unlimited
  agent_budgets: Record<string, number>; // agent_name -> budget_usd (-1 = unlimited)
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const modelLower = (model || '').toLowerCase();
  let matchedPrice: ModelPrice = { input: 1.00, output: 3.00 };

  for (const [key, price] of Object.entries(PRICING)) {
    if (modelLower.includes(key)) {
      matchedPrice = price;
      break;
    }
  }

  const inputCost = (inputTokens / 1_000_000) * matchedPrice.input;
  const outputCost = (outputTokens / 1_000_000) * matchedPrice.output;
  return Number((inputCost + outputCost).toFixed(6));
}

// Budget Config Operations
export function getBudgetConfig(): BudgetConfig {
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        global_daily_budget_usd: typeof data.global_daily_budget_usd === 'number' ? data.global_daily_budget_usd : 5.00,
        agent_budgets: data.agent_budgets || {}
      };
    }
  } catch (e) {}
  return { global_daily_budget_usd: 5.00, agent_budgets: {} };
}

export function setDailyBudget(limitUsd: number, agent?: string): BudgetConfig {
  const config = getBudgetConfig();
  const cleanLimit = limitUsd <= 0 ? -1 : Math.max(0.1, Number(limitUsd.toFixed(2)));

  if (agent && agent.trim()) {
    config.agent_budgets[agent.toLowerCase().trim()] = cleanLimit;
  } else {
    config.global_daily_budget_usd = cleanLimit;
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return config;
}

export function logTokenUsage(log: TokenLog) {
  log.timestamp = new Date().toISOString();
  if (log.estimated_cost_usd === undefined) {
    log.estimated_cost_usd = calculateCost(log.model, log.input_tokens, log.output_tokens);
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
  estimated_cost_usd: number;
}

export function getTokenStats(period: 'today' | 'yesterday' | 'all') {
  const config = getBudgetConfig();
  const stats = {
    global: { input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: 0 },
    providers: {} as Record<string, StatsGroup>,
    models: {} as Record<string, StatsGroup>,
    budget: {
      global_daily_usd: config.global_daily_budget_usd,
      is_unlimited: config.global_daily_budget_usd <= 0,
      used_percent: 0,
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
          const cost = log.estimated_cost_usd ?? calculateCost(model, log.input_tokens || 0, log.output_tokens || 0);

          stats.global.input_tokens += log.input_tokens || 0;
          stats.global.output_tokens += log.output_tokens || 0;
          stats.global.total_tokens += log.total_tokens || 0;
          stats.global.estimated_cost_usd += cost;
          
          if (!stats.providers[provider]) {
              stats.providers[provider] = { input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: 0 };
          }
          stats.providers[provider].input_tokens += log.input_tokens || 0;
          stats.providers[provider].output_tokens += log.output_tokens || 0;
          stats.providers[provider].total_tokens += log.total_tokens || 0;
          stats.providers[provider].estimated_cost_usd += cost;

          if (!stats.models[model]) {
              stats.models[model] = { input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: 0 };
          }
          stats.models[model].input_tokens += log.input_tokens || 0;
          stats.models[model].output_tokens += log.output_tokens || 0;
          stats.models[model].total_tokens += log.total_tokens || 0;
          stats.models[model].estimated_cost_usd += cost;
      }
    } catch (e) {}
  }

  stats.global.estimated_cost_usd = Number(stats.global.estimated_cost_usd.toFixed(4));
  for (const p of Object.keys(stats.providers)) {
    stats.providers[p].estimated_cost_usd = Number(stats.providers[p].estimated_cost_usd.toFixed(4));
  }
  for (const m of Object.keys(stats.models)) {
    stats.models[m].estimated_cost_usd = Number(stats.models[m].estimated_cost_usd.toFixed(4));
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
          hourlyBucket[hourKey].cost += log.estimated_cost_usd || calculateCost(log.model, log.input_tokens, log.output_tokens);
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
        log.estimated_cost_usd = calculateCost(log.model || 'unknown', log.input_tokens || 0, log.output_tokens || 0);
      }
      logs.push(log);
    } catch (e) {}
  }

  return logs;
}

export function getLogsAsCsv(): string {
  if (!fs.existsSync(dbPath)) {
    return 'Timestamp,Provider,Model,InputTokens,OutputTokens,TotalTokens,EstimatedCostUSD\n';
  }

  const lines = fs.readFileSync(dbPath, 'utf-8').split('\n').filter(l => l.trim() !== '');
  let csv = 'Timestamp,Provider,Model,InputTokens,OutputTokens,TotalTokens,EstimatedCostUSD\n';
  
  for (const line of lines) {
    try {
      const log: TokenLog = JSON.parse(line);
      const cost = log.estimated_cost_usd ?? calculateCost(log.model || 'unknown', log.input_tokens || 0, log.output_tokens || 0);
      csv += `"${log.timestamp || ''}","${log.provider || ''}","${log.model || ''}",${log.input_tokens || 0},${log.output_tokens || 0},${log.total_tokens || 0},${cost.toFixed(6)}\n`;
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
