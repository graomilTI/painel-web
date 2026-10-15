// Metas — bônus dos gestores: relatório XLSX e cartões em PNG.
// Extraído de modules/metas.js em 15/10/2026 (era um único bloco autoexecutável de ~3.300 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo metas-*.js, troque o token ?v=20261015-metas1 em TODOS os imports internos e no carregador
// (assets/js/metas.js): tests/metas-modulos-versao.test.mjs garante que fiquem iguais.
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
import html2canvas from 'https://esm.sh/html2canvas@1.4.1';
import { escapeHtml, getMonthName, normalizarTexto } from './metas-util.js?v=20261015-metas1';
import { rowKey, isMonthClosed, mergeCoordenacoes } from './metas-calculo.js?v=20261015-metas1';
import { enrichGestoresParaFechamento } from './metas-dados.js?v=20261015-metas1';

  function gerarRelatorioBonusXlsx(state, gestoresEnriq, gestoresBonus) {
    const porId = new Map(gestoresEnriq.map(g => [g.id, g]));
    const round2 = v => Number(Number(v || 0).toFixed(2));

    const linhas = (gestoresBonus || [])
      .filter(gb => gb.qualifica && (gb.bonusProducao + gb.bonusCusto + gb.bonusLeitura) > 0)
      .map(gb => {
        const g = porId.get(gb.gestorId) || {};
        const total = gb.bonusProducao + gb.bonusCusto + gb.bonusLeitura;
        return [
          g.gestor || '',
          g.coordenacao || '',
          g.supervisao || '',
          round2(g.bonusInicial),
          round2(gb.bonusProducao),
          round2(gb.bonusCusto),
          round2(gb.bonusLeitura),
          round2(total)
        ];
      })
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[0]).localeCompare(String(b[0])));

    if (!linhas.length) return;

    const headers = ['Gestor', 'Coordenação', 'Supervisão', 'Bônus Inicial', 'Produção (40%)', 'Custo (30%)', 'Patrimônios/Leitura (30%)', 'Total Bônus'];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...linhas]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bônus');

    const ref = `${String(state.mes).padStart(2, '0')}-${state.ano}`;
    XLSX.writeFile(wb, `bonus_metas_${ref}.xlsx`);
  }

  function slugFileName(str) {
    return normalizarTexto(str).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'gestor';
  }

  function montarDadosCartaoBonus(gestoresEnriq, gestoresBonus, state) {
    const porId = new Map(gestoresEnriq.map(g => [g.id, g]));

    return (gestoresBonus || [])
      .filter(gb => gb.qualifica && (gb.bonusProducao + gb.bonusCusto + gb.bonusLeitura) > 0)
      .map(gb => {
        const g = porId.get(gb.gestorId) || {};
        const total = gb.bonusProducao + gb.bonusCusto + gb.bonusLeitura;
        const pctDe = v => (total > 0 ? (v / total) * 100 : 0);

        return {
          gestor: g.gestor || '',
          coordenacao: g.coordenacao || '',
          supervisao: g.supervisao || '',
          mes: state.mes,
          ano: state.ano,
          bonusInicial: g.bonusInicial || 0,
          total,
          producao: {
            valor: gb.bonusProducao,
            pctTotal: pctDe(gb.bonusProducao),
            metaTons: gb.metaTons || 0,
            produzidoTons: gb.produzidoTons || 0,
            pct: gb.pct || 0
          },
          despesas: {
            valor: gb.bonusCusto,
            pctTotal: pctDe(gb.bonusCusto),
            cptGeral: g.cptGeral || 0,
            cptCoord: g.cptCoord || 0
          },
          leitura: {
            valor: gb.bonusLeitura,
            pctTotal: pctDe(gb.bonusLeitura),
            leituraPct: g.leituraPct
          }
        };
      });
  }

  function desenharPizza3D(canvas, slices) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2;
    const rx = W * 0.39;
    const ry = rx * 0.55;
    const depth = rx * 0.27;
    const cyTop = ry + 10;

    const total = slices.reduce((s, sl) => s + Math.max(sl.value, 0), 0) || 1;
    let acc = 0;
    const spans = slices.map(sl => {
      const startClock = (acc / total) * 360;
      acc += Math.max(sl.value, 0);
      const endClock = (acc / total) * 360;
      return { ...sl, startClock, endClock };
    });
    const toCanvasAngle = (clockDeg) => ((clockDeg - 90) * Math.PI) / 180;

    ctx.clearRect(0, 0, W, H);

    // sombra suave de apoio
    ctx.save();
    ctx.filter = 'blur(6px)';
    ctx.beginPath();
    ctx.ellipse(cx, cyTop + depth + ry * 0.5, rx * 0.92, ry * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.restore();

    // ponto de luz único (mesma posição pra todas as fatias) — dá o efeito "cromado"
    const highlightX = cx - rx * 0.35;
    const highlightY = cyTop - ry * 0.45;

    // parede (extrusão) cromada — só a metade voltada pra frente (ângulo canvas 0°–180°)
    spans.forEach(sl => {
      const a0 = toCanvasAngle(sl.startClock);
      const a1 = toCanvasAngle(sl.endClock);
      const visStart = Math.max(a0, 0);
      const visEnd = Math.min(a1, Math.PI);
      if (visStart >= visEnd) return;

      const wallGrad = ctx.createLinearGradient(cx, cyTop, cx, cyTop + depth);
      wallGrad.addColorStop(0, sl.top);
      wallGrad.addColorStop(0.5, sl.wall);
      wallGrad.addColorStop(1, sl.rim);

      ctx.beginPath();
      ctx.ellipse(cx, cyTop, rx, ry, 0, visStart, visEnd, false);
      ctx.lineTo(cx + rx * Math.cos(visEnd), cyTop + depth + ry * Math.sin(visEnd));
      ctx.ellipse(cx, cyTop + depth, rx, ry, 0, visEnd, visStart, true);
      ctx.closePath();
      ctx.fillStyle = wallGrad;
      ctx.fill();
    });

    // topo cromado (face de cima, com brilho radial por fatia)
    spans.forEach(sl => {
      const a0 = toCanvasAngle(sl.startClock);
      const a1 = toCanvasAngle(sl.endClock);

      const topGrad = ctx.createRadialGradient(highlightX, highlightY, rx * 0.03, cx, cyTop, rx);
      topGrad.addColorStop(0, sl.highlight);
      topGrad.addColorStop(0.45, sl.top);
      topGrad.addColorStop(1, sl.wall);

      ctx.beginPath();
      ctx.moveTo(cx, cyTop);
      ctx.ellipse(cx, cyTop, rx, ry, 0, a0, a1, false);
      ctx.closePath();
      ctx.fillStyle = topGrad;
      ctx.fill();
    });
  }

  function lerpCor(hexBaixo, hexAlto, t) {
    const a = hexBaixo.match(/\w\w/g).map(h => parseInt(h, 16));
    const b = hexAlto.match(/\w\w/g).map(h => parseInt(h, 16));
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
  }

  // Interpola verde↔vermelho conforme onde `valor` cai entre `pontoVerde` e `pontoVermelho`
  // (a ordem dos dois pontos define se "maior é melhor" ou "menor é melhor").
  function corEscalaAlerta(valor, pontoVerde, pontoVermelho) {
    if (valor === null || valor === undefined || !Number.isFinite(valor)) return '#7d8590';
    const t = pontoVermelho === pontoVerde
      ? 0
      : Math.min(1, Math.max(0, (valor - pontoVerde) / (pontoVermelho - pontoVerde)));
    return lerpCor('#86efac', '#f87171', t);
  }

  async function renderCartaoBonusPng(dados) {
    const fmtBRL  = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtT    = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const fmtPct1 = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    const linhaComponente = (cor, titulo, peso, valor, metaLabel, metaValor, atingidoLabel, atingidoValor, atingidoCor) => `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="display:flex;gap:8px;align-items:center;">
            <div style="width:9px;height:9px;border-radius:50%;background:${cor};flex:none;"></div>
            <span style="font-size:12.5px;color:#f3f4f6;font-weight:600;">${escapeHtml(titulo)} · ${peso}%</span>
          </div>
          <span style="font-size:12.5px;color:#f3f4f6;font-weight:600;">${fmtBRL(valor)}</span>
        </div>
        <div style="display:flex;background:rgba(148,163,184,.08);border-radius:8px;overflow:hidden;">
          <div style="flex:1;padding:6px 10px;border-right:1px solid rgba(148,163,184,.14);">
            <p style="margin:0;font-size:10px;color:#7d8590;">${escapeHtml(metaLabel)}</p>
            <p style="margin:1px 0 0;font-size:12px;color:#e5e7eb;font-weight:600;">${metaValor}</p>
          </div>
          <div style="flex:1;padding:6px 10px;">
            <p style="margin:0;font-size:10px;color:#7d8590;">${escapeHtml(atingidoLabel)}</p>
            <p style="margin:1px 0 0;font-size:12px;color:${atingidoCor || '#86efac'};font-weight:600;">${atingidoValor}</p>
          </div>
        </div>
      </div>`;

    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';

    const card = document.createElement('div');
    card.style.cssText = 'width:360px;background:#0b1220;border:1px solid rgba(148,163,184,.18);border-radius:20px;padding:24px 22px;font-family:"DM Sans",system-ui,sans-serif;color:#e5e7eb;box-sizing:border-box;';
    card.innerHTML = `
      <div style="margin-bottom:16px;">
        <p style="margin:0;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#7d8590;">Bônus · ${escapeHtml(getMonthName(dados.mes))}/${dados.ano}</p>
        <p style="margin:2px 0 0;font-size:17px;font-weight:600;color:#f3f4f6;">${escapeHtml(dados.gestor)}</p>
        <p style="margin:1px 0 0;font-size:12px;color:#9ca3af;">${escapeHtml(dados.coordenacao)}${dados.supervisao ? ' · ' + escapeHtml(dados.supervisao) : ''}</p>
      </div>
      <div style="display:flex;background:rgba(148,163,184,.08);border-radius:10px;overflow:hidden;margin:2px 0 16px;">
        <div style="flex:1;text-align:center;padding:14px 10px;border-right:1px solid rgba(148,163,184,.14);">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Bônus de Partida</p>
          <p style="margin:4px 0 0;font-size:21px;font-weight:600;color:#e5e7eb;">${fmtBRL(dados.bonusInicial)}</p>
        </div>
        <div style="flex:1;text-align:center;padding:14px 10px;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Bônus Final</p>
          <p style="margin:4px 0 0;font-size:21px;font-weight:600;color:#86efac;">${fmtBRL(dados.total)}</p>
        </div>
      </div>
      <div style="display:flex;justify-content:center;margin-bottom:14px;">
        <canvas id="metasBonusDonut" width="300" height="210" style="width:150px;height:105px;"></canvas>
      </div>
      <div style="border-top:1px solid rgba(148,163,184,.16);padding-top:14px;">
        ${linhaComponente('#166534', 'Produção', 40, dados.producao.valor,
          'Meta', `${fmtT(dados.producao.metaTons)} t`,
          'Atingido', `${fmtT(dados.producao.produzidoTons)} t (${fmtPct1(dados.producao.pct)}%)`)}
        ${linhaComponente('#4ade80', 'Despesas', 30, dados.despesas.valor,
          'Meta (custo/t empresa)', fmtBRL(dados.despesas.cptGeral),
          'Atingido (custo/t regional)', dados.despesas.cptCoord > 0 ? fmtBRL(dados.despesas.cptCoord) : 'sem dado',
          dados.despesas.cptCoord > 0 ? corEscalaAlerta(dados.despesas.cptCoord, dados.despesas.cptGeral, dados.despesas.cptGeral * 1.5) : null)}
        ${linhaComponente('#bbf7d0', 'Leitura', 30, dados.leitura.valor,
          'Meta', '100%',
          'Atingido', dados.leitura.leituraPct !== null && dados.leitura.leituraPct !== undefined ? `${fmtPct1(dados.leitura.leituraPct)}%` : 'sem dado',
          corEscalaAlerta(dados.leitura.leituraPct, 90, 60))}
      </div>
    `;

    holder.appendChild(card);
    document.body.appendChild(holder);

    const canvas = card.querySelector('#metasBonusDonut');
    desenharPizza3D(canvas, [
      { value: dados.producao.valor, top: '#166534', wall: '#0d3d1f', highlight: '#a7f3c9', rim: '#04170c' },
      { value: dados.despesas.valor, top: '#4ade80', wall: '#2c854d', highlight: '#eafff5', rim: '#0d3d20' },
      { value: dados.leitura.valor, top: '#bbf7d0', wall: '#70947d', highlight: '#ffffff', rim: '#345940' }
    ]);

    try {
      // Pequena espera pra garantir que o layout/DOM assentou antes da captura.
      // Não usar requestAnimationFrame aqui: em lote (vários gestores seguidos), o
      // usuário pode trocar de aba durante a geração e o navegador suspende rAF em
      // abas em segundo plano, travando o fechamento indefinidamente. setTimeout
      // continua rodando (só com throttling leve).
      await new Promise(resolve => setTimeout(resolve, 50));
      const canvasImg = await html2canvas(card, { backgroundColor: '#0b1220', scale: 2 });
      return canvasImg.toDataURL('image/png');
    } finally {
      holder.remove();
    }
  }

  async function gerarImagensBonusPorGestor(state, dadosGestores) {
    if (!dadosGestores.length) return;

    const ref = `${String(state.mes).padStart(2, '0')}-${state.ano}`;
    for (const dados of dadosGestores) {
      const dataUrl = await renderCartaoBonusPng(dados);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `bonus_${slugFileName(dados.gestor)}_${ref}.png`;
      a.click();
      // Pequeno intervalo entre downloads: disparar todos no mesmo tick faz o
      // navegador tratar como pop-up em massa e bloquear os downloads seguintes.
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }

  async function baixarRelatorioBonusFechado(state, supabase) {
    if (!isMonthClosed(state)) return;

    const rows = mergeCoordenacoes(state).filter(row => Number(row.meta_tons || 0) > 0);
    if (!rows.length) {
      alert('Nenhuma meta cadastrada para este mês.');
      return;
    }

    const fechadoRow = (state.metasCadastro || []).find(r => r.fechado);
    const min = Number(fechadoRow?.bonus_percentual_minimo || 100);

    const gestoresEnriq = await enrichGestoresParaFechamento(state, supabase, Number(state.ano), Number(state.mes));

    const percByKey = new Map(rows.map(row => {
      const meta = Number(row.meta_tons || 0);
      const prod = Number(row.produzido_tons || 0);
      return [rowKey(row), meta > 0 ? (prod / meta) * 100 : 0];
    }));

    const gestoresBonus = gestoresEnriq.map(g => {
      const pct = percByKey.has(g._key) ? percByKey.get(g._key) : 0;
      const auditoria = (state.auditoria || []).find(a => normalizarTexto(a.regional) === g._key);
      const qualifica = pct >= min && (!auditoria || auditoria.apto !== false);
      return {
        coordenacaoKey: g._key,
        gestorId: g.id,
        qualifica,
        bonusProducao: qualifica ? (pct / 100) * g.bonusInicial * 0.4 : 0,
        bonusCusto:    qualifica ? g.valorCusto  : 0,
        bonusLeitura:  qualifica ? g.valorLeitura : 0
      };
    });

    if (!gestoresBonus.some(gb => gb.qualifica)) {
      alert('Nenhum gestor qualificado para bônus neste mês.');
      return;
    }

    gerarRelatorioBonusXlsx(state, gestoresEnriq, gestoresBonus);
  }

export { gerarRelatorioBonusXlsx, montarDadosCartaoBonus, gerarImagensBonusPorGestor, baixarRelatorioBonusFechado };
