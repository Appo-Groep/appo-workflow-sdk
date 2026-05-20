import { describe, expect, it } from 'vitest';
import { validateMessage } from './validate';

describe('validateMessage', () => {
  it('rejects non-objects', () => {
    expect(validateMessage(null).valid).toBe(false);
    expect(validateMessage('string').valid).toBe(false);
    expect(validateMessage(42).valid).toBe(false);
  });

  it('rejects messages without a string type field', () => {
    expect(validateMessage({}).valid).toBe(false);
    expect(validateMessage({ type: 1 }).valid).toBe(false);
  });

  it('accepts unknown message types (forward-compatible with new server types)', () => {
    expect(validateMessage({ type: 'made_up_type', anything: true }).valid).toBe(true);
  });

  it('validates a well-formed auth message', () => {
    const result = validateMessage({
      type: 'auth',
      token: 'abc',
      shared_id: '00000000-0000-4000-8000-000000000000',
      client_type: 'extension',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects an auth message with extra properties', () => {
    const result = validateMessage({
      type: 'auth',
      token: 'abc',
      shared_id: '00000000-0000-4000-8000-000000000000',
      client_type: 'extension',
      extra: 'nope',
    });
    expect(result.valid).toBe(false);
    expect(result.errors?.join(' ')).toMatch(/additional properties|extra/i);
  });

  it('rejects auth with wrong client_type', () => {
    const result = validateMessage({
      type: 'auth',
      token: 'abc',
      shared_id: '00000000-0000-4000-8000-000000000000',
      client_type: 'unknown',
    });
    expect(result.valid).toBe(false);
  });

  it('validates a context_update payload', () => {
    expect(
      validateMessage({
        type: 'context_update',
        payload: {
          host: 'www.make.com',
          pathname: '/scenarios/123/edit',
          platform: 'make',
        },
      }).valid,
    ).toBe(true);
  });

  it('rejects context_update with unsupported platform', () => {
    const result = validateMessage({
      type: 'context_update',
      payload: {
        host: 'www.make.com',
        pathname: '/scenarios/123/edit',
        platform: 'aol-keyword',
      },
    });
    expect(result.valid).toBe(false);
  });

  it('validates an inject_html message with safe element children', () => {
    const result = validateMessage({
      type: 'inject_html',
      payload: {
        injections: [
          {
            id: 'appo-deploy-btn',
            selector: '.sidebar-nav-actions',
            strategy: 'append',
            element: {
              tag: 'button',
              textContent: 'Deploy',
              classes: ['appo-btn'],
            },
            events: [
              {
                event: 'click',
                wssCommand: {
                  type: 'action',
                  action: 'deploy_scenario',
                  target: 'retool_client',
                },
              },
            ],
          },
        ],
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects inject_html with a disallowed tag', () => {
    const result = validateMessage({
      type: 'inject_html',
      payload: {
        injections: [
          {
            id: 'appo-evil',
            selector: 'body',
            strategy: 'append',
            element: { tag: 'script', textContent: 'alert(1)' },
          },
        ],
      },
    });
    expect(result.valid).toBe(false);
  });
});
