import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const email = require('./email.cjs');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('email URL helpers', () => {
  it('builds HashRouter-safe order tracking and verify links', () => {
    vi.stubEnv('CLIENT_URL', 'https://yourgbedu.example/app/');

    expect(email.getTrackUrl('ABC 123')).toBe('https://yourgbedu.example/app/#/track?id=ABC%20123');
    expect(email.getVerifyUrl({
      clientUrl: 'https://yourgbedu.example/',
      token: 'token+with spaces',
    })).toBe('https://yourgbedu.example/#/verify?token=token%2Bwith%20spaces');
  });
});

describe('sendMagicLinkEmail diagnostics', () => {
  it('logs a dev preview URL when Resend is not configured outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RESEND_API_KEY', 're_placeholder');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await email.sendMagicLinkEmail({
      to: 'customer@example.com',
      token: 'devtoken',
      clientUrl: 'http://localhost:5173',
    });

    expect(result).toMatchObject({
      ok: false,
      skipped: true,
      reason: 'resend_not_configured',
      devLinkLogged: true,
      previewUrl: 'http://localhost:5173/#/verify?token=devtoken',
    });
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('http://localhost:5173/#/verify?token=devtoken'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('magic_link skipped'));
  });

  it('does not expose a preview URL in production when Resend is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', 're_placeholder');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await email.sendMagicLinkEmail({
      to: 'customer@example.com',
      token: 'prodtoken',
      clientUrl: 'https://yourgbedu.example',
    });

    expect(result).toMatchObject({
      ok: false,
      skipped: true,
      reason: 'resend_not_configured',
      devLinkLogged: false,
    });
    expect(result.previewUrl).toBeUndefined();
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
