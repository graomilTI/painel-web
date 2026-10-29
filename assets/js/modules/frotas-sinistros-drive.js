// Frotas · Sinistros: envio dos arquivos ao Google Drive pelo Web App do Apps Script (o mesmo das multas e do excesso de velocidade).
// Ação upload_sinistro_arquivo (docs/apps-script-upload-sinistro.md): cria SINISTROS > "SIN-0001 - PLACA" se não existir e grava o arquivo.
// Falha do Drive nunca desfaz o arquivo guardado no painel: quem chama avisa e o botão "Enviar ao Drive" tenta de novo.

const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzDlhiUGilfA1afrunX3Jtc8LAG4DqMO9v0AJKveUxjUaccfJM_ynnKGRghp_K5AfjK/exec';
const ACAO = 'upload_sinistro_arquivo';
const PASTA_RAIZ = 'SINISTROS';
export const MAX_DRIVE_BYTES = 25 * 1024 * 1024;

function blobParaBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo para enviar ao Drive.'));
    r.readAsDataURL(blob);
  });
}

async function chamarAppsScript(payload) {
  const url = String(globalThis.window?.FROTAS_CONFIG?.EXCESSO_VELOCIDADE_WEBAPP_URL || DEFAULT_GAS_URL).trim();
  let resp;
  try {
    resp = await fetch(url, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  } catch {
    throw new Error('Não foi possível falar com o Apps Script do Drive (sem conexão ou bloqueado).');
  }
  let json = null;
  try { json = JSON.parse(await resp.text()); } catch { /* resposta que não é JSON */ }
  if (!json) throw new Error(`O Apps Script respondeu algo que não é JSON (HTTP ${resp.status}): a ação ${ACAO} provavelmente ainda não foi instalada nele.`);
  if (!json.ok) {
    if (/a[cç][aã]o inv[aá]lida/i.test(json.message || '')) throw new Error(`O Apps Script ainda não tem a ação ${ACAO}: publique a versão nova do script.`);
    throw new Error(json.message || json.error || `O Apps Script recusou a ação ${ACAO}.`);
  }
  return json;
}

// `pasta` = nome da subpasta do sinistro; `substituirId` = arquivo anterior (vai para a lixeira do Drive, não é apagado de vez).
export async function enviarArquivoAoDrive({ pasta, nomeArquivo, blob, mimeType, substituirId = null }) {
  if (blob.size > MAX_DRIVE_BYTES) throw new Error('Arquivo maior que 25 MB: não enviado ao Drive.');
  const r = await chamarAppsScript({
    action: ACAO, rootFolderName: PASTA_RAIZ, sinistroFolderName: pasta, fileName: nomeArquivo,
    mimeType: mimeType || blob.type || 'application/octet-stream', base64: await blobParaBase64(blob), replaceFileId: substituirId || null,
  });
  if (!r.fileId && !r.fileUrl) throw new Error('O Apps Script não devolveu o arquivo salvo.');
  return { fileId: r.fileId || null, fileUrl: r.fileUrl || '', folderId: r.folderId || null, folderName: r.folderName || pasta, folderUrl: r.folderUrl || '' };
}
