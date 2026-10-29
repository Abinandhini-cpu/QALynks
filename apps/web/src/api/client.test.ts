import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, toQueryString } from './client';

afterEach(() => vi.unstubAllGlobals());

const respond = (status: number, body?: unknown, raw?: string) =>
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(status === 204 ? null : (raw ?? JSON.stringify(body)), { status }),
      ),
  );

describe('toQueryString', () => {
  it('skips empty values', () => {
    expect(toQueryString({ q: 'a b', priority: '', page: 2, status: undefined })).toBe(
      '?q=a+b&page=2',
    );
    expect(toQueryString({})).toBe('');
  });
});

describe('api.exportUrl', () => {
  it('keeps filters and sorting but drops pagination', () => {
    expect(api.exportUrl({ priority: 'High', sort: 'title', page: 3, pageSize: 20 })).toBe(
      '/api/test-cases/export.csv?priority=High&sort=title',
    );
  });
});

describe('request handling', () => {
  it('returns parsed JSON and sends JSON bodies', async () => {
    respond(200, { ok: 1 });
    await api.update('TC-0001', {} as never);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/test-cases/TC-0001');
    expect(init).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'application/json' } });
  });

  it('returns undefined for 204 responses', async () => {
    respond(204);
    await expect(api.remove('TC-0001')).resolves.toBeUndefined();
  });

  it('maps API error bodies, including field errors', async () => {
    respond(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        fields: { title: 'Title is required' },
      },
    });
    const err = await api.create({} as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fields: { title: 'Title is required' },
    });
  });

  it('falls back to a generic message for non-JSON failures', async () => {
    respond(502, undefined, '<html>bad gateway</html>');
    await expect(api.summary()).rejects.toMatchObject({
      status: 502,
      message: 'Request failed (502)',
    });
  });

  it('reports network failures clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));
    await expect(api.modules()).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('sends CSV text as text/csv', async () => {
    respond(200, { totalRows: 0, created: [], skippedDuplicates: [], failed: [] });
    await api.importCsv('a,b');
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init).toMatchObject({
      method: 'POST',
      body: 'a,b',
      headers: { 'Content-Type': 'text/csv' },
    });
  });

  it('calls duplicate check and get endpoints', async () => {
    respond(200, { duplicates: [] });
    await api.checkDuplicates({ title: 't', module: '' });
    respond(200, {});
    await api.get('TC-0002');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/test-cases/TC-0002');
  });
});
