// Peças de tela compartilhadas pelos módulos da fila v3 (ADM).

// Colaboradores marcados na fila (caixinhas); sem nenhum marcado, vale só o da linha clicada.
export function idsMarcadosNaFila(fallback) {
  const ids = [...document.querySelectorAll('[data-v3-select]:checked')].map((el) => el.dataset.v3Select);
  return ids.length ? ids : [fallback];
}

// Pergunta um ou mais textos num modal (no lugar do window.prompt, que o navegador bloqueia e não valida).
// campos: [{ rotulo, obrigatorio, aviso, linhas, tipo, dica }] (aviso = texto do erro quando o obrigatório vem vazio). Resolve com a lista de valores digitados (na ordem dos campos),
// ou com null se o ADM cancelar. O modal se fecha sozinho nos dois casos.
export function pedirCampos({ modalRoot, esc }, { eyebrow, titulo, campos, textoOk = 'Confirmar' }) {
  return new Promise((resolve) => {
    const root = modalRoot();
    root.innerHTML = `<div class="ah-overlay"><form class="ah-modal" data-v3-dialogo><header><div><span class="ah-eyebrow">${esc(eyebrow)}</span><h2>${esc(titulo)}</h2></div><button type="button" class="ah-x" data-v3-campo-cancelar>×</button></header>
      <div class="ah-body">${campos.map((c) => `<div class="ds-field"><label>${esc(c.rotulo)}${c.obrigatorio ? ' *' : ''}</label>${c.linhas
        ? `<textarea data-v3-campo rows="${Number(c.linhas)}" placeholder="${esc(c.dica || '')}"></textarea>`
        : `<input data-v3-campo type="${esc(c.tipo || 'text')}" placeholder="${esc(c.dica || '')}">`}</div>`).join('')}
      <p class="ah-error" data-v3-dialogo-erro></p></div>
      <footer><button type="button" class="btn btn-secondary" data-v3-campo-cancelar>Cancelar</button><button type="submit" class="btn btn-primary" data-v3-campo-ok>${esc(textoOk)}</button></footer></form></div>`;
    const campo = [...root.querySelectorAll('[data-v3-campo]')];
    campo[0]?.focus();
    const encerrar = (valor) => { root.innerHTML = ''; resolve(valor); };
    root.querySelectorAll('[data-v3-campo-cancelar]').forEach((b) => { b.onclick = () => encerrar(null); });
    root.querySelector('[data-v3-dialogo]').onsubmit = (e) => {
      e.preventDefault();
      const valores = campo.map((c) => c.value.trim());
      const falta = campos.findIndex((c, i) => c.obrigatorio && !valores[i]);
      if (falta >= 0) {
        root.querySelector('[data-v3-dialogo-erro]').textContent = campos[falta].aviso || `Informe ${campos[falta].rotulo.toLowerCase()}.`;
        campo[falta].focus();
        return;
      }
      encerrar(valores);
    };
  });
}
