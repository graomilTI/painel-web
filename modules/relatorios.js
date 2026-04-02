
(function(){
  function el(tag,cls,html){
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(html)e.innerHTML=html;
    return e;
  }

  function renderTabs(container,tabs){
    const nav=el("div","top-tabs");
    const body=el("div");

    function draw(tab){
      body.innerHTML="";
      body.appendChild(el("div","card",`<h3>${tab}</h3>`));
    }

    tabs.forEach(t=>{
      const b=el("button","tab-btn",t);
      b.onclick=()=>draw(t);
      nav.appendChild(b);
    });

    container.appendChild(nav);
    container.appendChild(body);
    draw(tabs[0]);
  }

  window.RELATORIOS={
    openHome(container,opts={}){
      container.innerHTML="";
      const section=opts.section||"Colaboradores";

      if(section==="Produção"){
        renderTabs(container,["Importar","Consultar","Efetivos sem Produção"]);
      }else{
        renderTabs(container,["Importar","Consultar","Histórico"]);
      }
    }
  }
})();
