import fs from 'fs';
import path from 'path';

// Usiamo un semplice file JSON Lines (JSONL) per l'archiviazione.
// Vantaggi: Zero latenza (scrittura asincrona), zero crash, NO compilazione C++ necessaria.
const dbPath = path.join(process.cwd(), 'token_logs.jsonl');

export interface TokenLog {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  timestamp?: string;
}

/**
 * Aggiunge in maniera asincrona il log al file senza bloccare il thread principale.
 */
export function logTokenUsage(log: TokenLog) {
  log.timestamp = new Date().toISOString();
  const line = JSON.stringify(log) + '\n';
  
  fs.appendFile(dbPath, line, (err) => {
    if (err) console.error('[TokenGhost] Errore nel salvataggio del log:', err);
  });
}

/**
 * Legge e calcola le statistiche. 
 * Viene eseguito solo quando apri la dashboard o lo chiedi via MCP.
 */
export function getTokenStats(period: 'today' | 'yesterday' | 'all') {
  const stats = {
    global: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    providers: {} as Record<string, { input_tokens: number, output_tokens: number, total_tokens: number }>
  };

  if (!fs.existsSync(dbPath)) {
    return stats;
  }

  const lines = fs.readFileSync(dbPath, 'utf-8').split('\n');
  
  // Funzione helper per ottenere la data YYYY-MM-DD nel fuso orario locale del sistema
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
      
      // Calcoliamo la data locale anche per il log
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
          
          stats.global.input_tokens += log.input_tokens || 0;
          stats.global.output_tokens += log.output_tokens || 0;
          stats.global.total_tokens += log.total_tokens || 0;
          
          if (!stats.providers[provider]) {
              stats.providers[provider] = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
          }
          stats.providers[provider].input_tokens += log.input_tokens || 0;
          stats.providers[provider].output_tokens += log.output_tokens || 0;
          stats.providers[provider].total_tokens += log.total_tokens || 0;
      }
    } catch (e) {
        // Ignora righe corrotte
    }
  }

  return stats;
}

/**
 * Legge le chiamate singole più recenti per la sezione di logging.
 */
export function getRecentLogs(limit: number = 50): TokenLog[] {
  if (!fs.existsSync(dbPath)) {
    return [];
  }

  const lines = fs.readFileSync(dbPath, 'utf-8').split('\n').filter(l => l.trim() !== '');
  const logs: TokenLog[] = [];
  
  // Leggiamo dal fondo per avere le più recenti
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - limit); i--) {
    try {
      logs.push(JSON.parse(lines[i]));
    } catch (e) {
      // Ignora righe corrotte
    }
  }

  return logs;
}
