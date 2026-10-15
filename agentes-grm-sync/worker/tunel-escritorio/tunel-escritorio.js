'use strict';
/**
 * Mantém no ar, no PC do escritório, o túnel SSH reverso até a VPS dos agentes + o proxy restrito.
 *
 *   PC (aqui):  proxy-saida.js em 127.0.0.1:3128  <==ssh -R==>  VPS: 127.0.0.1:47213
 *
 * Na VPS, grm-egress-proxy.js manda só o tráfego do GRM para 127.0.0.1:47213; ele sai pela rede do escritório
 * (IP aceito pela Cloudflare do GRM). Este processo reconecta sozinho (espera 5 → 60 s) e é iniciado pela tarefa
 * agendada instalada por instalar-tunel.ps1.
 *
 * Variáveis (todas opcionais): TUNEL_VPS (grao100@server.grao1000.com.br), TUNEL_CHAVE (~/.ssh/grm_tunel_ed25519),
 * TUNEL_PORTA_VPS (47213), TUNEL_PORTA_LOCAL (3128), TUNEL_SSH (caminho do ssh), TUNEL_LOG (arquivo de log).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { criarProxy } = require('./proxy-saida');

const VPS = process.env.TUNEL_VPS || 'grao100@server.grao1000.com.br';
const CHAVE = process.env.TUNEL_CHAVE || path.join(os.homedir(), '.ssh', 'grm_tunel_ed25519');
const PORTA_VPS = Number(process.env.TUNEL_PORTA_VPS || 47213);
const PORTA_LOCAL = Number(process.env.TUNEL_PORTA_LOCAL || 3128);
const SSH = process.env.TUNEL_SSH || (process.platform === 'win32' ? 'C:\\Windows\\System32\\OpenSSH\\ssh.exe' : 'ssh');
const LOG = process.env.TUNEL_LOG || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'grm-tunel', 'tunel.log');
const LOG_MAX_BYTES = 1024 * 1024;

fs.mkdirSync(path.dirname(LOG), { recursive: true });
function log(msg) {
  const linha = `${new Date().toISOString()} ${msg}\n`;
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > LOG_MAX_BYTES) fs.renameSync(LOG, `${LOG}.1`);
    fs.appendFileSync(LOG, linha);
  } catch { /* log é melhor esforço */ }
  process.stdout.write(linha);
}

const { server, stats } = criarProxy({ log: (m) => log(`[proxy] ${m}`) });
let ssh = null;
let encerrando = false;

function conectar(tentativa) {
  if (encerrando) return;
  const inicio = Date.now();
  const args = [
    '-N', '-T',
    '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-o', 'ConnectTimeout=20',
    '-i', CHAVE,
    '-R', `127.0.0.1:${PORTA_VPS}:127.0.0.1:${PORTA_LOCAL}`,
    VPS,
  ];
  log(`ssh: conectando (tentativa ${tentativa}) ${VPS} -R ${PORTA_VPS}->${PORTA_LOCAL}`);
  ssh = spawn(SSH, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let erro = '';
  ssh.stderr.on('data', (d) => { erro = (erro + d.toString()).slice(-600); });
  ssh.on('error', (e) => { erro = e.message; });
  ssh.on('exit', (codigo) => {
    ssh = null;
    const duracao = Date.now() - inicio;
    const limpo = erro.replace(/\s+/g, ' ').replace(/\*\* [^*]*/g, '').trim();
    log(`ssh: saiu (código ${codigo}) após ${Math.round(duracao / 1000)} s${limpo ? ` — ${limpo.slice(0, 300)}` : ''}`);
    if (encerrando) return;
    const proxima = duracao > 60000 ? 1 : tentativa + 1;
    const espera = Math.min(60, 5 * 2 ** Math.min(proxima - 1, 4));
    log(`ssh: nova tentativa em ${espera} s`);
    setTimeout(() => conectar(proxima), espera * 1000);
  });
}

function encerrar() {
  encerrando = true;
  log('encerrando');
  if (ssh) ssh.kill();
  server.close();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { log(`porta ${PORTA_LOCAL} já em uso — outra instância do túnel está rodando; saindo.`); process.exit(0); }
  log(`erro no proxy: ${e.message}`);
  process.exit(1);
});
server.listen(PORTA_LOCAL, '127.0.0.1', () => {
  log(`proxy restrito em 127.0.0.1:${PORTA_LOCAL}; chave ${CHAVE}`);
  conectar(1);
});
setInterval(() => log(`status: ssh=${ssh ? 'conectado/tentando' : 'aguardando'} proxy conectados=${stats.conectados} recusados=${stats.recusados} erros=${stats.erros}`), 15 * 60 * 1000).unref();
