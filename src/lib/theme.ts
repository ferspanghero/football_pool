/**
 * Client-side colour theme selection, persisted in `localStorage` and applied via a
 * `data-theme` attribute on `<html>`. The default ("classic") theme needs no attribute; each other
 * theme is a `[data-theme="<name>"]` override block in its own `styles/<name>.css`, loaded after
 * `styles/app.css`.
 */

/**
 * The selectable UI themes. `classic` is the original look; `elifoot` is the Elifoot 98 skin;
 * `snes` is the dark retro 16-bit pixel skin.
 */
export type ThemeName = 'classic' | 'elifoot' | 'snes';

const STORAGE_KEY = 'fp-theme';

/** All selectable themes, in display order. */
export const THEMES: ReadonlyArray<{ value: ThemeName; label: string }> = [
    { value: 'classic', label: 'Classic' },
    { value: 'elifoot', label: 'Elifoot 98' },
    { value: 'snes', label: 'SNES Pixel' },
];

/** Read the persisted theme, falling back to `classic` when unset, unknown, or storage is unavailable. */
export function getStoredTheme(): ThemeName {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return THEMES.some((t) => t.value === stored) ? (stored as ThemeName) : 'classic';
    } catch {
        return 'classic';
    }
}

/**
 * Apply a theme to the document. `classic` removes the attribute (base styles apply); any other
 * theme sets `data-theme` on `<html>` so its scoped override block takes effect.
 */
export function applyTheme(theme: ThemeName): void {
    if (theme === 'classic') {
        delete document.documentElement.dataset.theme;
    } else {
        document.documentElement.dataset.theme = theme;
    }
}

/** Persist (best-effort) and apply a theme. Storage failures are ignored — the choice just won't stick. */
export function setTheme(theme: ThemeName): void {
    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch {
        // ignore — preference simply won't persist (e.g. storage disabled)
    }
    applyTheme(theme);
}
