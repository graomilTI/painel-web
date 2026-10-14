#!/usr/bin/env node
'use strict';

/*
 * Runner V6 para o cleanup de Café retroativo.
 *
 * Correções sobre o V5:
 * - mantém a seleção única do modal real do GRM via [role="dialog"][aria-modal="true"];
 * - reabre Funcionários > Caixa Operacional após CADA exclusão;
 * - não reutiliza o mesmo Caixa para excluir o segundo/terceiro movimento;
 * - se houver timeout durante uma exclusão, reconcilia o CPF pela API atual do GRM:
 *   * se a API caiu exatamente 1 movimento, considera a exclusão confirmada e continua;
 *   * se não caiu, registra erro e não presume que excluiu;
 *   * se caiu mais de 1, aborta por divergência de segurança.
 *
 * O arquivo-base V4 continua responsável pelas demais travas:
 * descrição exata, categoria Café, precheck, valor, CANCELAR/CONFIRMAR,
 * CPF opcional e verificação final pela API.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const sourcePath = path.join(dir, 'grm-cleanup-cafe-retroativo.js');
const runtimePath = path.join(dir, `.grm-cleanup-cafe-retroativo-v6-runtime-${process.pid}.js`);

let source = fs.readFileSync(sourcePath, 'utf8');

if (!source.includes("const VERSION = 'V4-GRM-TYPO-MODAL';")) {
  throw new Error('Versão-base inesperada. Esperado V4-GRM-TYPO-MODAL.');
}

// 1) Corrige a unicidade do modal exatamente como o V5 validado.
const confirmStart = source.indexOf('async function confirmDeleteModal(page, expectedValueKey) {');
const confirmEnd = source.indexOf('\nasync function deleteFirstTarget(page) {', confirmStart);
if (confirmStart < 0 || confirmEnd < 0) throw new Error('Função confirmDeleteModal não localizada.');

let beforeConfirm = source.slice(0, confirmStart);
let confirmFn = source.slice(confirmStart, confirmEnd);
let afterConfirm = source.slice(confirmEnd);

const oldSelector = "[role=\"dialog\"],.v-overlay__content,.v-dialog,[class*=\"modal\"],[class*=\"dialog\"]";
const newSelector = "[role=\"dialog\"][aria-modal=\"true\"]";
const modalOccurrences = confirmFn.split(oldSelector).length - 1;
if (modalOccurrences !== 2) {
  throw new Error(`Seletores esperados em confirmDeleteModal: 2; encontrados: ${modalOccurrences}.`);
}
confirmFn = confirmFn.split(oldSelector).join(newSelector);
source = beforeConfirm + confirmFn + afterConfirm;

// 2) Troca somente deleteAll por uma versão que reabre o Caixa a cada movimento.
const deleteStart = source.indexOf('async function deleteAll(page, targets, expectedTotal) {');
const deleteEnd = source.indexOf('\nasync function main() {', deleteStart);
if (deleteStart < 0 || deleteEnd < 0) throw new Error('Função deleteAll não localizada.');

const newDeleteAll = `async function deleteAll(page, targets, expectedTotal) {
  const summary = { colaboradores: 0, encontrados: 0, excluidos: 0, erros: 0 };

  for (const target of targets) {
    summary.colaboradores += 1;
    let deleted = 0;
    let expectedRemaining = target.esperado;
    let countedInitial = false;

    try {
      while (expectedRemaining > 0) {
        if (deleted >= MAX_DELETE_PER_STAFF) {
          throw new Error('Limite de exclusões por colaborador excedido.');
        }

        // Cada movimento começa em uma tela recém-aberta.
        const found = await openTarget(page, target);
        if (found.length !== expectedRemaining) {
          throw new Error(\`Divergência antes da exclusão: esperado_restante=\${expectedRemaining}, interface=\${found.length}.\`);
        }

        if (!countedInitial) {
          summary.encontrados += found.length;
          countedInitial = true;
        }

        let changed = false;
        try {
          changed = await deleteFirstTarget(page);
        } catch (error) {
          // Não presume falha nem sucesso: consulta a API atual para este CPF.
          await closeCurrent(page).catch(() => {});
          await sleep(900);

          const refreshed = await loadCurrentApiState(page);
          const apiRemaining = refreshed.targets
            .filter((row) => row.cpf === target.cpf)
            .reduce((sum, row) => sum + row.esperado, 0);

          if (apiRemaining === expectedRemaining - 1) {
            log('WARN', \`\${target.colaborador}: exclusão reconciliada pela API após timeout/erro de interface.\`, {
              cpf: target.cpf,
              erro_interface: error.message,
              antes: expectedRemaining,
              api_depois: apiRemaining,
            });
            changed = true;
          } else if (apiRemaining === expectedRemaining) {
            throw new Error(\`\${error.message}; API confirma que o movimento não foi excluído (restante=\${apiRemaining}).\`);
          } else {
            throw new Error(\`Divergência após erro de interface: antes=\${expectedRemaining}, API=\${apiRemaining}, erro=\${error.message}\`);
          }
        }

        if (!changed) throw new Error('Exclusão não alterou o estado do movimento.');

        deleted += 1;
        expectedRemaining -= 1;

        // Fecha totalmente e reabre no próximo laço para evitar estado stale do modal/tabela.
        await closeCurrent(page).catch(() => {});
        await sleep(900);
      }

      // Validação final do colaborador em uma abertura nova.
      const finalFound = await openTarget(page, target);
      if (finalFound.length !== 0) {
        throw new Error(\`Limpeza incompleta na conferência final: restante=\${finalFound.length}.\`);
      }

      summary.excluidos += deleted;
      log('SUCCESS', \`\${target.colaborador}: limpeza concluída.\`, {
        cpf: target.cpf,
        excluidos: deleted,
      });
    } catch (error) {
      summary.erros += 1;
      log('ERROR', \`\${target.colaborador} / \${target.cpf}: \${error.message}\`);
    } finally {
      await closeCurrent(page).catch(() => {});
    }
  }

  if (summary.erros > 0 || summary.excluidos !== expectedTotal) {
    throw new Error(\`EXCLUSÃO incompleta: \${JSON.stringify({ ...summary, esperado_api: expectedTotal })}\`);
  }
  return summary;
}`;

source = source.slice(0, deleteStart) + newDeleteAll + source.slice(deleteEnd);
source = source.replace("const VERSION = 'V4-GRM-TYPO-MODAL';", "const VERSION = 'V6-FRESH-OPEN-API-RECONCILE';");

fs.writeFileSync(runtimePath, source, { mode: 0o750 });

try {
  const result = spawnSync(process.execPath, [runtimePath, ...process.argv.slice(2)], {
    cwd: dir,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status == null ? 1 : result.status;
} finally {
  try { fs.unlinkSync(runtimePath); } catch (_) {}
}
