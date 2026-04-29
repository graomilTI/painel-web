document.addEventListener("DOMContentLoaded", async () => {
  try {
    await carregarDRE();
  } catch (err) {
    console.error("Erro ao carregar DRE automático:", err);
  }
});

document.getElementById("btnProcessarDRE")?.addEventListener("click", async () => {
  await carregarDRE();
});

async function carregarDRE() {
  console.log("Carregando DRE automaticamente...");
  // 👉 manter sua lógica existente aqui
}
