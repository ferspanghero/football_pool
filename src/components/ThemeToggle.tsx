/** Header control to switch the UI theme (Classic ↔ Elifoot 98) and persist the choice. */

import { useState } from 'react';
import { getStoredTheme, setTheme, THEMES, type ThemeName } from '../lib/theme';

export function ThemeToggle() {
    const [theme, setThemeState] = useState<ThemeName>(getStoredTheme);

    const onChange = (next: ThemeName) => {
        setTheme(next);
        setThemeState(next);
    };

    return (
        <label className="theme-toggle">
            <span className="hint">Theme</span>
            <select aria-label="Theme" value={theme} onChange={(e) => onChange(e.target.value as ThemeName)}>
                {THEMES.map((t) => (
                    <option key={t.value} value={t.value}>
                        {t.label}
                    </option>
                ))}
            </select>
        </label>
    );
}
