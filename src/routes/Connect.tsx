/**
 * "Connect your LLM" tab — mints an MCP bearer token and renders the ready-to-paste
 * `claude mcp add` command so a player can drive their picks from Claude Code. The password is
 * never shared: the token only ever acts as this player in this game, and expires after 60 days.
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api-client';
import { useToast } from '../components/Toast';

export function Connect() {
    const { gameId } = useParams();
    const { showToast } = useToast();
    const [command, setCommand] = useState<string | undefined>();
    const [expiresAt, setExpiresAt] = useState<string | undefined>();
    const [error, setError] = useState<string | undefined>();
    const [busy, setBusy] = useState(false);

    const generate = async () => {
        setBusy(true);
        setError(undefined);
        try {
            const res = await api.createMcpToken();
            const url = `${window.location.origin}/api/mcp`;
            setCommand(
                `claude mcp add --transport http -s user football-pool-${gameId} ${url} --header "Authorization: Bearer ${res.token}"`,
            );
            setExpiresAt(res.expiresAt);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to generate token');
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!command) return;
        try {
            await navigator.clipboard.writeText(command);
            showToast('success', 'Command copied');
        } catch {
            showToast('error', 'Copy failed — select the command and copy it manually');
        }
    };

    return (
        <>
            <h2>Connect your LLM</h2>
            <section className="connect-panel">
                <p>
                    Make your predictions by chatting with an LLM in <strong>Claude Code</strong>. Generate a token,
                    then paste the one-line command into your terminal. Your password is never shared — the token acts
                    only as you, in this game, and expires after 60 days.
                </p>
                <button type="button" onClick={generate} disabled={busy} data-testid="generate-token">
                    {command ? 'Regenerate token' : 'Generate token'}
                </button>
                {error && <div className="error">{error}</div>}
                {command && (
                    <div className="connect-result">
                        <pre data-testid="mcp-command">{command}</pre>
                        <div className="connect-actions">
                            <button type="button" className="secondary" onClick={copy}>
                                Copy command
                            </button>
                            {expiresAt && (
                                <span className="connect-expiry">Expires {new Date(expiresAt).toLocaleDateString()}</span>
                            )}
                        </div>
                    </div>
                )}
            </section>
        </>
    );
}
