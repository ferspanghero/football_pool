/** Renders a team's flag emoji. Decorative — the team name beside it is the accessible label. */

import type { MatchSide } from '../lib/matchDisplay';

export function Flag({ emoji }: { emoji?: string | undefined }) {
    if (!emoji) return null;

    return (
        <span className="flag" aria-hidden="true">
            {emoji}
        </span>
    );
}

/** One side of a match: its flag (when known) followed by the team name or slot label. */
export function TeamSide({ side }: { side: MatchSide }) {
    return (
        <>
            <Flag emoji={side.flag} />
            {side.name}
        </>
    );
}
