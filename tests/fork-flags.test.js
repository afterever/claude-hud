// The fork's opt-in display flags (see docs/reference/claude-hud-modifications.md in the bats repo).
// Each flag is off by default, so upstream's own tests pin the unchanged output; these pin the flagged one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderLines } from '../dist/render/index.js';
import { mergeConfig } from '../dist/config.js';

const NOW = new Date(2026, 9, 1, 12, 0).getTime();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const GREEN = '\x1b[32m';

const plain = (s) => s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
const from = (ms) => new Date(NOW + ms);

function ctx({ config = {}, stdin = {}, transcript = {}, ...rest } = {}) {
  return {
    stdin: {
      model: { display_name: 'Opus' },
      cwd: '/home/u/dev/my-project',
      context_window: { context_window_size: 200000, used_percentage: 45, current_usage: { input_tokens: 90000 } },
      ...stdin,
    },
    transcript: { tools: [], agents: [], todos: [], ...transcript },
    claudeMdCount: 0,
    rulesCount: 0,
    mcpCount: 0,
    hooksCount: 0,
    costTotals: null,
    outputSpeed: null,
    gitStatus: null,
    usageData: null,
    memoryUsage: null,
    extraLabel: null,
    ...rest,
    config: mergeConfig(config),
  };
}

const raw = (c) => renderLines(c, null, NOW);
const lines = (c) => raw(c).map(plain);
const usage = () => ({ fiveHour: 25, sevenDay: 40, fiveHourResetAt: from(90 * MINUTE), sevenDayResetAt: from(50 * HOUR) });

test('usageEmojiPace labels the windows with emoji and shows usage minus elapsed', () => {
  const config = { display: { usageEmojiPace: true, sevenDayThreshold: 0 } };
  assert.equal(
    lines(ctx({ usageData: usage(), config }))[1],
    'Context █████░░░░░ 45% │ ⏳ ███░░░░░░░ 25% (1h 30m/-45%) 🐾 ████░░░░░░ 40% (2d 2h/-30%)',
  );
  assert.ok(raw(ctx({ usageData: usage(), config })).join('\n').includes(`${GREEN}-45%`), 'under pace is green');
  const weeklyOnly = { ...usage(), fiveHour: null };
  assert.equal(lines(ctx({ usageData: weeklyOnly, config }))[1], 'Context █████░░░░░ 45% │ 🐾 ████░░░░░░ 40% (2d 2h/-30%)');
});

test('contextSizeIcon picks the icon by window size', () => {
  const icon = (size) => lines(ctx({
    stdin: { context_window: { context_window_size: size, used_percentage: 45 } },
    config: { display: { contextSizeIcon: true } },
  }))[1].split(' ')[0];
  assert.equal(icon(1000000), '🐳');
  assert.equal(icon(200000), '🦐');
  assert.equal(icon(500000), '🧠');
  assert.equal(icon(undefined), '🧠', 'a missing size is not "under 200k"');
});

test('inlineDuration and inlineLastReply trail the merged context + usage row', () => {
  const stdin = { cost: { total_duration_ms: 90 * MINUTE } };
  const transcript = { lastAssistantResponseAt: new Date(2026, 9, 1, 11, 55) };
  const row = (display) => lines(ctx({ usageData: usage(), stdin, transcript, config: { display } }))[1];
  assert.match(row({ inlineDuration: true, inlineLastReply: true }), / \| ⏱️  1h 30m \| 🔔 11:55$/);
  assert.match(row({ inlineDuration: true }), / \| ⏱️  1h 30m$/);
  assert.match(row({ inlineLastReply: true }), / \| 🔔 11:55$/);
  assert.doesNotMatch(row({}), /⏱️|🔔/);
  const noUsage = lines(ctx({ stdin, transcript, config: { display: { inlineDuration: true, inlineLastReply: true } } }));
  assert.doesNotMatch(noUsage.join('\n'), /🔔/, 'only the merged context + usage row carries the suffix');
});

test('cacheOnTokensRow moves cache hit and expiry onto the Tokens row', () => {
  const transcript = { sessionTokens: { inputTokens: 12345, outputTokens: 6789, cacheCreationTokens: 0, cacheReadTokens: 4321 } };
  const stdin = { prompt_cache: { caching_observed: true, warm: true, ttl: '1h', expires_at: (NOW + 30 * MINUTE) / 1000, hit_ratio: 0.9432 } };
  const display = { showSessionTokens: true, showPromptCache: true, showCacheHitRate: true };
  const on = lines(ctx({ stdin, transcript, config: { display: { ...display, cacheOnTokensRow: true } } }));
  assert.equal(on.at(-1), 'Tokens 23k (in: 12k, out: 7k, cache: 4k) 🎯 94.3% 💤 12:30 in 30m0s');
  assert.doesNotMatch(on.join('\n'), /Cache hit|until/, 'the standalone rows are dropped');
  const off = lines(ctx({ stdin, transcript, config: { display } }));
  assert.match(off.join('\n'), /Cache hit 94\.3%/, 'without the flag the native rows stay');
  assert.equal(off.at(-1), 'Tokens 23k (in: 12k, out: 7k, cache: 4k)');
});

test('modelEmoji swaps the family name for its emoji and drops the brackets', () => {
  const badge = (display_name, display = {}) => lines(ctx({ stdin: { model: { display_name }, effort: { level: 'xhigh' } }, config: { display: { modelEmoji: true, ...display } } }))[0].split(' │ ')[0];
  assert.equal(badge('Opus'), '👑');
  assert.equal(badge('Sonnet 5.5'), '💎 5.5');
  assert.equal(badge('Haiku 5.5'), '✨ 5.5');
  assert.equal(badge('Fable 5.1'), '🦄 5.1');
  assert.equal(badge('Sonnet 5.5', { showEffortLevel: true, effortFormat: 'symbol' }), '💎 5.5 ◕');
  assert.equal(badge('Mystery 1'), 'Mystery 1', 'an unknown family is left alone');
});
