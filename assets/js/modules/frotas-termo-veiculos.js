(function () {
  const MODULE_NAME = 'FROTAS_TERMO_VEICULOS';
  const EMPRESA_NOME = 'GRAO MIL LTDA';

  const styles = `
    <style>
      .fmt-shell{color:#e2e2f0}.fmt-head{margin-bottom:18px}.fmt-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fmt-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fmt-sub{max-width:900px;color:#6b7280;line-height:1.55;margin:0}.fmt-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.fmt-body{padding:18px;max-width:640px}.fmt-field{position:relative;margin-bottom:14px}.fmt-field label{display:block;margin:0 0 6px;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.fmt-input{width:100%;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark;box-sizing:border-box}.fmt-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.fmt-colab-results{position:absolute;z-index:20;top:100%;left:0;margin-top:4px;width:100%;max-height:220px;overflow:auto;border:1px solid rgba(34,197,94,.28);border-radius:14px;background:#0d0d18;box-shadow:0 20px 45px rgba(0,0,0,.45)}.fmt-colab-results button{display:block;width:100%;text-align:left;padding:9px 12px;border:0;background:transparent;color:#e2e2f0;cursor:pointer;font-size:12px}.fmt-colab-results button:hover{background:rgba(22,101,52,.3)}.fmt-picked{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(34,197,94,.30);background:rgba(22,101,52,.14);border-radius:14px;padding:12px 14px;margin-bottom:14px}.fmt-picked strong{display:block;color:#f8fafc;font-size:14px}.fmt-picked small{display:block;margin-top:2px;color:#86efac;font-size:11px}.fmt-picked button{border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.72);color:#cbd5e1;border-radius:10px;padding:6px 10px;font-size:11px;font-weight:900;cursor:pointer;white-space:nowrap}.fmt-btn{border:0;border-radius:14px;min-height:44px;padding:0 18px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%}.fmt-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fmt-btn:disabled{opacity:.5;cursor:not-allowed}.fmt-note{margin-top:14px;padding:12px 14px;border:1px dashed rgba(34,197,94,.28);border-radius:16px;background:rgba(2,6,23,.26);color:#bfdbfe;font-size:12px;line-height:1.5}.fmt-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 14px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.fmt-toast.show{opacity:1;transform:translateY(0)}@media(max-width:680px){.fmt-row{grid-template-columns:1fr}}
    </style>`;

  const state = { colaborador: null, gerando: false };

  function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c])); }
  function onlyDigits(v) { return String(v || '').replace(/\D/g, ''); }
  function toast(msg, error = false) {
    let el = document.querySelector('.fmt-toast');
    if (!el) { el = document.createElement('div'); el.className = 'fmt-toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.style.background = error ? 'rgba(127,29,29,.96)' : 'rgba(22,101,52,.96)';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3200);
  }

  function todayBr() {
    const d = new Date();
    return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  function dateInputToBr(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }

  async function loadJsPdf() {
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Não foi possível carregar o gerador de PDF.'));
      document.head.appendChild(script);
    });
    return window.jspdf.jsPDF;
  }

  const TERMO_BULLETS = [
    'Zelar pela conservação do veículo da empresa e mensalmente, no dia 20 de cada mês, preencher o checklist através do aplicativo Infleet-Motorista, com as informações sobre as condições do veículo da empresa.',
    'Comunicar diretamente à EMPRESA a necessidade de manutenção ou conserto do veículo, não podendo esse procedimento (conserto ou manutenção) ser feito sem prévio consentimento ou por pessoa não autorizada pela EMPRESA, excetuando-se aquelas de pequena monta, imprescindíveis à continuidade de viagens. Esta comunicação deverá ser através do aplicativo Infleet-Motorista, onde será inserida a informação da manutenção necessária, juntamente com a foto da peça/serviço solicitado.',
    'Comunicar imediatamente a empresa qualquer ocorrência relacionada ao veículo, tais como, danos, avarias e roubo ou furto.',
    'Comunicar imediatamente a empresa em caso de recebimento de multa por qualquer tipo de infração de trânsito.',
    'Pagar as multas decorrentes de infração de trânsito de minha responsabilidade.',
    'Controlar o consumo conforme as normas, mediante apresentação da nota fiscal do abastecimento, e anotação da quilometragem no momento do abastecimento.',
    'Não utilizar o veículo para viagens particulares, salvo se houver liberação formal, por escrito da EMPRESA.',
  ];

  const TERMO_PROIBICOES = [
    'A utilização do veículo por terceiros;',
    'A utilização do veículo para fins particulares;',
    'A concessão de carona para terceiros, que não colaboradores da empresa.',
    'Conduzir o veículo sob o efeito de bebidas, drogas ou qualquer outro entorpecente.',
  ];

  const TERMO_PARAGRAFOS_FINAIS = [
    'Os encargos e despesas com abastecimento, manutenção, licenciamento, seguro e pedágio ficam a encargo da EMPRESA.',
    'Em caso de danos ou avarias no veículo, decorrentes de negligência ou má utilização do mesmo, bem como o recebimento de multas por infração de trânsito ou ainda pelo não cumprimento das determinações acima, AUTORIZO a empresa a proceder a desconto em folha de pagamento do valor correspondente ao mesmo.',
    'Em caso de acidente por descuido ou negligência minha, RESPONDEREI, civil e criminalmente, pelos danos eventualmente causados a terceiros e ainda pagarei à empresa o valor do prejuízo causado pelo acidente.',
    'Tenho conhecimento de que nenhuma indenização me será devida pela EMPRESA, pela condução do veículo, haja vista que o mesmo é fornecido para que eu tenha condições de desempenhar a função para a qual fui contratado.',
    'O presente Termo terá início a partir da data assinatura e vigorará por prazo indeterminado, enquanto durar o vínculo empregatício, podendo ser revogado a qualquer tempo.',
    'E por estar de pleno acordo com as condições ora pactuadas, assino o presente instrumento.',
  ];

  async function gerarPdfTermo({ nome, cnhNumero, cnhValidadeBr }) {
    const JsPDF = await loadJsPdf();
    const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const marginX = 20;
    const pageWidth = 210;
    const pageHeight = 297;
    const contentWidth = pageWidth - marginX * 2;
    const lineHeight = 4.6;
    let y = 20;

    function ensureSpace(needed) {
      if (y + needed > pageHeight - 18) { doc.addPage(); y = 20; }
    }

    function paragraph(text, { gapAfter = 4, bold = false } = {}) {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(text, contentWidth);
      ensureSpace(lines.length * lineHeight + gapAfter);
      lines.forEach((line) => { doc.text(line, marginX, y); y += lineHeight; });
      y += gapAfter;
    }

    function indentedItem(prefix, text, indent) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(text, contentWidth - indent);
      ensureSpace(lines.length * lineHeight + 3);
      doc.text(prefix, marginX, y);
      lines.forEach((line) => { doc.text(line, marginX + indent, y); y += lineHeight; });
      y += 3;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Termo de Responsabilidade por Utilização de Veículo da Empresa', pageWidth / 2, y, { align: 'center' });
    y += 11;

    paragraph('Eu, abaixo nomeado, pela assinatura no presente instrumento, COMPROMETO-ME a:', { gapAfter: 5 });

    TERMO_BULLETS.forEach((item) => indentedItem('•', item, 6));

    y += 1;
    paragraph('Declaro ainda ter conhecimento que a utilização do veículo da empresa, destina-se única e exclusivamente para fins de exercício das atividades inerentes à função, sendo expressamente PROIBIDO:', { gapAfter: 5 });

    TERMO_PROIBICOES.forEach((item, idx) => indentedItem(`${String.fromCharCode(97 + idx)})`, item, 8));

    y += 1;
    TERMO_PARAGRAFOS_FINAIS.forEach((p) => paragraph(p, { gapAfter: 5 }));

    ensureSpace(10);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Cascavel PR, ${todayBr()}`, pageWidth - marginX, y, { align: 'right' });
    y += 16;

    ensureSpace(40);
    doc.setFont('helvetica', 'normal');
    doc.text(`Empresa: ${EMPRESA_NOME}`, marginX, y); y += 6;
    doc.text(`Colaborador Condutor ${nome.toUpperCase()}`, marginX, y); y += 6;
    doc.text(`CNH ${cnhNumero}  B ${cnhValidadeBr}`, marginX, y); y += 16;
    doc.line(marginX, y, marginX + 90, y);
    y += 5;
    doc.text('Assinatura', marginX, y);

    const slug = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'colaborador';
    doc.save(`termo-veiculo-${slug}.pdf`);
  }

  async function buscarColaborador(root, opts, termo) {
    const wrap = root.querySelector('[data-colab-results]');
    if (!wrap) return;
    if (!termo || termo.trim().length < 3) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
    const { data, error } = await opts.supabase
      .from('colaboradores_atuais')
      .select('nome,cpf,whatsapp,email_empresa,email_pessoal,endereco,bairro,cidade,estado,cep')
      .ilike('nome', `%${termo.trim()}%`)
      .limit(8);
    if (error || !data?.length) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
    wrap.innerHTML = data.map((c, idx) => `<button type="button" data-colab-idx="${idx}">${esc(c.nome)}</button>`).join('');
    wrap.style.display = 'block';
    wrap.querySelectorAll('[data-colab-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.colaborador = data[Number(btn.dataset.colabIdx)];
        wrap.innerHTML = ''; wrap.style.display = 'none';
        renderForm(root, opts);
      });
    });
  }

  async function salvarMotorista(opts, colaborador, cnhNumero, cnhValidade) {
    const cpf = onlyDigits(colaborador.cpf) || null;
    const telefone = onlyDigits(colaborador.whatsapp) || null;
    const email = colaborador.email_empresa || colaborador.email_pessoal || null;
    const endereco = [colaborador.endereco, colaborador.bairro, colaborador.cidade, colaborador.estado, colaborador.cep].filter(Boolean).join(', ') || null;

    let existente = null;
    if (cpf) {
      const { data } = await opts.supabase.from('frotas_motoristas').select('id').eq('cpf', cpf).limit(1);
      existente = data?.[0] || null;
    }

    const payload = { nome: colaborador.nome, cpf, telefone, email, cnh_numero: cnhNumero, cnh_validade: cnhValidade, endereco, status: 'ATIVO' };

    if (existente) {
      const { error } = await opts.supabase.from('frotas_motoristas').update(payload).eq('id', existente.id);
      if (error) throw error;
      return 'atualizado';
    }
    const { error } = await opts.supabase.from('frotas_motoristas').insert({ ...payload, origem: 'termo_veiculo' });
    if (error) throw error;
    return 'cadastrado';
  }

  async function gerarTermo(root, opts) {
    const cnhNumero = root.querySelector('[name="cnh_numero"]')?.value.trim();
    const cnhValidade = root.querySelector('[name="cnh_validade"]')?.value;
    if (!state.colaborador) return toast('Selecione o colaborador que vai assinar o termo.', true);
    if (!cnhNumero) return toast('Informe o número da CNH.', true);
    if (!cnhValidade) return toast('Informe a data de vencimento da CNH.', true);

    const btn = root.querySelector('[data-gerar]');
    state.gerando = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando...'; }
    try {
      await gerarPdfTermo({ nome: state.colaborador.nome, cnhNumero, cnhValidadeBr: dateInputToBr(cnhValidade) });
      const resultado = await salvarMotorista(opts, state.colaborador, cnhNumero, cnhValidade);
      toast(`Termo gerado e ${state.colaborador.nome} ${resultado === 'atualizado' ? 'atualizado(a)' : 'cadastrado(a)'} em Motoristas.`);
      state.colaborador = null;
      renderForm(root, opts);
    } catch (err) {
      toast(err?.message || 'Erro ao gerar o termo.', true);
    } finally {
      state.gerando = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Gerar'; }
    }
  }

  function renderForm(root, opts) {
    const body = root.querySelector('[data-fmt-body]');
    if (!body) return;
    const colabBlock = state.colaborador
      ? `<div class="fmt-picked"><div><strong>${esc(state.colaborador.nome)}</strong><small>${esc(state.colaborador.cpf || 'CPF não cadastrado')}</small></div><button type="button" data-trocar-colab>Trocar</button></div>`
      : `<div class="fmt-field" style="position:relative"><label>Colaborador</label><input class="fmt-input" placeholder="Digite o nome do colaborador..." data-nome-input autocomplete="off"><div class="fmt-colab-results" data-colab-results style="display:none"></div></div>`;

    body.innerHTML = `${colabBlock}<div class="fmt-row"><div class="fmt-field"><label>CNH (número)</label><input class="fmt-input" name="cnh_numero" placeholder="Somente números"></div><div class="fmt-field"><label>Vencimento da CNH</label><input class="fmt-input" name="cnh_validade" type="date"></div></div><button class="fmt-btn primary" type="button" data-gerar>Gerar</button><div class="fmt-note">Ao gerar, o painel monta o PDF do termo com os dados preenchidos e cadastra (ou atualiza) o colaborador na aba <strong>Motoristas</strong> com essa CNH e vencimento.</div>`;

    body.querySelector('[data-trocar-colab]')?.addEventListener('click', () => { state.colaborador = null; renderForm(root, opts); });
    let debounce;
    body.querySelector('[data-nome-input]')?.addEventListener('input', (e) => {
      clearTimeout(debounce);
      const termo = e.target.value;
      debounce = setTimeout(() => buscarColaborador(root, opts, termo), 250);
    });
    body.querySelector('[data-gerar]')?.addEventListener('click', () => gerarTermo(root, opts));
  }

  function openHome(container, opts = {}) {
    container.innerHTML = `${styles}<section class="fmt-shell"><div class="fmt-head"><div class="fmt-kicker">Frotas · Cadastro</div><h1 class="fmt-title">Termo de Utilização de Veículos</h1><p class="fmt-sub">Selecione o colaborador que vai conduzir o veículo, preencha a CNH e o vencimento, e gere o termo em PDF para assinatura.</p></div><div class="fmt-card"><div class="fmt-body" data-fmt-body></div></div></section>`;
    document.addEventListener('click', (e) => {
      const wrap = container.querySelector('[data-colab-results]');
      if (wrap && !wrap.contains(e.target) && e.target !== container.querySelector('[data-nome-input]')) { wrap.style.display = 'none'; }
    });
    renderForm(container, opts);
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
