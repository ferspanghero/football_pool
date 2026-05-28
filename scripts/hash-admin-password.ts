/**
 * One-shot utility: read a password from stdin, print the scrypt-style hash to stdout.
 * Use the printed value as the `ADMIN_PASSWORD_HASH` secret in Cloudflare.
 *
 * Usage:
 *   echo -n "your-password" | node --import tsx scripts/hash-admin-password.ts
 *   # or interactively:
 *   node --import tsx scripts/hash-admin-password.ts
 */

import { hashPassword } from '@api/crypto';

const chunks: Buffer[] = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', async () => {
    const password = Buffer.concat(chunks).toString('utf8').trim();
    if (!password) {
        process.stderr.write('Error: empty password\n');
        process.exit(1);
    }
    const hash = await hashPassword(password);
    process.stdout.write(hash + '\n');
});
