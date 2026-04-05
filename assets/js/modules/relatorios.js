(function(){
  function el(tag,cls,html){
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(html)e.innerHTML=html;
    return e;
  }

  function renderTabs(container,tabs,section){
    const nav=el("div","top-tabs");
    const body=el("div");

    function draw(tab){
      body.innerHTML="";
      const card=el("div","card");
      card.innerHTML=`
        <h3>${section} · ${tab}</h3>
        <p style="margin:8px 0 0;color:#94a3b8;line-height:1.6">
          ${section === 'Patrimônios' && tab === 'Importar'
            ? 'Upload diário da planilha de patrimônios para alimentar o banco do painel.'
            : 'Área preparada para a evolução do módulo dentro de Relatórios.'}
        </p>
      `;
      body.appendChild(card);
    }

    tabs.forEach((t,index)=>{
      const b=el("button","tab-btn",t);
      if(index===0)b.classList.add('active');
      b.onclick=()=>{
        [...nav.querySelectorAll('.tab-btn')].forEach(btn=>btn.classList.remove('active'));
        b.classList.add('active');
        draw(t);
      };
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
        renderTabs(container,["Importar","Consultar","Efetivos sem Produção"],section);
      }else if(section==="Patrimônios"){
        renderTabs(container,["Importar"],section);
      }else{
        renderTabs(container,["Importar","Consultar","Histórico"],section);
      }
    }
  }
})();
