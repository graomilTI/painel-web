import { supabase } from "./supabaseClient.js";

const pageContent = document.getElementById("pageContent");

// ==============================
// RENDER PRINCIPAL
// ==============================
function render() {
  pageContent.innerHTML = `
    <div class="card">
      <h2>Upload de Relatórios</h2>

      <div style="margin-top:20px;">
        <input type="file" id="fileInput" multiple />
      </div>

      <div style="margin-top:20px;">
        <button id="btnUpload" class="btn btn-primary">
          Enviar arquivos
        </button>
      </div>

      <div id="logUpload" style="margin-top:20px;"></div>
    </div>
  `;

  document
    .getElementById("btnUpload")
    .addEventListener("click", handleUpload);
}

// ==============================
// UPLOAD
// ==============================
async function handleUpload() {
  const files = document.getElementById("fileInput").files;
  const log = document.getElementById("logUpload");

  if (!files.length) {
    alert("Selecione ao menos um arquivo");
    return;
  }

  log.innerHTML = "Enviando...";

  for (const file of files) {
    try {
      const filePath = `relatorios/${Date.now()}_${file.name}`;

      // upload no bucket
      const { error: uploadError } = await supabase.storage
        .from("relatorios-uploads")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // salva registro no banco
      const { error: dbError } = await supabase
        .from("relatorios_importacoes")
        .insert([
          {
            nome_arquivo: file.name,
            path: filePath,
          },
        ]);

      if (dbError) throw dbError;

      log.innerHTML += `<div style="color:lime;">✔ ${file.name}</div>`;
    } catch (err) {
      console.error(err);
      log.innerHTML += `<div style="color:red;">✖ ${file.name}</div>`;
    }
  }

  log.innerHTML += `<div style="margin-top:10px;">Finalizado</div>`;
}

// ==============================
// INIT
// ==============================
render();
