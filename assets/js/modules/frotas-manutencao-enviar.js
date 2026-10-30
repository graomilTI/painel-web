// Frotas · "Enviar para manutenção" (Checklist): a pessoa descreve o problema e o pedido vira um cartão em Corretiva >
// Solicitações, com quem pediu, motorista, placa, veículo e a descrição. A equipe de Manutenção recebe o aviso e decide
// cotar, aprovar e quando será feito. Nada aqui lê as tabelas da Manutenção (quem envia pode não ter acesso a elas).
import { closeModal, esc, openModal, toast } from '../core/ui.js';
import { solicitar } from './frotas-manutencao-dados.js?v=20261030-frotas-manut-v5';

const JANELA = 'fmEnviar';
const PRIORIDADES = [['normal', 'Normal'], ['alta', 'Alta'], ['urgente', 'Urgente']];

const ESTILOS = `<style>
.fme{display:grid;gap:12px;color:#e2e8f0;font-size:14px}
.fme h3{margin:0;font-size:18px}
.fme-sub{color:#94a3b8;font-size:13px}
.fme label{display:block;font-size:12px;color:#94a3b8;margin-bottom:4px}
.fme input[type=text],.fme select,.fme textarea{width:100%;box-sizing:border-box;background:#0b1220;color:#e2e8f0;border:1px solid rgba(148,163,184,.3);border-radius:10px;padding:9px 11px;font:inherit}
.fme textarea{min-height:110px;resize:vertical}
.fme-linha{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.fme-info{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;background:rgba(148,163,184,.08);border-radius:10px;padding:10px 12px;font-size:13px}.fme-info b{display:block;font-size:11px;color:#94a3b8;font-weight:600}
.fme-ref{white-space:pre-wrap;overflow-wrap:anywhere;color:#cbd5e1;font-size:13px;border-left:3px solid rgba(34,197,94,.5);padding-left:10px}
.fme-check{display:flex;align-items:center;gap:8px;font-size:14px;color:#e2e8f0;margin:0!important}
.fme-itens{margin:0;padding-left:18px;color:#cbd5e1;font-size:13px}
.fme-nota{background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);border-radius:10px;padding:9px 11px;font-size:13px;color:#cbd5e1}
.fme-erro{color:#fca5a5;font-size:13px;min-height:1em}
.fme-acoes{display:flex;justify-content:flex-end;gap:8px}
.fme-btn{border:1px solid rgba(148,163,184,.35);background:transparent;color:#e2e8f0;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;cursor:pointer}
.fme-btn.primary{background:#16a34a;border-color:#16a34a;color:#fff}
.fme-btn[disabled]{opacity:.6;cursor:wait}
@media(max-width:560px){.fme-linha{grid-template-columns:1fr}}
</style>`;

const nomeDoUsuario = (opts) => opts?.auth?.user?.nome || opts?.auth?.user?.name || opts?.auth?.user?.full_name || opts?.user?.nome || opts?.user?.name || opts?.auth?.user?.email || '';

export function htmlEnvio(veiculo, preset = {}, { usuario = '', motorista = '' } = {}) {
  const itens = (preset.itens || []).map((i) => String(i.descricao || '').trim()).filter(Boolean);
  const modelo = veiculo.marca_modelo || [veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || veiculo.nome || '—';
  return `${ESTILOS}<div class="fme">
    <div><h3>Enviar para a Manutenção</h3><div class="fme-sub">O pedido vira uma solicitação em Corretiva. A equipe decide se será cotado e aprovado e quando será feito.</div></div>
    <div class="fme-info"><div><b>Placa</b>${esc(veiculo.placa || '—')}</div><div><b>Veículo</b>${esc(modelo)}</div><div><b>Solicitante</b>${esc(usuario || '—')}</div><div><b>Motorista</b>${esc(motorista || '—')}</div></div>
    <div><label for="fme-desc">Descreva o problema *</label><textarea id="fme-desc" data-e-descricao placeholder="Ex.: barulho ao frear, pneu careca, luz do painel acesa..."></textarea></div>
    ${preset.referencia ? `<div><label>No checklist</label><div class="fme-ref">${esc(preset.referencia)}</div></div>` : ''}
    ${itens.length ? `<div><label>Itens com falha ou atenção</label><ul class="fme-itens">${itens.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
    <div class="fme-linha">
      <div><label for="fme-prio">Prioridade</label><select id="fme-prio" data-e-prioridade>${PRIORIDADES.map(([v, t]) => `<option value="${v}"${v === (preset.prioridade || 'normal') ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div><label>Situação</label><label class="fme-check"><input type="checkbox" data-e-parado${preset.veiculo_parado ? ' checked' : ''}> Veículo parado</label></div>
    </div>
    <div class="fme-erro" data-e-erro role="alert"></div>
    <div class="fme-acoes"><button type="button" class="fme-btn" data-e-fechar>Cancelar</button><button type="button" class="fme-btn primary" data-e-enviar>Enviar</button></div>
  </div>`;
}

// Descrição que vai para o cartão: o que a pessoa escreveu e, embaixo, o que o checklist apontava (contexto para a equipe).
export function descricaoDoPedido(texto, referencia = '') {
  const t = String(texto || '').trim();
  const r = String(referencia || '').trim();
  return r ? `${t}\n\n${r}` : t;
}

export async function abrirEnvio(opts, preset = {}, { aoEnviar } = {}) {
  const supabase = opts?.supabase;
  if (!supabase || !preset.veiculo_id) { toast('Escolha um veículo para pedir a manutenção.', true); return; }
  const { data: veiculo, error } = await supabase.from('frotas_veiculos')
    .select('id,placa,marca_modelo,marca,modelo,nome,motorista_atual').eq('id', preset.veiculo_id).maybeSingle();
  if (error || !veiculo) { toast('Não foi possível ler o veículo para o pedido.', true); return; }

  const motorista = String(preset.motorista || veiculo.motorista_atual || '').trim();
  const ov = openModal({ id: JANELA, conteudoHtml: htmlEnvio(veiculo, preset, { usuario: nomeDoUsuario(opts), motorista }) });
  const erro = ov.querySelector('[data-e-erro]');
  const enviar = ov.querySelector('[data-e-enviar]');
  ov.querySelector('[data-e-fechar]').addEventListener('click', () => closeModal(JANELA));
  ov.querySelector('[data-e-descricao]').focus();
  enviar.addEventListener('click', async () => {
    const texto = ov.querySelector('[data-e-descricao]').value.trim();
    if (!texto) { erro.textContent = 'Descreva o problema para enviar o pedido.'; return; }
    erro.textContent = '';
    enviar.disabled = true;
    try {
      await solicitar(supabase, {
        veiculo_id: veiculo.id, descricao: descricaoDoPedido(texto, preset.referencia), prioridade: ov.querySelector('[data-e-prioridade]').value,
        origem: preset.origem || 'manual', checklist_id: preset.checklist_id || null,
        veiculo_parado: ov.querySelector('[data-e-parado]').checked,
        solicitante_nome: nomeDoUsuario(opts), motorista_nome: motorista, itens: preset.itens || [],
      });
      closeModal(JANELA);
      Promise.resolve(aoEnviar?.()).catch(() => {});
      toast('Pedido enviado: a solicitação foi criada em Corretiva > Solicitações.');
    } catch (err) {
      erro.textContent = err.message || 'Não foi possível enviar o pedido.';
      enviar.disabled = false;
    }
  });
}
