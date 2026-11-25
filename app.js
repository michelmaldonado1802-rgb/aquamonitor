import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, updateDoc,
  onSnapshot, runTransaction, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDl1KaOZpygIN8f_dmPQq6iEziqOoOuJmQ",
  authDomain: "aquamonitor-3268a.firebaseapp.com",
  projectId: "aquamonitor-3268a",
  storageBucket: "aquamonitor-3268a.firebasestorage.app",
  messagingSenderId: "1091569468767",
  appId: "1:1091569468767:web:70ef2c0ea599ddae03a2ea"
};

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const counterRef = doc(db, "meta", "contador");

(function(){
  var ZONES=["Centro de Tonalá","Loma Dorada","Santa Paula","Coyula","Zalatitán","Basilio Vadillo"];
  var TYPES={turbia:"Agua turbia o con color",olor:"Mal olor o sabor",fuga:"Fuga en la vía pública",drenaje:"Drenaje desbordado",sinagua:"Sin servicio de agua"};
  var LIM={ph:[6.5,8.5],turb:[0,4],cl:[0.2,1.5]};
  var STATUS={nuevo:"Nuevo",atencion:"En atención",resuelto:"Resuelto"};
  var NEXT={nuevo:"atencion",atencion:"resuelto",resuelto:"nuevo"};
  var NEXTLABEL={nuevo:"Marcar en atención",atencion:"Marcar resuelto",resuelto:"Reabrir"};

  function daysAgo(n){var d=new Date();d.setDate(d.getDate()-n);return d.toISOString();}
  function sample(){return{
    seq:6,
    readings:{
      "Centro de Tonalá":{ph:7.4,turb:1.2,cl:0.8,date:daysAgo(1)},
      "Loma Dorada":{ph:7.1,turb:2.1,cl:0.5,date:daysAgo(2)},
      "Santa Paula":{ph:6.2,turb:5.8,cl:0.1,date:daysAgo(1)},
      "Coyula":{ph:7.8,turb:3.1,cl:1.1,date:daysAgo(3)},
      "Zalatitán":{ph:7.0,turb:4.6,cl:0.3,date:daysAgo(2)},
      "Basilio Vadillo":{ph:7.3,turb:1.8,cl:0.6,date:daysAgo(4)}
    },
    reports:[
      {id:1,zone:"Santa Paula",type:"turbia",place:"Calle Hidalgo esquina con Morelos",sev:"alta",desc:"El agua sale café desde el lunes en unas 20 casas. No se puede usar para cocinar.",status:"nuevo",date:daysAgo(1)},
      {id:2,zone:"Santa Paula",type:"drenaje",place:"Frente al mercado",sev:"alta",desc:"El drenaje se desborda cada vez que llueve y el agua corre hacia la calle principal.",status:"atencion",date:daysAgo(3)},
      {id:3,zone:"Zalatitán",type:"fuga",place:"Av. Zalatitán, a un costado de la parada",sev:"media",desc:"Fuga constante en la toma, ya se hizo un charco grande.",status:"nuevo",date:daysAgo(2)},
      {id:4,zone:"Loma Dorada",type:"sinagua",place:"Privada Las Flores",sev:"media",desc:"Sin agua desde la mañana. Los vecinos de la privada siguen sin servicio por la tarde.",status:"atencion",date:daysAgo(2)},
      {id:5,zone:"Coyula",type:"olor",place:"Calle Independencia",sev:"baja",desc:"El agua huele a cloro más fuerte de lo normal en la mañana.",status:"resuelto",date:daysAgo(6)},
      {id:6,zone:"Centro de Tonalá",type:"fuga",place:"Plaza principal",sev:"baja",desc:"Gotea una válvula junto a la banqueta.",status:"resuelto",date:daysAgo(8)}
    ]};}

  // Estado en memoria: se llena con lo que llega de Firestore
  var S={seq:0,readings:{},reports:[]};

  // ---------- Firestore ----------
  function seedBatch(batch,data){
    data.reports.forEach(function(r){batch.set(doc(db,"reportes",String(r.id)),r);});
    Object.keys(data.readings).forEach(function(z){batch.set(doc(db,"mediciones",z),data.readings[z]);});
    batch.set(counterRef,{seq:data.seq});
  }

  async function seedIfEmpty(){
    try{
      var c=await getDoc(counterRef);
      if(!c.exists()){
        var b=writeBatch(db);
        seedBatch(b,sample());
        await b.commit();
      }
    }catch(e){console.error(e);toast("No se pudo conectar con la base de datos");}
  }

  function listen(){
    onSnapshot(collection(db,"reportes"),function(snap){
      S.reports=snap.docs.map(function(d){return Object.assign({},d.data(),{id:Number(d.id)});});
      renderZones();renderList();
    },function(e){console.error(e);toast("Error al leer los reportes");});

    onSnapshot(collection(db,"mediciones"),function(snap){
      var r={};snap.forEach(function(d){r[d.id]=d.data();});
      S.readings=r;renderZones();
    },function(e){console.error(e);toast("Error al leer las mediciones");});
  }

  // ---------- Utilidades ----------
  function $(id){return document.getElementById(id);}
  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  function fdate(iso){try{return new Date(iso).toLocaleDateString("es-MX",{day:"numeric",month:"short"});}catch(e){return "";}}
  function out(k,v){return v<LIM[k][0]||v>LIM[k][1];}

  function zoneInfo(z){
    var r=S.readings[z],bad=0;
    if(r){["ph","turb","cl"].forEach(function(k){if(out(k,r[k]))bad++;});}
    var open=S.reports.filter(function(x){return x.zone===z&&x.status!=="resuelto";});
    var highOpen=open.filter(function(x){return x.sev==="alta";}).length;
    var s="ok";
    if(bad>=2||highOpen>=2||(bad>=1&&highOpen>=1))s="crit";
    else if(bad>=1||open.length>0)s="warn";
    return{r:r,bad:bad,open:open.length,s:s};
  }
  var SLABEL={ok:"Dentro de rango",warn:"Atención",crit:"Crítica"};

  function renderZones(){
    var box=$("zones");box.textContent="";
    ZONES.forEach(function(z){
      var i=zoneInfo(z);
      var b=el("button","zone");b.type="button";b.setAttribute("data-s",i.s);
      b.setAttribute("aria-label",z+", "+SLABEL[i.s]+", "+i.open+" reportes abiertos. Ver reportes");
      var t=el("div","zt");t.appendChild(el("strong",null,z));t.appendChild(el("span","pill "+i.s,SLABEL[i.s]));b.appendChild(t);
      var m=el("div","meas");
      [["pH","ph",1],["Turbidez","turb",1],["Cloro","cl",2]].forEach(function(c){
        var d=el("div");d.appendChild(el("span",null,c[0]));
        var v=el("b",i.r&&out(c[1],i.r[c[1]])?"bad":null,i.r?i.r[c[1]].toFixed(c[2]):"—");d.appendChild(v);m.appendChild(d);
      });
      b.appendChild(m);
      var f=el("div","zf");
      f.appendChild(el("span",null,i.open+(i.open===1?" reporte abierto":" reportes abiertos")));
      f.appendChild(el("span",null,i.r?"Medido "+fdate(i.r.date):"Sin mediciones"));
      b.appendChild(f);
      b.addEventListener("click",function(){$("fZone").value=z;$("fType").value="";$("fStatus").value="";show("reportes");renderList();});
      box.appendChild(b);
    });
    var openAll=S.reports.filter(function(x){return x.status!=="resuelto";}).length;
    $("openCount").textContent=openAll?"("+openAll+")":"";
  }

  function renderList(){
    var z=$("fZone").value,t=$("fType").value,s=$("fStatus").value;
    var items=S.reports.filter(function(x){return(!z||x.zone===z)&&(!t||x.type===t)&&(!s||x.status===s);})
      .sort(function(a,b){return new Date(b.date)-new Date(a.date);});
    var box=$("list");box.textContent="";
    if(!items.length){box.appendChild(el("div","empty","No hay reportes con estos filtros."));return;}
    items.forEach(function(x){
      var c=el("article","rep");
      var h=el("div","rh");
      h.appendChild(el("span","folio","AQM-"+String(x.id).padStart(4,"0")));
      h.appendChild(el("span","pill "+x.status,STATUS[x.status]));
      h.appendChild(el("span","folio","Gravedad "+x.sev));
      c.appendChild(h);
      c.appendChild(el("h3",null,TYPES[x.type]+" · "+x.zone));
      if(x.place)c.appendChild(el("p",null,x.place));
      c.appendChild(el("p",null,x.desc));
      var f=el("div","rf");f.appendChild(el("span",null,"Enviado el "+fdate(x.date)));
      var b=el("button","btn ghost",NEXTLABEL[x.status]);b.type="button";
      b.addEventListener("click",async function(){
        try{
          await updateDoc(doc(db,"reportes",String(x.id)),{status:NEXT[x.status]});
        }catch(e){console.error(e);toast("No se pudo cambiar el estado");}
      });
      f.appendChild(b);c.appendChild(f);
      box.appendChild(c);
    });
  }

  function fillSelects(){
    function opts(sel,first,pairs){sel.textContent="";if(first!=null){var o=el("option",null,first);o.value="";sel.appendChild(o);}pairs.forEach(function(p){var o=el("option",null,p[1]);o.value=p[0];sel.appendChild(o);});}
    var zp=ZONES.map(function(z){return[z,z];});
    var tp=Object.keys(TYPES).map(function(k){return[k,TYPES[k]];});
    opts($("mZone"),null,zp);opts($("rZone"),"Elige una zona",zp);opts($("rType"),"Elige un tipo",tp);
    opts($("fZone"),"Todas",zp);opts($("fType"),"Todos",tp);
    $("limits").textContent="";
    [["pH","6.5 a 8.5"],["Turbidez","hasta 4 UTN"],["Cloro residual libre","0.2 a 1.5 mg/L"]].forEach(function(l){
      var s=el("span",null,l[0]+": ");s.appendChild(el("b",null,l[1]));$("limits").appendChild(s);});
  }

  var VIEWS=["panel","reportar","reportes","acerca"];
  function show(v){
    if(VIEWS.indexOf(v)<0)v="panel";
    VIEWS.forEach(function(n){
      $("v-"+n).hidden=n!==v;
      $("t-"+n).setAttribute("aria-selected",n===v?"true":"false");
    });
    try{if(location.hash!=="#"+v)history.replaceState(null,"","#"+v);}catch(e){}
  }
  document.querySelector("nav").addEventListener("click",function(e){
    var b=e.target.closest("button[data-view]");if(b){show(b.getAttribute("data-view"));}
  });
  window.addEventListener("hashchange",function(){show(location.hash.slice(1));});

  var toastT;
  function toast(msg){var t=$("toast");t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){t.hidden=true;},2800);}

  // ---------- Enviar reporte ----------
  $("fRep").addEventListener("submit",async function(e){
    e.preventDefault();
    var z=$("rZone").value,t=$("rType").value,d=$("rDesc").value.trim(),p=$("rPlace").value.trim();
    var sev=document.querySelector('input[name="sev"]:checked').value;
    var err=$("rErr");
    if(!z){err.textContent="Elige la zona donde ocurre el problema.";$("rZone").focus();return;}
    if(!t){err.textContent="Elige el tipo de problema.";$("rType").focus();return;}
    if(d.length<10){err.textContent="Describe el problema con al menos 10 caracteres.";$("rDesc").focus();return;}
    err.textContent="";

    var folio;
    try{
      // El folio se incrementa dentro de una transacción para que no se repita
      folio=await runTransaction(db,async function(tx){
        var c=await tx.get(counterRef);
        var n=(c.exists()?c.data().seq:6)+1;
        tx.set(counterRef,{seq:n});
        tx.set(doc(db,"reportes",String(n)),{
          id:n,zone:z,type:t,place:p,sev:sev,desc:d,status:"nuevo",date:new Date().toISOString()
        });
        return n;
      });
    }catch(ex){
      console.error(ex);
      err.textContent="No se pudo enviar el reporte. Revisa tu conexión e inténtalo de nuevo.";
      return;
    }

    $("fRep").reset();
    $("fZone").value=z;$("fType").value="";$("fStatus").value="";
    renderList();show("reportes");
    toast("Reporte AQM-"+String(folio).padStart(4,"0")+" enviado");
  });

  // ---------- Guardar medición ----------
  $("fMeas").addEventListener("submit",async function(e){
    e.preventDefault();
    var z=$("mZone").value,ph=parseFloat($("mPh").value),tb=parseFloat($("mTurb").value),cl=parseFloat($("mCl").value),err=$("mErr");
    if(isNaN(ph)||isNaN(tb)||isNaN(cl)){err.textContent="Captura pH, turbidez y cloro residual.";return;}
    if(ph<0||ph>14){err.textContent="El pH debe estar entre 0 y 14.";return;}
    if(tb<0||cl<0){err.textContent="Turbidez y cloro no pueden ser negativos.";return;}
    err.textContent="";
    try{
      await setDoc(doc(db,"mediciones",z),{ph:ph,turb:tb,cl:cl,date:new Date().toISOString()});
    }catch(ex){
      console.error(ex);
      err.textContent="No se pudo guardar la medición. Revisa tu conexión.";
      return;
    }
    $("fMeas").reset();$("mZone").value=z;
    toast("Medición guardada en "+z);
  });

  ["fZone","fType","fStatus"].forEach(function(id){$(id).addEventListener("change",renderList);});

  // Restaurar datos de ejemplo (afecta a todos, porque la base de datos es compartida)
  $("resetData").addEventListener("click",async function(){
    try{
      var data=sample();
      var b=writeBatch(db);
      var keep={};data.reports.forEach(function(r){keep[r.id]=true;});
      S.reports.forEach(function(r){if(!keep[r.id])b.delete(doc(db,"reportes",String(r.id)));});
      seedBatch(b,data);
      await b.commit();
      toast("Datos de ejemplo restaurados");
    }catch(ex){console.error(ex);toast("No se pudieron restaurar los datos");}
  });

  fillSelects();renderZones();renderList();show(location.hash.slice(1));
  seedIfEmpty();
  listen();
})();