import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { companyAccessRedirect } from '../lib/company-access';
import { renderExpiredCompanyAgenda } from './support/redesign-fixtures.cjs';
import { inspectEnvironment } from '../lib/runtime-config';
import { withRequestTimeout } from '../lib/server-fetch';
import { operationalFailure } from '../lib/operations';

const environment = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_isolated_public_key',
  NEXT_PUBLIC_SITE_URL: 'https://nuvlink.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'isolated-private-key-that-never-leaves-the-server',
  NUVEMMEET_REGISTRATION_OPEN: 'false',
  MERCADO_PAGO_BILLING_ENABLED: 'false',
};

test('preflight recusa segredos públicos, origem insegura e cobrança incompleta sem divulgar valores', () => {
  expect(inspectEnvironment(environment).valid).toBe(true);
  for (const url of ['http://nuvlink.invalid', 'https://user:password@nuvlink.invalid', 'https://nuvlink.invalid/path', 'https://nuvlink.invalid/?token=private']) {
    expect(inspectEnvironment({ ...environment, NEXT_PUBLIC_SITE_URL: url }).valid).toBe(false);
  }
  const privilegedJwt = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  for (const value of ['sb_secret_isolated_private_value', privilegedJwt]) {
    const result = inspectEnvironment({ ...environment, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: value });
    expect(result.errors).toContainEqual({ key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', code: 'privileged_key' });
    expect(JSON.stringify(result)).not.toContain(value);
  }
  const incomplete = inspectEnvironment({ ...environment, MERCADO_PAGO_BILLING_ENABLED: 'true' });
  expect(incomplete.valid).toBe(false);
  expect(incomplete.errors.map(issue => issue.key)).toEqual(expect.arrayContaining(['MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET']));
  expect(inspectEnvironment({ ...environment, NEXT_PUBLIC_PAYMENT_SECRET: 'isolated-secret' }).valid).toBe(false);
  expect(inspectEnvironment({ ...environment, NUVEMMEET_REGISTRATION_OPEN: 'TRUE' }).valid).toBe(false);
});

test('cadastro aberto exige contato e recuperação exige chave administrativa suficiente', () => {
  expect(inspectEnvironment({ ...environment, NUVEMMEET_REGISTRATION_OPEN: 'true' }).valid).toBe(false);
  expect(inspectEnvironment({ ...environment, NUVEMMEET_REGISTRATION_OPEN: 'true', NEXT_PUBLIC_CONTROLLER_NAME: 'Responsável de teste', NEXT_PUBLIC_PRIVACY_CONTACT: 'contact@example.test' }).valid).toBe(true);
  expect(inspectEnvironment({ ...environment, SUPABASE_SERVICE_ROLE_KEY: '' }).valid).toBe(false);
  expect(inspectEnvironment({ ...environment, SUPABASE_SERVICE_ROLE_KEY: 'too-short' }).valid).toBe(false);
});

test('requisições preservam cabeçalhos e cancelamento e encerram dependências lentas', async () => {
  const timers: NodeJS.Timeout[] = [];
  const server = createServer((request, response) => {
    if (request.url === '/slow') timers.push(setTimeout(() => response.end('late'), 500));
    else { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ authorization: request.headers.authorization })); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local test server');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const response = await withRequestTimeout(2_000)(url, { headers: { Authorization: 'Bearer isolated-test' } });
    expect(await response.json()).toEqual({ authorization: 'Bearer isolated-test' });
    await expect(withRequestTimeout(30)(url + '/slow')).rejects.toBeTruthy();
    const controller = new AbortController();
    const pending = withRequestTimeout(2_000)(new Request(url + '/slow', { signal: controller.signal }));
    controller.abort();
    await expect(pending).rejects.toBeTruthy();
  } finally {
    timers.forEach(clearTimeout); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('logs operacionais usam códigos permitidos e correlação sem dados pessoais ou segredos', () => {
  const original = console.warn;
  const messages: string[] = [];
  console.warn = value => messages.push(String(value));
  try {
    const requestId = operationalFailure('billing.webhook_failed', new Error('private-token customer@example.test https://private.invalid/?secret=123'));
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(messages[0])).toMatchObject({ event: 'billing.webhook_failed', reason: 'unavailable', requestId });
    expect(messages[0]).not.toMatch(/private-token|customer@|private\.invalid|secret=/);
    operationalFailure('billing.status_failed', new Error('provider_unavailable'));
    expect(JSON.parse(messages[1]).reason).toBe('provider_unavailable');
  } finally { console.warn = original; }
});

test('liveness não confunde aplicação ativa com banco configurado nem expõe detalhes internos', async ({ request }) => {
  const health = await request.get('/api/health', { headers: { Cookie: 'sb-untrusted-auth-token=expired-invalid' } });
  expect(health.status()).toBe(200);
  expect(health.headers()['cache-control']).toContain('no-store');
  expect(await health.json()).toMatchObject({ status: 'ok', service: 'nuvlink' });
  const ready = await request.get('/api/ready');
  expect(ready.status()).toBe(503);
  expect(await ready.json()).toEqual({ status: 'unavailable' });
  expect(ready.headers()['cache-control']).toContain('no-store');
  expect((await request.post('/api/health')).status()).toBe(405);
});


test('SDK real limita prazo total e repete somente leituras transitórias idempotentes', async () => {
  const counts = new Map<string, number>();
  const timers: NodeJS.Timeout[] = [];
  const server = createServer((request, response) => {
    const path = request.url!.split('?')[0];
    counts.set(path, (counts.get(path) || 0) + 1);
    response.setHeader('Content-Type', 'application/json');
    if (path.endsWith('/slow')) { timers.push(setTimeout(() => response.end('[]'), 500)); return; }
    if (path.endsWith('/deadline')) {
      if (counts.get(path) === 1) { response.writeHead(503); response.end('{"message":"retry"}'); }
      else timers.push(setTimeout(() => response.end('[]'), 200));
      return;
    }
    if (path.endsWith('/transient') && counts.get(path) === 1) { response.writeHead(503); response.end('{"message":"temporarily unavailable"}'); return; }
    if (path.endsWith('/backoff')) { response.writeHead(503, { 'Retry-After': '3600' }); response.end('{"message":"later"}'); return; }
    if (request.method === 'POST') { response.writeHead(503); response.end('{"message":"unavailable"}'); return; }
    response.end('[]');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing SDK test server');
  const url = `http://127.0.0.1:${address.port}`;
  const client = (timeout: number) => createClient(url, 'isolated-public-key', {
    db: { retry: false }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: withRequestTimeout(timeout) },
  });
  try {
    const start = Date.now();
    expect((await client(80).from('slow').select('id')).error).toBeTruthy();
    expect(Date.now() - start).toBeLessThan(1_000);
    expect(counts.get('/rest/v1/slow')).toBe(1);
    expect((await client(2_000).from('transient').select('id')).error).toBeNull();
    expect(counts.get('/rest/v1/transient')).toBe(2);
    expect((await client(250).from('deadline').select('id')).error).toBeTruthy();
    expect(counts.get('/rest/v1/deadline')).toBe(2);
    expect((await client(2_000).from('writes').insert({ id: 1 })).error).toBeTruthy();
    expect(counts.get('/rest/v1/writes')).toBe(1);
    expect((await client(80).from('backoff').select('id')).error).toBeTruthy();
    expect(counts.get('/rest/v1/backoff')).toBe(1);
  } finally {
    timers.forEach(clearTimeout); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('página real preserva agenda vencida e bloqueia recursos pagos sem consultar empresa privada', async ({ page, baseURL }) => {
  expect(companyAccessRedirect(false, 'agenda')).toBeNull();
  for (const tab of ['dashboard', 'servicos', 'clientes', 'avaliacoes', 'perfil', 'galeria', 'configuracoes']) {
    expect(companyAccessRedirect(false, tab)).toBe('/empresa?tab=agenda');
    expect(companyAccessRedirect(true, tab)).toBeNull();
  }
  await page.setContent(await renderExpiredCompanyAgenda(baseURL!));
  await expect(page.getByText(/Seu plano venceu/)).toBeVisible();
  await page.locator('.appointment-row').nth(1).locator('summary').click();
  await expect(page.getByRole('button', { name: 'Confirmar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reagendar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Ver perfil público/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Renovar plano', exact: true })).toBeVisible();
  await expect(renderExpiredCompanyAgenda(baseURL!, false)).rejects.toThrow('Fixture redirect: /planos');
});
