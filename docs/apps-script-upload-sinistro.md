# Apps Script: ação `upload_sinistro_arquivo` (documentos de sinistro → Drive)

Frotas > **Sinistros**: cada arquivo anexado na ficha (CNH, CRLV, fotos, boletim de ocorrência, documentos do terceiro...)
é guardado no painel (bucket privado `frotas-sinistros`, cópia de segurança) e **também enviado ao Drive**:

```
SINISTROS / SIN-0001 - ABC1D23 / CNH do colaborador - cnh.pdf
                               / Fotos do acidente e do veículo - frente.jpg
                               / Terceiro 1 (Carlos) - CNH do condutor - cnh.jpg
```

O nome do arquivo já diz o que ele é, para a corretora achar sem abrir. As pastas são criadas no primeiro envio. O número
do sinistro não muda, então a subpasta é sempre a mesma.

## Instalar

1. Abra o projeto do Apps Script do Web App de Frotas (o mesmo das multas e do excesso de velocidade; a URL está em
   `DEFAULT_GAS_URL`) e substitua o conteúdo do `Código.gs` por [`docs/apps-script/frotas-web-app.gs`](apps-script/frotas-web-app.gs).
   Ele já traz a ação nova ligada no `doPost` (se o seu `Código.gs` estiver diferente do arquivo do repositório, copie só a função
   `handleUploadSinistroArquivo_` + `encontrarOuCriarPastaSinistro_` e as 3 linhas do `doPost`).
2. Implantar → **Gerenciar implantações** → lápis na implantação atual → **Versão: Nova versão** → Implantar.
   **Não use "Nova implantação"**: ela gera outra URL e o painel continuaria chamando a antiga.
3. Na primeira execução o Google pode pedir autorização de Drive; use a conta dona das pastas.

## Onde fica a pasta SINISTROS

Por padrão, no **Meu Drive** da conta dona do script. Para usar uma pasta que já existe (por exemplo, compartilhada com a
equipe ou a corretora), copie o id dela (o trecho final da URL da pasta) e preencha `FROTAS_PASTA_SINISTROS_ID` no script.

## Contrato

`POST` (`Content-Type: text/plain;charset=utf-8`, corpo JSON, igual às outras ações):

```json
{
  "action": "upload_sinistro_arquivo",
  "rootFolderName": "SINISTROS",
  "sinistroFolderName": "SIN-0001 - ABC1D23",
  "fileName": "CNH do colaborador - cnh.pdf",
  "mimeType": "application/pdf",
  "base64": "<arquivo em base64>",
  "replaceFileId": null
}
```

Resposta: `{ "ok": true, "fileId": "...", "fileUrl": "...", "folderId": "...", "folderName": "SIN-0001 - ABC1D23", "folderUrl": "...", "replaced": false }`
ou `{ "ok": false, "message": "motivo" }`.

## No painel

- Ao anexar, o arquivo vai ao Drive sozinho. Se o Drive falhar (script ainda sem a ação, sem conexão), o arquivo fica salvo no
  painel, aparece o selo **só no painel** e um aviso com o motivo.
- Na aba **Documentos** há a faixa **Google Drive**: link da pasta do sinistro e o botão **Enviar ao Drive (n)** para reenviar o que
  ficou pendente (inclui arquivos anexados antes do Drive existir).
- Remover um arquivo no painel **não apaga** a cópia que já está no Drive.
- Limite de 25 MB por arquivo.
