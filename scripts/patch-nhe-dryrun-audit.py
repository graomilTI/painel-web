from pathlib import Path

p = Path('agentes-grm-sync/grm-sync-lancar-nhe.js')
s = p.read_text(encoding='utf-8')

old = """            if (dryRun) {\n              stats.sucesso++;\n              await salvarResultado(candidato, { status: 'DRY_RUN_OK', lancado_em: new Date().toISOString() });\n              log('SUCCESS', 'O.S. ' + candidato.os + ': NHE validado (dry-run).');\n              continue;\n            }\n"""
new = """            if (dryRun) {\n              await salvarResultado(candidato, { status: 'DRY_RUN_OK', lancado_em: null, erro: null });\n              log('SUCCESS', 'O.S. ' + candidato.os + ': NHE validado (dry-run).');\n              continue;\n            }\n"""

if s.count(old) != 1:
    raise SystemExit('anchor dry-run nao encontrado exatamente uma vez')

s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')
