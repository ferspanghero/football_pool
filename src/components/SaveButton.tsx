/** A save button with three states, shared by the editable rows and the champion banner. */

import type { ButtonHTMLAttributes } from 'react';

/**
 * Save button that reflects its save lifecycle in the label: idle ("Save"), in-flight
 * ("Saving…"), and persisted ("Saved ✓"). Disabled while saving, and when the caller passes
 * `disabled` (e.g. nothing selected yet). All other button props (`onClick`, `data-match`,
 * `tabIndex`, `style`, `className`) pass through to the underlying element.
 */
export function SaveButton({
    saving,
    saved = false,
    disabled = false,
    ...rest
}: { saving: boolean; saved?: boolean; disabled?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button {...rest} type="button" disabled={saving || disabled}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
    );
}
