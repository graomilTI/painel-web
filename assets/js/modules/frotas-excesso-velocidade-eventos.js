// Frotas — ligação dos eventos da tela de Excesso de velocidade / Notificações (lista, modais e envio de prints).
// Separado de frotas-excesso-velocidade.js em 15/10/2026 (a função renderExcessoVelocidade tinha 494 linhas).
// O código foi movido sem alteração. Ao editar, troque o token ?v= em todos os imports internos do conjunto
// frotas-*.js (tests/frotas-modulos-versao.test.mjs confere).
import { addUploadedFiles, clipboardImageFilesFromEvent, renderUploadLists, uploadPrints } from './frotas-upload-prints.js?v=20261015-frotas-dos1';
import { agirForaHorario, fetchForaHorario, fhNotificarDia, recalcularDossieForaHorario, sincronizarForaHorario } from './frotas-fh-dados.js?v=20261015-frotas-dos1';
import { fhResumoTexto } from './frotas-fh-dossie-regras.js?v=20261015-frotas-dos1';
import { atualizarRodapeDossie, openDossieModal, openRotaModal, renderForaHorarioList } from './frotas-fh-dossie.js?v=20261015-frotas-dos1';
import { copyText, state, toast } from './frotas-base.js?v=20261015-frotas-dos1';
import { fetchImportedExcessos } from './frotas-excessos-dados.js?v=20261015-frotas-dos1';
import { fhCarregarMapa, fhFecharMapa, fhMapaFocarIntervalo, fhMapaFocarPonto, fhMapaTrocarBase } from './frotas-fh-mapa.js?v=20261015-frotas-dos1';
import { fhLiberarAncestrais, readForaHorarioReportPeriod } from './frotas-fh-util.js?v=20261015-frotas-dos1';

  // Fora do horário: carga inicial, lista, filtros, agrupamento, busca e período.
  function ligarForaHorario(container, opts) {
    fhLiberarAncestrais(container);
    // Reaplica antes de qualquer clique abrir uma janela (o host pode ter trocado/embrulhado ancestrais depois).
    container.addEventListener('click', () => fhLiberarAncestrais(container), true);
    renderUploadLists(container);
    // Pendências de excesso (PENDENTE/GERADA): o OCR dos prints baixa os registros a partir delas.
    fetchImportedExcessos(container, opts);
    if (!state.foraHorarioLoaded) fetchForaHorario(container, opts);

    container.querySelector('[data-sync-bfleet-fora-horario]')?.addEventListener('click', () => sincronizarForaHorario(container, opts, 'yesterday'));
    container.querySelector('[data-sync-bfleet-fora-horario-periodo]')?.addEventListener('click', () => sincronizarForaHorario(container, opts, 'period'));
    container.querySelector('[data-refresh-fora-horario]')?.addEventListener('click', () => fetchForaHorario(container, opts));
    container.querySelector('.fora-horario-layout')?.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-recalcular-dossie]')) recalcularDossieForaHorario(container, opts);
    });
    container.querySelector('[data-fora-horario-table]')?.addEventListener('click', (ev) => {
      const dossieBtn = ev.target.closest('[data-fh-dossie]');
      if (dossieBtn) { if (!dossieBtn.disabled) openDossieModal(container, opts, dossieBtn.dataset.key); return; }
      const rotaBtn = ev.target.closest('[data-ver-rota]');
      if (rotaBtn) { openRotaModal(container, rotaBtn.dataset.id); return; }
      const btn = ev.target.closest('[data-fora-action]');
      if (!btn || btn.disabled) return;
      agirForaHorario(container, opts, btn.dataset.id, btn.dataset.foraAction);
    });
    container.querySelectorAll('[data-fh-filter]').forEach((btn) => btn.addEventListener('click', () => {
      state.foraHorarioFiltro = btn.dataset.fhFilter;
      renderForaHorarioList(container);
    }));
    container.querySelectorAll('[data-fh-agrupar] [data-agrupar]').forEach((btn) => btn.addEventListener('click', () => {
      state.foraHorarioAgrupar = btn.dataset.agrupar === 'rota' ? 'rota' : 'dia';
      container.querySelectorAll('[data-fh-agrupar] [data-agrupar]').forEach((b) => b.classList.toggle('active', b === btn));
      renderForaHorarioList(container);
    }));
    const foraHorarioBusca = container.querySelector('[data-fora-horario-search]');
    if (foraHorarioBusca) foraHorarioBusca.value = state.foraHorarioSearchTerm;
    foraHorarioBusca?.addEventListener('input', (ev) => {
      state.foraHorarioSearchTerm = ev.target.value;
      renderForaHorarioList(container);
    });

    // Trocar a data consulta direto o banco (sem precisar clicar em nada).
    let temporizadorDatas = null;
    container.querySelectorAll('[data-fora-horario-report-start], [data-fora-horario-report-end]').forEach((input) => input.addEventListener('change', () => {
      const inicio = container.querySelector('[data-fora-horario-report-start]');
      const fim = container.querySelector('[data-fora-horario-report-end]');
      if (inicio?.value && fim?.value && inicio.value > fim.value) {
        if (input === inicio) fim.value = inicio.value; else inicio.value = fim.value;
      }
      window.clearTimeout(temporizadorDatas);
      temporizadorDatas = window.setTimeout(() => {
        const { start, end } = readForaHorarioReportPeriod(container);
        if (start && end && start <= end) fetchForaHorario(container, opts);
      }, 250);
    }));
  }

  // modal do dossiê (abas, percursos, mapa, notificar, copiar, fechar).
  function ligarModalDossie(container, opts) {
    const dossieModal = container.querySelector('[data-dossie-modal]');
    const closeDossieModal = () => { if (dossieModal) dossieModal.hidden = true; fhFecharMapa(container); };
    container.querySelector('[data-dossie-modal-close]')?.addEventListener('click', closeDossieModal);
    dossieModal?.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-rota-mapa-tentar]')) { fhCarregarMapa(container, opts); return; }
      const base = ev.target.closest('[data-mapa-base] [data-base]');
      if (base) {
        fhMapaTrocarBase(base.dataset.base);
        base.closest('[data-mapa-base]').querySelectorAll('[data-base]').forEach((b) => b.classList.toggle('active', b === base));
        return;
      }
      if (ev.target.closest('a, button, input, summary')) return;
      const linhaViagem = ev.target.closest('[data-fh-foco-ini]');
      if (linhaViagem) { fhMapaFocarIntervalo(linhaViagem.dataset.fhFocoIni, linhaViagem.dataset.fhFocoFim); return; }
      const linhaExcesso = ev.target.closest('[data-fh-foco-ponto]');
      if (linhaExcesso) {
        const [lat, lng] = String(linhaExcesso.dataset.fhFocoPonto).split(',').map(Number);
        if (Number.isFinite(lat) && Number.isFinite(lng)) fhMapaFocarPonto(lat, lng);
      }
    });
    dossieModal?.addEventListener('click', (ev) => {
      const alternar = ev.target.closest('[data-fh-alternar-viagens]');
      if (!alternar) return;
      const bloco = alternar.closest('[data-fh-percursos]');
      if (!bloco) return;
      const completo = bloco.dataset.modo !== 'completo';
      bloco.dataset.modo = completo ? 'completo' : 'resumo';
      alternar.textContent = completo ? 'Mostrar só os trajetos com alerta' : `Mostrar também os ${bloco.dataset.demais} trajeto(s) sem alerta`;
    });
    dossieModal?.addEventListener('click', (ev) => {
      const aba = ev.target.closest('[data-fh-aba], [data-fh-ir-aba]');
      if (!aba) return;
      const alvo = aba.dataset.fhAba || aba.dataset.fhIrAba;
      const corpo = dossieModal.querySelector('[data-dossie-body]');
      if (!corpo || !corpo.querySelector(`[data-fh-pane="${alvo}"]`)) return;
      corpo.querySelectorAll('[data-fh-aba]').forEach((botao) => {
        const ativo = botao.dataset.fhAba === alvo;
        botao.classList.toggle('active', ativo);
        botao.setAttribute('aria-selected', String(ativo));
      });
      corpo.querySelectorAll('[data-fh-pane]').forEach((painel) => { painel.hidden = painel.dataset.fhPane !== alvo; });
      corpo.querySelector('.fh-abas')?.scrollIntoView({ block: 'nearest' });
    });
    dossieModal?.addEventListener('click', async (ev) => {
      const notificar = ev.target.closest('[data-fh-notificar]');
      if (notificar) {
        if (notificar.disabled) return;
        notificar.disabled = true;
        try { await fhNotificarDia(container, opts, notificar.dataset.fhData); } finally { notificar.disabled = false; }
        return;
      }
      const rota = ev.target.closest('[data-ver-rota]');
      if (rota) { closeDossieModal(); openRotaModal(container, rota.dataset.id); return; }
      const acao = ev.target.closest('[data-fora-action]');
      if (!acao || acao.disabled) return;
      await agirForaHorario(container, opts, acao.dataset.id, acao.dataset.foraAction);
      atualizarRodapeDossie(container);
    });
    dossieModal?.addEventListener('click', (ev) => { if (ev.target === dossieModal) closeDossieModal(); });
    dossieModal?.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeDossieModal(); });
    container.querySelector('[data-dossie-copiar]')?.addEventListener('click', async () => {
      if (!state.foraHorarioDossieAberto) return;
      try {
        await copyText(fhResumoTexto(state.foraHorarioDossieAberto));
        toast('Resumo do dossiê copiado.');
      } catch (err) {
        console.warn('[FROTAS] Falha ao copiar resumo do dossiê:', err);
        toast('Não foi possível copiar o resumo.', 'error');
      }
    });
  }

  // modal de envio de prints (abrir, fechar, foco por teclado).
  function ligarModalPrints(container) {
    const printsModal = container.querySelector('[data-prints-modal]');
    const printsOpenBtn = container.querySelector('[data-open-prints-modal]');
    const printsFocusables = () => Array.from(printsModal?.querySelectorAll('button, input, [tabindex="0"]') || [])
      .filter((el) => !el.disabled && el.offsetParent !== null);
    const openPrintsModal = () => {
      if (!printsModal) return;
      printsModal.hidden = false;
      // Foco direto na área de colagem: o Ctrl+V já funciona sem precisar clicar de novo.
      const zone = printsModal.querySelector('[data-paste-zone]');
      (zone || printsModal.querySelector('.speed-modal'))?.focus({ preventScroll: true });
    };
    const closePrintsModal = () => {
      if (!printsModal || printsModal.hidden) return;
      printsModal.hidden = true;
      printsOpenBtn?.focus({ preventScroll: true });
    };
    printsOpenBtn?.addEventListener('click', openPrintsModal);
    container.querySelector('[data-prints-modal-close]')?.addEventListener('click', closePrintsModal);
    printsModal?.addEventListener('click', (ev) => { if (ev.target === printsModal) closePrintsModal(); });
    printsModal?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); closePrintsModal(); return; }
      if (ev.key !== 'Tab') return;
      // Mantém o Tab dentro do modal (aria-modal): não deixa o foco ir para a tela de trás.
      const items = printsFocusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (ev.shiftKey && (document.activeElement === first || document.activeElement === printsModal.querySelector('.speed-modal'))) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
  }

  // modal da rota (fechar).
  function ligarModalRota(container) {
    const rotaModal = container.querySelector('[data-rota-modal]');
    const closeRotaModal = () => { if (rotaModal) rotaModal.hidden = true; };
    container.querySelector('[data-rota-modal-close]')?.addEventListener('click', closeRotaModal);
    rotaModal?.addEventListener('click', (ev) => { if (ev.target === rotaModal) closeRotaModal(); });
  }

  // seleção, colagem e arrasto de prints e botão Enviar.
  function ligarEnvioDePrints(container) {
    container.querySelector('[data-print-files]')?.addEventListener('change', (ev) => { addUploadedFiles(container, ev.target.files || [], 'selecionado'); ev.target.value = ''; });

    const pasteZone = container.querySelector('[data-paste-zone]');
    const handlePrintPaste = (ev) => {
      const files = clipboardImageFilesFromEvent(ev);
      if (!files.length) return;
      ev.preventDefault();
      ev.stopPropagation();
      addUploadedFiles(container, files, 'colado');
      if (pasteZone) {
        pasteZone.classList.add('drag');
        setTimeout(() => pasteZone.classList.remove('drag'), 450);
      }
    };

    container.addEventListener('paste', handlePrintPaste);

    if (pasteZone) {
      pasteZone.addEventListener('click', () => {
        pasteZone.focus();
        toast('Área de prints selecionada. Agora use Ctrl + V para colar o print.');
      });
      pasteZone.addEventListener('paste', handlePrintPaste);
      pasteZone.addEventListener('dragover', (ev) => { ev.preventDefault(); pasteZone.classList.add('drag'); });
      pasteZone.addEventListener('dragleave', () => pasteZone.classList.remove('drag'));
      pasteZone.addEventListener('drop', (ev) => {
        ev.preventDefault();
        pasteZone.classList.remove('drag');
        addUploadedFiles(container, ev.dataTransfer?.files || [], 'arrastado');
      });
    }

    container.querySelector('[data-upload-prints]')?.addEventListener('click', () => uploadPrints(container));
  }

export { ligarForaHorario, ligarModalDossie, ligarModalPrints, ligarModalRota, ligarEnvioDePrints };
