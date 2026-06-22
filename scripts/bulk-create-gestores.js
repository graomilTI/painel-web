// Cria login (Supabase Auth + app_usuarios) em massa para gestores a partir de uma planilha.
// Uso: node scripts/bulk-create-gestores.js "C:/Users/graom/OneDrive/Desktop/gestores.xlsx"
// Planilha sem cabeçalho, colunas: A=nome, B=cargo, C=email, D=senha, E=regional/coordenacao
const fs = require('fs');
const path = require('path');
const xlsx = require('C:/Users/graom/node_modules/xlsx');

const envPath = path.join(__dirname, '..', 'email-worker', '.env');
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('SUPABASE_URL/SERVICE_ROLE_KEY não encontrados em email-worker/.env');

const GESTOR_PERFIL_ID = '8968a8ce-6239-48dd-813d-9a622ef6148f';
const filePath = process.argv[2];
if (!filePath) throw new Error('Informe o caminho da planilha como argumento.');

function headers(extra = {}) {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra };
}

async function emailExiste(email) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_usuarios?select=id&email=eq.${encodeURIComponent(email)}`, { headers: headers() });
  const data = await r.json();
  return Array.isArray(data) && data.length > 0;
}

async function criarAuthUser(email, password, nome) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password: String(password), email_confirm: true, user_metadata: { nome } }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.msg || data?.error_description || JSON.stringify(data));
  return data.id;
}

async function inserirAppUsuario(row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_usuarios`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.message || JSON.stringify(data));
  return data;
}

async function main() {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const resultados = [];
  for (const r of rows) {
    const nome = String(r[0] || '').trim();
    const cargo = String(r[1] || '').trim();
    const email = String(r[2] || '').trim().toLowerCase();
    const senha = String(r[3] || '').trim();
    const regional = String(r[4] || '').trim();
    if (!nome || !email || !senha) { resultados.push({ email, status: 'ignorado_linha_incompleta' }); continue; }

    try {
      if (await emailExiste(email)) {
        resultados.push({ email, status: 'ja_existe_nao_alterado' });
        continue;
      }
      const authUserId = await criarAuthUser(email, senha, nome);
      await inserirAppUsuario({
        nome, email, auth_user_id: authUserId, perfil_id: GESTOR_PERFIL_ID,
        status: 'ativo', ativo: true, setor: cargo || null, coordenacao: regional || null,
      });
      resultados.push({ email, status: 'criado' });
      console.log(`[OK] ${email}`);
    } catch (e) {
      resultados.push({ email, status: 'erro', detalhe: e.message });
      console.warn(`[ERRO] ${email}: ${e.message}`);
    }
  }

  const criados = resultados.filter(r => r.status === 'criado').length;
  const existentes = resultados.filter(r => r.status === 'ja_existe_nao_alterado').length;
  const erros = resultados.filter(r => r.status === 'erro').length;
  console.log(`\nResumo: ${criados} criados, ${existentes} já existiam (não alterados), ${erros} erros.`);

  const outPath = path.join(path.dirname(filePath), 'gestores_resultado.csv');
  const csv = ['email,status,detalhe', ...resultados.map(r => `${r.email},${r.status},"${(r.detalhe || '').replace(/"/g, "'")}"`)].join('\n');
  fs.writeFileSync(outPath, csv, 'utf8');
  console.log(`Relatório salvo em: ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
