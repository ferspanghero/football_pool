import { describe, test, expect } from 'vitest';
import { hashPassword, verifyPassword, signCookie, verifyCookie } from '@api/crypto';

describe('hashPassword + verifyPassword', () => {
    test('verifyPassword returns true for the correct password', async () => {
        // Arrange
        const stored = await hashPassword('correct horse');

        // Act, Assert
        expect(await verifyPassword('correct horse', stored)).toBe(true);
    });

    test('verifyPassword returns false for the wrong password', async () => {
        // Arrange
        const stored = await hashPassword('correct horse');

        // Act, Assert
        expect(await verifyPassword('wrong password', stored)).toBe(false);
    });

    test('hashPassword produces a different output each time (random salt)', async () => {
        // Arrange, Act
        const a = await hashPassword('same');
        const b = await hashPassword('same');

        // Assert
        expect(a).not.toBe(b);
    });

    test('verifyPassword returns false on a malformed stored hash', async () => {
        // Arrange, Act, Assert
        expect(await verifyPassword('any', 'not-a-valid-hash-format')).toBe(false);
    });

    test('verifyPassword returns false on empty stored hash', async () => {
        // Arrange, Act, Assert
        expect(await verifyPassword('any', '')).toBe(false);
    });
});

describe('signCookie + verifyCookie', () => {
    const SECRET = 'test-secret-32-chars-12345678901234';

    test('verifyCookie returns the payload for a valid signed token', async () => {
        // Arrange
        const payload = { sub: 42, gid: 7, exp: nowSec() + 60 };
        const token = await signCookie(payload, SECRET);

        // Act
        const verified = await verifyCookie(token, SECRET);

        // Assert
        expect(verified).toEqual(payload);
    });

    test('verifyCookie returns undefined when the signature is tampered', async () => {
        // Arrange
        const token = await signCookie({ sub: 1, exp: nowSec() + 60 }, SECRET);
        const tampered = token.slice(0, -2) + 'XX';

        // Act, Assert
        expect(await verifyCookie(tampered, SECRET)).toBeUndefined();
    });

    test('verifyCookie returns undefined when the payload is tampered', async () => {
        // Arrange
        const token = await signCookie({ sub: 1, exp: nowSec() + 60 }, SECRET);
        const [, sig] = token.split('.');
        const tamperedPayload = btoa(JSON.stringify({ sub: 999, exp: nowSec() + 60 }))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        const tampered = `${tamperedPayload}.${sig}`;

        // Act, Assert
        expect(await verifyCookie(tampered, SECRET)).toBeUndefined();
    });

    test('verifyCookie returns undefined when token is expired', async () => {
        // Arrange
        const token = await signCookie({ sub: 1, exp: nowSec() - 1 }, SECRET);

        // Act, Assert
        expect(await verifyCookie(token, SECRET)).toBeUndefined();
    });

    test('verifyCookie returns undefined when the secret does not match', async () => {
        // Arrange
        const token = await signCookie({ sub: 1, exp: nowSec() + 60 }, SECRET);

        // Act, Assert
        expect(await verifyCookie(token, 'other-secret-32-chars-098765432100')).toBeUndefined();
    });

    test('verifyCookie returns undefined for malformed input', async () => {
        // Arrange, Act, Assert
        expect(await verifyCookie('', SECRET)).toBeUndefined();
        expect(await verifyCookie('no-dot-separator', SECRET)).toBeUndefined();
        expect(await verifyCookie('a.b.c', SECRET)).toBeUndefined();
    });

    test('verifyCookie returns undefined when expiry is missing', async () => {
        // Arrange — payload without `exp` field; signCookie requires `exp` but a tampered token might omit it
        const tamperedPayload = btoa(JSON.stringify({ sub: 1 }))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        const token = `${tamperedPayload}.somesig`;

        // Act, Assert
        expect(await verifyCookie(token, SECRET)).toBeUndefined();
    });
});

function nowSec(): number {
    return Math.floor(Date.now() / 1000);
}
