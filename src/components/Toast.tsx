/**
 * Transient feedback toasts. `success` toasts auto-dismiss; `error` toasts stay until the
 * user dismisses them (so important guidance isn't missed). Wrap the app in `ToastProvider`
 * and call `useToast().showToast(kind, message)` from anywhere inside it.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error';
type ToastItem = { id: number; kind: ToastKind; message: string };
type ToastContextValue = { showToast: (kind: ToastKind, message: string) => void };

const SUCCESS_TIMEOUT_MS = 3000;
const ToastContext = createContext<ToastContextValue | undefined>(undefined);
let nextToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const dismiss = useCallback((id: number) => {
        setToasts((current) => current.filter((t) => t.id !== id));
    }, []);

    const showToast = useCallback(
        (kind: ToastKind, message: string) => {
            const id = nextToastId++;
            setToasts((current) => [...current, { id, kind, message }]);
            if (kind === 'success') {
                setTimeout(() => dismiss(id), SUCCESS_TIMEOUT_MS);
            }
        },
        [dismiss],
    );

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="toast-viewport" role="status" aria-live="polite">
                {toasts.map((t) => (
                    <div key={t.id} className={`toast toast-${t.kind}`}>
                        <span>{t.message}</span>
                        <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                            ×
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

/** Access the toast API. Must be called from a component rendered inside `ToastProvider`. */
export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used within a ToastProvider');
    }

    return ctx;
}
