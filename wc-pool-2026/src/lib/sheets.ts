// Data layer.
//
// Each Sheet tab is loaded independently. Whatever is wired up via
// VITE_SHEET_CSV_* gets real data; everything else falls back to mock data
// so the dashboard stays renderable as we connect tabs one at a time.
//
// Refresh model: fetch on page load + manual via Refresh button. No polling.

import Papa from 'papaparse';
import { getMockSnapshot } from './mockData';
import { cascade, type BracketStructure } from './bracket';
import { buildDummyBracket } from './dummyBracket';
import { API_CONFIGURED, bracketApi } from './bracketApi';
import type {
  DataSnapshot, GroupStanding, Match, MatchResult, Outcome,
  PlayerScore, PlayerPicks, PredictionsData, Stage,
} from './types';

const ENV = import.meta.env;

const URLS = {
  results: ENV.VITE_SHEET_CSV_RESULTS,
  scoring: ENV.VITE_SHEET_CSV_SCORING,
  standings: ENV.VITE_SHEET_CSV_STANDINGS,
  schedule: ENV.VITE_SHEET_CSV_SCHEDULE,
  predictionsGroup: ENV.VITE_SHEET_CSV_PREDICTIONS_GROUP,
  predictionsKo: ENV.VITE_SHEET_CSV_PREDICTIONS_KO,
} as const;

async function fetchCsvRows(url: string): Promise<string[][]> {
  // Cache-buster: Google caches published CSVs ~5 min server-side.
  // Adding a unique query param sometimes (not always) forces a fresh fetch.
  const sep = url.includes('?') ? '&' : '?';
  const bustedUrl = `${url}${sep}_=${Date.now()}`;
  const res = await fetch(bustedUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`CSV fetch ${res.status} for ${url}`);
  const text = await res.text();
  return new Promise<string[][]>((resolve, reject) => {
    Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: 'greedy',
      complete: (out) => resolve(out.data),
      error: reject,
    });
  });
}

