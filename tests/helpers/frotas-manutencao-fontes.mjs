// Fonte da tela de Manutenção (Corretiva) para os testes que conferem o código por texto: o controlador e as janelas que saíram dele,
// e as peças de HTML (cada uma em seu arquivo). Assim os testes não dependem de em qual arquivo uma função está.
import { readFileSync } from 'node:fs';

const PASTA = new URL('../../assets/js/modules/', import.meta.url);
const junta = (arquivos) => arquivos.map((p) => readFileSync(new URL(p, PASTA), 'utf8')).join('\n');

const CONTROLADOR = [
  'frotas-manutencao.js', 'frotas-manutencao-janela-aprovacao.js', 'frotas-manutencao-janela-consulta.js', 'frotas-manutencao-janela-orcamento.js',
  'frotas-manutencao-nova.js', 'frotas-manutencao-notas.js',
];
const HTML = [
  'frotas-manutencao-html.js', 'frotas-manutencao-html-base.js', 'frotas-manutencao-html-nova.js', 'frotas-manutencao-html-orcamento.js', 'frotas-manutencao-html-notas.js',
];

export const fonteControlador = () => junta(CONTROLADOR);
export const fonteHtml = () => junta(HTML);
