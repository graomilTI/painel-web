const supabase = window.supabaseClient;

async function processarDia() {
  const data = document.getElementById("dataReferencia").value;

  if (!data) {
    alert("Selecione a data");
    return;
  }

  try {
    // 1. Buscar colaboradores ativos no dia
    const { data: colaboradores, error: errColab } = await supabase
      .from("colaboradores_snapshot")
      .select("*")
      .eq("data_referencia", data)
      .eq("situacao", "Ativo");

    if (errColab) throw errColab;

    // 2. Buscar produção do dia
    const { data: producao, error: errProd } = await supabase
      .from("producao_snapshot")
      .select("*")
      .eq("data_referencia", data);

    if (errProd) throw errProd;

    // 3. Mapear quem produziu
    const produziuSet = new Set(
      producao.map(p => (p.funcionario || "").trim().toUpperCase())
    );

    // 4. Filtrar quem NÃO produziu
    const semProducao = colaboradores.filter(c => {
      const nome = (c.nome || "").trim().toUpperCase();
      return !produziuSet.has(nome);
    });

    // 5. Salvar no banco
    const registros = semProducao.map(c => ({
      data_referencia: data,
      colaborador: c.nome,
      coordenacao: c.coordenacao,
      supervisao: c.supervisao,
      cargo: c.cargo,
      tipo: c.tipo,
      motivo: "Sem produção no dia"
    }));

    if (registros.length > 0) {
      await supabase.from("efetivos_sem_producao").insert(registros);
    }

    // 6. Exibir resultado
    document.getElementById("resultado").innerText =
      `Total sem produção: ${registros.length}`;

  } catch (err) {
    console.error(err);
    alert("Erro ao processar");
  }
}
