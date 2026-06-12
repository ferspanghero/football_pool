/**
 * Client-side colour theme selection, persisted in `localStorage` and applied via a
 * `data-theme` attribute on `<html>`. The default ("classic") theme needs no attribute —
 * the Elifoot 98 skin is the `[data-theme="elifoot"]` override block in `styles/app.css`.
 */

/** The selectable UI themes. `classic` is the original look; `elifoot` is the Elifoot 98 skin. */
export type ThemeName = 'classic' | 'elifoot';

const STORAGE_KEY = 'fp-theme';

/** All selectable themes, in display order. */
export const THEMES: ReadonlyArray<{ value: ThemeName; label: string }> = [
    { value: 'classic', label: 'Classic' },
    { value: 'elifoot', label: 'Elifoot 98' },
];

/** Read the persisted theme, falling back to `classic` when unset, unknown, or storage is unavailable. */
export function getStoredTheme(): ThemeName {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'elifoot' ? 'elifoot' : 'classic';
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
