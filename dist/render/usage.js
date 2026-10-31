import { t } from '../i18n/index.js';
import { isLimitReached } from '../types.js';
import { FIVE_HOUR_WINDOW_MS, SEVEN_DAY_WINDOW_MS, resolveUsagePaces } from '../usage-pace.js';
import { critical, formatQuotaPercent, green, label, quotaBar, red, yellow } from './colors.js';
import { barLabel } from './labels.js';
import { formatResetTime, formatWindowTime, limitTimeFormat, wallClock } from './time.js';
/** How much of the window has passed, 0-100; null without a reset time. */
function elapsedPercent(resetAt, windowMs, now) {
    if (!resetAt)
        return null;
    const elapsed = ((now - (resetAt.getTime() - windowMs)) / windowMs) * 100;
    return Math.max(0, Math.min(100, Math.round(elapsed)));
}
/** Usage minus elapsed time, e.g. `+12%`: green below 0, yellow up to +15, red beyond. */
function paceDelta(usagePercent, elapsed) {
    const delta = Math.round((usagePercent ?? 0) - elapsed);
    const text = `${delta >= 0 ? '+' : ''}${delta}%`;
    if (delta < 0)
        return green(text);
    return delta <= 15 ? yellow(text) : red(text);
}
function formatWindow(f, layout, w, align) {
    const display = f.config?.display;
    const colors = f.config?.colors;
    const timeFormat = display?.timeFormat ?? 'relative';
    const percent = formatQuotaPercent(w.percent, colors, display?.usageValue ?? 'percent', w.pace);
    const reset = formatWindowTime(w.resetAt, w.windowMs, timeFormat, wallClock(display), f.now);
    if (display?.usageCompact) {
        return reset
            ? `${label(`${w.label}:`, colors)} ${percent} ${label(`(${reset})`, colors)}`
            : `${label(`${w.label}:`, colors)} ${percent}`;
    }
    const elapsed = w.emoji ? elapsedPercent(w.resetAt, w.windowMs, f.now) : null;
    const delta = reset && elapsed !== null ? `/${paceDelta(w.percent, elapsed)}` : '';
    const elapsedMode = timeFormat === 'elapsed' || timeFormat === 'elapsedAndAbsolute';
    const wording = (display?.showResetLabel ?? true) && !elapsedMode;
    const resetText = delta
        ? `${reset}${delta}`
        : reset && wording ? `${t(timeFormat === 'absolute' ? 'format.resets' : 'format.resetsIn')} ${reset}` : reset;
    const styledLabel = w.emoji ?? (w.labelKey ? barLabel(w.labelKey, colors, align) : label(w.label, colors));
    if (display?.usageBarEnabled ?? true) {
        const barReset = layout === 'compact' && timeFormat === 'relative' && reset && !delta
            ? `${reset} / ${w.durationLabel ?? w.label}`
            : resetText;
        const body = `${quotaBar(w.percent ?? 0, f.barWidth, colors, w.pace)} ${percent}${barReset ? ` (${barReset})` : ''}`;
        return w.forceLabel ? `${styledLabel} ${body}` : body;
    }
    return `${styledLabel} ${percent}${resetText ? ` (${resetText})` : ''}`;
}
function limitNotice(f) {
    const display = f.config?.display;
    const usage = f.usageData;
    const format = limitTimeFormat(display?.timeFormat ?? 'relative');
    const resetAt = usage.fiveHour === 100 ? usage.fiveHourResetAt : usage.sevenDayResetAt;
    const reset = formatResetTime(resetAt, format, wallClock(display), f.now);
    if (display?.usageCompact) {
        return critical(`⚠ Limit${reset ? ` (${reset})` : ''}`, f.config?.colors);
    }
    const resetsKey = format === 'absolute' ? 'format.resets' : 'format.resetsIn';
    const suffix = reset ? ((display?.showResetLabel ?? true) ? ` (${t(resetsKey)} ${reset})` : ` (${reset})`) : '';
    return critical(`⚠ ${t('status.limitReached')}${suffix}`, f.config?.colors);
}
/**
 * The usage windows as separator-joined parts. Expanded joins them into one line;
 * compact lays them out with the rest of its line and leaves `Usage` off the
 * limit, weekly-only, and below-threshold parts.
 */
