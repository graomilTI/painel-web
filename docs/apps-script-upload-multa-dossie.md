# Apps Script: ação `upload_multa_dossie` (PDF único das multas → pasta do condutor no Drive)

> **Versão pronta:** [`docs/apps-script/frotas-web-app.gs`](apps-script/frotas-web-app.gs) é o `Código.gs` completo do
> Web App (o `doPost` original do excesso de velocidade + esta ação, reaproveitando os helpers de pasta dele).
> Basta substituir o conteúdo do arquivo no editor do Apps Script por ele e publicar uma nova versão na
> implantação existente. Os passos 1 e 2 abaixo servem só para quem prefere colar por partes.

Frotas > Ocorrências > Multas > **Anexos**: quando o auto de infração e o termo de desconto assinado
estão anexados, o painel junta tudo num único PDF e o envia ao Drive **na subpasta do condutor dentro
de "CONDUTORES FROTA"** (a mesma pasta dos prints de excesso de velocidade), com o título

```
DATA - PLACA - CONDUTOR - AUTO.pdf        ex.: 07-10-2026 - ABC1D23 - JOAO DA SILVA - G001234567.pdf
```

Num grupo de multas, datas, placas e autos distintos entram juntos separados por `+`.

O painel chama o **mesmo Web App do Apps Script** do excesso de velocidade
(`modules/frotas.js`, `DEFAULT_GAS_URL`), mas com uma ação nova. Enquanto o script não tiver essa ação,
o painel guarda o PDF único no Storage (cópia de segurança) e mostra o aviso
"não foi enviado ao Drive"; depois de atualizar o script, o botão **Enviar ao Drive** reenvia.

## Contrato

Requisição (`POST`, `Content-Type: text/plain;charset=utf-8`, corpo JSON — igual ao `upload_excesso_velocidade`):

```json
{
  "action": "upload_multa_dossie",
  "parentFolderId": "1q5Ba5qqNJEBUZYA8GNRZmXZZsJ8U0YIr",
  "driverName": "JOAO DA SILVA",
  "fileName": "07-10-2026 - ABC1D23 - JOAO DA SILVA - G001234567.pdf",
  "mimeType": "application/pdf",
  "base64": "<PDF em base64>",
  "replaceExisting": true,
  "createFolderIfMissing": true
}
```

Resposta: `{ "ok": true, "fileId": "...", "fileUrl": "https://drive.google.com/file/d/.../view", "folderId": "...", "folderName": "JOAO DA SILVA", "createdFolder": false, "replaced": false }`
ou `{ "ok": false, "message": "motivo" }`.

## 1) Cole esta função no projeto do Apps Script

O projeto é o do Web App cuja URL está em `DEFAULT_GAS_URL` (conta dona da pasta "CONDUTORES FROTA").

```javascript
function normalizarNomePasta_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

function handleUploadMultaDossie_(data) {
  try {
    var parentId = String(data.parentFolderId || '').trim();
    var condutor = normalizarNomePasta_(data.driverName);
    var fileName = String(data.fileName || '').trim();
    if (!parentId || !condutor || !fileName || !data.base64) {
      return { ok: false, message: 'Informe parentFolderId, driverName, fileName e base64.' };
    }

    // Subpasta do condutor: compara sem acento/maiúsculas/espaços extras (as pastas existentes são "NOME SOBRENOME").
    var parent = DriveApp.getFolderById(parentId);
    var folder = null;
    var it = parent.getFolders();
    while (it.hasNext()) {
      var f = it.next();
      if (normalizarNomePasta_(f.getName()) === condutor) { folder = f; break; }
    }
    var createdFolder = false;
    if (!folder) {
      if (data.createFolderIfMissing === false) return { ok: false, message: 'Pasta do condutor não encontrada: ' + condutor };
      folder = parent.createFolder(condutor);
      createdFolder = true;
    }

    // Mesmo nome = substitui (o arquivo anterior vai para a lixeira, não é apagado de vez).
    var replaced = false;
    if (data.replaceExisting !== false) {
      var same = folder.getFilesByName(fileName);
      while (same.hasNext()) { same.next().setTrashed(true); replaced = true; }
    }

    var blob = Utilities.newBlob(Utilities.base64Decode(data.base64), data.mimeType || 'application/pdf', fileName);
    var file = folder.createFile(blob);
    return {
      ok: true, fileId: file.getId(), fileUrl: file.getUrl(),
      folderId: folder.getId(), folderName: folder.getName(),
      createdFolder: createdFolder, replaced: replaced
    };
  } catch (err) {
    return { ok: false, message: String(err && err.message || err) };
  }
}
```

## 2) Ligue a ação no `doPost`

No `doPost(e)` do script, cole **logo na primeira linha de dentro da função**, antes de qualquer outro
código (não depende do nome das variáveis que o seu `doPost` já usa):

```javascript
var __multa = null;
try { __multa = JSON.parse(e.postData.contents); } catch (err) { /* não é JSON: segue o fluxo normal */ }
if (__multa && __multa.action === 'upload_multa_dossie') {
  return ContentService
    .createTextOutput(JSON.stringify(handleUploadMultaDossie_(__multa)))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Teste opcional (não cria nada): cole também esta função, escolha-a no menu de execução do editor e clique
em Executar; o log mostra se a subpasta do condutor é encontrada.

```javascript
function testarBuscaPastaCondutor() {
  var nome = normalizarNomePasta_('JOAO PEDRO CERUTTI CERQUEIRA'); // troque por um condutor real
  var it = DriveApp.getFolderById('1q5Ba5qqNJEBUZYA8GNRZmXZZsJ8U0YIr').getFolders();
  while (it.hasNext()) {
    var f = it.next();
    if (normalizarNomePasta_(f.getName()) === nome) { Logger.log('ENCONTRADA: ' + f.getName() + ' (' + f.getUrl() + ')'); return; }
  }
  Logger.log('NÃO encontrada: ' + nome);
}
```

## 3) Publique **na implantação existente** (a URL não pode mudar)

Implantar → **Gerenciar implantações** → lápis na implantação atual do Web App → **Versão: Nova versão** → Implantar.
Não use "Nova implantação": ela gera outra URL e o painel continuaria chamando a antiga.

Na primeira execução o Google pode pedir autorização de Drive para o script; use a conta dona da pasta.

## Como testar

No painel, abra Multas → ícone de clipe (Anexos) de uma multa de teste, anexe o auto e o termo assinado.
Ao completar, o PDF único deve aparecer na subpasta do condutor com o título acima, e o modal mostra
"Drive: abrir pasta do condutor". Em caso de erro o modal mostra o motivo e mantém a cópia no painel.
