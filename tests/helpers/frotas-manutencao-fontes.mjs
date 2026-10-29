// Fonte da tela de Manutenção (Corretiva) para os testes que conferem o código por texto: o controlador e as janelas que saíram dele
// (cada uma em seu arquivo). Assim os testes não dependem de em qual arquivo uma função está.
import { readFileSync, readdirSync } from 'node:fs';

const PASTA = new URL('../../assets/js/modules/', import.meta.url);
const PARTES = ['frotas-manutencao.js', 'frotas-manutencao-janela-aprovacao.js', 'frotas-manutencao-janela-consulta.js', 'frotas-manutencao-janela-orcamento.js', 'frotas-manutencao-nova.js', 'frotas-manutencao-notas.js'];

export const fonteControlador = () => PARTES.map((p) => readFileSync(new URL(p, PASTA), 'utf8')).join('\n');
export const arquivosDoControlador = () => PARTES.filter((p) => readdirSync(PASTA).includes(p));