export function usageParts(f, layout, align = {}) {
    const display = f.config?.display;
    const usage = f.usageData;
    if (display?.showUsage === false || !usage)
        return null;
    const colors = f.config?.colors;
    const compact = layout === 'compact';
    const usageLabel = barLabel('label.usage', colors, align);
    const withLabel = (part) => `${usageLabel} ${part}`;
    const balance = usage.balanceLabel ?? null;
    const withBalance = (parts) => (balance ? [...parts, balance] : parts);
    const scopedWindows = display?.showModelScopedUsage === false ? [] : usage.scopedWindows ?? [];
    const hasWindowData = usage.fiveHour !== null || usage.sevenDay !== null || scopedWindows.length > 0;
    if (balance && !hasWindowData)
        return [withLabel(balance)];
    const paces = resolveUsagePaces(usage, scopedWindows, display, f.now);
    const scoped = scopedWindows.map((w, i) => formatWindow(f, layout, {
        label: w.label,
        percent: w.percent,
        resetAt: w.resetAt,
        windowMs: SEVEN_DAY_WINDOW_MS,
        pace: paces.scoped[i],
        forceLabel: true,
        durationLabel: '7d',
    }, align));
    if (isLimitReached(usage)) {
        const notice = limitNotice(f);
        return withBalance([compact || display?.usageCompact ? notice : withLabel(notice), ...scoped]);
    }
    const effectiveUsage = Math.max(usage.fiveHour ?? 0, usage.sevenDay ?? 0, ...scopedWindows.map((w) => w.percent ?? 0));
    if (effectiveUsage < (display?.usageThreshold ?? 0) && !paces.alert) {
        return balance ? [compact ? balance : withLabel(balance)] : null;
    }
    const emojiPace = display?.usageEmojiPace === true;
    const fiveHour = () => formatWindow(f, layout, {
        label: '5h',
        emoji: emojiPace ? '⏳' : undefined,
        percent: usage.fiveHour,
        resetAt: usage.fiveHourResetAt,
        windowMs: FIVE_HOUR_WINDOW_MS,
        pace: paces.fiveHour,
        forceLabel: emojiPace,
    }, align);
    const sevenDay = () => formatWindow(f, layout, {
        label: display?.usageCompact ? '7d' : t('label.weekly'),
        emoji: emojiPace && !display?.usageCompact ? '🐾' : undefined,
        labelKey: 'label.weekly',
        percent: usage.sevenDay,
        resetAt: usage.sevenDayResetAt,
        windowMs: SEVEN_DAY_WINDOW_MS,
        pace: paces.sevenDay,
        forceLabel: true,
    }, align);
    if (display?.usageCompact) {
        const windows = [
            usage.fiveHour !== null ? fiveHour() : null,
            usage.sevenDay !== null && (usage.fiveHour === null || paces.showSevenDay) ? sevenDay() : null,
        ].filter((part) => part !== null);
        const parts = [...windows, ...scoped];
        return parts.length > 0 ? withBalance(parts) : null;
    }
    if (usage.fiveHour === null && usage.sevenDay === null) {
        const [first, ...rest] = scoped;
        return first ? withBalance([withLabel(first), ...rest]) : balance ? [withLabel(balance)] : null;
    }
    // Emoji labels name the windows already, so they drop the `Usage` prefix and share one part.
    if (usage.fiveHour === null) {
        const weekly = sevenDay();
        return withBalance([compact || emojiPace ? weekly : withLabel(weekly), ...scoped]);
    }
    const windows = [fiveHour()];
    if (paces.showSevenDay)
        windows.push(sevenDay());
    if (emojiPace)
        return withBalance([windows.join(' '), ...scoped]);
    return withBalance([withLabel(windows[0]), ...windows.slice(1), ...scoped]);
}
//# sourceMappingURL=usage.js.map