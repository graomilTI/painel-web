// Frotas · Manutenção: tema verde (mesma paleta de Gestor › Programação) para janelas e cards.
// Os estilos de Manutenção foram escritos com cinzas azulados (slate); aqui eles viram verdes escuros. O azul fica só nos campos
// digitáveis e listas suspensas (inputs/selects usam #0d0d18) e nos selos de status. Escurecido a pedido: fundos quase pretos
// (rgba(5,14,10) e rgba(2,8,6)), linhas verde-acinzentadas discretas, texto #eef7f2 e apoio #8ba79a.
const TROCAS = [
  [/rgba\(15,23,42,/g, 'rgba(5,14,10,'], // fundo de cards e janelas (verde quase preto)
  [/rgba\(2,6,23,/g, 'rgba(2,8,6,'], // fundos mais fundos (rodapés, blocos internos)
  [/#0f172a/gi, '#050e0a'],
  [/#f8fafc/gi, '#f2faf6'], // títulos
  [/#e2e8f0/gi, '#eef7f2'], // texto
  [/#cbd5e1/gi, '#b8ccc0'], // texto secundário
  [/#94a3b8/gi, '#8ba79a'], // apoio
  [/#64748b/gi, '#6f8a7d'],
];

// Linhas e bordas: verde-acinzentado e discreto (verde apagado com 60% da opacidade que o cinza azulado tinha).
const LINHAS = /rgba\(148,163,184,(\d*\.?\d+)\)/g;

export function verdear(css) {
  const base = TROCAS.reduce((texto, [de, para]) => texto.replace(de, para), String(css));
  return base.replace(LINHAS, (_, a) => `rgba(110,160,135,${(Math.round(Number(a) * 60) / 100).toString().replace(/^0\./, '.')})`);
}

// A janela (ds-modal-card) vem do design system global em azul-marinho; nas janelas de Manutenção ela segue o tema verde.
export const ESTILOS_TEMA_VERDE = `
<style>
.fm-mod .ds-modal-card{background:#050e0a;border-color:rgba(110,160,135,.16)}
.fm-mod.ds-modal{background:rgba(0,4,2,.84)}
.fm-card{background:radial-gradient(circle at top left,rgba(34,197,94,.035),transparent 34%),linear-gradient(180deg,rgba(5,14,10,.98),rgba(2,8,6,.98))}
.fm-kcard.active,.fm-kcard[aria-pressed="true"]{background:linear-gradient(180deg,var(--kc-bg),rgba(2,8,6,.92))}
</style>`;
