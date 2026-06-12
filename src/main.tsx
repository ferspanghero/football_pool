import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { applyTheme, getStoredTheme } from './lib/theme';
import './styles/app.css';
// Theme skins layer on top of app.css; load after it so equal-specificity overrides win by order.
// Each skin is scoped to its own [data-theme] block, so order between skins is immaterial.
import './styles/elifoot.css';
import './styles/snes.css';

// Apply the persisted theme before first render (index.html also applies it pre-paint to avoid a flash).
applyTheme(getStoredTheme());

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}
