// Frotas · Manutenção: tema verde (mesma paleta de Gestor › Programação) para janelas e cards.
// Os estilos de Manutenção foram escritos com cinzas azulados (slate); aqui eles viram verdes escuros. O azul fica só nos campos
// digitáveis e listas suspensas (inputs/selects usam #0d0d18) e nos selos de status. Programação: fundo #06130e, superfícies
// rgba(8,22,17) / rgba(13,32,24), linhas rgba(111,208,165), texto #eef7f2 e apoio #8ba79a.
const TROCAS = [
  [/rgba\(15,23,42,/g, 'rgba(10,30,23,'], // fundo de cards e janelas
  [/rgba\(2,6,23,/g, 'rgba(5,18,13,'], // fundos mais fundos (rodapés, blocos internos)
  [/rgba\(148,163,184,/g, 'rgba(111,208,165,'], // linhas e bordas
  [/#0f172a/gi, '#0a1e17'],
  [/#f8fafc/gi, '#f2faf6'], // títulos
  [/#e2e8f0/gi, '#eef7f2'], // texto
  [/#cbd5e1/gi, '#b8ccc0'], // texto secundário
  [/#94a3b8/gi, '#8ba79a'], // apoio
  [/#64748b/gi, '#6f8a7d'],
];

export function verdear(css) {
  return TROCAS.reduce((texto, [de, para]) => texto.replace(de, para), String(css));
}

// A janela (ds-modal-card) vem do design system global em azul-marinho; nas janelas de Manutenção ela segue o tema verde.
export const ESTILOS_TEMA_VERDE = `
<style>
.fm-mod .ds-modal-card{background:#0a1e17;border-color:rgba(111,208,165,.26)}
.fm-mod.ds-modal{background:rgba(2,10,7,.78)}
</style>`;
