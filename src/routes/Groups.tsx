/** Groups tab — 12 group cards with team list and group matches. */

import { useOutletContext } from 'react-router-dom';
import { isGroupMatch } from '@shared/phases';
import { flagEmoji } from '@data/flags';
import { Flag } from '../components/Flag';
import type { GameContextValue } from './GameLayout';
import type { GroupLetter, Match, Team } from '@shared/types';

const ALL_GROUPS: GroupLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export function Groups() {
    const ctx = useOutletContext<GameContextValue>();
    const teamsByGroup = new Map<GroupLetter, Team[]>();
    for (const t of ctx.tournament.teams) {
        const list = teamsByGroup.get(t.group) ?? [];
        list.push(t);
        teamsByGroup.set(t.group, list);
    }
    const matchesByGroup = ctx.tournament.matches.reduce<Record<string, Match[]>>((acc, m) => {
        if (!isGroupMatch(m) || !m.group) return acc;
        const list = acc[m.group] ?? [];
        list.push(m);
        acc[m.group] = list;

        return acc;
    }, {});

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
                                    <li key={t.id}>
                                        <Flag emoji={flagEmoji(t.id)} />
                                        {t.name}
                                    </li>
                                ))}
                            </ul>
                            <h4>Matches</h4>
                            <ul>
                                {matches.map((m) => (
                                    <li key={m.id}>
                                        <Flag emoji={flagEmoji(m.homeTeamId)} />
                                        {teamName(m.homeTeamId)} vs <Flag emoji={flagEmoji(m.awayTeamId)} />
                                        {teamName(m.awayTeamId)} — {new Date(m.kickoffUtc).toLocaleDateString()}
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
