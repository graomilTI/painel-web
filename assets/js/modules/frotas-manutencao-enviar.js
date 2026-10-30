// Frotas · pedido de manutenção enviado por quem NÃO tem o módulo Manutenção (ex.: Cadastros > Checklists ou Veículos).
// A pessoa só descreve o problema e envia: o pedido nasce "solicitada", a equipe de Manutenção recebe o aviso e decide cotar,
// aprovar e quando será feito. Nada aqui lê as tabelas da Manutenção (o usuário não tem acesso a elas).
import { closeModal, esc, openModal, toast } from '../core/ui.js';
import { solicitar } from './frotas-manutencao-dados.js?v=20261030-frotas-manut-envio';

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

const rotuloVeiculo = (v) => [v.placa, v.marca_modelo || [v.marca, v.modelo].filter(Boolean).join(' ') || v.nome].filter(Boolean).join(' · ');

export function htmlEnvio(veiculo, preset = {}, quemPediu = '') {
  const itens = (preset.itens || []).map((i) => String(i.descricao || '').trim()).filter(Boolean);
  return `${ESTILOS}<div class="fme">
    <div><h3>Enviar pedido de manutenção</h3><div class="fme-sub">${esc(rotuloVeiculo(veiculo))}</div></div>
    <div class="fme-nota">O pedido vai para a equipe de Manutenção. Ela decide se será cotado e aprovado e quando será feito; você acompanha pelos avisos.</div>
    <div><label for="fme-desc">Problema / serviço solicitado</label><textarea id="fme-desc" data-e-descricao placeholder="Ex.: barulho ao frear, pneu careca, luz do painel acesa...">${esc(preset.descricao || '')}</textarea></div>
    ${itens.length ? `<div><label>Itens do checklist</label><ul class="fme-itens">${itens.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
    <div class="fme-linha">
      <div><label for="fme-quem">Quem pediu</label><input id="fme-quem" type="text" data-e-quem maxlength="120" autocomplete="off" value="${esc(quemPediu)}"></div>
      <div><label for="fme-prio">Prioridade</label><select id="fme-prio" data-e-prioridade>${PRIORIDADES.map(([v, t]) => `<option value="${v}"${v === (preset.prioridade || 'normal') ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
    </div>
    <label class="fme-check"><input type="checkbox" data-e-parado${preset.veiculo_parado ? ' checked' : ''}> Veículo parado</label>
    <div class="fme-erro" data-e-erro role="alert"></div>
    <div class="fme-acoes"><button type="button" class="fme-btn" data-e-fechar>Cancelar</button><button type="button" class="fme-btn primary" data-e-enviar>Enviar para a Manutenção</button></div>
  </div>`;
}

export async function abrirEnvio(opts, preset = {}) {
  const supabase = opts?.supabase;
  if (!supabase || !preset.veiculo_id) { toast('Escolha um veículo para pedir a manutenção.', true); return; }
  const { data: veiculo, error } = await supabase.from('frotas_veiculos')
    .select('id,placa,marca_modelo,marca,modelo,nome,motorista_atual').eq('id', preset.veiculo_id).maybeSingle();
  if (error || !veiculo) { toast('Não foi possível ler o veículo para o pedido.', true); return; }

  const ov = openModal({ id: JANELA, conteudoHtml: htmlEnvio(veiculo, preset, preset.solicitante_nome || veiculo.motorista_atual || '') });
  const erro = ov.querySelector('[data-e-erro]');
  const enviar = ov.querySelector('[data-e-enviar]');
  ov.querySelector('[data-e-fechar]').addEventListener('click', () => closeModal(JANELA));
  enviar.addEventListener('click', async () => {
    const descricao = ov.querySelector('[data-e-descricao]').value.trim();
    if (!descricao) { erro.textContent = 'Descreva o problema ou o serviço.'; return; }
    erro.textContent = '';
    enviar.disabled = true;
    try {
      await solicitar(supabase, {
        veiculo_id: veiculo.id, descricao, prioridade: ov.querySelector('[data-e-prioridade]').value,
        origem: preset.origem || 'manual', checklist_id: preset.checklist_id || null,
        veiculo_parado: ov.querySelector('[data-e-parado]').checked,
        solicitante_nome: ov.querySelector('[data-e-quem]').value.trim(), itens: preset.itens || [],
      });
      closeModal(JANELA);
      toast('Pedido enviado para a equipe de Manutenção.');
    } catch (err) {
      erro.textContent = err.message || 'Não foi possível enviar o pedido.';
      enviar.disabled = false;
    }
  });
}
