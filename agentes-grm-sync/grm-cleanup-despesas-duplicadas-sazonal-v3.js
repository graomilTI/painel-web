#!/usr/bin/env node
'use strict';

/*
 * V3 conservadora da limpeza sazonal.
 * Reaproveita integralmente a V2 e injeta uma trava semântica adicional:
 * grupos classificados como ALMOÇO cuja descrição mencionar JANTA, CAFÉ,
 * DESJEJUM, PERNOITE ou HOSPEDAGEM vão para REVISAR e nunca são excluídos.
 *
 * A V2 permanece intacta como referência validada para resolução de datas.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const base = path.join(__dirname, 'grm-cleanup-despesas-duplicadas-sazonal.js');
let source = fs.readFileSync(base, 'utf8');

const oldVersion = "const VERSION = 'V2-DUPLICIDADES-REF-DATE';";
const newVersion = "const VERSION = 'V3-DUPLICIDADES-SEMANTIC-GUARD';";
if (!source.includes(oldVersion)) {
  throw new Error('Base V2 esperada não encontrada; abortando V3.');
}
source = source.replace(oldVersion, newVersion);

const anchor = "function plan(g,rows){const m=match(rows,g),s=m.filter(r=>r.special);";
if (!source.includes(anchor)) {
  throw new Error('Ponto de injeção da trava semântica não encontrado; abortando V3.');
}

const injected = anchor + "const semanticConflict=g.typeKey==='ALMOCO'&&g.movements.some(x=>/(^| )(JANTA|CAFE|DESJEJUM|PERNOITE|HOSPEDAGEM)( |$)/.test(norm(x.description)));if(semanticConflict)return{safe:true,action:'REVISAR',deleteCount:0,other:g.apiCount,matched:m,special:s,reason:'DESCRICAO_INCOMPATIVEL_COM_ALMOCO'};";
source = source.replace(anchor, injected);

const virtualFilename = path.join(__dirname, 'grm-cleanup-despesas-duplicadas-sazonal-v3.compiled.js');
const mod = new Module(virtualFilename, module);
mod.filename = virtualFilename;
mod.paths = Module._nodeModulePaths(__dirname);
mod._compile(source, virtualFilename);
