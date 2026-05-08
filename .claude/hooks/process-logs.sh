#!/bin/bash
# Process JSONL logs into recent-5.md and summary-10.md
# Called by session-end.sh before git commit
# Reads logs/dialogs/YYYY-MM-DD.jsonl, updates rolling windows

set -euo pipefail

export PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
export PROMPTS_DIR="$PROJECT_DIR/.github/prompts"
export LOGS_DIR="$PROJECT_DIR/logs/dialogs"

mkdir -p "$LOGS_DIR"

# Use node for all JSON processing (no jq dependency)
node -e "
const fs = require('fs');
const path = require('path');

const PROMPTS_DIR = process.env.PROMPTS_DIR;
const LOGS_DIR = process.env.LOGS_DIR;
const STATE_FILE = path.join(PROMPTS_DIR, 'log-state.json');
const RECENT_FILE = path.join(PROMPTS_DIR, 'recent-5.md');
const SUMMARY_FILE = path.join(PROMPTS_DIR, 'summary-10.md');

// ── Load or init state ───────────────────────────────────────────
let state = {
  nextEntryId: 1,
  windowId: 'W-0001',
  windowCount: 0,
  lastProcessedDate: '',
  lastProcessedCount: 0
};

try {
  if (fs.existsSync(STATE_FILE)) {
    Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  }
} catch {}

// ── Read new entries from JSONL ──────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const jsonlFile = path.join(LOGS_DIR, today + '.jsonl');

if (!fs.existsSync(jsonlFile) || fs.statSync(jsonlFile).size === 0) {
  // No new entries — ensure files exist
  if (!fs.existsSync(RECENT_FILE)) {
    fs.writeFileSync(RECENT_FILE,
      '# Recent Activity (auto-managed by hooks)\n\n' +
      '> Auto-generated from PostToolUse hooks. Do not edit manually.\n' +
      '> Showing last 5 state-changing events.\n');
  }
  if (!fs.existsSync(SUMMARY_FILE)) {
    fs.writeFileSync(SUMMARY_FILE,
      '# Window Summary (Stateful)\n\n' +
      '> Auto-managed rolling window. Every 10 events generates a summary with carry-forward.\n\n' +
      '## ' + state.windowId + '\n\n' +
      '- Window progress: ' + state.windowCount + '/10\n');
  }
  process.exit(0);
}

const jsonlContent = fs.readFileSync(jsonlFile, 'utf8');
const allLines = jsonlContent.split('\n').filter(l => l.trim());
const totalLines = allLines.length;

// Find new lines to process
let startIdx = 0;
if (state.lastProcessedDate === today && state.lastProcessedCount > 0) {
  if (state.lastProcessedCount >= totalLines) process.exit(0);
  startIdx = state.lastProcessedCount;
}

const newLines = allLines.slice(startIdx);
if (newLines.length === 0) process.exit(0);

// ── Parse new entries ────────────────────────────────────────────
const newEntries = [];
for (const line of newLines) {
  try {
    const d = JSON.parse(line);
    const entryId = state.nextEntryId++;
    state.windowCount++;
    newEntries.push({
      id: entryId,
      time: d.time || '',
      tool: d.tool || 'unknown',
      target: d.target || '',
      summary: d.summary || 'Tool call'
    });
  } catch {}
}

if (newEntries.length === 0) process.exit(0);

// ── Format entries as markdown ───────────────────────────────────
function formatEntry(e) {
  const timeShort = (e.time || '').replace('T', ' ').replace('Z', '').replace(/\.\d+/, '');
  const padId = String(e.id).padStart(3, '0');
  return [
    '## Event-' + padId,
    '',
    '- **Time**: ' + timeShort,
    '- **Tool**: \`' + e.tool + '\`',
    '- **Target**: \`' + e.target + '\`',
    '- **Summary**: ' + e.summary,
    ''
  ].join('\n');
}

const newMd = newEntries.map(formatEntry).join('\n');

// ── Update recent-5.md ───────────────────────────────────────────
const recentHeader =
  '# Recent Activity (auto-managed by hooks)\n\n' +
  '> Auto-generated from PostToolUse hooks. Do not edit manually.\n' +
  '> Showing last 5 state-changing events.\n';

let existingEntries = '';
if (fs.existsSync(RECENT_FILE)) {
  const content = fs.readFileSync(RECENT_FILE, 'utf8');
  // Extract entries (everything after the 4-line header)
  const lines = content.split('\n');
  const firstEntry = lines.findIndex(l => l.startsWith('## Event-'));
  if (firstEntry >= 0) {
    existingEntries = lines.slice(firstEntry).join('\n').trim();
  }
}

// Combine and keep last 5
const combined = (existingEntries + '\n' + newMd).trim();
const entryBlocks = combined.split(/\n(?=## Event-)/).filter(b => b.startsWith('## Event-'));
const recentEntries = entryBlocks.slice(-5).join('\n');

fs.writeFileSync(RECENT_FILE, recentHeader + '\n' + recentEntries + '\n');

// ── Update summary-10.md ─────────────────────────────────────────
let summaryContent = '';
if (fs.existsSync(SUMMARY_FILE)) {
  summaryContent = fs.readFileSync(SUMMARY_FILE, 'utf8');
} else {
  summaryContent =
    '# Window Summary (Stateful)\n\n' +
    '> Auto-managed rolling window. Every 10 events generates a summary with carry-forward.\n';
}

// Update window progress
const progressRe = /Window progress:\s*\d+\/10/;
const newProgress = 'Window progress: ' + state.windowCount + '/10';
if (progressRe.test(summaryContent)) {
  summaryContent = summaryContent.replace(progressRe, newProgress);
} else {
  summaryContent += '\n## ' + state.windowId + '\n\n- ' + newProgress + '\n';
}

// ── Rolling window: generate carry-forward if reached 10 ─────────
if (state.windowCount >= 10) {
  // Summarize from JSONL
  const allEntries = allLines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const filesChanged = [...new Set(
    allEntries.filter(e => e.tool === 'Edit' || e.tool === 'Write').map(e => e.target)
  )].slice(0, 10);
  const commandsRun = allEntries.filter(e => e.tool === 'Bash').map(e => e.target).slice(0, 5);

  let carryLines = 'Carry-forward from ' + state.windowId + ':';
  if (filesChanged.length > 0) carryLines += '\n- Files modified: ' + filesChanged.join(', ');
  if (commandsRun.length > 0) carryLines += '\n- Commands: ' + commandsRun.join('; ');
  carryLines += '\n- Total events in window: ' + state.windowCount;

  // Advance window
  const wn = parseInt(state.windowId.replace('W-', '')) || 1;
  state.windowId = 'W-' + String(wn + 1).padStart(4, '0');
  state.windowCount = 0;

  summaryContent += '\n\n### Carry Forward\n\n' + carryLines;
  summaryContent += '\n\n---\n\n## ' + state.windowId + '\n\n- Window progress: 0/10\n';
}

fs.writeFileSync(SUMMARY_FILE, summaryContent);

// ── Update log-state.json ────────────────────────────────────────
state.lastProcessedDate = today;
state.lastProcessedCount = totalLines;
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');

console.log('Processed ' + newEntries.length + ' new events. Window: ' + state.windowId + ' (' + state.windowCount + '/10)');
"
