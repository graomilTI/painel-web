const colaboradores = [
  {nome:"João Silva"},
  {nome:"Maria Souza"}
];

const alojamentos = ["Alojamento 1", "Alojamento 2"];

function render(){
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";

  colaboradores.forEach((c, i)=>{
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${c.nome}</td>
      <td>
        <select onchange="toggleStatus(this, ${i})">
          <option>DISPONÍVEL</option>
          <option>ATESTADO</option>
          <option>FÉRIAS</option>
          <option>FOLGA</option>
          <option>FALTA</option>
          <option>TRANSFERIR</option>
          <option>INATIVO</option>
        </select>
      </td>
      <td><input type="checkbox"></td>
      <td><input type="checkbox"></td>
      <td><input type="checkbox"></td>
      <td>
        <select>
          <option>MOTORISTA FROTA</option>
          <option>CARONA FROTA</option>
          <option>UBER/TÁXI</option>
          <option>REEMBOLSO KM</option>
        </select>
      </td>
      <td><button onclick="toggleExtra(${i})">+</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function toggleExtra(i){
  const tbody = document.getElementById("tbody");
  const existing = document.getElementById("extra-"+i);
  if(existing){ existing.remove(); return; }

  const tr = document.createElement("tr");
  tr.id = "extra-"+i;
  tr.className = "extra-row";

  tr.innerHTML = `
    <td colspan="7">
      Estadia:
      <select onchange="handleEstadia(this, ${i})" id="estadia-${i}">
        <option value="">Selecione</option>
        <option>CASA</option>
        <option>PERNOITE</option>
        <option>ALOJAMENTO</option>
        <option>HOTEL</option>
      </select>

      <span id="campos-${i}"></span>
    </td>
  `;
  tbody.insertBefore(tr, tbody.children[i+1]);
}

function handleEstadia(el, i){
  const container = document.getElementById("campos-"+i);
  const value = el.value;

  if(value === "HOTEL"){
    container.innerHTML = `
      Cidade/UF <input required>
      Check-in <input type="date" required>
      Checkout <input type="date" required>
      Chegada <input type="time" required>
    `;
  } else if(value === "ALOJAMENTO"){
    container.innerHTML = `
      Alojamento
      <select required>
        ${alojamentos.map(a=>`<option>${a}</option>`).join("")}
      </select>
    `;
  } else {
    container.innerHTML = "";
  }
}

render();
