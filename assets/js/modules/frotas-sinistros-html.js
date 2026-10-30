// Frotas · Sinistros: HTML puro (recebe dados e devolve texto). Sem estado, sem eventos e sem banco.
import { esc } from '../core/ui.js';
import { cardFiltro, ICON } from './frotas-ui-lista.js?v=20261030-frotas-manut-envio';
import {
  ETAPAS, CARIMBO_ETAPA, etapaInfo, encerrado, proximaEtapa, etapaAnterior, codigoSinistro, dataCurta, dataHoraCurta, dataISOCurta,
  paraInputDataHora, itensChecklist,
} from './frotas-sinistros-regras.js';

const BADGE_TONE = { amber: 'warn', blue: 'info', purple: 'purple', green: 'ok', red: 'err' };
export const badgeEtapa = (etapa) => { const e = etapaInfo(etapa); return `<span class="fm-badge ${BADGE_TONE[e.tone] || ''}">${esc(e.label)}</span>`; };

const tamanho = (b) => (b == null ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const veiculoRotulo = (v, placa) => esc([placa || v?.placa, v?.marca_modelo || [v?.marca, v?.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · '));

const httpsOk = (u) => /^https:\/\//.test(String(u || ''));

// Linha de um arquivo: abre pelo painel (URL assinada) e mostra se a cópia já está no Drive.
export function htmlArquivo(a, podeEditar, comQuem = true) {
  const drive = a.drive_file_id
    ? (httpsOk(a.drive_url) ? `<a class="drv ok" href="${esc(a.drive_url)}" target="_blank" rel="noopener" title="Abrir a cópia no Drive">Drive ✓</a>` : '<span class="drv ok">Drive ✓</span>')
    : '<span class="drv pend" title="Ainda só no painel: use Enviar ao Drive">só no painel</span>';
  return `<div class="sn-arq"><button type="button" class="lnk" data-sn-ver="${esc(a.id)}" title="Abrir">${esc(a.nome_arquivo || 'arquivo')}</button>${drive}<small>${esc(tamanho(a.tamanho_bytes))}${comQuem && a.criado_por_nome ? ' · ' + esc(a.criado_por_nome) : ''}</small>${podeEditar ? `<button type="button" class="x" data-sn-del-anexo="${esc(a.id)}" title="Remover arquivo" aria-label="Remover arquivo">✕</button>` : ''}</div>`;
}

// Faixa do Drive no topo dos documentos: pasta do sinistro e o que ainda não foi enviado.
export function htmlDrive({ s, anexos, podeEditar }) {
  const meus = anexos.filter((a) => a.sinistro_id === s.id);
  if (!meus.length && !s.drive_pasta_url) return '';
  const pend = meus.filter((a) => !a.drive_file_id).length;
  return `<div class="sn-drive"><span class="sn-drive-tx"><strong>Google Drive</strong>${httpsOk(s.drive_pasta_url) ? ` · <a href="${esc(s.drive_pasta_url)}" target="_blank" rel="noopener">abrir pasta ${esc(s.drive_pasta_nome || '')}</a>` : ' · pasta criada no primeiro envio'}
    ${pend ? `<span class="fm-badge warn">${pend} arquivo(s) só no painel</span>` : '<span class="fm-badge ok">Tudo no Drive</span>'}</span>
    ${podeEditar && pend ? `<button class="fm-btn soft mini" type="button" data-sn-drive-enviar>Enviar ao Drive (${pend})</button>` : ''}</div>`;
}

// ── lista ──────────────────────────────────────────────────────────────────
export function htmlShell({ podeEditar }) {
  return `<section class="sn-shell">
    <div class="fm-kpis" data-sn-kpis></div>
    <div class="fm-card"><div class="fm-body">
      <div class="fm-bar sn-bar"><div class="fm-search">${ICON.busca}<input class="fm-input" placeholder="Buscar por placa, condutor, local, nº do sinistro..." data-sn-busca></div><span data-chip></span><span class="fm-count" data-sn-contagem>0 sinistro(s)</span>
        <div class="sn-bar-acoes"><button class="fm-btn soft" type="button" data-sn-atualizar>↻ Atualizar</button>${podeEditar ? '<button class="fm-btn primary" type="button" data-sn-novo>+ Novo sinistro</button>' : ''}</div></div>
      <div class="fm-table-wrap"><table class="fm-table"><thead><tr><th>Sinistro</th><th>Veículo</th><th>Condutor</th><th>Ocorrência</th><th>Etapa</th><th>Documentos</th><th>Próximo passo</th></tr></thead><tbody data-sn-linhas></tbody></table></div>
      <div class="sn-ajuda"><strong>Como usar:</strong> registre o sinistro assim que o condutor avisar, reúna os documentos do checklist e envie à corretora. Marque "Solicitado" quando mandar o pedido e "Aberto" quando a corretora confirmar. Abra a linha para ver o checklist, os terceiros e o acompanhamento.</div>
    </div></div>
  </section>`;
}

export function htmlKpis(c, filtro) {
  const card = (f, tone, icone, label, dica) => cardFiltro({ filtro: f, tone, icone, label, valor: String(c[f] ?? 0), dica, ativo: filtro === f });
  return [
    card('todos', 'blue', 'total', 'Total', 'Todos os sinistros'),
    card('preparando', 'amber', 'doc', 'Preparando', 'Reunindo documentos para enviar à corretora'),
    card('solicitado', 'blue', 'relogio', 'Aguardando corretora', 'Pedido enviado, corretora ainda não confirmou a abertura'),
    card('aberto', 'purple', 'ok', 'Abertos', 'Corretora confirmou a abertura na seguradora'),
    card('reparo', 'amber', 'ferramenta', 'Em reparo', 'Veículo na oficina'),
    card('prazo', 'red', 'alerta', 'Prazo vencido', 'Próximo passo com prazo de hoje ou vencido'),
    card('concluido', 'green', 'ok', 'Concluídos', 'Sinistros encerrados'),
  ].join('');
}

export function htmlLinhas(linhas) {
  if (!linhas.length) return '<tr><td colspan="7" class="fm-empty">Nenhum sinistro encontrado.</td></tr>';
  return linhas.map((s) => {
    const r = s.__resumo;
    const prog = encerrado(s.etapa) ? '<span class="fm-badge">—</span>' : `<div class="sn-prog${r.pct < 100 ? ' baixo' : ''}" title="${r.faltam.length ? esc('Falta: ' + r.faltam.map((f) => f.rotulo + (f.quem ? ` (${f.quem})` : '')).join(', ')) : 'Tudo reunido'}"><div class="sn-prog-bar"><i style="width:${r.pct}%"></i></div><span>${r.feitos}/${r.total}</span></div>`;
    const prazo = s.proxima_acao || s.proxima_acao_em
      ? `<div class="fm-cell"><strong>${esc(s.proxima_acao || '—')}</strong><small class="sn-prazo-${s.__prazo || 'futuro'}">${s.proxima_acao_em ? `até ${dataISOCurta(s.proxima_acao_em)}${s.__prazo === 'vencido' ? ' · vencido' : s.__prazo === 'hoje' ? ' · hoje' : ''}` : ''}</small></div>` : '<small>—</small>';
    return `<tr data-sn-abrir="${esc(s.id)}">
      <td class="fm-cell"><strong>${codigoSinistro(s)}</strong><small>${s.protocolo ? 'Nº ' + esc(s.protocolo) : 'sem nº da seguradora'}</small></td>
      <td class="fm-cell"><strong>${esc(s.placa)}</strong><small>${esc(s.__veiculo?.marca_modelo || '')}</small></td>
      <td class="fm-cell">${esc(s.condutor_nome || '—')}${s.houve_terceiro ? '<br><small>com terceiro</small>' : ''}${s.houve_ferido ? '<br><small>houve socorro</small>' : ''}</td>
      <td class="fm-cell">${dataHoraCurta(s.ocorrido_em)}<br><small>${esc(s.local_texto || '')}</small></td>
      <td>${badgeEtapa(s.etapa)}</td>
      <td>${prog}</td>
      <td>${prazo}</td></tr>`;
  }).join('');
}

// ── janela: novo sinistro ───────────────────────────────────────────────────
export function htmlNovo({ veiculos, colaboradores }) {
  return `<div class="sn-mod sn-novo">
    <h3>Novo sinistro</h3>
    <p>Basta o veículo para começar: o resto (relato, documentos, terceiros) você completa na ficha.</p>
    <form data-sn-form-novo autocomplete="off">
      <div class="sn-grid">
        <div><label>Placa do veículo *</label><input class="fm-input" name="veiculo" list="snVeiculos" placeholder="Digite a placa" required>
          <datalist id="snVeiculos">${veiculos.map((v) => `<option value="${esc(v.placa)}">${esc([v.marca_modelo, v.motorista_atual].filter(Boolean).join(' · '))}</option>`).join('')}</datalist></div>
        <div class="c2"><label>Condutor</label><input class="fm-input" name="condutor_nome" list="snColab" placeholder="Quem estava dirigindo">
          <datalist id="snColab">${colaboradores.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist></div>
        <div><label>Data e hora do acidente</label><input class="fm-input" type="datetime-local" name="ocorrido_em"></div>
        <div class="c2"><label>Local</label><input class="fm-input" name="local_texto" placeholder="Rodovia, cidade, referência"></div>
        <div class="c3"><label>Relato</label><textarea class="fm-input" name="relato" placeholder="O que aconteceu, como o condutor contou"></textarea></div>
        <div class="c3 sn-checks">
          <label><input type="checkbox" name="houve_terceiro"> Há terceiro envolvido</label>
          <label><input type="checkbox" name="houve_ferido"> Colaborador precisou ser socorrido</label>
          <label><input type="checkbox" name="guincho"> Precisa de guincho</label>
        </div>
      </div>
      <div class="sn-erro" data-sn-erro></div>
      <div class="sn-barra-salvar"><button type="button" class="fm-btn ghost" data-sn-fechar>Cancelar</button><button type="submit" class="fm-btn primary" data-sn-criar>Registrar sinistro</button></div>
    </form></div>`;
}

// ── janela: ficha ───────────────────────────────────────────────────────────
function htmlPassos(s) {
  if (s.etapa === 'cancelado') return `<div class="sn-passos"><div class="sn-passo atual" style="grid-column:1/-1"><strong>Cancelado em ${dataCurta(s.cancelado_em)}</strong><small>${esc(s.motivo_status || '')}</small></div></div>`;
  const atual = ETAPAS.findIndex((e) => e.id === s.etapa);
  return `<div class="sn-passos">${ETAPAS.map((e, i) => {
    const quando = s[CARIMBO_ETAPA[e.id]];
    return `<div class="sn-passo ${i < atual ? 'feito' : i === atual ? 'atual' : ''}" title="${esc(e.dica)}"><strong>${esc(e.curto)}</strong><small>${i <= atual ? dataCurta(quando) : '&nbsp;'}</small></div>`;
  }).join('')}</div>`;
}

function htmlAcoesEtapa(s, podeEditar) {
  if (!podeEditar) return '';
  if (s.etapa === 'cancelado') return '<div class="sn-acoes"><button class="fm-btn soft" type="button" data-sn-etapa="preparando">Reabrir sinistro</button></div>';
  const prox = proximaEtapa(s.etapa);
  const ant = etapaAnterior(s.etapa);
  return `<div class="sn-acoes">
    ${prox ? `<button class="fm-btn primary" type="button" data-sn-etapa="${prox.id}">${esc(etapaInfo(s.etapa).avancar)} →</button>` : ''}
    ${ant ? `<button class="fm-btn ghost mini" type="button" data-sn-etapa="${ant.id}" title="Voltar para: ${esc(ant.label)}">← Voltar para ${esc(ant.curto)}</button>` : ''}
    <span class="grow"></span>
    ${s.etapa !== 'concluido' ? '<button class="fm-btn danger mini" type="button" data-sn-cancelar>Cancelar sinistro</button>' : ''}</div>`;
}

export function htmlAbas({ aba, resumo, qtdTerceiros }) {
  const abas = [['docs', 'Documentos', `${resumo.feitos}/${resumo.total}`], ['dados', 'Dados', null], ['terceiros', 'Terceiros', qtdTerceiros || null], ['acomp', 'Acompanhamento', null]];
  return `<div class="sn-abas" role="tablist">${abas.map(([id, nome, n]) => `<button class="sn-aba${aba === id ? ' ativa' : ''}" type="button" role="tab" data-sn-aba="${id}">${nome}${n != null ? `<span class="fm-badge${id === 'docs' && resumo.faltam.length ? ' warn' : id === 'docs' ? ' ok' : ''}">${esc(n)}</span>` : ''}</button>`).join('')}</div>`;
}

export function htmlFicha({ s, veiculo, resumo, aba, qtdTerceiros, podeEditar }) {
  const dis = podeEditar ? '' : ' disabled';
  return `<div class="sn-mod" data-sn-ficha="${esc(s.id)}">
    <div class="sn-top">
      <div class="sn-top-linha">
        <div><h3><small>${codigoSinistro(s)}</small>${veiculoRotulo(veiculo, s.placa)} ${badgeEtapa(s.etapa)}</h3>
          <p>${esc(s.condutor_nome || 'Condutor não informado')} · ${dataHoraCurta(s.ocorrido_em)}${s.local_texto ? ' · ' + esc(s.local_texto) : ''}${s.protocolo ? ' · Nº ' + esc(s.protocolo) : ''}</p></div>
        <button class="sn-fechar" type="button" data-sn-fechar aria-label="Fechar">✕</button>
      </div>
      ${htmlPassos(s)}
      ${htmlAcoesEtapa(s, podeEditar)}
    </div>
    ${encerrado(s.etapa) ? '' : `<div class="sn-faixa" data-sn-faixa>
      <div><label>Nº do sinistro (seguradora)</label><input class="fm-input" name="protocolo" value="${esc(s.protocolo || '')}" placeholder="Quando a corretora informar"${dis}></div>
      <div><label>Próximo passo</label><input class="fm-input" name="proxima_acao" value="${esc(s.proxima_acao || '')}" placeholder="Ex.: cobrar a corretora, mandar fotos da oficina"${dis}></div>
      <div><label>Até</label><input class="fm-input" type="date" name="proxima_acao_em" value="${esc(String(s.proxima_acao_em || '').slice(0, 10))}"${dis}></div>
      <div><label>Previsão de entrega</label><input class="fm-input" type="date" name="previsao_entrega" value="${esc(String(s.previsao_entrega || '').slice(0, 10))}"${dis}></div>
      ${podeEditar ? '<button class="fm-btn soft" type="button" data-sn-salvar-faixa>Salvar</button>' : '<span></span>'}
    </div>`}
    ${htmlAbas({ aba, resumo, qtdTerceiros })}
    <div class="sn-corpo" data-sn-corpo></div>
  </div>`;
}

// ── aba Documentos (checklist da empresa) ───────────────────────────────────
export function htmlItem(item, { podeEditar, terceiroId = null, irPara = 'dados' }) {
  const t = terceiroId ? ` data-terceiro="${esc(terceiroId)}"` : '';
  const cls = item.situacao === 'ok' ? 'ok' : item.situacao === 'dispensado' ? 'dispensado' : item.obrigatorio ? 'falta' : '';
  const ic = item.situacao === 'ok' ? '✓' : item.situacao === 'dispensado' ? '–' : '';
  const origem = item.situacao === 'ok' && item.origem === 'campo' ? '<small>Preenchido nos dados.</small>' : item.situacao === 'ok' && item.origem === 'marca' ? '<small>Conferido sem arquivo.</small>' : item.situacao === 'dispensado' ? '<small>Dispensado (não se aplica).</small>' : '';
  const arqs = item.arquivos.length ? `<div class="sn-arqs">${item.arquivos.map((a) => htmlArquivo(a, podeEditar)).join('')}</div>` : '';
  let bt = '';
  if (podeEditar) {
    if (item.situacao === 'pendente') {
      bt = item.porCampo
        ? (terceiroId ? '<small>Preencha acima.</small>' : `<button class="fm-btn soft mini" type="button" data-sn-irpara="${irPara}">Preencher</button>`)
        : `<label class="fm-btn soft mini" style="cursor:pointer;margin:0;text-transform:none;letter-spacing:0;color:#86efac;font-size:12px">Anexar<input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,image/*" data-sn-upload="${esc(item.codigo)}"${t}></label>
           <button class="fm-btn ghost mini" type="button" data-sn-marca="ok" data-codigo="${esc(item.codigo)}"${t} title="Já foi enviado por outro meio">Marcar ok</button>`;
      bt += `<button class="fm-btn ghost mini" type="button" data-sn-marca="dispensado" data-codigo="${esc(item.codigo)}"${t} title="Não se aplica a este sinistro">Dispensar</button>`;
    } else if (item.origem === 'arquivo') {
      bt = `<label class="fm-btn ghost mini" style="cursor:pointer;margin:0;text-transform:none;letter-spacing:0;font-size:12px">+ Arquivo<input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,image/*" data-sn-upload="${esc(item.codigo)}"${t}></label>`;
    } else if (item.origem === 'marca') {
      bt = `<button class="fm-btn ghost mini" type="button" data-sn-marca="" data-codigo="${esc(item.codigo)}"${t}>Desfazer</button>`;
    }
  }
  return `<div class="sn-item ${cls}"><div class="sn-item-ic">${ic}</div>
    <div class="sn-item-tx"><div class="sn-item-tit"><strong>${esc(item.rotulo)}</strong>${item.obrigatorio ? '<span class="fm-badge warn">Obrigatório</span>' : '<span class="fm-badge">Opcional</span>'}</div>
      ${item.dica && item.situacao === 'pendente' ? `<small>${esc(item.dica)}</small>` : ''}${origem}${arqs}</div>
    <div class="sn-item-bt">${bt}</div></div>`;
}

export function htmlResumo(resumo) {
  const baixo = resumo.pct < 100 ? ' baixo' : '';
  return `<div class="sn-resumo"><div class="sn-prog${baixo}"><div class="sn-prog-bar"><i style="width:${resumo.pct}%"></i></div><span>${resumo.feitos} de ${resumo.total} obrigatórios</span></div>
    ${resumo.faltam.length ? `<div class="sn-faltam">${resumo.faltam.map((f) => `<span class="fm-badge warn">${esc(f.rotulo)}${f.quem ? ' · ' + esc(f.quem) : ''}</span>`).join('')}</div>` : '<span class="fm-badge ok">Tudo reunido para enviar à corretora</span>'}</div>`;
}

export function htmlDocumentos({ s, modelo, marcas, anexos, resumo, podeEditar }) {
  const itens = itensChecklist({ modelo, sinistro: s, marcas, anexos });
  const outros = anexos.filter((a) => a.sinistro_id === s.id && !a.terceiro_id && !a.item_codigo);
  return `${htmlDrive({ s, anexos, podeEditar })}${htmlResumo(resumo)}
    <div class="sn-sec"><h4>Veículo da empresa <small>CNH, documento do veículo, relato, fotos e oficina</small></h4>${itens.map((i) => htmlItem(i, { podeEditar })).join('')}</div>
    <div class="sn-sec"><h4>Outros arquivos <small>qualquer documento que não está na lista</small></h4>
      ${outros.length ? `<div class="sn-arqs">${outros.map((a) => htmlArquivo(a, podeEditar, false)).join('')}</div>` : ''}
      ${podeEditar ? '<div style="margin-top:8px"><label class="fm-btn ghost mini" style="cursor:pointer;margin:0;text-transform:none;letter-spacing:0;font-size:12px">+ Anexar arquivo<input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,image/*" data-sn-upload=""></label></div>' : ''}
    </div>
    ${s.houve_terceiro ? '<div class="sn-ajuda">Há terceiro envolvido: os documentos dele ficam na aba <strong>Terceiros</strong>.</div>' : ''}`;
}

// ── aba Dados ──────────────────────────────────────────────────────────────
export function htmlDados({ s, colaboradores = [], podeEditar }) {
  const dis = podeEditar ? '' : ' disabled';
  const campo = (rotulo, nome, extra = '', cls = '') => `<div class="${cls}"><label>${rotulo}</label><input class="fm-input" name="${nome}" value="${esc(s[nome] ?? '')}" ${extra}${dis}></div>`;
  const chk = (nome, rotulo) => `<label><input type="checkbox" name="${nome}"${s[nome] ? ' checked' : ''}${dis}> ${rotulo}</label>`;
  return `<datalist id="snColabFicha">${colaboradores.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
  <form data-sn-form-dados autocomplete="off">
    <div class="sn-sec"><h4>Ocorrência</h4><div class="sn-grid">
      <div><label>Data e hora</label><input class="fm-input" type="datetime-local" name="ocorrido_em" value="${esc(paraInputDataHora(s.ocorrido_em))}"${dis}></div>
      ${campo('Local', 'local_texto', 'placeholder="Rodovia, cidade, referência"', 'c2')}
      <div class="c3"><label>Relato</label><textarea class="fm-input" name="relato" placeholder="O que aconteceu"${dis}>${esc(s.relato || '')}</textarea></div>
      ${campo('Boletim de ocorrência (nº)', 'bo_numero')}
      <div class="c2 sn-checks" style="align-self:end;min-height:42px">${chk('houve_terceiro', 'Há terceiro envolvido')}${chk('houve_ferido', 'Colaborador precisou ser socorrido')}${chk('guincho', 'Guincho')}</div>
      ${campo('Detalhes do guincho', 'guincho_obs', 'placeholder="Empresa, quem acionou, onde está o veículo"', 'c3')}
    </div></div>
    <div class="sn-sec"><h4>Condutor</h4><div class="sn-grid">
      ${campo('Nome', 'condutor_nome', 'list="snColabFicha"', 'c2')}${campo('Telefone', 'condutor_telefone', 'inputmode="tel"')}
    </div></div>
    <div class="sn-sec"><h4>Corretora e seguradora</h4><div class="sn-grid">
      ${campo('Seguradora', 'seguradora')}${campo('Corretora', 'corretora')}${campo('Apólice', 'apolice')}
    </div></div>
    <div class="sn-sec"><h4>Oficina <small>normalmente indicada pela seguradora</small></h4><div class="sn-grid">
      ${campo('Nome da oficina', 'oficina_nome', '', 'c2')}${campo('Contato', 'oficina_contato')}
    </div></div>
    <div class="sn-sec"><h4>Observações</h4><textarea class="fm-input" name="observacoes"${dis}>${esc(s.observacoes || '')}</textarea></div>
    ${podeEditar ? '<div class="sn-barra-salvar"><button class="fm-btn primary" type="submit">Salvar dados</button></div>' : ''}
  </form>`;
}

// ── aba Terceiros ──────────────────────────────────────────────────────────
export const htmlItensTerceiro = (itens, terceiroId, podeEditar) => itens.map((i) => htmlItem(i, { podeEditar, terceiroId, irPara: 'terceiros' })).join('');

export function htmlTerceiros({ s, terceiros, modelo, marcas, anexos, podeEditar }) {
  const dis = podeEditar ? '' : ' disabled';
  const lista = terceiros.filter((t) => t.sinistro_id === s.id);
  const cartao = (t, n) => {
    const itens = itensChecklist({ modelo, sinistro: s, terceiro: t, marcas, anexos });
    const f = (rotulo, nome, extra = '', cls = '') => `<div class="${cls}"><label>${rotulo}</label><input class="fm-input" name="${nome}" value="${esc(t[nome] ?? '')}" ${extra}${dis}></div>`;
    const seguro = t.tem_seguro === true ? 'sim' : t.tem_seguro === false ? 'nao' : '';
    return `<div class="sn-terc" data-sn-terceiro="${esc(t.id)}">
      <div class="sn-terc-head"><h4>Terceiro ${n}${t.nome ? ' · ' + esc(t.nome) : ''}</h4>${podeEditar ? `<div><small>Salva ao sair do campo.</small> <button class="fm-btn danger mini" type="button" data-sn-del-terceiro="${esc(t.id)}">Remover</button></div>` : ''}</div>
      <div class="sn-t-grid">
        ${f('Nome do condutor', 'nome', '', '')}${f('Telefone', 'telefone', 'inputmode="tel"')}${f('E-mail', 'email', 'type="email"')}
        ${f('Placa', 'placa')}${f('Veículo (modelo)', 'veiculo_modelo')}
        <div><label>Possui seguro?</label><select class="fm-select" name="tem_seguro"${dis}><option value=""${seguro === '' ? ' selected' : ''}>Não informado</option><option value="sim"${seguro === 'sim' ? ' selected' : ''}>Sim</option><option value="nao"${seguro === 'nao' ? ' selected' : ''}>Não</option></select></div>
        ${f('Seguradora do terceiro', 'seguradora')}${f('Oficina de preferência', 'oficina_preferencia', '', 'c2')}
      </div>
      <div style="margin-top:14px" data-sn-itens>${htmlItensTerceiro(itens, t.id, podeEditar)}</div>
    </div>`;
  };
  return `${podeEditar ? '<div class="sn-acoes" style="margin:0 0 14px"><button class="fm-btn primary" type="button" data-sn-add-terceiro>+ Adicionar terceiro</button></div>' : ''}
    ${lista.length ? lista.map((t, i) => cartao(t, i + 1)).join('') : `<div class="sn-vazio">Nenhum terceiro cadastrado.<br>Se o acidente envolveu outro veículo, adicione o terceiro: o painel passa a pedir CNH, CRLV, contato, comprovante de residência, oficina de preferência, fotos e se ele tem seguro.</div>`}`;
}

// ── aba Acompanhamento ─────────────────────────────────────────────────────
export function htmlAcompanhamento({ historico, podeEditar }) {
  const evento = (h) => {
    const txt = h.tipo === 'nota' ? esc(h.texto || '') : h.de_etapa ? `${esc(etapaInfo(h.de_etapa).label)} → <strong>${esc(etapaInfo(h.para_etapa).label)}</strong>` : esc(h.texto || 'Sinistro registrado');
    const motivo = h.tipo === 'etapa' && h.de_etapa && h.texto ? `<p>${esc(h.texto)}</p>` : '';
    return `<li class="${h.tipo}"><strong>${h.tipo === 'nota' ? 'Atualização' : 'Etapa'}</strong>${h.tipo === 'nota' ? `<p>${txt}</p>` : ` — ${txt}${motivo}`}<span class="quando">${esc(h.por_nome || 'Sistema')} · ${dataHoraCurta(h.criado_em)}</span></li>`;
  };
  return `${podeEditar ? `<div class="sn-nota"><label style="color:#86efac;font-size:10.5px;font-weight:900;text-transform:uppercase;letter-spacing:.08em">Nova atualização</label>
      <textarea class="fm-input" data-sn-nota placeholder="O que foi feito ou combinado (ex.: fotos enviadas à corretora, seguradora pediu o BO, veículo entrou na oficina)"></textarea>
      <div class="sn-barra-salvar" style="margin:0"><button class="fm-btn primary" type="button" data-sn-add-nota>Registrar atualização</button></div></div>` : ''}
    ${historico.length ? `<ul class="sn-tl">${historico.map(evento).join('')}</ul>` : '<div class="sn-vazio">Sem registros ainda.</div>'}`;
}
