/**
 * Migrate SpecStory session cache from JSON files to SQLite.
 *
 * Reads all JSON files from ~/.claude/timetracker/specstory-cache/
 * and upserts into the specstory_sessions table in ~/.tt/tt.db.
 *
 * Usage: npx tsx scripts/migrate-specstory-cache.ts [--dry-run]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { getDb } from '../src/core/db/connection.js';
import * as specstoryDb from '../src/core/db/specstory.js';
import config from '../tt.config.js';

const CACHE_ROOT = resolve(homedir(), '.claude', 'timetracker', 'specstory-cache');
const DRY_RUN = process.argv.includes('--dry-run');

// Repos to exclude (internal tooling, not billable)
const SKIP_REPOS = new Set([
  'timetracker-ui', 'tt', 'cricker.com', 'subekyoga.com', 'sqzd.in',
]);

interface CacheTimeline {
  time: string;
  type: string;
  repo: string;
  title: string;
  goal: string;
  outcome: string;
  session_recap: string[];
  completion_recap: string[];
  user_messages: number;
  agent_messages: number;
  size_kb: number;
  commits: string[];
  pr_urls: string[];
}

interface CacheFile {
  date: string;
  generated: string;
  timeline: CacheTimeline[];
}

function findJsonFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findJsonFiles(full));
      } else if (entry.name.endsWith('.json')) {
        files.push(full);
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return files;
}

function timeToIso(dateStr: string, timeStr: string): string {
  // Parse "1:47 PM" + "2026-03-16" → ISO string in Pacific Time
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return `${dateStr}T00:00:00`;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${dateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
}

function buildSummary(s: CacheTimeline): string | null {
  const parts: string[] = [];
  if (s.session_recap?.length) parts.push(...s.session_recap);
  if (s.completion_recap?.length) parts.push(...s.completion_recap);
  return parts.length > 0 ? parts.join('\n') : null;
}

function companyFromRepo(repo: string): string | null {
  if (repo.includes('zerobias') || repo === 'ui' || repo === 'clients' || repo === 'platform') return 'ZeroBias';
  if (repo.includes('w3geekery') || repo.includes('sme-mart') || repo.includes('sme_mart')) return 'W3Geekery';
  if (repo.includes('subekyoga')) return 'Sub Ek Yoga';
  return null;
}

function main() {
  const jsonFiles = findJsonFiles(CACHE_ROOT);
  console.log(`Found ${jsonFiles.length} cache files in ${CACHE_ROOT}`);

  if (jsonFiles.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  const db = getDb(config.db);
  let total = 0;
  let skipped = 0;
  let migrated = 0;

  for (const file of jsonFiles.sort()) {
    const raw = readFileSync(file, 'utf-8');
    const data: CacheFile = JSON.parse(raw);
    if (!data.timeline?.length) continue;

    for (const s of data.timeline) {
      total++;

      // Skip entries with no repo or unbillable repos
      if (!s.repo) { skipped++; continue; }
      const repoBase = s.repo.split('/').pop() ?? s.repo;
      if (SKIP_REPOS.has(repoBase) || SKIP_REPOS.has(s.repo)) {
        skipped++;
        continue;
      }

      // Construct a synthetic path (no real path in JSON cache)
      const safeName = (s.title ?? 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
      const syntheticPath = `cache-migrated/${data.date}/${s.repo}/${safeName}`;

      const session = {
        path: syntheticPath,
        repo: s.repo,
        company: companyFromRepo(s.repo),
        started: timeToIso(data.date, s.time),
        ended: null,
        size_bytes: (s.size_kb ?? 0) * 1024,
        summary: buildSummary(s),
        goal: s.goal ?? null,
        outcome: s.outcome ?? null,
        user_messages: s.user_messages ?? null,
        agent_messages: s.agent_messages ?? null,
        commits: s.commits ?? [],
        pr_urls: s.pr_urls ?? [],
      };

      if (DRY_RUN) {
        console.log(`  [DRY] ${data.date} | ${s.repo} | ${(s.title ?? 'untitled').slice(0, 40)} | ${s.outcome}`);
      } else {
        specstoryDb.upsert(db, session);
      }
      migrated++;
    }
  }

  console.log(`\nTotal sessions: ${total}`);
  console.log(`Skipped (unbillable): ${skipped}`);
  console.log(`Migrated: ${migrated}`);
  if (DRY_RUN) console.log('(dry run — no writes)');
}

main();
