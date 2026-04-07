
(function(){
  const styles = `
    <style>
      .dropzone {
        border: 2px dashed #166534;
        border-radius: 16px;
        padding: 40px;
        text-align: center;
        background: #020617;
        color: #e5e7eb;
        cursor: pointer;
      }
      .dropzone:hover { background:#020617cc; }
      .file-list { margin-top:20px; }
      .file-item {
        display:flex;
        justify-content:space-between;
        padding:10px;
        border-bottom:1px solid #1e293b;
      }
      .progress {
        height:8px;
        background:#1e293b;
        border-radius:6px;
        overflow:hidden;
      }
      .progress-bar {
        height:100%;
        background:#22c55e;
        width:0%;
      }
    </style>
  `;

  function detectTipo(nome){
    const n = nome.toLowerCase();
    if(n.includes('producao')) return 'PRODUCAO';
    if(n.includes('despesa')) return 'DESPESA';
    if(n.includes('patrimonio')) return 'PATRIMONIO';
    return 'OUTROS';
  }

  async function uploadFile(file, supabase, progressEl){
    const path = `relatorios/${Date.now()}_${file.name}`;

    const { error } = await supabase.storage
      .from('relatorios-uploads')
      .upload(path, file);

    if(error) throw error;

    await supabase.from('relatorios_importacoes').insert([{
      nome_arquivo: file.name,
      tipo: detectTipo(file.name),
      path
    }]);

    progressEl.style.width = '100%';
  }

  function openHome(container, opts){
    container.innerHTML = `
      ${styles}
      <div class="dropzone" id="dropzone">
        Arraste arquivos aqui ou clique
        <input type="file" id="fileInput" multiple hidden />
      </div>
      <div class="file-list" id="fileList"></div>
    `;

    const drop = container.querySelector('#dropzone');
    const input = container.querySelector('#fileInput');
    const list = container.querySelector('#fileList');

    drop.onclick = () => input.click();

    drop.ondragover = e => { e.preventDefault(); };
    drop.ondrop = e => {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    };

    input.onchange = () => handleFiles(input.files);

    async function handleFiles(files){
      list.innerHTML = '';

      for(const file of files){
        const item = document.createElement('div');
        item.className = 'file-item';

        const name = document.createElement('span');
        name.innerText = file.name;

        const progress = document.createElement('div');
        progress.className = 'progress';
        const bar = document.createElement('div');
        bar.className = 'progress-bar';
        progress.appendChild(bar);

        item.appendChild(name);
        item.appendChild(progress);
        list.appendChild(item);

        try{
          await uploadFile(file, opts.supabase, bar);
        }catch(err){
          bar.style.background = 'red';
          console.error(err);
        }
      }
    }
  }

  window.RELATORIOS = { openHome };
})();
