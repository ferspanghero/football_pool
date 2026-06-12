import { describe, test, expect, vi, afterEach } from 'vitest';
import { log } from '@api/log';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('log', () => {
    test('info writes a structured JSON line to console.log', () => {
        // Arrange
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

        // Act
        log.info('hello');

        // Assert
        expect(spy).toHaveBeenCalledTimes(1);
        expect(JSON.parse(spy.mock.calls[0]![0] as string)).toEqual({ level: 'info', msg: 'hello' });
    });

    test('warn writes to console.warn and merges extra fields', () => {
        // Arrange
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Act
        log.warn('degraded', { window: '20260611-20260611' });

        // Assert
        expect(spy).toHaveBeenCalledTimes(1);
        expect(JSON.parse(spy.mock.calls[0]![0] as string)).toEqual({
            level: 'warn',
            msg: 'degraded',
            window: '20260611-20260611',
        });
    });

    test('error writes to console.error and merges extra fields', () => {
        // Arrange
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Act
        log.error('boom', { err: 'db down' });

        // Assert
        expect(spy).toHaveBeenCalledTimes(1);
        expect(JSON.parse(spy.mock.calls[0]![0] as string)).toEqual({ level: 'error', msg: 'boom', err: 'db down' });
    });
});
