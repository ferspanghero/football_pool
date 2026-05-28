/**
 * Crypto primitives for the Worker — password hashing (PBKDF2/SHA-256) and HMAC-signed
 * session cookies. Uses Web Crypto (`globalThis.crypto.subtle`), which is available in
 * both Cloudflare Workers and Node 22+.
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const HMAC_ALGORITHM = 'HMAC';
const HASH_ALGORITHM = 'SHA-256';

/**
 * Hash a plaintext password with PBKDF2-SHA256 and a fresh random salt.
 *
 * The output format is `<base64url-salt>:<base64url-hash>` — stored as a single string
 * in the DB. Verify with `verifyPassword`.
 */
export async function hashPassword(plain: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const hash = await deriveKey(plain, salt);

    return `${toBase64Url(salt)}:${toBase64Url(hash)}`;
}

/**
 * Compare a plaintext password against a stored hash produced by `hashPassword`.
 *
 * Returns false (without throwing) for any malformed input. The comparison uses
 * constant-time bytewise equality to prevent timing attacks.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
    const parts = stored.split(':');
    if (parts.length !== 2) return false;
    const [saltB64, hashB64] = parts;
    if (!saltB64 || !hashB64) return false;
    let salt: Uint8Array;
    let expected: Uint8Array;
    try {
        salt = fromBase64Url(saltB64);
        expected = fromBase64Url(hashB64);
    } catch {
        return false;
    }
    const candidate = await deriveKey(plain, salt);

    return constantTimeEqual(candidate, expected);
}

/** Sign a JSON-serializable payload into a `<base64url-payload>.<base64url-hmac>` token. */
export async function signCookie<T>(payload: T, secret: string): Promise<string> {
    const json = JSON.stringify(payload);
    const data = toBase64Url(new TextEncoder().encode(json));
    const sig = await hmacSign(data, secret);

    return `${data}.${sig}`;
}

/**
 * Verify a token signed by `signCookie` and return the payload. Returns undefined on:
 * malformed input, signature mismatch, missing `exp` field, or expired token.
 *
 * `nowMs` lets callers (route handlers) pass an injected clock so the expiry check is
 * deterministic in tests. Defaults to `Date.now()` for any caller that doesn't care.
 *
 * The payload type is `unknown` — callers must narrow before use.
 */
export async function verifyCookie(token: string, secret: string, nowMs: number = Date.now()): Promise<unknown> {
    const parts = token.split('.');
    if (parts.length !== 2) return undefined;
    const [data, sig] = parts;
    if (!data || !sig) return undefined;
    const expectedSig = await hmacSign(data, secret);
    if (!constantTimeEqualStrings(sig, expectedSig)) return undefined;
    let payload: unknown;
    try {
        const decoded = new TextDecoder().decode(fromBase64Url(data));
        payload = JSON.parse(decoded);
    } catch {
        return undefined;
    }
    if (!isExpirableObject(payload)) return undefined;
    if (payload.exp <= Math.floor(nowMs / 1000)) return undefined;

    return payload;
}

async function deriveKey(plain: string, salt: Uint8Array): Promise<Uint8Array> {
    const passwordKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(plain),
        { name: 'PBKDF2' },
        false,
        ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: HASH_ALGORITHM },
        passwordKey,
        KEY_BYTES * 8,
    );

    return new Uint8Array(bits);
}

async function hmacSign(data: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: HMAC_ALGORITHM, hash: HASH_ALGORITHM },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign(HMAC_ALGORITHM, key, new TextEncoder().encode(data));

    return toBase64Url(new Uint8Array(sig));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a[i]! ^ b[i]!;
    }

    return diff === 0;
}

function constantTimeEqualStrings(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return diff === 0;
}

function toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

function isExpirableObject(value: unknown): value is { exp: number } & Record<string, unknown> {
    return typeof value === 'object' && value !== null && typeof (value as { exp?: unknown }).exp === 'number';
}
