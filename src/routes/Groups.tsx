/** Groups tab — 12 group cards with team list and group matches. */

import { useOutletContext } from 'react-router-dom';
import type { GameContextValue } from './GameLayout';
import type { GroupLetter, Team } from '@shared/types';

const ALL_GROUPS: GroupLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export function Groups() {
    const ctx = useOutletContext<GameContextValue>();
    const teamsByGroup = new Map<GroupLetter, Team[]>();
    for (const t of ctx.tournament.teams) {
        const list = teamsByGroup.get(t.group) ?? [];
        list.push(t);
        teamsByGroup.set(t.group, list);
    }
    const matchesByGroup = ctx.tournament.matches.reduce<Record<string, typeof ctx.tournament.matches>>(
        (acc, m) => {
            if (m.phase !== 'GROUP') return acc;
            const list = acc[m.group] ?? [];
            list.push(m);
            acc[m.group] = list;

            return acc;
        },
        {},
    );

    return (
        <>
            <h2>Groups</h2>
            <div className="groups-grid">
                {ALL_GROUPS.map((g) => {
                    const teams = teamsByGroup.get(g) ?? [];
                    const matches = matchesByGroup[g] ?? [];
                    const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? id;

                    return (
                        <div key={g} className="group-card">
                            <h3>Group {g}</h3>
                            <ul>
                                {teams.map((t) => (
                                    <li key={t.id}>{t.name}</li>
                                ))}
                            </ul>
                            <h4>Matches</h4>
                            <ul>
                                {matches.map((m) => (
                                    <li key={m.id}>
                                        {'homeTeamId' in m && (
                                            <>
                                                {teamName(m.homeTeamId)} vs {teamName(m.awayTeamId)} —{' '}
                                                {new Date(m.kickoffUtc).toLocaleDateString()}
                                            </>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
