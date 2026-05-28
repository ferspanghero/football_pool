/** Loading-skeleton placeholder and a hook that delays showing it (avoids flashing on fast loads). */

import { useEffect, useState } from 'react';

/** Returns true only once `active` has stayed true for `delayMs`; resets to false when inactive. */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
    const [shown, setShown] = useState(false);

    useEffect(() => {
        if (!active) {
            setShown(false);

            return;
        }
        const timer = setTimeout(() => setShown(true), delayMs);

        return () => clearTimeout(timer);
    }, [active, delayMs]);

    return shown;
}

/** A shimmering placeholder block standing in for content that is still loading. */
export function Skeleton({ lines = 3 }: { lines?: number }) {
    return (
        <div className="skeleton" aria-busy="true" aria-label="Loading">
            {Array.from({ length: lines }).map((_, i) => (
                <div key={i} className="skeleton-line" />
            ))}
        </div>
    );
}
