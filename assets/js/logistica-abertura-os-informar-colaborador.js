import { supabase } from './supabaseClient.js';
import { adicionarColaboradorOs } from './programacao-equipe.js';
import { abrirPopupColaboradorDespesas } from './colaborador-despesas-popup.js';

// Botão "Informar colaborador" na tabela "Minhas solicitações" (Gestor >
// Logística, renderAberturaOsHistorico em logistica.js) — aparece quando a
// solicitação já virou uma O.S. real (status CADASTRADO), como reforço/
// segunda chance pra quem respondeu "Não" no popup que já roda no momento de
// confirmar a abertura (ver logistica.js handleSalvarAberturaOs +
// colaborador-despesas-popup.js). Roda como patch isolado (mesmo padrão de
// logistica-abertura-os-correcao.js): não importa logistica.js, escuta
// clique por delegação em [data-informar-colab].
//
// Objetivo (pedido do usuário, 2026-09-11): informar o colaborador que vai
// atender a O.S. sem precisar abrir a Programação e procurar a O.S.
// manualmente — grava direto nas mesmas tabelas que o fluxo normal de
// "Adicionar colaborador" da Programação usaria
// (programacao_dia/programacao_equipe/operacional_os_colaboradores/
// programacao_colaboradores/programacao_alimentacao), reaproveitando
// adicionarColaboradorOs de programacao-equipe.js em vez de duplicar a
// lógica.

const osCache = new Map();
async function loadOsPorNumero(numero) {
  if (osCache.has(numero)) return osCache.get(numero);
  const { data, error } = await supabase.from('operacional_os')
    .select('id,numero_os,cliente,embarque,destino,supervisao,data_os,status_gestor')
    .eq('numero_os', numero).maybeSingle();
  const row = error ? null : data;
  osCache.set(numero, row);
  return row;
}

async function ensureProgramacaoDia(dataReferencia, supervisao) {
  const { data: existente, error: selError } = await supabase.from('programacao_dia')
    .select('id').eq('data_referencia', dataReferencia).eq('supervisao', supervisao).maybeSingle();
  if (selError) throw selError;
  if (existente) return existente.id;
  const { data: criada, error: insError } = await supabase.from('programacao_dia')
    .insert({ data_referencia: dataReferencia, supervisao, coordenacao: supervisao, regional: supervisao, status: 'rascunho' })
    .select('id').single();
  if (insError) throw insError;
  return criada.id;
}

async function aplicarColaborador(os, escolha) {
  const programacaoId = await ensureProgramacaoDia(escolha.dataInicio, os.supervisao);
  await adicionarColaboradorOs(programacaoId, { ...os, data_os: escolha.dataInicio }, { colaboradorId: escolha.colaboradorId, nome: escolha.nome });
  const { error: despError } = await supabase.from('programacao_alimentacao').upsert({
    programacao_id: programacaoId,
    data_referencia: escolha.dataInicio,
    colaborador_id: escolha.colaboradorId,
    nome_colaborador: escolha.nome,
    ...escolha.despesas,
  }, { onConflict: 'programacao_id,colaborador_id' });
  if (despError) throw despError;
}

async function abrirFluxo(numeroOs) {
  const os = await loadOsPorNumero(numeroOs);
  if (!os) { alert('Não encontrei essa O.S. em operacional_os ainda — o sync do GRM pode levar alguns minutos. Tente de novo em instantes.'); return; }
  if (!os.supervisao) { alert('Essa O.S. está sem Supervisão definida — não dá pra vincular colaborador automaticamente na Programação. Ajuste pela tela de Programação.'); return; }

  const escolha = await abrirPopupColaboradorDespesas({
    titulo: `Informar colaborador — O.S. ${os.numero_os}`,
    subtitulo: `${os.cliente || '-'} · ${os.embarque || '-'} → ${os.destino || '-'}`,
    regional: os.supervisao,
    dataSugerida: os.data_os,
  });
  if (!escolha) return;

  try {
    await aplicarColaborador(os, escolha);
    alert(`Colaborador ${escolha.nome} vinculado à O.S. ${os.numero_os} para ${escolha.dataInicio}. Já aparece em Gestor > Programação.`);
  } catch (error) {
    console.error('[informar-colaborador]', error);
    alert(error.message || 'Não foi possível salvar. Tente novamente.');
  }
}

document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-informar-colab]');
  if (!btn) return;
  event.preventDefault();
  const numeroOs = btn.dataset.os;
  if (!numeroOs) { alert('Essa solicitação ainda não tem número de O.S. cadastrado.'); return; }
  abrirFluxo(numeroOs).catch((error) => {
    console.error('[informar-colaborador]', error);
    alert('Erro ao abrir o formulário de colaborador.');
  });
});
