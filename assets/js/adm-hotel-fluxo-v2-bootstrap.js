// Evita que o observador de montagem do complemento de Hospedagem continue
// recarregando os dados depois que o novo shell já foi inserido. Observadores
// específicos das tabelas continuam funcionando normalmente.
const NativeMutationObserver = window.MutationObserver;

window.MutationObserver = class HospedagemMutationObserver extends NativeMutationObserver {
  observe(target, options) {
    this.__hospedagemRootObserver = target === document.documentElement && Boolean(options?.subtree);
    return super.observe(target, options);
  }

  constructor(callback) {
    super((records, observer) => {
      if (observer.__hospedagemRootObserver && document.getElementById('hospV2Kpis')) {
        observer.disconnect();
        return;
      }
      callback(records, observer);
    });
  }
};

setTimeout(() => {
  if (window.MutationObserver.name === 'HospedagemMutationObserver') {
    window.MutationObserver = NativeMutationObserver;
  }
}, 20000);
