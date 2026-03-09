function toast(msg, type="ok"){
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(()=> el.classList.add("show"));
  setTimeout(()=>{
    el.classList.remove("show");
    setTimeout(()=> el.remove(), 200);
  }, 2600);
}

function setLoading(btn, on){
  if(!btn) return;
  btn.disabled = !!on;
  btn.dataset.oldText ||= btn.textContent;
  btn.textContent = on ? "Aguarde..." : btn.dataset.oldText;
}
window.toast = toast; window.setLoading = setLoading;
