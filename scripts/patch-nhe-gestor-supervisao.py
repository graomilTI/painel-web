from pathlib import Path

p = Path('agentes-grm-sync/grm-sync-lancar-nhe.js')
s = p.read_text(encoding='utf-8')

old = "  var supervisaoAlvo = (candidato.loginMatch && candidato.loginMatch.supervisao) || '';\n"
new = "  var supervisaoAlvo = candidato.viaGestor\n    ? (candidato.gestorSupervisao || '')\n    : ((candidato.loginMatch && candidato.loginMatch.supervisao) || '');\n"

if s.count(old) != 1:
    raise SystemExit('anchor supervisaoAlvo nao encontrado exatamente uma vez')

s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')
