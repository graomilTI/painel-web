// Frotas — HTML da tela de Excesso de velocidade / Notificações (template único).
// Separado de frotas-excesso-velocidade.js em 15/10/2026 (a função renderExcessoVelocidade tinha 494 linhas).
// O código foi movido sem alteração. Ao editar, troque o token ?v= em todos os imports internos do conjunto
// frotas-*.js (tests/frotas-modulos-versao.test.mjs confere).
import { ICO_CLOSE, ICO_COPY, ICO_PAPERCLIP, ICO_REFRESH, ICO_SEARCH, PASTA_MAE_DRIVE_ID, getStyles, yesterdayInputDate } from './frotas-base.js?v=20261016-frotas-hist1';

  function htmlExcessoVelocidade() {
    return `${getStyles()}
      <section class="frotas-shell">
        <div class="frotas-header"><div><div class="frotas-kicker">Frotas · Notificações</div><h1 class="frotas-title">Notificações</h1><p class="frotas-subtitle">Um dossiê por veículo e por dia, com uma única notificação para uso fora do horário e excesso de velocidade. Depois de enviar a mensagem, anexe o print.</p></div></div>
        <div class="frotas-card">
          <div class="frotas-body">
            <div class="fh-conteudo">
              <style>
                .print-driver-pending{border-radius:12px}
                .print-driver-item{padding:14px 0}
                @media(max-width:720px){.speed-fab span{display:none}}
                .fora-horario-layout{display:grid;gap:14px;width:100%}
                .fora-horario-toolbar{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;padding:0 0 14px;border-bottom:1px solid rgba(148,163,184,.14)}
                .fora-horario-date{width:170px;margin:0}
                .fora-horario-date label{min-height:0;color:#dbeafe;line-height:1.35}
                .fora-horario-date .speed-input{height:46px;border-radius:14px;font-size:14px;font-weight:900;padding:0 14px}
                .fora-horario-sync{height:46px;min-width:0;border-radius:14px;padding:0 22px}
                .fora-horario-refresh{width:46px;height:46px;min-height:46px;border-radius:14px;padding:0}
                .fora-horario-table{border-color:rgba(34,197,94,.20);border-radius:20px;background:rgba(2,6,23,.30)}
                .fora-horario-table .hist-table{min-width:1480px}
                .fora-horario-actions{display:flex;gap:7px;flex-wrap:wrap}
                .fora-horario-actions .speed-btn{min-height:34px;padding:7px 10px;border-radius:10px}
                .fora-horario-actions .speed-btn:disabled{opacity:.42;cursor:not-allowed}
                .fora-horario-table .hist-table th{height:58px;padding:0 18px;color:#34d399;background:rgba(2,44,30,.76);font-size:12px}
                .fora-horario-table .hist-table td{padding:18px;color:#f8fafc;font-size:13px}
                .fora-horario-table .speed-import-empty{border:0;border-radius:0;background:transparent;color:#f8fafc}
                .fora-horario-count{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
                .fora-horario-link-btn{border:0;background:transparent;padding:0;color:#86efac;font-weight:800;font-size:inherit;cursor:pointer;text-decoration:underline}
                .fora-horario-link-btn:hover{color:#bbf7d0}
                .rota-modal-table td small{display:block;color:#6b7280;margin-top:2px}
                .speed-fab[hidden]{display:none}
                .fh-filtros{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
                .fh-chips{display:flex;gap:8px;flex-wrap:wrap}
                .fh-chip{appearance:none;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.6);color:#cbd5e1;border-radius:999px;padding:8px 14px;font-weight:900;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:.16s ease}
                .fh-chip[hidden]{display:none}
                .fh-chip b{background:rgba(148,163,184,.18);border-radius:999px;padding:1px 8px;font-size:11px;color:#f8fafc}
                .fh-chip:hover{border-color:rgba(34,197,94,.5);color:#dcfce7}
                .fh-chip.active{background:rgba(34,197,94,.16);border-color:rgba(34,197,94,.6);color:#bbf7d0}
                .fh-chip.active b{background:rgba(34,197,94,.3)}
                .fh-busca{width:min(100%,300px);margin:0}
                .fh-filtros-dir{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
                .fh-agrupar{display:inline-flex;align-items:center;gap:2px;padding:2px 2px 2px 10px;border-radius:12px;background:rgba(148,163,184,.12)}
                .fh-agrupar span{color:#94a3b8;font-size:11px;font-weight:800;margin-right:6px}
                .fh-agrupar button{appearance:none;border:0;background:transparent;color:#94a3b8;font-size:12px;font-weight:900;padding:7px 14px;border-radius:10px;cursor:pointer}
                .fh-agrupar button.active{background:rgba(34,197,94,.25);color:#bbf7d0}
                .fh-rodape-dia{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
                .fh-alerta{margin:0;border:1px solid rgba(251,191,36,.35);background:rgba(251,191,36,.08);border-radius:12px;padding:9px 12px;color:#fde68a;font-size:12px}
                .fh-alerta[hidden]{display:none}
                .fh-ajuda{color:#94a3b8;font-size:12px;line-height:1.55}
                .fh-ajuda summary{cursor:pointer;color:#94a3b8;font-weight:800;width:max-content}
                .fh-ajuda summary:hover{color:#bbf7d0}
                .fh-ajuda p{margin:8px 0 0;max-width:900px}
                .fh-legenda{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px}
                .fh-legenda span{display:inline-flex;align-items:center;gap:6px}
                .fh-sub{margin-top:3px;color:#94a3b8;font-size:12px;line-height:1.4}
                .fh-muted{color:#6b7280}
                .fh-badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 11px;font-size:11px;font-weight:950;border:1px solid rgba(148,163,184,.3);white-space:nowrap}
                .fh-badge-fora{background:rgba(248,113,113,.16);border-color:rgba(248,113,113,.5);color:#fecaca}
                .fh-badge-atencao{background:rgba(251,191,36,.14);border-color:rgba(251,191,36,.45);color:#fde68a}
                .fh-badge-dentro{background:rgba(52,211,153,.14);border-color:rgba(52,211,153,.4);color:#a7f3d0}
                .fh-badge-nd{background:rgba(148,163,184,.12);color:#cbd5e1}
                .fh-lista{display:flex;flex-direction:column;gap:6px}
                .fh-dia{margin:16px 0 4px;color:#cbd5e1;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
                .fh-dia:first-child{margin-top:4px}
                .fh-dia .fh-dia-esp{color:#fbbf24;font-weight:800}
                .fh-dia span{margin-left:10px;color:#6b7280;font-weight:700;text-transform:none;letter-spacing:0}
                .fh-status{display:inline-flex;border-radius:999px;padding:3px 10px;background:rgba(34,197,94,.14);color:#bbf7d0;font-size:11px;font-weight:900;white-space:nowrap}
                .fh-btn-dossie{background:rgba(96,165,250,.14);color:#bfdbfe;border:1px solid rgba(96,165,250,.4);white-space:nowrap}
                .fh-btn-dossie:hover:not(:disabled){background:rgba(96,165,250,.26)}
                .fh-btn-dossie:disabled{opacity:.42;cursor:not-allowed}
                .fh-lg{display:inline-block;width:12px;height:12px;border-radius:3px}
                .fh-lg-dot-sem{background:#c084fc;border-radius:50%}.fh-lg-dot-exc{background:#fb923c;border-radius:50%}
                .fh-lg-dot-fora{background:#f87171;border-radius:50%}.fh-lg-dot-atencao{background:#fbbf24;border-radius:50%}.fh-lg-dot-dentro{background:#34d399;border-radius:50%}
                .fh-cab,.fh-linha{display:grid;grid-template-columns:minmax(190px,1.7fr) repeat(3,minmax(88px,.75fr)) 108px;align-items:center;gap:14px}
                .fh-cab{padding:0 17px 0 19px;margin-top:6px;color:#6b7280;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.07em}
                .fh-linha{padding:11px 16px;border:1px solid rgba(148,163,184,.13);border-left:3px solid rgba(148,163,184,.3);background:rgba(15,23,42,.5);border-radius:12px}
                .fh-linha:hover{border-color:rgba(148,163,184,.3);background:rgba(15,23,42,.8)}
                .fh-linha.fh-linha-fora{border-left-color:#f87171}.fh-linha.fh-linha-atencao{border-left-color:#fbbf24}.fh-linha.fh-linha-dentro{border-left-color:#34d399}
                .fh-cels{display:contents}
                .fh-linha .fh-btn-dossie{width:100%;justify-content:center}
                .fh-cel{min-width:0}
                .fh-c{display:inline-flex;align-items:center;border-radius:8px;padding:4px 9px;font-size:13px;font-weight:900;white-space:nowrap}
                .fh-c-vazio{color:#475569;padding-left:0;font-weight:700}
                .fh-c-fora{background:rgba(248,113,113,.16);color:#fecaca}
                .fh-c-atencao{background:rgba(251,191,36,.12);color:#fde68a}
                .fh-c-sem{background:rgba(192,132,252,.18);color:#e9d5ff}
                .fh-c-sem-leve{background:rgba(192,132,252,.08);color:#d8b4fe}
                .fh-c-exc{background:rgba(251,146,60,.16);color:#fed7aa}
                .fh-l-quem strong{display:block;color:#f8fafc;font-size:14px;line-height:1.3}
                .fh-l-quem small{display:block;margin-top:3px;color:#94a3b8;font-size:12px;line-height:1.4}
                .fh-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:2px 0 16px}
                .fh-tile{appearance:none;font:inherit;text-align:left;display:flex;flex-direction:column;gap:3px;padding:12px 14px;border-radius:14px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.55);color:#e2e8f0;cursor:default}
                button.fh-tile{cursor:pointer}
                button.fh-tile:hover{filter:brightness(1.18)}
                .fh-tile-rot{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8}
                .fh-tile b{font-size:22px;letter-spacing:-.02em;color:#f8fafc;line-height:1.2}
                .fh-tile small{font-size:12px;color:#94a3b8;line-height:1.4}
                .fh-tile-fora{border-color:rgba(248,113,113,.5);background:rgba(248,113,113,.1)}.fh-tile-fora .fh-tile-rot,.fh-tile-fora b{color:#fecaca}
                .fh-tile-atencao{border-color:rgba(251,191,36,.4);background:rgba(251,191,36,.07)}.fh-tile-atencao .fh-tile-rot,.fh-tile-atencao b{color:#fde68a}
                .fh-tile-sem{border-color:rgba(192,132,252,.5);background:rgba(192,132,252,.1)}.fh-tile-sem .fh-tile-rot,.fh-tile-sem b{color:#e9d5ff}
                .fh-tile-sem-leve{border-color:rgba(192,132,252,.32);background:rgba(192,132,252,.05)}.fh-tile-sem-leve .fh-tile-rot,.fh-tile-sem-leve b{color:#d8b4fe}
                .fh-tile-exc{border-color:rgba(251,146,60,.5);background:rgba(251,146,60,.1)}.fh-tile-exc .fh-tile-rot,.fh-tile-exc b{color:#fed7aa}
                .fh-tile-nada b{color:#64748b;font-size:18px}
                .fh-abas{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid rgba(148,163,184,.18);margin-bottom:14px}
                .fh-aba{appearance:none;border:0;background:transparent;color:#94a3b8;font-weight:900;font-size:13px;padding:9px 14px;border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer}
                .fh-aba b{background:rgba(148,163,184,.2);color:#f8fafc;border-radius:999px;padding:0 7px;font-size:11px;margin-left:4px}
                .fh-aba:hover{color:#e2e8f0}
                .fh-aba.active{color:#bbf7d0;border-bottom-color:#22c55e}
                .fh-painel[hidden]{display:none}
                @media(max-width:760px){.fh-cab{display:none}.fh-linha{grid-template-columns:1fr auto}.fh-linha .fh-btn-dossie{width:auto}.fh-cels{display:flex;flex-wrap:wrap;gap:6px 14px;grid-column:1/-1}.fh-cel.vazio{display:none}.fh-cel::before{content:attr(data-rotulo);display:block;margin:0 0 2px 2px;font-size:10px;color:#94a3b8}.fh-tiles{grid-template-columns:1fr}}
                .fh-barra{position:relative;margin:4px 0 0;padding-bottom:20px}
                .fh-barra-trilho{position:relative;height:36px;border-radius:8px;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.14);overflow:hidden}
                .fh-barra-janela{position:absolute;top:0;bottom:0;background:rgba(34,197,94,.2);border-left:2px solid rgba(34,197,94,.7);border-right:2px solid rgba(34,197,94,.7)}
                .fh-barra-bloco{position:absolute;top:6px;bottom:13px;border-radius:3px;min-width:3px}
                .fh-barra-bloco.ok{background:#60a5fa}.fh-barra-bloco.fora{background:#f87171}
                .fh-barra-sem{position:absolute;bottom:3px;height:6px;border-radius:3px;min-width:3px;background:#c084fc}
                .fh-barra-excs{position:relative;height:12px;margin-top:3px}
                .fh-barra-exc{position:absolute;top:0;width:0;height:0;margin-left:-5px;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:10px solid #fb923c}
                .fh-barra-escala{position:absolute;left:0;right:0;bottom:0;height:16px}
                .fh-barra-hora{position:absolute;transform:translateX(-50%);font-size:10px;color:#6b7280}
                .fh-barra-div{position:absolute;top:0;bottom:0;width:0;border-left:2px dashed rgba(251,191,36,.85);z-index:2}
                .fh-lb-meia{width:0;height:12px;border-left:2px dashed rgba(251,191,36,.85);border-radius:0}
                .fh-barra-hora:first-child{transform:none}.fh-barra-hora:last-child{transform:translateX(-100%)}
                .fh-legenda-barra{display:flex;gap:14px;flex-wrap:wrap;margin-top:6px;color:#94a3b8;font-size:11px}
                .fh-legenda-barra span{display:inline-flex;align-items:center;gap:6px}
                .fh-lb{display:inline-block;width:12px;height:10px;border-radius:3px}
                .fh-lb-janela{background:rgba(34,197,94,.35);border:1px solid rgba(34,197,94,.7)}
                .fh-lb-ok{background:#60a5fa}.fh-lb-fora{background:#f87171}.fh-lb-sem{background:#c084fc;height:5px}
                .fh-lb-exc{width:0;height:0;border-radius:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid #fb923c}
                .fh-fatos{margin:6px 0 0;color:#cbd5e1;font-size:13px;line-height:1.5}
                .fh-nota{margin:10px 0 0;padding-left:10px;border-left:3px solid rgba(251,191,36,.5);color:#94a3b8;font-size:12px;line-height:1.5}
                .speed-modal.fh-modal{max-width:min(1480px,96vw)}
                .fh-dossie-grade{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:20px;align-items:start}
                .fh-dossie-detalhes{min-width:0}
                .fh-dossie-mapa{position:sticky;top:0;min-width:0}
                .fh-mapa-cab{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 8px}
                .fh-mapa-cab b{color:#f8fafc;font-size:14px;margin-right:8px}
                .fh-mapa-cab span{color:#6b7280;font-size:11px}
                .fh-mapa-base{display:inline-flex;gap:2px;padding:2px;border-radius:10px;background:rgba(148,163,184,.14)}
                .fh-mapa-base button{appearance:none;border:0;background:transparent;color:#94a3b8;font-size:11px;font-weight:900;padding:5px 11px;border-radius:8px;cursor:pointer}
                .fh-mapa-base button.active{background:rgba(34,197,94,.25);color:#bbf7d0}
                .fh-mapa-vazio{border:1px dashed rgba(148,163,184,.25);border-radius:14px;padding:24px 16px;color:#94a3b8;font-size:13px;text-align:center;line-height:1.6}
                .fh-clicavel{cursor:pointer}
                .fh-tl tr.fh-clicavel:hover td{background:rgba(96,165,250,.1)}
                .fh-lb-excm{width:10px;height:10px;border-radius:50%;background:#fb923c}
                @media(max-width:1100px){.fh-dossie-grade{grid-template-columns:1fr}.fh-dossie-mapa{position:static}.fh-mapa{height:340px !important}}
                .fh-m-sub{margin:0 0 14px;color:#94a3b8;font-size:13px;line-height:1.5}
                .fh-h4{margin:20px 0 8px;color:#f8fafc;font-size:14px;letter-spacing:.01em}
                .fh-motivos{margin:0;padding-left:18px;color:#e2e8f0;font-size:13px;line-height:1.65}
                .fh-passos{display:grid;gap:8px;margin-top:10px}
                .fh-passo{display:grid;grid-template-columns:210px 1fr;gap:14px;border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.55);border-left:4px solid rgba(96,165,250,.55);border-radius:12px;padding:10px 14px}
                .fh-passo b{color:#f8fafc;font-size:13px}
                .fh-passo span{color:#cbd5e1;font-size:13px;line-height:1.55}
                .fh-tl-wrap{max-height:380px;overflow:auto}
                .fh-tl{min-width:680px}
                .fh-tl td{vertical-align:top}
                .fh-percursos .fh-tl-completo{display:none}
                .fh-percursos[data-modo="completo"] .fh-tl-completo{display:block}
                .fh-percursos[data-modo="completo"] .fh-tl-resumo{display:none}
                .fh-alternar{margin-top:10px}
                .fh-tl tr.fh-linha-fora td{background:rgba(248,113,113,.09)}
                .fh-tl tr.fh-linha-fora td:first-child{box-shadow:inset 3px 0 0 #f87171}
                .fh-tl tr.fh-linha-casa td{color:#6b7280}
                .fh-tl a,.fh-dossie-topo a,.fh-metodo a,.speed-hint a{color:#86efac}
                .fh-fase{display:inline-flex;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:900}
                .fh-fase.ok{background:rgba(96,165,250,.16);color:#bfdbfe}
                .fh-fase.fora{background:rgba(248,113,113,.2);color:#fecaca}
                .fh-fase.info{background:rgba(251,191,36,.14);color:#fde68a}
                .fh-fase.neutra{background:rgba(148,163,184,.14);color:#cbd5e1}
                .fh-fase.sem{background:rgba(192,132,252,.2);color:#e9d5ff}
                .fh-fase.exc{background:rgba(251,146,60,.2);color:#fed7aa}
                .fh-fase.uso{background:rgba(52,211,153,.12);color:#a7f3d0}
                .fh-chips-cel{display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start}
                .fh-chips-cel .fh-sub{flex-basis:100%;margin-top:0}
                .fh-tl tr.fh-linha-sem td:first-child{box-shadow:inset 3px 0 0 #c084fc}
                .fh-tl tr.fh-linha-sem td{background:rgba(192,132,252,.07)}
                .fh-metodo{margin-top:16px;border:1px solid rgba(148,163,184,.14);border-radius:14px;padding:10px 14px;color:#cbd5e1;font-size:12px}
                .fh-metodo.fh-interno{margin-top:10px;background:rgba(2,6,23,.3)}
                .fh-metodo summary{cursor:pointer;font-weight:900;color:#bbf7d0}
                .fh-metodo ul{margin:10px 0 2px;padding-left:18px;line-height:1.6}
                .fh-metodo .fh-tl-wrap{margin-top:10px}
                .fh-m-rodape{position:sticky;bottom:-20px;margin:18px -20px -20px;padding:12px 20px;background:#0d0d18;border-top:1px solid rgba(148,163,184,.16);display:flex;flex-direction:column;align-items:stretch;gap:10px}
                .fh-m-rodape-info{display:flex;flex-direction:column;gap:2px}
                .fh-m-rodape-info:empty{display:none}
                .fh-fresco{margin:0;color:#6b7280;font-size:12px}
                .fh-fresco[hidden]{display:none}
                .fh-mapa{height:clamp(340px,54vh,560px);border-radius:14px;overflow:hidden;border:1px solid rgba(148,163,184,.2);isolation:isolate;background:#0b1220}
                .fh-mapa-slider{display:flex;align-items:center;gap:12px;margin-top:10px}
                .fh-mapa-slider input{flex:1;accent-color:#fbbf24}
                .fh-mapa-slider span{min-width:130px;color:#fde68a;font-weight:900;font-size:13px;text-align:right}
                .fh-refs{display:grid;gap:8px}
                .fh-ref{display:grid;grid-template-columns:30px 1fr auto;gap:12px;align-items:center;border:1px solid rgba(148,163,184,.14);border-radius:12px;padding:8px 12px;background:rgba(15,23,42,.5)}
                .fh-ref b{display:block;color:#f8fafc;font-size:13px}
                .fh-ref small{display:block;color:#94a3b8;font-size:12px;line-height:1.4}
                .fh-ref small.fh-ref-prox{color:#bbf7d0}
                .fh-pin{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:10px;color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5)}
                .fh-pin-os{background:#f59e0b}.fh-pin-casa{background:#3b82f6}.fh-pin-pernoite{background:#64748b}
                .fh-pin-carga{width:24px;height:24px;border-radius:7px;background:#0d9488;font-size:11px}
                .fh-pin-carga.em-casa{opacity:.55}
                .fh-lb-carga{width:10px;height:10px;border-radius:3px;background:#0d9488}
                .fh-carro-icone{background:none;border:0}
                .fh-carro{width:44px;height:27px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.75))}
                .fh-carro svg{display:block;width:100%;height:100%}
                .fh-carro.fh-carro-esq svg{transform:scaleX(-1)}
                .fh-hora{background:rgba(2,6,23,.88);color:#e2e8f0;border:1px solid rgba(148,163,184,.45);border-radius:6px;padding:0 5px;font-size:10px;font-weight:800;line-height:15px;text-align:center;white-space:nowrap}
                @media(max-width:760px){.fh-filtros{display:grid}.fh-busca{width:100%}.fh-passo{grid-template-columns:1fr;gap:4px}.fh-m-manchete{font-size:20px}}
                @media(max-width:760px){.fora-horario-toolbar{display:grid;grid-template-columns:1fr 1fr 58px;gap:10px}.fora-horario-date{width:auto}.fora-horario-sync{grid-column:1/3;min-width:0;width:100%}.fora-horario-refresh{grid-column:3;grid-row:1/3;align-self:end;width:58px}.fora-horario-date .speed-input,.fora-horario-sync,.fora-horario-refresh{height:58px;min-height:58px}}
                @media(max-width:520px){.fora-horario-toolbar{grid-template-columns:1fr 54px}.fora-horario-date{grid-column:1}.fora-horario-sync{grid-column:1}.fora-horario-refresh{grid-column:2;grid-row:1/4;width:54px}.fora-horario-date .speed-input{font-size:14px}}
              </style>
              <div class="fora-horario-layout">
                <div class="fora-horario-toolbar">
                  <div class="speed-field fora-horario-date"><label>De</label><input class="speed-input" type="date" data-fora-horario-report-start value="${yesterdayInputDate()}"></div>
                  <div class="speed-field fora-horario-date"><label>Até</label><input class="speed-input" type="date" data-fora-horario-report-end value="${yesterdayInputDate()}"></div>
                  <button class="speed-btn speed-btn-soft fora-horario-sync" type="button" data-sync-bfleet-fora-horario-periodo>Sincronizar período</button>
                  <button class="speed-btn speed-btn-soft fora-horario-refresh" type="button" data-refresh-fora-horario title="Atualizar lista" aria-label="Atualizar lista">${ICO_REFRESH}</button>
                </div>
                <div class="fh-filtros">
                  <div class="fh-chips" role="group" aria-label="Filtrar por resultado">
                    <button class="fh-chip active" type="button" data-fh-filter="ALERTAS">Alertas <b>0</b></button>
                    <button class="fh-chip" type="button" data-fh-filter="FORA_HORARIO">Fora do horário <b>0</b></button>
                    <button class="fh-chip" type="button" data-fh-filter="USO_INDEVIDO">Uso indevido <b>0</b></button>
                    <button class="fh-chip" type="button" data-fh-filter="EXCESSO">Excesso de velocidade <b>0</b></button>
                    <button class="fh-chip" type="button" data-fh-filter="SEM_DOSSIE" hidden>Sem dossiê <b>0</b></button>
                    <button class="fh-chip" type="button" data-fh-filter="TODOS">Todos <b>0</b></button>
                  </div>
                  <div class="fh-filtros-dir">
                    <div class="fh-agrupar" data-fh-agrupar title="Rota junta num só item o percurso que atravessa a meia-noite (o relatório da BFleet corta as viagens às 00h)">
                      <span>Ver por</span>
                      <button type="button" data-agrupar="dia" class="active">Dia</button>
                      <button type="button" data-agrupar="rota">Rota</button>
                    </div>
                    <div class="speed-search-field fh-busca">${ICO_SEARCH}<input class="speed-input" type="text" placeholder="Buscar colaborador ou placa" data-fora-horario-search></div>
                  </div>
                </div>
                <p class="fh-alerta" data-fh-alerta hidden></p>
                <p class="fh-fresco" data-fh-fresco hidden></p>
                <details class="fh-ajuda">
                  <summary>Como funciona</summary>
                  <p>Um dossiê por veículo e por dia, com três frentes: (1) uso fora do horário de trabalho do colaborador, que vem dos informativos do Mapa de Embarque, da produção, do GPS do celular e da escala de carona da Programação, mais o tempo de ida e volta e 20 min de folga; (2) trajetos sem justificativa, que não chegam a O.S. programada, carona nem local de registro de trabalho; (3) excessos de velocidade registrados pelo rastreador. Aos domingos e feriados só é autorizado rodar com embarque (em qualquer horário). Clique em "Ver detalhes" para ver o dia completo, o mapa da rota e gerar a notificação: uma só mensagem por veículo e dia, com as seções que se aplicam (uso fora do horário e/ou excesso de velocidade).</p>
                  <div class="fh-legenda">
                    <span><i class="fh-lg fh-lg-dot-fora"></i>Fora do horário</span>
                    <span><i class="fh-lg fh-lg-dot-sem"></i>Uso sem justificativa</span>
                    <span><i class="fh-lg fh-lg-dot-exc"></i>Excesso de velocidade</span>
                    <span><i class="fh-lg fh-lg-dot-dentro"></i>Sem alertas</span>
                  </div>
                  <p>Dados desatualizados? <button type="button" class="fora-horario-link-btn" data-recalcular-dossie>Recalcular dossiê</button></p>
                </details>
                <p class="fora-horario-count" data-fora-horario-count>Nenhum registro carregado</p>
                <div class="fh-cab" aria-hidden="true"><span>Veículo</span><span>Fora do horário</span><span>Sem justificativa</span><span>Excessos</span><span></span></div>
                <div class="fh-lista" data-fora-horario-table><div class="speed-import-empty">Carregando ocorrências...</div></div>
              </div>
            </div>
          </div>
        </div>
        <button class="speed-fab" type="button" data-open-prints-modal title="Anexar prints" aria-label="Anexar prints">${ICO_PAPERCLIP} Anexar prints</button>
        <div class="speed-modal-overlay" data-prints-modal hidden>
          <div class="speed-modal" role="dialog" aria-modal="true" aria-label="Anexar prints" tabindex="-1" style="outline:none">
            <div class="speed-modal-head">
              <div><h3>Anexar prints</h3><span class="speed-step-pill">colar direto aqui</span></div>
              <button class="speed-modal-close" type="button" data-prints-modal-close title="Fechar" aria-label="Fechar">${ICO_CLOSE}</button>
            </div>
            <div class="upload-box">
              <div class="speed-field"><label>Leitor OCR</label><input class="speed-input" type="text" value="Serviço central configurado" readonly><p class="speed-hint">Os prints são salvos no Drive e toda conciliação fica auditada no banco. Pasta mãe: <code>${PASTA_MAE_DRIVE_ID}</code>.</p></div>
              <div class="paste-zone" tabindex="0" data-paste-zone>
                <strong>Clique aqui e cole o print</strong>
                <span>Após clicar neste quadro, use <kbd>Ctrl</kbd> + <kbd>V</kbd>. Também funciona colando em qualquer campo desta tela, arrastando imagens ou selecionando em lote abaixo.</span>
              </div>
              <div class="speed-field" style="margin-top:14px"><label>Selecionar prints em lote</label><input class="speed-input" type="file" accept="image/*" multiple data-print-files></div>
              <div data-upload-list class="upload-list"></div>
              <div class="upload-actions"><button class="speed-btn speed-btn-primary" type="button" data-upload-prints>Enviar prints e conferir por OCR</button></div>
              <div class="print-status-box"><strong>Como o arquivamento funciona</strong><p>Depois de gerar a notificação no dossiê e enviá-la ao colaborador, anexe o print da conversa. O sistema identifica o condutor pelo OCR e cruza número da notificação, motorista, placa, data e velocidade com as pendências abertas, e salva o arquivo na pasta do motorista no Drive.</p></div>
              <div data-saved-list class="saved-list"></div>
            </div>
          </div>
        </div>
        <div class="speed-modal-overlay" data-rota-modal hidden>
          <div class="speed-modal" role="dialog" aria-modal="true" aria-label="Rota do veículo">
            <div class="speed-modal-head">
              <div><h3 data-rota-modal-title>Rota do veículo</h3><span class="speed-step-pill" data-rota-modal-km>0,00 km</span></div>
              <button class="speed-modal-close" type="button" data-rota-modal-close title="Fechar" aria-label="Fechar">${ICO_CLOSE}</button>
            </div>
            <p class="speed-hint" data-rota-modal-hint></p>
            <div class="hist-table-wrap"><table class="hist-table rota-modal-table"><thead><tr><th>Horário</th><th>Endereço</th><th>Latitude</th><th>Longitude</th><th>Vel. (km/h)</th></tr></thead><tbody data-rota-modal-body></tbody></table></div>
            <p class="speed-hint"><a data-rota-modal-link href="#" target="_blank" rel="noopener noreferrer" hidden>Abrir trajeto no Google Maps</a></p>
          </div>
        </div>
        <div class="speed-modal-overlay" data-dossie-modal hidden>
          <div class="speed-modal fh-modal" role="dialog" aria-modal="true" aria-label="Dossiê diário do veículo" tabindex="-1" style="outline:none">
            <div class="speed-modal-head">
              <div><h3 data-dossie-title>Dossiê</h3></div>
              <div style="display:flex;gap:8px;align-items:center">
                <button class="speed-btn speed-btn-soft speed-btn-compact" type="button" data-dossie-copiar title="Copiar resumo" aria-label="Copiar resumo" hidden>${ICO_COPY}</button>
                <button class="speed-modal-close" type="button" data-dossie-modal-close title="Fechar" aria-label="Fechar">${ICO_CLOSE}</button>
              </div>
            </div>
            <div class="fh-dossie-grade">
              <div class="fh-dossie-detalhes"><div data-dossie-body></div></div>
              <aside class="fh-dossie-mapa" data-dossie-mapa aria-label="Rota realizada"></aside>
            </div>
            <div class="fh-m-rodape" data-dossie-rodape></div>
          </div>
        </div>
      </section>`;
  }

export { htmlExcessoVelocidade };
