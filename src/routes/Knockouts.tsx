/** Knockouts tab — vertical list grouped by phase. */

import { useOutletContext } from 'react-router-dom';
import { formatKickoff } from '@shared/time';
import type { GameContextValue } from './GameLayout';
import type { BracketSlot, Phase } from '@shared/types';

const KNOCKOUT_PHASES: Phase[] = ['R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'];
const PHASE_LABEL: Record<Phase, string> = {
    GROUP: 'Group',
    R32: 'Round of 32',
    R16: 'Round of 16',
    QF: 'Quarter-finals',
    SF: 'Semi-finals',
    '3RD': '3rd-place playoff',
    FINAL: 'Final',
};

export function Knockouts() {
    const ctx = useOutletContext<GameContextValue>();
    const matches = ctx.tournament.matches;
    const now = Date.now();

    return (
        <>
            <h2>Knockouts</h2>
            {KNOCKOUT_PHASES.map((phase) => {
                const rows = matches.filter((m) => m.phase === phase);

                return (
                    <section key={phase}>
                        <h3>{PHASE_LABEL[phase]}</h3>
                        <ul>
                            {rows.map((m) => {
                                if (m.phase === 'GROUP') return null;
                                const locked = Date.parse(m.kickoffUtc) <= now;

                                return (
                                    <li key={m.id}>
                                        {slotLabel(m.homeSlot)} vs {slotLabel(m.awaySlot)} —{' '}
                                        {formatKickoff(m.kickoffUtc)}{' '}
                                        <span className={`badge${locked ? ' locked' : ''}`}>
                                            {locked ? 'locked' : 'open'}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                );
            })}
        </>
    );
}

function slotLabel(slot: BracketSlot): string {
    switch (slot.kind) {
        case 'GROUP_WINNER':
            return `Winner of Group ${slot.group}`;
        case 'GROUP_RUNNER_UP':
            return `Runner-up of Group ${slot.group}`;
        case 'BEST_THIRD_OF':
            return `Best 3rd from ${slot.eligibleGroups.join('/')}`;
        case 'KNOCKOUT_WINNER':
            return `Winner of ${slot.matchId}`;
        case 'KNOCKOUT_LOSER':
            return `Loser of ${slot.matchId}`;
    }
}
