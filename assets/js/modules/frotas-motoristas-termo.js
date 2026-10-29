// Frotas > Cadastros > Motoristas: gerar o Termo de Utilização de Veículos e anexar o termo assinado.
// O assinado vai para a subpasta do condutor no Drive (pasta mãe "CONDUTORES FROTA", a mesma do excesso
// de velocidade e das multas) pelo Web App do Apps Script, usando a ação upload_multa_dossie, que grava
// qualquer PDF na pasta do condutor. O painel só guarda a referência em frotas_motoristas.termo_*.
// Migration: 20261016120000_frotas_motoristas_termo_utilizacao.sql
import { dateInputToBr, montarDocTermo } from './frotas-termo-pdf.js?v=20261029-frotas-manut64';

const PASTA_MAE_DRIVE_ID = '1q5Ba5qqNJEBUZYA8GNRZmXZZsJ8U0YIr';
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzDlhiUGilfA1afrunX3Jtc8LAG4DqMO9v0AJKveUxjUaccfJM_ynnKGRghp_K5AfjK/exec';
const ACAO_DRIVE = 'upload_multa_dossie';
const MAX_BYTES = 15 * 1024 * 1024;
const TIPOS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
const EXT_TIPO = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

const limpar = (v) => String(v ?? '').replace(/[ ​-‍﻿]/g, ' ').replace(/\s+/g, ' ').trim();

function slug(v) {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'motorista';
}

// "Termo de Utilização de Veiculos - NOME DO CONDUTOR.pdf" (barras viram hífen para não quebrar o nome no Drive).
export function nomeArquivoTermo(nome, ext = 'pdf') {
  const condutor = limpar(nome).replace(/[\\/]+/g, '-').toUpperCase();
  return `Termo de Utilização de Veiculos - ${condutor}.${ext}`;
}

// Situação do termo para a tabela: anexado ou não.
export function termoAnexado(m) {
  return Boolean(m?.termo_anexado_em);
}

// Tipo do arquivo escolhido: só PDF, JPG ou PNG (pelo tipo informado ou, na falta, pela extensão).
export function tipoDoArquivo(file) {
  const porMime = TIPOS[String(file?.type || '').toLowerCase()];
  if (porMime) return { ext: porMime, mime: file.type.toLowerCase() };
  const ext = String(file?.name || '').split('.').pop().toLowerCase();
  if (EXT_TIPO[ext]) return { ext: ext === 'jpeg' ? 'jpg' : ext, mime: EXT_TIPO[ext] };
  return null;
}

function blobParaBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo para enviar ao Drive.'));
    r.readAsDataURL(blob);
  });
}

async function chamarAppsScript(payload) {
  const url = String(window.FROTAS_CONFIG?.EXCESSO_VELOCIDADE_WEBAPP_URL || DEFAULT_GAS_URL).trim();
  let resp;
  try {
    resp = await fetch(url, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  } catch (err) {
    console.warn('[motoristas] Apps Script inacessível:', err);
    throw new Error('Não foi possível falar com o Apps Script do Drive (sem conexão ou bloqueado).');
  }
  let json = null;
  try { json = JSON.parse(await resp.text()); } catch { /* resposta que não é JSON */ }
  if (!json) throw new Error(`O Apps Script respondeu algo que não é JSON (HTTP ${resp.status}): a ação ${ACAO_DRIVE} provavelmente não está instalada nele.`);
  if (!json.ok) throw new Error(json.message || json.error || `O Apps Script recusou a ação ${ACAO_DRIVE}.`);
  return json;
}

// Baixa o termo em PDF, já com nome, CNH e validade do motorista, para imprimir e colher a assinatura.
export async function gerarTermoMotorista(supabase, m) {
  if (!m?.cnh_numero || !m?.cnh_validade) throw new Error('Preencha o número e a validade da CNH do motorista (Editar) antes de gerar o termo.');
  let empresa = '';
  const cpf = String(m.cpf || '').replace(/\D/g, '');
  if (cpf) {
    const { data } = await supabase.from('colaboradores_atuais').select('empresa').eq('cpf', m.cpf).limit(1);
    empresa = data?.[0]?.empresa || '';
  }
  const { doc, slug: s } = await montarDocTermo({ nome: m.nome, empresa, cnhNumero: m.cnh_numero, cnhValidadeBr: dateInputToBr(m.cnh_validade) });
  doc.save(`termo-veiculo-${s || slug(m.nome)}.pdf`);
}

// Envia o termo assinado à pasta do condutor no Drive e grava a referência no cadastro.
export async function anexarTermoAssinado(supabase, m, file, usuarioNome = '') {
  const tipo = tipoDoArquivo(file);
  if (!tipo) throw new Error('Anexe o termo assinado em PDF, JPG ou PNG.');
  if (file.size > MAX_BYTES) throw new Error('O arquivo passa de 15 MB. Reduza ou envie em PDF.');
  const fileName = nomeArquivoTermo(m.nome, tipo.ext);
  const r = await chamarAppsScript({
    action: ACAO_DRIVE,
    parentFolderId: PASTA_MAE_DRIVE_ID,
    driverName: limpar(m.nome),
    fileName,
    mimeType: tipo.mime,
    base64: await blobParaBase64(file),
    replaceExisting: true,
    createFolderIfMissing: true,
  });
  if (!r.fileId && !r.fileUrl) throw new Error('O Apps Script não devolveu o arquivo salvo.');
  const campos = {
    termo_anexado_em: new Date().toISOString(),
    termo_arquivo_nome: fileName,
    termo_drive_file_id: r.fileId || null,
    termo_drive_url: r.fileUrl || null,
    termo_drive_pasta: r.folderName || null,
    termo_anexado_por: usuarioNome || null,
    termo_origem: 'painel',
  };
  const { error } = await supabase.from('frotas_motoristas').update(campos).eq('id', m.id);
  if (error) throw new Error(`O termo foi para o Drive, mas não consegui registrar no cadastro: ${error.message}`);
  return { ...campos, pasta: r.folderName || '' };
}

export const __teste = { nomeArquivoTermo, tipoDoArquivo, termoAnexado };
