import { coloredBar, getContextColor, label, RESET } from './colors.js';
import { t } from '../i18n/index.js';
import { formatContextValue, formatTokens } from '../utils/format.js';
import { contextUsage } from './derive.js';
import { barLabel } from './labels.js';
function thresholds(f) {
    return {
        warning: f.config?.display?.contextWarningThreshold,
        critical: f.config?.display?.contextCriticalThreshold,
    };
}
/** The context bar (when shown) and value, e.g. `█████░░░░░ 45%`. */
export function contextBarAndValue(f) {
    const display = f.config?.display;
    const colors = f.config?.colors;
    const context = contextUsage(f);
    const value = `${getContextColor(context.percent, colors, thresholds(f))}${formatContextValue(context, display?.contextValue ?? 'percent')}${RESET}`;
    const bar = display?.showContextBar !== false
        ? coloredBar(context.percent, f.barWidth, colors, thresholds(f))
        : null;
    return { bar, value };
}
/** ` (in: 12k, cache: 180k)` once context reaches the critical threshold. */
export function tokenBreakdown(f) {
    const display = f.config?.display;
    const usage = f.stdin.context_window?.current_usage;
    if (display?.showTokenBreakdown === false || !usage)
        return '';
    if (contextUsage(f).percent < (display?.contextCriticalThreshold ?? 85))
        return '';
    const input = formatTokens(usage.input_tokens ?? 0);
    const cache = formatTokens((usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0));
    return label(` (${t('format.in')}: ${input}, ${t('format.cache')}: ${cache})`, f.config?.colors);
}
/** 🐳 for a 1M window, 🦐 for 200k, 🧠 for any other or unreported size; null unless contextSizeIcon is on. */
function sizeIcon(f) {
    if (!f.config?.display?.contextSizeIcon)
        return null;
    const size = f.stdin.context_window?.context_window_size;
    if (typeof size !== 'number')
        return '🧠';
    return size >= 1_000_000 ? '🐳' : size <= 200_000 ? '🦐' : '🧠';
}
export function contextLine(f, align = {}) {
    const { bar, value } = contextBarAndValue(f);
    const prefix = sizeIcon(f) ?? barLabel('label.context', f.config?.colors, align);
    return `${prefix} ${bar ? `${bar} ` : ''}${value}${tokenBreakdown(f)}`;
}
//# sourceMappingURL=context.js.map