function colIdx(letter: string): number {
  let n = 0;
  for (const c of letter.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function num(cell: string | undefined): number {
  if (cell == null || cell === '') return 0;
  const cleaned = cell.replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseNum(cell: string | undefined): number | null {
  if (cell == null) return null;
  const t = cell.trim();
  if (t === '') return null;
  const n = parseFloat(t.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function hasValue(cell: string | undefined): boolean {
  return cell != null && cell.trim() !== '';
}

/** Normalize a date string to ISO yyyy-mm-dd. Handles 6/11/2026, 11/6/2026, and ISO. */
function normalizeDate(s: string | undefined): string {
  if (!s) return '';
  const t = s.trim();
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  // M/D/YYYY (US locale, Sheets default in US/CA)
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }
  const d = new Date(t);
  if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10);
  return t;
}

/** Normalize a time string. Accepts "18:00", "6:00 PM", "06:00:00", etc. */
function normalizeTime(s: string | undefined): string {
  if (!s) return '';
  const t = s.trim();
  if (!t) return '';
  if (/^\d{1,2}:\d{2}$/.test(t)) return t.padStart(5, '0');
  // 6:00 PM → 18:00
  const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = m12[2];
    const ap = m12[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  if (/^\d{1,2}:\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  return t;
}

function normalizeStage(s: string | undefined): Stage {
  const t = (s ?? '').trim().toLowerCase();
  if (t.includes('group') || t === '') return 'Group';
  if (/r\s*32|round of 32/.test(t)) return 'R32';
  if (/r\s*16|round of 16/.test(t)) return 'R16';
  if (/qf|quarter/.test(t)) return 'QF';
  if (/sf|semi/.test(t)) return 'SF';
  if (/3rd|third/.test(t)) return '3rd';
  if (/final/.test(t)) return 'Final';
  return 'Group';
}

// ─────────────────────────────────────────────────────────────────────
// Scoring tab
// ─────────────────────────────────────────────────────────────────────

const SCORING_COLS = {
  name: colIdx('A'),
  groupTotal: colIdx('BV'),
  knockoutTotal: colIdx('DC'),
  wildcardTotal: colIdx('DG'),
  tiebreakerDelta: colIdx('DI'),
  grandTotal: colIdx('DJ'),
  rank: colIdx('DK'),
} as const;

function parseScoringCsv(rows: string[][]): PlayerScore[] {
  const HEADER_BLOCKLIST = new Set([
    '', 'player', 'name', 'player name', 'total', 'rank', 'scoring',
    'group', 'knockout', 'wild card', 'wildcard', 'tiebreaker',
    'example', 'sample', 'test', 'admin',
  ]);

  const raw: PlayerScore[] = [];
  for (const row of rows) {
    const name = (row[SCORING_COLS.name] ?? '').trim();
    if (!name || HEADER_BLOCKLIST.has(name.toLowerCase())) continue;
    if (/^[\d.,\s]+$/.test(name)) continue;
    const scoreCells = [
      row[SCORING_COLS.groupTotal], row[SCORING_COLS.knockoutTotal],
      row[SCORING_COLS.wildcardTotal], row[SCORING_COLS.grandTotal],
    ];
    if (!scoreCells.some(hasValue)) continue;
    raw.push({
      name,
      groupTotal: num(row[SCORING_COLS.groupTotal]),
      knockoutTotal: num(row[SCORING_COLS.knockoutTotal]),
      wildcardTotal: num(row[SCORING_COLS.wildcardTotal]),
      tiebreakerDelta: num(row[SCORING_COLS.tiebreakerDelta]),
      grandTotal: num(row[SCORING_COLS.grandTotal]),
      rank: 0,
    });
  }

  // Dedupe by name (defensive against multiple form submissions).
  const seen = new Set<string>();
  const players = raw.filter((p) => {
    const k = p.name.toLowerCase().trim();
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  // Always rank locally — ignore DK because it can be stale.
  players.sort((a, b) => {
    if (b.grandTotal !== a.grandTotal) return b.grandTotal - a.grandTotal;
    return a.tiebreakerDelta - b.tiebreakerDelta;
  });
  players.forEach((p, i) => { p.rank = i + 1; });
  return players;
}

// ─────────────────────────────────────────────────────────────────────
// Schedule tab — 8 cols: num, date, time, stage, group, teamA, teamB, venue
// Works for both a dedicated Schedule tab AND the Config tab (the parser
// just filters to rows where col A is a numeric match number 1..120).
// ─────────────────────────────────────────────────────────────────────

function parseScheduleCsv(rows: string[][]): Match[] {
  const matches: Match[] = [];
  for (const row of rows) {
    const n = parseNum(row[0]);
    if (n == null || n < 1 || n > 120) continue;
    const teamA = (row[5] ?? '').trim();
    const teamB = (row[6] ?? '').trim();
    if (!teamA || !teamB) continue;
    matches.push({
      number: Math.round(n),
      date: normalizeDate(row[1]),
      time: normalizeTime(row[2]),
      stage: normalizeStage(row[3]),
      group: (row[4] ?? '').trim() || null,
      teamA, teamB,
      venue: (row[7] ?? '').trim(),
    });
  }
  matches.sort((a, b) => a.number - b.number);
  return matches;
}

// ─────────────────────────────────────────────────────────────────────
// Results tab — per spec, A5:J108, I = computed outcome ('A'|'B'|'D')
// Score columns aren't explicitly documented; we scan likely positions.
// ─────────────────────────────────────────────────────────────────────

function parseResultsCsv(rows: string[][]): MatchResult[] {
  const results: MatchResult[] = [];
  for (const row of rows) {
    const n = parseNum(row[0]);
    if (n == null || n < 1 || n > 120) continue;

    const outcomeRaw = (row[colIdx('I')] ?? '').trim().toUpperCase();
    const outcome: Outcome =
      outcomeRaw === 'A' || outcomeRaw === 'B' || outcomeRaw === 'D'
        ? outcomeRaw
        : null;

    // Heuristic: scoreA / scoreB are the first two adjacent numeric cells
    // between columns C..H. Most pool sheets put them as the last two
    // before the outcome column.
    let scoreA: number | null = null;
    let scoreB: number | null = null;
    for (let i = colIdx('C'); i <= colIdx('G'); i++) {
      const a = parseNum(row[i]);
      const b = parseNum(row[i + 1]);
      if (a != null && b != null) { scoreA = a; scoreB = b; break; }
    }

    // Infer outcome from scores when the outcome cell isn't a clean A/B/D.
    let finalOutcome: Outcome = outcome;
    if (!finalOutcome && scoreA != null && scoreB != null) {
      finalOutcome = scoreA > scoreB ? 'A' : scoreA < scoreB ? 'B' : 'D';
    }
    const played = finalOutcome !== null || (scoreA != null && scoreB != null);
    results.push({ matchNumber: Math.round(n), scoreA, scoreB, outcome: finalOutcome, played });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────
// Standings — computed client-side from schedule + results
// ─────────────────────────────────────────────────────────────────────

function computeStandings(
  matches: Match[],
  results: MatchResult[],
): GroupStanding[] {
  const standings = new Map<string, GroupStanding>();
  // Seed every team that appears in a group match.
  for (const m of matches) {
    if (m.stage !== 'Group' || !m.group) continue;
    for (const team of [m.teamA, m.teamB]) {
      const key = `${m.group}-${team}`;
      if (!standings.has(key)) {
        standings.set(key, {
          group: m.group, team,
          played: 0, wins: 0, draws: 0, losses: 0,
          goalDifference: 0, points: 0,
        });
      }
    }
  }
  // Tally played group matches.
  const rmap = new Map(results.map((r) => [r.matchNumber, r]));
  for (const m of matches) {
    if (m.stage !== 'Group' || !m.group) continue;
    const r = rmap.get(m.number);
    if (!r?.played) continue;
    const a = standings.get(`${m.group}-${m.teamA}`);
    const b = standings.get(`${m.group}-${m.teamB}`);
    if (!a || !b) continue;
    a.played++; b.played++;
    if (r.scoreA != null && r.scoreB != null) {
      a.goalDifference += r.scoreA - r.scoreB;
      b.goalDifference += r.scoreB - r.scoreA;
    }
    if (r.outcome === 'A') { a.wins++; b.losses++; a.points += 3; }
    else if (r.outcome === 'B') { b.wins++; a.losses++; b.points += 3; }
    else if (r.outcome === 'D') { a.draws++; b.draws++; a.points++; b.points++; }
  }
  return [...standings.values()];
}


// ─────────────────────────────────────────────────────────────────────
// Predictions-Group tab
// Per spec: row 4 = match numbers, row 5 = labels, rows 6-35 = picks.
// Layout: col A = player name, cols B onwards = per-match picks (A/B/D).
// ─────────────────────────────────────────────────────────────────────

function parsePredictionsGroupCsv(rows: string[][]): PredictionsData {
  const empty: PredictionsData = {
    byPlayer: new Map(), consensus: new Map(), totalPlayers: 0,
  };
  if (rows.length < 5) {
    console.warn('[sheets] Predictions-Group too short');
    return empty;
  }

  // Find the row containing match numbers. Strategy: score each candidate
  // row by counting how many of its cells are integers in 1..120. The row
  // with the most such cells is almost certainly the match-numbering row
  // (group stage has 72 matches, so we expect 72+ matching cells).
  // Previous bug: was matching the first row with two adjacent small ints,
  // which picked up the Wild Card numbering row (1, 2, 3) instead.
  let matchNumRow: string[] | null = null;
  let matchNumRowIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const candidate = rows[i];
    if (!candidate) continue;
    let score = 0;
    const seen = new Set<number>();
    for (let j = 0; j < candidate.length; j++) {
      const t = (candidate[j] ?? '').trim();
      // STRICT: cell must be a pure integer. parseNum would strip letters,
      // turning "WC1" into 1 — that bug mapped wildcard columns onto
      // matches 1-3 and corrupted their picks.
      if (!/^\d+$/.test(t)) continue;
      const n = parseInt(t, 10);
      if (n >= 1 && n <= 104 && !seen.has(n)) {
        score++;
        seen.add(n);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      matchNumRow = candidate;
      matchNumRowIdx = i;
    }
  }
  if (!matchNumRow || bestScore < 10) {
    console.warn(`[sheets] No match-number row found in Predictions-Group (best score ${bestScore}). Need at least 10 columns with integers in 1..120.`);
    return empty;
  }
  console.info(`[sheets] Predictions match-number row at index ${matchNumRowIdx} (${bestScore} match columns).`);

  // Column index -> match number map. STRICT integers only ("WC1" must not
  // parse as 1), and first occurrence wins so duplicate numbers can't
  // overwrite real match columns.
  const colToMatch = new Map<number, number>();
  const usedMatchNums = new Set<number>();
  for (let i = 0; i < matchNumRow.length; i++) {
    const t = (matchNumRow[i] ?? '').trim();
    if (!/^\d+$/.test(t)) continue;
    const n = parseInt(t, 10);
    if (n < 1 || n > 104 || usedMatchNums.has(n)) continue;
    usedMatchNums.add(n);
    colToMatch.set(i, n);
  }
  if (colToMatch.size === 0) {
    console.warn('[sheets] No match columns found in Predictions-Group');
    return empty;
  }

  // Filter out wildcard / non-match columns by checking pick diversity.
  // Real match picks across players have at most 3 distinct values (teamA /
  // teamB / Draw, or A / B / D). Wildcard columns have one value per player
  // because every player's favorite top scorer differs. So if a column has
  // more than ~5 unique values across sampled player rows, it's not a real
  // match column.
  const sample = rows.slice(0, 60); // generous window of candidate player rows
  const dropped: number[] = [];
  for (const [colIdx, matchNum] of [...colToMatch]) {
    const uniq = new Set<string>();
    let nonEmpty = 0;
    for (const row of sample) {
      const cell = (row[colIdx] ?? '').trim().toLowerCase();
      if (!cell) continue;
      // Skip header-like rows.
      const name = (row[0] ?? '').trim().toLowerCase();
      if (!name || name.length > 60) continue;
      nonEmpty++;
      uniq.add(cell);
    }
    // Need at least 3 player rows to judge; if too few, keep the column.
    if (nonEmpty >= 3 && uniq.size > 5) {
      colToMatch.delete(colIdx);
      dropped.push(matchNum);
    }
  }
  if (dropped.length > 0) {
    console.info(`[sheets] Dropped ${dropped.length} non-match column(s) from Predictions-Group (looks like wildcards): match labels ${dropped.slice(0, 10).join(', ')}${dropped.length > 10 ? '…' : ''}`);
  }

  if (colToMatch.size === 0) {
    console.warn('[sheets] All Predictions-Group columns filtered out as wildcards. Check sheet layout.');
    return empty;
  }

  // Parse player rows. Players live BELOW the match-number row and the
  // labels row that immediately follows it.
  const byPlayer = new Map<string, PlayerPicks>();
  const consensus = new Map<number, Map<string, number>>();
  const HEADER_BLOCK = new Set([
    '', 'player', 'name', 'predictions', 'predictions-group',
    'pick', 'picks', 'match', 'matches',
  ]);
  const isHeaderLike = (s: string): boolean => {
    const t = s.toLowerCase();
    if (HEADER_BLOCK.has(t)) return true;
    // "match #:", "match#", "match :", "round of 16:", etc.
    if (/^(match|round|stage|group|venue|date|time|score)\b[\s#:]*$/.test(t)) return true;
    if (/^(match|round)\s*[#:]/i.test(t)) return true;
    return false;
  };

  for (let i = 0; i < rows.length; i++) {
    // Skip everything at or before the labels row (which sits immediately
    // after the match-number row per spec).
    if (i <= matchNumRowIdx + 1) continue;
    const row = rows[i];
    const name = (row[0] ?? '').trim();
    if (!name || isHeaderLike(name)) continue;
    if (name.length > 60) continue; // descriptions, not names
    if (/^[\d.,\s]+$/.test(name)) continue;

    const picks = new Map<number, string>();
    for (const [colIdx, matchNum] of colToMatch) {
      const cell = (row[colIdx] ?? '').trim();
      if (!cell) continue;
      // Sanity cap only. Longest legit pick is "Bosnia and Herzegovina Win"
      // (26 chars) — the old 20-char cap silently dropped those picks.
      // Wildcard contamination is no longer possible here because the
      // match-number mapping now requires strict integers ("WC1" can't
      // register as match 1), so a generous cap is safe.
      if (cell.length > 60) continue;
      // Skip purely numeric cells (e.g. "1", "0", "3.5") — those are stray
      // score values that occasionally leak into the Predictions tab,
      // not real predictions. Real picks always contain letters.
      if (/^[\d.,]+$/.test(cell)) continue;
      picks.set(matchNum, cell);
    }
    if (picks.size === 0) continue;

    const key = name.toLowerCase().trim();
    if (byPlayer.has(key)) continue; // dedupe
    byPlayer.set(key, { name, picks });

    // Build consensus tallies.
    for (const [matchNum, pick] of picks) {
      let counts = consensus.get(matchNum);
      if (!counts) { counts = new Map(); consensus.set(matchNum, counts); }
      counts.set(pick, (counts.get(pick) ?? 0) + 1);
    }
  }

  console.info(`[sheets] Loaded predictions for ${byPlayer.size} players across ${colToMatch.size} matches.`);
  return { byPlayer, consensus, totalPlayers: byPlayer.size };
}

// ─────────────────────────────────────────────────────────────────────
// Knockout team resolution — the Schedule sheet's KO rows (matches
// 73-104) only ever carry whatever placeholder label is typed into them
// ("Group A 2nd", "Match 74 winner"); the real team names live behind
// the Bracket backend (Config!J6:J37 + live results), resolved the same
// way the Bracket page resolves them. We mirror that here so Schedule
// and MyPicks show real names too, falling back to "TBD" per side until
// the backend can resolve it.
// ─────────────────────────────────────────────────────────────────────

async function resolveKnockoutTeams(): Promise<Map<number, [string, string]> | null> {
  if (!API_CONFIGURED) return null;
  try {
    const [teamsRes, resultsRes] = await Promise.all([
      bracketApi.getTeams(),
      bracketApi.getResults(),
    ]);
    if (!teamsRes.ok) return null;
    const structure: BracketStructure = buildDummyBracket(teamsRes.teams);
    const resolved = cascade(structure, resultsRes.ok ? resultsRes.results : {});
    const byMatchNumber = new Map<number, [string, string]>();
    for (const slot of structure.slots) {
      const comp = resolved.get(slot.id);
      byMatchNumber.set(slot.matchNumber, [comp?.a || 'TBD', comp?.b || 'TBD']);
    }
    return byMatchNumber;
  } catch (e) {
    console.error('[sheets] Knockout team resolution failed:', e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

export async function loadSnapshot(): Promise<DataSnapshot> {
  const mock = getMockSnapshot();

  const anyConfigured = Object.values(URLS).some((u) => u && u.startsWith('http'));
  if (!anyConfigured) {
    await new Promise((r) => setTimeout(r, 200));
    return mock;
  }

  const snapshot: DataSnapshot = { ...mock, fetchedAt: new Date() };

  // Kicked off now so it resolves concurrently with the CSV fetches below.
  const koTeamsPromise = resolveKnockoutTeams();

  // Run independent fetches in parallel.
  const tasks: Promise<void>[] = [];

  if (URLS.scoring) {
    tasks.push((async () => {
      try {
        const rows = await fetchCsvRows(URLS.scoring!);
        const players = parseScoringCsv(rows);
        if (players.length > 0) {
          snapshot.players = players;
          console.info(`[sheets] Loaded ${players.length} players from Scoring.`);
        } else {
          console.warn('[sheets] Scoring parsed to 0 players; keeping mocks.');
        }
      } catch (e) { console.error('[sheets] Scoring failed:', e); }
    })());
  }

  let realSchedule: Match[] | null = null;
  if (URLS.schedule) {
    tasks.push((async () => {
      try {
        const rows = await fetchCsvRows(URLS.schedule!);
        const matches = parseScheduleCsv(rows);
        if (matches.length > 0) {
          realSchedule = matches;
          snapshot.matches = matches;
          console.info(`[sheets] Loaded ${matches.length} matches from Schedule.`);
        } else {
          console.warn('[sheets] Schedule parsed to 0 matches; keeping mocks.');
        }
      } catch (e) { console.error('[sheets] Schedule failed:', e); }
    })());
  }

  let realResults: MatchResult[] | null = null;
  if (URLS.results) {
    tasks.push((async () => {
      try {
        const rows = await fetchCsvRows(URLS.results!);
        const results = parseResultsCsv(rows);
        if (results.length > 0) {
          realResults = results;
          snapshot.results = results;
          const played = results.filter((r) => r.played).length;
          console.info(`[sheets] Loaded ${results.length} results (${played} played).`);
        } else {
          console.warn('[sheets] Results parsed to 0 rows; keeping mocks.');
        }
      } catch (e) { console.error('[sheets] Results failed:', e); }
    })());
  }

  if (URLS.predictionsGroup) {
    tasks.push((async () => {
      try {
        const rows = await fetchCsvRows(URLS.predictionsGroup!);
        const preds = parsePredictionsGroupCsv(rows);
        if (preds.totalPlayers > 0) {
          snapshot.predictions = preds;
        } else {
          console.warn('[sheets] Predictions-Group parsed to 0 players; keeping mocks.');
        }
      } catch (e) { console.error('[sheets] Predictions-Group failed:', e); }
    })());
  }

  await Promise.all(tasks);

  // Overlay real KO team names (or "TBD" until resolved) over whatever
  // placeholder label the Schedule sheet has for matches 73-104.
  const koTeams = await koTeamsPromise;
  if (koTeams) {
    for (const m of snapshot.matches) {
      const sides = koTeams.get(m.number);
      if (sides) { m.teamA = sides[0]; m.teamB = sides[1]; }
    }
  }

  // Sanity gate: KO matches that still have placeholder team names
  // ("M73 winner", "1st Group A", "TBD", etc.) can't actually be played
  // yet. If the Results tab has stray cells in those rows the parser will
  // misread them as scores. Wipe played/score for those matches.
  const sched = realSchedule as Match[] | null;
  const res = realResults as MatchResult[] | null;
  if (sched && res) {
    const placeholderRe = /(winner|loser|TBD|^\d+(?:st|nd|rd|th)\b)/i;
    const mByNum = new Map(sched.map((m) => [m.number, m]));
    let cleared = 0;
    for (const r of res) {
      if (!r.played) continue;
      const m = mByNum.get(r.matchNumber);
      if (!m || m.stage === 'Group') continue;
      const hasPlaceholderTeam =
        placeholderRe.test(m.teamA) || placeholderRe.test(m.teamB);
      if (hasPlaceholderTeam) {
        r.played = false;
        r.scoreA = null;
        r.scoreB = null;
        r.outcome = null;
        cleared++;
      }
    }
    if (cleared > 0) {
      console.info(`[sheets] Cleared ${cleared} KO match(es) flagged as played but still have placeholder team names.`);
    }
    snapshot.standings = computeStandings(sched, res);
    console.info(`[sheets] Computed standings from real data.`);
  }

  return snapshot;
}
