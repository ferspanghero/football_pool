/**
 * Flag emoji for each tournament team. FIFA's 3-letter codes (`RSA`, `GER`, `ENG`, …) are not
 * ISO 3166-1 alpha-2, so this module maps each team to its ISO alpha-2 code and derives the
 * regional-indicator flag. England and Scotland aren't ISO countries, so they use the
 * subdivision tag-sequence flags instead. Kept next to the team data it mirrors.
 */

import type { TeamId } from '@shared/types';

const REGIONAL_INDICATOR_OFFSET = 0x1f1e6 - 'A'.charCodeAt(0);
const TAG_OFFSET = 0xe0000;
const CANCEL_TAG = '\u{E007F}';

/** Convert an ISO 3166-1 alpha-2 country code (e.g. `"ZA"`) into its regional-indicator flag emoji. */
export function toFlagEmoji(alpha2: string): string {
    const codePoints = [...alpha2.toUpperCase()].map((ch) => ch.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET);

    return String.fromCodePoint(...codePoints);
}

/** Build a subdivision flag (e.g. `"gbeng"` → England) from a tag sequence. */
function subdivisionFlag(subdivision: string): string {
    const tags = [...subdivision.toLowerCase()].map((ch) => String.fromCodePoint(TAG_OFFSET + ch.charCodeAt(0)));

    return ['🏴', ...tags, CANCEL_TAG].join('');
}

/** FIFA team code → ISO 3166-1 alpha-2 country code, for the 46 teams that are sovereign countries. */
const ALPHA2_BY_TEAM: Record<TeamId, string> = {
    MEX: 'MX', RSA: 'ZA', KOR: 'KR', CZE: 'CZ',
    CAN: 'CA', BIH: 'BA', QAT: 'QA', SUI: 'CH',
    BRA: 'BR', MAR: 'MA', HAI: 'HT',
    USA: 'US', PAR: 'PY', AUS: 'AU', TUR: 'TR',
    GER: 'DE', CUW: 'CW', CIV: 'CI', ECU: 'EC',
    NED: 'NL', JPN: 'JP', SWE: 'SE', TUN: 'TN',
    BEL: 'BE', EGY: 'EG', IRN: 'IR', NZL: 'NZ',
    ESP: 'ES', CPV: 'CV', KSA: 'SA', URU: 'UY',
    FRA: 'FR', SEN: 'SN', IRQ: 'IQ', NOR: 'NO',
    ARG: 'AR', ALG: 'DZ', AUT: 'AT', JOR: 'JO',
    POR: 'PT', COD: 'CD', UZB: 'UZ', COL: 'CO',
    CRO: 'HR', GHA: 'GH', PAN: 'PA',
};

/** Teams that are UK home nations rather than ISO countries — flagged via subdivision tag sequences. */
const SUBDIVISION_BY_TEAM: Record<TeamId, string> = {
    ENG: 'gbeng',
    SCO: 'gbsct',
};

/** The flag emoji for a team, or an empty string if the id is unknown. */
export function flagEmoji(teamId: TeamId): string {
    const subdivision = SUBDIVISION_BY_TEAM[teamId];
    if (subdivision) return subdivisionFlag(subdivision);

    const alpha2 = ALPHA2_BY_TEAM[teamId];

    return alpha2 ? toFlagEmoji(alpha2) : '';
}
