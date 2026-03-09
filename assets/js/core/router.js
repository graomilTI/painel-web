const Router = (() => {
  const routes = {};
  let current = null;

  function register(path, mod){ routes[path] = mod; }

  async function go(path){
    if (!path) path = "#/programacao";
    if (!path.startsWith("#")) path = `#${path}`;
    location.hash = path;
  }

  async function render(){
    const root = document.getElementById("view");
    const hash = location.hash || "#/programacao";
    const key = hash.split("?")[0];
    const mod = routes[key] || routes["#/programacao"];

    if (current && current.unmount) {
      try{ current.unmount(); }catch(e){}
    }

    root.innerHTML = "";
    current = mod;
    if (mod && mod.mount) {
      await mod.mount(root);
    }

    document.querySelectorAll("[data-nav]").forEach(a => {
      a.classList.toggle("active", a.getAttribute("href") === (location.hash || "#/programacao"));
    });
  }

  function init(){
    window.addEventListener("hashchange", render);
    render();
  }

  return { register, init, go };
})();
window.Router = Router;
