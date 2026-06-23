// Envia link do painel + email + senha (via bot/WhatsApp) para os gestores recém-criados.
// Uso: node scripts/send-gestores-credenciais.js "C:/Users/graom/OneDrive/Desktop/gestores.xlsx"
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

const PAINEL_URL = 'https://grao1000.com.br/painel';
const filePath = process.argv[2];
if (!filePath) throw new Error('Informe o caminho da planilha como argumento.');

// Telefones obtidos por nome na tabela colaboradores (somente os 32 logins recém-criados).
const TELEFONES = {
  'carlos@grao1000.com.br': '45999172391',
  'supervisao.ms@grao1000.com.br': '66996909921',
  'jeanpabloex@gmail.com': '66996076403',
  'manuel_kaique@hotmail.com': '99988486088',
  'marco.augusto@grao1000.com.br': '66999652182',
  'marcosmota@grao1000.com.br': '44997119843',
  'michaelribas2017@gmail.com': '42998344303',
  'supervisao.londrina@grao1000.com.br': '43991826733',
  'samuelbbca@gmail.com': '67991194786',
  'sidneiribeirolm@gmail.com': '64992233113',
  'vanuzadeusnocorasao@gmail.com': '66984578435',
  'ricardomelo.araujo@hotmail.com': '34997297489',
  'lambertesalex@gmail.com': '55996668909',
  'andergraomil@gmail.com': '44998293822',
  'suporte.sp.sul@grao1000.com.br': '15996993214',
  'brunoeduardoferreirademello@gmail.com': '64992788163',
  'dvd_4630@hotmail.com': '44997076282',
  'dilmarthomet09@gmail.com': '54996743775',
  'eliasgrlrv@hotmail.com': '65992017487',
  'elsogarcia@grao1000.com': '66981274979',
  'supervisao.para@grao1000.com.br': '94992647956',
  'johny.sabino@hotmail.com': '34996710761',
  'juliosilvamtv@gmail.com': '64999441045',
  'marcosrosaalvesrosaalves@gmail.com': '44998565645',
  'pedrosallespaiva@gmail.com': '64999549057',
  'rdrigosocorreia@gmail.com': '61992441510',
  'rosivaldo.rrr@gmail.com': '66999244128',
  'ruimarcosferreiradossantos@gmail.com': '42991624954',
  'borchardtrepresentacoes@gmail.com': '54996073809',
  'silfarneyfelipe@gmail.com': '64992440472',
  'walissonbol123@gmail.com': '66999207904',
  'wgclassificacao@yahoo.com': '66996417613',
};

function primeiroNome(nomeCompleto) {
  const partes = String(nomeCompleto || '').trim().split(/\s+/);
  return partes[0] ? partes[0].charAt(0) + partes[0].slice(1).toLowerCase() : '';
}

async function enviar(phone, message, nome) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/botconversa-send`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, message, nome }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || data?.message || JSON.stringify(data));
  return data;
}

async function main() {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const resultados = [];
  for (const r of rows) {
    const nome = String(r[0] || '').trim();
    const email = String(r[2] || '').trim().toLowerCase();
    const senha = String(r[3] || '').trim();
    const telefone = TELEFONES[email];
    if (!telefone) continue; // não está na lista dos 32 recém-criados

    const message = `Olá ${primeiroNome(nome)}! Seu acesso ao Painel Grão 1000 foi criado.\nLink: ${PAINEL_URL}\nEmail: ${email}\nSenha: ${senha}\n\nRecomendamos alterar a senha no primeiro acesso.`;
    try {
      await enviar(telefone, message, nome);
      resultados.push({ email, telefone, status: 'enviado' });
      console.log(`[OK] ${email} -> ${telefone}`);
    } catch (e) {
      resultados.push({ email, telefone, status: 'erro', detalhe: e.message });
      console.warn(`[ERRO] ${email}: ${e.message}`);
    }
  }

  const ok = resultados.filter(r => r.status === 'enviado').length;
  const erro = resultados.filter(r => r.status === 'erro').length;
  console.log(`\nResumo: ${ok} enviados, ${erro} erros.`);

  const outPath = path.join(path.dirname(filePath), 'gestores_envio_resultado.csv');
  const csv = ['email,telefone,status,detalhe', ...resultados.map(r => `${r.email},${r.telefone},${r.status},"${(r.detalhe || '').replace(/"/g, "'")}"`)].join('\n');
  fs.writeFileSync(outPath, csv, 'utf8');
  console.log(`Relatório salvo em: ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
