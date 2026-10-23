// Isolated visual fixtures. No credentials, sessions, API calls or product routes.
// Real TSX/CSS are loaded; only server actions and external data are replaced.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const appRequire = Module.createRequire(path.join(root, 'package.json'));
const ts = appRequire('typescript');
const React = appRequire('react');
const { renderToStaticMarkup } = appRequire('react-dom/server');
const cache = new Map();
let companyFixtureDb = null;
const actionFiles = /lib\/(actions|customer-actions|company-actions|engagement-actions)\.ts$/;
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  let source = fs.readFileSync(filename, 'utf8');
  if (relative === 'app/cliente/page.tsx') source += '\nexport { Home as FixtureHome };';
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = id => {
    if (id === 'server-only') return {};
    if (id === 'next/navigation') return { useRouter: () => ({ refresh() {}, push() {}, replace() {} }), redirect(destination) { throw new Error(`Fixture redirect: ${destination}`); } };
    let file;
    if (id.startsWith('@/')) file = path.join(root, id.slice(2));
    else if (id.startsWith('.')) file = path.resolve(path.dirname(filename), id);
    if (file) {
      file = [file, `${file}.tsx`, `${file}.ts`].find(candidate => fs.existsSync(candidate));
      if (file && actionFiles.test(file)) return new Proxy({}, { get: (_, name) => `/__isolated-action/${String(name)}` });
      if (file && /lib\/supabase\.ts$/.test(file)) return { isConfigured: () => companyFixtureDb !== null, isRegistrationOpen: () => false, supabase() { if (companyFixtureDb) return companyFixtureDb; throw new Error('Fixtures must never connect to Supabase.'); } };
      if (file) return load(path.relative(root, file));
    }
    return original(id);
  };
  cache.set(filename, mod);
  mod._compile(compiled, filename);
  return mod.exports;
}
const h = React.createElement;
const cssFiles = ['app/globals.css', 'app/workspace.css', 'app/shell.css', 'app/customer.css', 'app/discovery.css', 'app/business.css', 'app/entry.css', 'components/notifications.css'];
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixturesData() {
  const start = Date.now() + 2 * 60 * 60 * 1000;
  const items = ['confirmed', 'pending', 'completed', 'cancelled'].map((status, i) => ({ id: id(i + 10), business_id: id(1), service_id: id(2), customer_id: id(3), customer_name: 'Cliente de teste de layout', service_name: i ? 'Atendimento com nome longo para verificar quebra de texto' : 'Consulta de verificação', starts_at: new Date(start + i * 86400000).toISOString(), ends_at: new Date(start + i * 86400000 + 3600000).toISOString(), status, price_cents: 12000, comment: i === 1 ? 'Mensagem de teste de layout, sem dados reais.' : null }));
  const business = { id: id(1), owner_id: id(3), name: 'Empresa de teste de layout', slug: 'empresa-de-teste', description: 'Descrição de teste de layout, usada apenas nos testes isolados.', timezone: 'America/Sao_Paulo', category: 'Serviços', city: 'São Paulo', state: 'SP', phone: null, whatsapp: null, instagram: null, logo_path: null, cover_path: null, rating_average: 4.5, rating_count: 2 };
  const service = { id: id(2), business_id: id(1), name: 'Consulta de verificação', description: 'Descrição de teste isolado.', duration_minutes: 60, price_cents: 12000, active: true };
  return { items, business, service };
}
function homeDb(items, business) {
  return { rpc: async () => ({ data: { upcoming: 2, completed: 1, spending_cents: 12000, favorites: 1 }, error: null }), from(table) {
    let rows = table === 'appointments' ? [...items] : [{ id: business.id, name: business.name, logo_path: null }];
    const builder = { select() { return builder; }, eq(key, value) { rows = rows.filter(row => row[key] === value); return builder; }, neq(key, value) { rows = rows.filter(row => row[key] !== value); return builder; }, in(key, values) { rows = rows.filter(row => values.includes(row[key])); return builder; }, gte(key, value) { rows = rows.filter(row => row[key] >= value); return builder; }, lt(key, value) { rows = rows.filter(row => row[key] < value); return builder; }, order() { return builder; }, limit(value) { rows = rows.slice(0, value); return builder; }, then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); } };
    return builder;
  } };
}
async function renderFixtures(origin) {
  const { AppShell } = load('components/app-shell.tsx');
  const { NotificationProvider } = load('components/notifications.tsx');
  const { Appointments } = load('components/appointments.tsx');
  const { PageHeader } = load('components/ui.tsx');
  const { FixtureHome } = load('app/cliente/page.tsx');
  const { PublicCompanyDetails } = load('components/public-company-details.tsx');
  const { CompanyProfileForm, CompanyServices } = load('components/company-forms.tsx');
  const { BusinessAnalytics } = load('components/business-analytics.tsx');
  const { SlotPicker } = load('components/slot-picker.tsx');
  const { items, business, service } = fixturesData();
  const businesses = { [business.id]: { name: business.name, logo_path: null } };
  const home = await FixtureHome({ db: homeDb(items, business), userId: id(3), name: 'Pessoa de teste' });
  const today = new Date().toISOString().slice(0, 10);
  const report = { range: '7d', starts_on: today, ends_on: today, days: [{ date: today, appointments: 3, completed: 1, cancelled: 1 }], totals: { appointments: 3, completed: 1, future: 2, cancelled: 1 } };
  const scenarios = {
    cliente: h(AppShell, { workspace: 'cliente', activeTab: 'inicio', account: { name: 'Pessoa de teste' } }, home),
    agendamentos: h(AppShell, { workspace: 'cliente', activeTab: 'agendamentos', account: { name: 'Pessoa de teste' } }, h(PageHeader, { title: 'Meus agendamentos' }), h(Appointments, { items, businesses })),
    empresa: h(AppShell, { workspace: 'empresa', activeTab: 'dashboard', account: { name: 'Pessoa de teste' } }, h('div', { className: 'business-workspace stack' }, h(PageHeader, { title: 'Dashboard', eyebrow: business.name }), h('div', { className: 'business-dashboard stack' }, h(BusinessAnalytics, { report })), h('h2', null, 'Próximos agendamentos'), h(Appointments, { items, host: true }))),
    perfil: h(AppShell, { workspace: 'empresa', activeTab: 'perfil' }, h(PageHeader, { title: 'Perfil da empresa' }), h(CompanyProfileForm, { business })),
    servicos: h(AppShell, { workspace: 'empresa', activeTab: 'servicos' }, h('div', { className: 'business-workspace stack' }, h(PageHeader, { title: 'Serviços' }), h(CompanyServices, { services: [service] }))),
    publico: h(AppShell, { authenticated: false, active: 'empresas' }, h('h1', null, business.name), h(PublicCompanyDetails, { business, services: [service], hours: [], gallery: [], professionals: [], reviews: [{ id: id(8), business_id: business.id, rating: 4, comment: 'Comentário de teste de layout.', reviewer_name: 'Cliente de teste', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }], date: today }), h('form', { className: 'card stack booking-step' }, h('h2', null, 'Escolha seu horário'), h(SlotPicker, { slots: items.slice(0, 2).map(a => ({ starts_at: a.starts_at, ends_at: a.ends_at })), timezone: business.timezone }), h('button', { type: 'button', className: 'button' }, 'Confirmar agendamento'))),
  };
  const css = cssFiles.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  return Object.fromEntries(Object.entries(scenarios).map(([name, tree]) => [name, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${origin}/"><title>Teste isolado ${name}</title><style>${css}</style></head><body data-isolated-fixture="true">${renderToStaticMarkup(h(NotificationProvider, null, tree))}</body></html>`]));
}
async function renderExpiredCompanyAgenda(origin, hasCompany = true) {
  const { items, business } = fixturesData();
  companyFixtureDb = {
    auth: { getUser: async () => ({ data: { user: { id: id(3) } } }) },
    rpc: async (name) => {
      if (name === 'has_active_business_subscription') return { data: false, error: null };
      if (name === 'get_my_business_agenda_context') return { data: hasCompany ? { id: business.id, name: business.name, timezone: business.timezone } : null, error: null };
      throw new Error(`Unexpected paid RPC in expired fixture: ${name}`);
    },
    from(table) {
      if (!['profiles', 'appointments'].includes(table)) throw new Error(`Expired page must not query private company or paid resources: ${table}`);
      const query = { select() { return query; }, eq() { return query; }, order() { return query; },
        single: async () => ({ data: { display_name: 'Pessoa de teste', avatar_path: null } }),
        range: async () => ({ data: items, count: items.length, error: null }) };
      return query;
    },
  };
  try {
    const Company = load('app/empresa/page.tsx').default;
    const tree = await Company({ searchParams: Promise.resolve({ tab: 'agenda' }) });
    const { NotificationProvider } = load('components/notifications.tsx');
    const css = cssFiles.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
    return `<!doctype html><html lang="pt-BR"><head><base href="${origin}/"><style>${css}</style></head><body>${renderToStaticMarkup(h(NotificationProvider, null, tree))}</body></html>`;
  } finally { companyFixtureDb = null; }
}
module.exports = { renderFixtures, renderExpiredCompanyAgenda };
