/** Knockouts tab — read-only overview, grouped by phase, with open/locked badges. */

import { useOutletContext } from 'react-router-dom';
import { PHASES, isKnockoutMatch } from '@shared/phases';
import { formatKickoff } from '@shared/time';
import { matchSides } from '../lib/matchDisplay';
import { TeamSide } from '../components/Flag';
import type { GameContextValue } from './GameLayout';

const KNOCKOUT_PHASES = PHASES.filter((p) => p.stage === 'KNOCKOUT');

export function Knockouts() {
    const ctx = useOutletContext<GameContextValue>();
    const matches = ctx.tournament.matches;
    const now = Date.now();

    return (
        <>
            <h2>Knockouts</h2>
            {KNOCKOUT_PHASES.map((phase) => {
                const rows = matches.filter((m) => isKnockoutMatch(m) && m.phase === phase.id);

                return (
                    <section key={phase.id}>
                        <h3>{phase.label}</h3>
                        <ul>
                            {rows.map((m) => {
                                const locked = Date.parse(m.kickoffUtc) <= now;
                                const sides = matchSides(m, ctx.tournament.teams);

                                return (
                                    <li key={m.id}>
                                        <TeamSide side={sides.home} /> vs <TeamSide side={sides.away} /> —{' '}
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
