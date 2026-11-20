"use strict";
/* =====================================================================
   bodycam-proc : monde procédural (aucun asset), path tracing progressif
   en WebGL2 avec reprojection temporelle, puis simulation d'un capteur
   de caméra-piéton à l'affichage. Voir docs/ pour les principes.
   ===================================================================== */

const VS = __SHADER_VS__;
const FS_PT = __SHADER_FS_PT__;
const FS_DOWN = __SHADER_FS_DOWN__;
const FS_EXPO = __SHADER_FS_EXPO__;
const FS_BLUR = __SHADER_FS_BLUR__;
const FS_CAM = __SHADER_FS_CAM__;
const VS_V2PTS = __SHADER_VS_V2PTS__, FS_V2PTS = __SHADER_FS_V2PTS__, FS_V2CIEL = __SHADER_FS_V2CIEL__, FS_V2TROUS = __SHADER_FS_V2TROUS__;
const VS_V3GRAINS = __SHADER_VS_V3GRAINS__, VS_V3SOL = __SHADER_VS_V3SOL__, FS_V3GBUF = __SHADER_FS_V3GBUF__, FS_V3OMBRAGE = __SHADER_FS_V3OMBRAGE__, FS_V3TAPIS = __SHADER_FS_V3TAPIS__, FS_V3SONDE = __SHADER_FS_V3SONDE__, VS_V3PROCHES = __SHADER_VS_V3PROCHES__, FS_V3PROCHES = __SHADER_FS_V3PROCHES__;
const FICHES = __SCENES__;                      // fiches de lieu embarquées (scenes/*.json)

const $ = id => document.getElementById(id);
const canvas = $("view");
const CFG = Object.assign({}, window.__CFG || {});   // réglages de test injectés par tools/shot.mjs
// Sur le téléphone, les mêmes réglages s'écrivent après # dans l'adresse : page.html#v3&v3tapis=0&v3damier=0
try{ for(const kv of location.hash.slice(1).split("&")){ if(!kv) continue; const i=kv.indexOf("="), k=decodeURIComponent(i<0?kv:kv.slice(0,i)), v=i<0?"true":decodeURIComponent(kv.slice(i+1));
  if(/^[A-Za-z0-9_]{1,24}$/.test(k)&&!(k in CFG)){ let x=v; try{ x=JSON.parse(v); }catch(_){} CFG[k]=x; } } }catch(_){}   // 0 vaut « non »
/* Optimisations du moteur v3 en qualité mobile (docs/moteur-v3.md, « Vers 30 images par seconde »), modifiables pendant la
   marche par le bouton Mesurer pour les comparer : undefined = choix automatique (mobile oui, complète non). */
const OPT={ tapis:CFG.v3tapis, damier:CFG.v3damier, sondeSync:true, expoSync:!!CFG.expoSync, v3sync:!!CFG.v3sync, capteur4:!!CFG.capteur4 };
function fail(msg){ const e=$("err"); e.style.display="flex"; e.style.userSelect="text"; e.style.webkitUserSelect="text"; e.textContent=msg+(typeof diag==="function"&&typeof gl!=="undefined"&&gl?diag():""); throw new Error(msg); }

/* ------------------------------------------------------------------ WebGL */
const gl = canvas.getContext("webgl2",{antialias:false,alpha:false,depth:false,stencil:false,powerPreference:"high-performance"});
/* Diagnostic : les dernières étapes graphiques (compilations, premières passes), affichées si le contexte tombe ou si un
   programme ne se lie pas. Sans cela, impossible de savoir d'ici ce qui casse sur une machine qu'on n'a pas sous la main. */
const ETAPES=[]; const t00=performance.now(); var REG_RES=1;
function etapeGL(nom){ ETAPES.push(((performance.now()-t00)/1000).toFixed(1)+" s  "+nom); if(ETAPES.length>14) ETAPES.shift(); }
let CARTE="?";
function diag(){ const m=CARTE;
  let o=""; try{ if(typeof V3==="object"&&V3.on) o="\n"+ombDiag(); }catch(_){}
  return "\n\n— Diagnostic à copier —\nCarte : "+m+"\nÉcran : "+canvas.width+" × "+canvas.height+", qualité "+(typeof QUAL==="object"&&QUAL.full?"complète":"mobile")+o+"\nDernières étapes :\n"+ETAPES.join("\n"); }
canvas.addEventListener("webglcontextlost",e=>{ e.preventDefault(); const el=$("err"); el.style.display="flex"; el.style.userSelect="text"; el.style.webkitUserSelect="text";
  try{ localStorage.setItem("bodycam-chute",ETAPES[ETAPES.length-1]||""); }catch(_){}
  try{ if(typeof OMB==="object"){ OMB.mem=ECHELLE.auPlantage(OMB.mem,Date.now()); OMB.perdu=true; localStorage.setItem(ECHELLE.CLE_OMBRAGE,JSON.stringify(OMB.mem)); } }catch(_){}   // ce qui compilait est noté « interrompu »
  el.textContent="La carte graphique a abandonné (contexte WebGL perdu)."+diag(); });
try{ const d=gl&&gl.getExtension("WEBGL_debug_renderer_info"); if(d) CARTE=gl.getParameter(d.UNMASKED_RENDERER_WEBGL); }catch(_){}
if(!gl) fail("Ce navigateur ne propose pas WebGL2, nécessaire pour le rendu.\nEssaie avec une version récente de Chrome, Safari ou Firefox.");
if(!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float"))
  fail("Ce GPU ne sait pas dessiner dans une texture flottante, nécessaire pour accumuler la lumière.");

function sh(type,src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) fail("Erreur de compilation du shader :\n"+gl.getShaderInfoLog(s)); return s; }
function lancer(fs,vs=VS,nom){ const p=gl.createProgram(), v=gl.createShader(gl.VERTEX_SHADER), f=gl.createShader(gl.FRAGMENT_SHADER);   // compile sans attendre le résultat
  gl.shaderSource(v,vs); gl.compileShader(v); gl.shaderSource(f,fs); gl.compileShader(f);
  gl.attachShader(p,v); gl.attachShader(p,f); gl.linkProgram(p);
  const x={p,v,f,nom:nom||"programme",t0:performance.now()}; COMP.envol.push(x); COMP.dernier=COMP.img; COMP.lances++; etapeGL("lancé : "+x.nom); return x; }
function finir(x){
  if(!gl.getProgramParameter(x.p,gl.LINK_STATUS)){
    for(const s of [x.v,x.f]) if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) fail("Erreur de compilation du shader :\n"+gl.getShaderInfoLog(s));
    fail("Erreur de liaison du shader :\n"+gl.getProgramInfoLog(x.p)); }
  const p=x.p, u={}; const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){ const a=gl.getActiveUniform(p,i); u[a.name.replace("[0]","")]=gl.getUniformLocation(p,a.name); }
  compNote(x); p.__nom=x.nom; return {p,u}; }
const prog=(fs,vs=VS,nom)=>{ etapeGL("compilation : "+(nom||"programme")); const r=finir(lancer(fs,vs)); etapeGL("  compilé : "+(nom||"programme")); return r; };
/* Variantes fixes du même shader, choisies par #define. En rendu logiciel, le code présent coûte à chaque pas de rayon même
   quand il ne s'exécute pas : la forêt garde un programme sans semis, un monde nu un programme sans arbres. Chaque variante se
   compile une fois (en tâche de fond si le navigateur le permet), à la première fiche qui la demande : jamais de code généré par monde.
   Variante 0 : forêt et dunes (le shader d'origine). 1 : avec semis. 2 : monde nu (sans arbres ni canopée). 3 : monde nu avec semis.
   + 4 : bosses et buttes du relief (RELIEF, monde.glsl). */
const variante=v=>v?FS_PT.replace("\n","\n#define SEMIS "+(v&1)+"\n#define NU "+((v>>1)&1)+"\n#define RELIEF "+((v>>2)&1)+"\n"):FS_PT;
const parallele=!!gl.getExtension("KHR_parallel_shader_compile");
const EXTP=gl.getExtension("KHR_parallel_shader_compile");
const fini=x=>!EXTP||gl.getProgramParameter(x.p,EXTP.COMPLETION_STATUS_KHR);
/* Lancement sans gel (docs/moteur-v3.md, « Lancement sans gel »). Le processus graphique de Chrome est partagé par toute
   l'application qui contient la page (vue web embarquée) : une compilation longue, ou plusieurs à la fois, la figent tout
   entière. Donc une seule compilation en vol, au moins une image entre deux lancements, jamais d'interrogation d'un
   programme (LINK_STATUS, uniformes) avant COMPLETION_STATUS_KHR, et les gros programmes (ombrage, tapis, lanceur de rayons)
   attendent une pause dans la frappe. Ordre : capteur et halo, semeur, socle, formes, variante complète. COMP.journal garde
   la durée de chaque compilation (diagnostic). Option compTout : tout lancer d'un coup, comme avant. */
const COMP={ envol:[], img:0, dernier:-1, frappe:-1e9, journal:[], lances:0 };
addEventListener("keydown",()=>{ COMP.frappe=performance.now(); },true);
function compNote(x){ if(x.note) return; x.note=true; const ms=performance.now()-x.t0; COMP.journal.push({nom:x.nom,ms,t:(x.t0-t00)/1000}); if(COMP.journal.length>24) COMP.journal.shift(); }
function compVol(){ COMP.envol=COMP.envol.filter(x=>{ if(x.note) return false; if(!fini(x)) return true; compNote(x); return false; }); return COMP.envol.length>0; }
/* Premier dessin de chaque programme. Sous Direct3D, ANGLE et le pilote peuvent finir le travail au premier dessin (variante du
   nuanceur de pixels selon les cibles, nuanceur de géométrie des points, compilation du pilote) : un gel qui ne se voit pas dans
   la durée de compilation. Chaque programme est marqué à sa première utilisation (useProgram) ; à la fin d'une image qui en
   contient, une attente de la puce (syncPuce, seulement ces images-là) chronomètre le tout (diagnostic, COMP.premiers). */
COMP.froids=[]; COMP.premiers=[]; COMP.gels=[];
/* Gels : tout intervalle de plus de 250 ms entre deux images (page visible), ouverture comprise, avec ce qui compilait ou
   faisait son premier dessin à ce moment-là. Dit, sur la vraie machine, si une compilation « en parallèle » fige quand même
   la page (diagnostic et banc d'essai). */
function gelNote(now,d){
  if(!(d>250)||document.hidden||!COMP.vu) { COMP.vu=!document.hidden; return; }
  const vol=COMP.envol.filter(x=>!x.note).map(x=>x.nom), fr=COMP.dernPrem&&now-COMP.dernPrem.t<d+50?COMP.dernPrem.noms:"";
  COMP.gels.push({t:(now-t00)/1000,ms:d,quoi:(vol.length?"compile : "+vol.join(", "):"")+(fr?(vol.length?" ; ":"")+"1er dessin : "+fr:"")+(ouvRepos?" (ouverture)":"")});
  if(COMP.gels.length>10) COMP.gels.splice(COMP.gels.reduce((m,g,i,a)=>g.ms<a[m].ms?i:m,0),1);   // on garde les dix plus longs
}
const gelsTexte=()=>COMP.gels.length?COMP.gels.map(g=>g.t.toFixed(0)+" s : "+(g.ms/1000).toFixed(1)+" s"+(g.quoi?" ("+g.quoi+")":"")).join(" · "):"aucun (> 250 ms)";
const BANC={ on:false, v:null, vi:-1, rec:null, tFin:0 };       // banc d'essai (balade.banc, « Plus » → « Banc d'essai ») : variante en cours, mesures
{ const use=gl.useProgram.bind(gl); gl.useProgram=p=>{ if(p&&p.__nom&&!p.__chaud){ p.__chaud=true; COMP.froids.push(p.__nom); } use(p); }; }
/* Attente vraie du processus graphique : lecture d'un pixel d'une petite cible (Chrome traite d'abord tous les ordres en file,
   compilations paresseuses du premier dessin comprises). gl.finish ne suffit pas partout. */
let SYNC=null; const SYNC_B=new Uint8Array(4);
function syncPuce(){ if(!SYNC) SYNC=target(1,1,gl.RGBA8,gl.NEAREST); gl.bindFramebuffer(gl.FRAMEBUFFER,SYNC.f); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,SYNC_B); gl.bindFramebuffer(gl.FRAMEBUFFER,null); }
function premiersDessins(){
  if(!COMP.froids.length) return;
  const t=performance.now(); syncPuce(); const ms=performance.now()-t;
  COMP.premiers.push({noms:COMP.froids.join(", "),ms,ouv:!!ouvRepos}); COMP.dernPrem={t:performance.now(),noms:COMP.froids.join(", ")}; if(COMP.premiers.length>12) COMP.premiers.shift();
  etapeGL("premier dessin ("+(ms/1000).toFixed(1)+" s"+(ouvRepos?", ouverture":"")+") : "+COMP.froids.join(", ")); COMP.froids=[];
}
function compLibre(gros){                                       // peut-on lancer une compilation maintenant ?
  if(CFG.compTout) return true;
  if(compVol()||COMP.img<=COMP.dernier) return false;
  return !(gros&&(performance.now()-COMP.frappe<900||(typeof frozen!=="undefined"&&frozen)||(!window.__CFG&&!ouvRepos&&!document.hasFocus())));   // le joueur tape, ou parle au porteur : pas de gros programme
}
/* Capteur, halo et exposition : petits, mais compilés eux aussi un à un, sans attendre (postPret, appelé à chaque image). */
let P_DOWN=null, P_BLUR=null, P_CAM=null, P_EXPO=null; const POST={};
function postPret(){
  if(P_CAM) return true;
  for(const [k,fs,nom] of [["cam",FS_CAM,"capteur"],["down",FS_DOWN,"halo (réduction)"],["blur",FS_BLUR,"halo (flou)"],["expo",FS_EXPO,"exposition"]]){
    const e=POST[k]||(POST[k]={});
    if(e.p) continue;
    if(!e.l){ if(compLibre(false)) e.l=lancer(fs,VS,nom); return false; }
    if(!fini(e.l)) return false;
    e.p=finir(e.l);
  }
  P_DOWN=POST.down.p; P_BLUR=POST.blur.p; P_EXPO=POST.expo.p; P_CAM=POST.cam.p; return true;
}
/* Le shader du lanceur de rayons est très gros. Sur certains ordinateurs (Chrome sous Windows) sa compilation échoue et emporte
   tout le contexte WebGL. On le compile donc sous surveillance : une marque est posée avant, retirée après. Si la page meurt
   entre les deux, le chargement suivant le sait (PT_KO) et ne réessaie pas : il démarre sur le moteur v3, qui n'en a pas besoin.
   Sur ordinateur, on ne le compile qu'à la demande. balade.reessayerRayons() efface la marque. */
const bureau=!matchMedia("(pointer:coarse)").matches && !CFG.mobile;
let PT_KO=false; try{ PT_KO=localStorage.getItem("bodycam-rayons-2")==="essai"; }catch(_){}
const progs=[null,null,null,null,null,null,null,null], lances=[];
const varCourante=()=>(S.semN?1:0)+(S.kit===2?2:0)+(S.relOn?4:0);
const ptDispo=()=>compilerPT(varCourante());                    // le lanceur de rayons peut-il dessiner le monde courant ? (le compile au besoin)
/* Compilation sans bloquer : quand le navigateur le permet, le programme se compile sur un fil à part et on revient voir
   à chaque image s'il est prêt. Attendre le résultat d'un coup fige le processus graphique ; sur un gros shader, Chrome
   sous Windows le croit planté et le tue (constaté : trois chutes, puis tout l'affichage 3D désactivé). */
function compilerPT(v,attendre){
  if(progs[v]) return true; if(PT_KO) return false;
  if(!lances[v]||!lances[v].marque){
    try{ localStorage.setItem("bodycam-rayons-2","essai"); }catch(_){}
    if(!lances[v]&&!attendre&&!compLibre(true)) return false;   // une compilation à la fois
    etapeGL("compilation : moteur à rayons, variante "+v);
    lances[v]=lances[v]||lancer(variante(v),VS,"lanceur de rayons "+v); lances[v].marque=true;
  }
  if(!attendre&&!fini(lances[v])) return false;                 // pas encore prêt : on repassera
  try{ progs[v]=finir(lances[v]); lances[v]=null; etapeGL("  compilé : moteur à rayons"); }
  catch(e){ PT_KO=true; const el=$("err"); if(!gl.isContextLost()){ el.style.display="none"; el.textContent=""; } return false; }
  try{ localStorage.removeItem("bodycam-rayons-2"); }catch(_){}
  return true;
}
const ptEnCours=()=>{ const l=lances[varCourante()]; return !!(l&&l.marque&&!progs[varCourante()]&&!PT_KO); };
function progMonde(){ if(!compilerPT(varCourante(),true)) throw new Error("lanceur de rayons indisponible"); return progs[varCourante()]; }   // le programme qui sait dessiner le monde courant
if(!bureau && !PT_KO && !CFG.v3) compilerPT(0);                 // téléphone : compilé d'emblée, comme avant (pas en v3 : il n'y sert pas)
if(parallele && !bureau) setTimeout(function essai3(){ if(V3.on||PT_KO||progs[3]||lances[3]) return; if(!compLibre(true)) return setTimeout(essai3,1000); lances[3]=lancer(variante(3),VS,"lanceur de rayons 3"); },4000);   // la plus probable pour un monde décrit
/* La sonde de collision peut avoir son propre petit programme (v3_sonde.frag : la distance au décor, map(), rien d'autre),
   qui se compile là où le lanceur de rayons ne se compile pas. Il n'est compilé qu'avec l'option v3sonde : le porteur ne
   bouge que sur ordre du récit. Sans lui ni lanceur de rayons, la sonde rend « rien » (aucun obstacle). */
const SONDE={lance:null,p:null};
function sondeProg(){                                           // moteur v3 (ou option v3sonde) : compilée au départ, sans bloquer
  if(SONDE.p&&SONDE.rel!==!!S.relOn){ SONDE.p=null; SONDE.lance=null; }   // bosses et buttes : une autre variante (RELIEF)
  if(SONDE.p) return SONDE.p; if(!CFG.v3sonde&&!(V3.on&&S.semN>0&&S.kit===2)) return null;   // forêt : troncs et blocs sont connus en JS (obstaclesConnus), on épargne ce gros programme à Direct3D ;   // en v3, le lanceur de rayons n'est pas compilé : la sonde garde le porteur hors des surfaces (§16)
  if(!SONDE.lance){ if(!compLibre(false)) return null; SONDE.rel=!!S.relOn; SONDE.lance=lancer(FS_V3SONDE.replace("\n","\n#define RELIEF "+(S.relOn?1:0)+"\n"),VS,"sonde de collision"); }
  if(!fini(SONDE.lance)) return null;
  SONDE.p=finir(SONDE.lance); SONDE.lance=null; etapeGL("  compilé : sonde de collision"); return SONDE.p;
}
const sondeDispo=()=>!!(sondeProg()||progs[varCourante()]);
gl.bindVertexArray(gl.createVertexArray());

function target(w,h,ifmt,filter){
  const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t); gl.texStorage2D(gl.TEXTURE_2D,1,ifmt,w,h);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const f=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,f); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
  return {t,f,w,h,ok:gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE};
}
function freeT(x){ if(x){ gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); } }
let ACC_FMT=gl.RGBA32F;
{ const probe=target(4,4,gl.RGBA32F,gl.NEAREST); if(!probe.ok) ACC_FMT=gl.RGBA16F; freeT(probe); }
const dummy=target(1,1,ACC_FMT,gl.NEAREST), probeT=target(4,1,gl.RGBA8,gl.NEAREST);
const expoT=[target(1,1,gl.RGBA16F,gl.NEAREST),target(1,1,gl.RGBA16F,gl.NEAREST)]; let expoI=0, expoQuand=0;
function draw(){ gl.drawArrays(gl.TRIANGLES,0,3); }
function bindTex(unit,t,loc){ gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,t); gl.uniform1i(loc,unit); }

/* ------------------------------------------------------------------ scène : ce que la fiche de lieu pilote */
const S={ can:[7,19], houp:[0,1.5,2.6,1], loin:[0,3,2,0], loinCol:[.2,.2,.21], loinBas:[.05,.07,.05], surf:[0,1,2,0], surfT:[3,4,5,6], surfP:[.45,.5], objN:0, kit:0,
  rel:[1,1,0,0], relB:[0,0,0,0], relC:[0,0,1,1], relS:[0,0], relOn:false, hp:new Float32Array(64), hpC:new Float32Array(36), hpOn:false, traj:[1,.85,.3,.5], creux:[.10,1.8,.4,0], terK:[.88,0], yTop:23, pente:.22, semN:0, semTop:[0,0,0,0], objTop:0, solAlb:[.24,.15,.07], lum:0, sunDir:[0,1,0], sun:[7,5.6,4.2], sky:[1,1,1], fog:.011, torch:0, kitP:[.62,1,1,1], eye:1.36, nuit:false, seed:[0,0,0], trou:[0,0,0,0], trou2:[0,0,0,0], depart:null };
let fiche=null, ficheIdx=0, seedN=4821, seed=[0,0,0], sceneDirty=true;
function setSeed(n){ seedN=n; seed=LUMIERE.graineVec(n); S.seed=seed; }
function applyAmbiance(a){
  const so=a.soleil||{azimut:-33,hauteur:21};
  S.nuit=so.hauteur<-1;
  const el=S.nuit?38:Math.max(2,so.hauteur), az=so.azimut*Math.PI/180, e=el*Math.PI/180;
  S.sunDir=[Math.sin(az)*Math.cos(e),Math.sin(e),Math.cos(az)*Math.cos(e)];
  S.atmo=[0,0,0,1]; S.atmoRebord=0;
  const at=a.atmosphere, bb=isObj(a.brume_basse)?a.brume_basse:null;
  if(S.nuit){ S.sun=[.020,.027,.042]; S.sky=[.005,.007,.012]; }       // clair de lune
  else if(at){                                                  // modèle atmosphère : voir soleilAtmo()
    const tr=clampN(isObj(at)?at.trouble:undefined,0,1,.35), so2=soleilAtmo(Math.max(-1,so.hauteur),tr);
    S.sun=so2.sun; S.sky=so2.sky; S.atmo[0]=1; S.atmo[1]=tr; S.atmoRebord=clampN(isObj(at)?at.rebord:undefined,0,2,1);
    if(a.meteo==="voile"){ S.sun=S.sun.map(v=>v*.22); S.sky=S.sky.map((v,i)=>v*[.92,.86,.78][i]); }
  }
  else {
    const k=Math.min(1,el/38), I=7*Math.min(1,.35+el/14);              // soleil bas : plus faible et plus chaud
    S.sun=[I,I*(.62+.33*k),I*(.30+.55*k)]; S.sky=[1,1,1];
    if(a.meteo==="voile"){ S.sun=S.sun.map(v=>v*.22); S.sky=[.92,.86,.78]; }
  }
  S.lum=S.nuit?1:so.hauteur<8?.35*(8-Math.max(0,so.hauteur))/8:0;   // fenêtres allumées : la nuit, un peu au crépuscule
  S.torch=(a.lampe!==undefined?a.lampe:S.nuit)?26:0;
  S.fog=a.brume!==undefined?a.brume:.011;
  if(S.atmo[0]&&bb){ S.atmo[2]=clampN(bb.densite,0,.2,.04); S.atmo[3]=clampN(bb.hauteur,.3,30,3); }   // brume basse : dense au sol, s'amincit avec la hauteur
  if(S.kit===0) S.kitP[3]=a.saison==="ete"?0:1;
  sceneDirty=true;
  if(fiche) v3Fiche();                                          // une lampe allumée en cours d'histoire : le v3 laisse la place
}
/* Modèle atmosphère (fiche : ambiance.atmosphere) : la couleur et la force du soleil suivent sa hauteur, par la masse d'air
   traversée (Kasten et Young) et une épaisseur optique par canal (Rayleigh + aérosols selon le trouble), adoucie de 30 % :
   la balance des blancs d'un téléphone en garde la chaleur sans la pousser au rouge. Le ciel s'assombrit quand le soleil
   descend, moins vite que le soleil lui-même : à l'aube, l'ombre est bleue et le soleil orangé. Aucune heure n'est réglée à
   part : 3°, 8°, 15° ou 40° ne diffèrent que par la hauteur. À 21°, la même lumière que l'ancien réglage, à quelques % près. */
function soleilAtmo(h,trouble){
  const e=Math.max(-.5,h), m=1/(Math.sin(e*Math.PI/180)+.50572*Math.pow(e+6.07995,-1.6364));
  const aer=.05+.16*trouble, tau=[.036+aer*.76,.097+aer,.235+aer*1.37].map(v=>v*.7);
  const lever=Math.min(1,Math.max(0,(h+.5)/2.5));                // disque qui sort de l'horizon
  const sun=tau.map(t=>8.6*Math.exp(-t*m)*lever);
  const k=.22+.78*Math.min(1,Math.max(0,h/32));                 // le ciel baisse avec le soleil, un peu moins vite (diffus / direct : 0,3 à 8°)
  return {sun,sky:[k,k,k]};
}
/* Kit : "foret" et "dunes" ont encore leurs arbres, rochers et canopée en dur ; "nu" n'a rien de prédéfini.
   Une fiche sans kit qui fournit ses semis est un monde nu. */
const kitDe=LUMIERE.kitDe;
/* Relief et trajet : la fiche règle les formules de terrainH et pathX (src/lumiere.js, reglerRelief). Sans réglage, la forêt d'origine à l'identique. */
function reglerRelief(f){ LUMIERE.reglerRelief(S,f,seedN); }
function applyFiche(f){
  if(f!==fiche){ montrerDit(""); errance=arrivee(); immobile=false; cam.elev=0; cam.pied=null; cam.perche=null; }                                   // nouveau lieu : il se promène à nouveau de lui-même
  if(meneurLibre&&f!==fiche) quitterLibre();                    // on change de lieu : la promenade libre repart de zéro
  fiche=f; setSeed(f.graine||4821);
  S.kit=kitDe(f);
  const fo=f.foret||{};
  S.kitP=LUMIERE.kitParams(f,S.kit);
  reglerRelief(f);
  const cone=fo.houppier==="cone";                               // conifères : un cône de feuillage par arbre au lieu de la voûte commune
  S.can=cone?[clampN(fo.houppier_bas,.3,8,1.6),19]:[7,19];
  S.houp=[cone?1:0,S.can[0],clampN(fo.houppier_rayon,.8,3.2,3),clampN(fo.perches,0,1,cone?.25:1)];
  const lo=isObj(f.lointain)?f.lointain:null, lh=lo?clampN(lo.hauteur,0,40,0):0;   // horizon : montagnes ou collines
  S.loin=[Math.tan(lh*Math.PI/180),.7+2.3*clampN(lo&&lo.decoupe,0,1,.5),lo&&lo.neige>0?1-clampN(lo.neige,0,1,0):2,lh>0?1:0];
  S.loinCol=couleur(lo&&lo.couleur||"#7b7a80"); S.loinBas=couleur(lo&&lo.couleur_bas||"#3d4a3a");
  S.eau=lo&&lo.eau?[...couleur(typeof lo.eau==="string"?lo.eau:"#2c4652"),1]:[0,0,0,0];   // mer, baie ou lac sous l'horizon
  S.eye=(f.camera&&f.camera.hauteur)||1.36;
  buildMats(f); reglerHouppiers(f); buildShapes(f);
  applyAmbiance(f.ambiance||{});
  if(f.ambiance&&f.ambiance.saison==="hiver") S.kitP[2]*=.15;
  LUMIERE.reglerTrouee(S,f,pathX);                               // foret.trouee : une bande sans arbres vers le soleil (troue, monde.glsl)
  cacheObj.clear(); (f.objets||[]).forEach(o=>{ if(o&&o.visible===false) cacheObj.add(o.id); });
  S.depart=departDe(f);                                          // parcours.depart : où il démarre (au soleil, à l'ombre)
  auDepart(); queue.length=0; tempsFaits.length=0;
  cacheObj.clear(); (f.objets||[]).forEach(o=>{ if(o&&o.visible===false) cacheObj.add(o.id); }); buildShapes(f);
  v3Fiche();
}

/* Le départ (fiche : parcours.depart) : { lumiere: "soleil" | "ombre" } cherche le long du trajet le point et le cap où le sol
   autour du porteur (2,5 m, devant et derrière) est au soleil (ou à l'ombre), libre d'obstacle, le soleil de trois quarts
   (LUMIERE.chercherDepart : relief, troncs, perches, blocs, houppiers, trouée). Calculé une fois par fiche. Sans ce champ (ou
   sans soleil) : le début du trajet, dans son axe, comme avant. */
function departDe(f){
  const d=isObj(f.parcours)&&isObj(f.parcours.depart)?f.parcours.depart:null, lu=d&&(d.lumiere==="soleil"||d.lumiere==="ombre")?d.lumiere:null;
  if(!lu||S.kit===1||S.nuit) return null;
  const t=performance.now(), r=LUMIERE.chercherDepart(MJ,{lumiere:lu});
  if(r) console.log("départ "+lu+" : z "+r.z.toFixed(1)+", écart "+(r.x-pathX(r.z)).toFixed(2)+" m, disque au soleil "+Math.round(r.part*100)+" % (min "+Math.round(r.min*100)+" %), soleil à "+r.soleil_deg+"° du regard, "+Math.round(performance.now()-t)+" ms");
  return r?{x:r.x,z:r.z,yaw:r.yaw,part:r.part,min:r.min,lumiere:lu}:null;
}
function auDepart(){
  const d=S.depart; cam.z=d?d.z:0; cam.x=d?d.x:S.kit!==1?pathX(0):0; cam.yaw=d?d.yaw:S.kit!==1?pathYaw(0):1.15; cam.pitch=-.03; look.yaw=0; look.pitch=0;
}
/* Houppiers (foret.houppiers) : un port par écorce (arbres a et b, perches a et b, même partage). Rien n'est une essence :
   la fiche dit où commence le houppier sur la hauteur du tronc, sa largeur, son profil, ses charpentières (nombre, montée,
   retombée), leurs rameaux, et les masses de feuillage au bout (taille, remplissage, taille des feuilles, couleurs). Rangé dans
   uHp et uHpC (monde.glsl, v3_grains.vert, variante HOUPPIER du moteur v3). Le lanceur de rayons ne les connaît pas : il garde
   les trois branches et la canopée d'avant ; dans le moteur v3, un tronc proche dessiné en boîte (v3_proches) montre le
   départ des trois premières charpentières. */
function portHoup(o,i,part){
  const r=i*16, c=i*9;
  if(!isObj(o)) return false;
  LUMIERE.portHoupNum(S.hp,o,i,part);                           // les nombres du port (src/lumiere.js : la lumière les lit aussi)
  const cs=(Array.isArray(o.couleurs)?o.couleurs:[]).filter(x=>typeof x==="string").slice(0,3);
  if(!cs.length) cs.push("#6b5a2a");
  for(let k=0;k<3;k++) S.hpC.set(couleur(cs[k%cs.length]),c+3*k);
  return true;
}
function reglerHouppiers(f){
  S.hp.fill(0); S.hpC.fill(0); S.hpOn=false;
  const h=kitDe(f)===0&&isObj(f.foret)&&isObj(f.foret.houppiers)?f.foret.houppiers:null; if(!h) return;
  let on=false; const fam=["arbres","perches"];
  for(let i=0;i<2;i++){ const g=isObj(h[fam[i]])?h[fam[i]]:{};
    S.hp[(2*i)*16+12]=S.surfP[i];                                // part de l'écorce a : le port suit l'écorce
    if(portHoup(g.a,2*i,S.surfP[i])) on=true;
    if(portHoup(g.b,2*i+1,S.surfP[i])) on=true; }
  S.hpOn=on;
}
/* Aire d'un houppier (bois et masses, m²), même estimation que aireHoup (v3_grains.vert) : partage du budget de grains. */
function aireHoupJS(e,r0){ const r=e*16; if(S.hp[r+11]<.5) return 0;
  return S.hp[r+4]*Math.PI*r0*.45*S.hp[r+2]*.85*(1+.16*S.hp[r+7])+S.hp[r+4]*(S.hp[r+7]+1)*8.9*S.hp[r+8]*S.hp[r+8]; }

/* Objets : la fiche les décrit en formes de base, on les range dans une texture de données lue par le shader. */
const FORMES={boite:0,boule:1,cylindre:2,cone:3,capsule:4,toit:5};
const dentsDe=fo=>Math.round(clampN(fo.dents,0,60,0));       // découpe en peigne le long de x (sdPrim, monde.glsl)
const MATIERES={mat:0,bois:1,pierre:2,metal:3,verre:4,pelage:5,tissu:5,tuile:6,lumineux:7};
const SEM0=72, SEM_L=10, SH_ROWS=SEM0+4*SEM_L, shapesData=new Float32Array(4*4*SH_ROWS), cacheObj=new Set();
// les mains du porteur (§17) : leur description est une donnée (src/modeles.json, « corps ») ; l'objet n'est pas dans la fiche
// (ni obstacle, ni perçu par le meneur), buildShapes le range après les objets quand elles sont dans le champ
const MAINS=typeof MODELES!=="undefined"&&MODELES&&MODELES.corps&&MODELES.corps.mains&&typeof MODELES.corps.mains==="object"?MODELES.corps.mains:null;
let mainsObj=null;
const shapesT=gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D,shapesT); gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,4,SH_ROWS);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
function couleur(c){                                           // "#rrggbb" ou [r,v,b] entre 0 et 1, converti en linéaire
  let v=[.4,.4,.4];
  if(typeof c==="string"&&/^#[0-9a-f]{6}$/i.test(c)) v=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255);
  else if(Array.isArray(c)&&c.length>=3) v=c.slice(0,3).map(x=>clampN(x,0,1,.4));
  return v.map(x=>Math.pow(x,2.2));
}
/* Le repère d'un objet de la fiche : position au sol, cap (radians), échelle. Le même pour buildShapes, les mains et le geste. */
function repereObjet(o){
  const dv=clampN(o.devant,-60,400,12), ct=clampN(o.cote,-120,120,3), ech=clampN(o.echelle,.1,5,1);
  let x,z,yaw;
  if(S.kit!==1){ z=dv; x=pathX(z)+ct; yaw=Math.atan2(pathX(z-4)-x,-4); }          // par défaut, la face avant regarde celui qui arrive
  else { const a=1.15; x=Math.sin(a)*dv+Math.cos(a)*ct; z=Math.cos(a)*dv-Math.sin(a)*ct; yaw=a+Math.PI; }
  if(o.cap!==undefined) yaw+=clampN(o.cap,-360,360,0)*Math.PI/180;
  return {x,z,y:terrainH(x,z),yaw,ech};
}
function versMonde(R,p){ const c=Math.cos(R.yaw), s=Math.sin(R.yaw); return [R.x+(c*p[0]+s*p[2])*R.ech, R.y+p[1]*R.ech, R.z+(-s*p[0]+c*p[2])*R.ech]; }
function versLocal(R,w){ const dx=w[0]-R.x, dz=w[2]-R.z, c=Math.cos(R.yaw), s=Math.sin(R.yaw); return [(c*dx-s*dz)/R.ech,(w[1]-R.y)/R.ech,(s*dx+c*dz)/R.ech]; }
function buildShapes(f,seulsGestes){                            // seulsGestes : les mains ou une chose façonnée bougent (rien de nouveau pour les obstacles)
  shapesData.fill(0); S.objN=0; S.objRows=0; S.objTop=0; S.vac=[]; S.mou=false; if(!seulsGestes) S.objVer=(S.objVer||0)+1; let row=8;
  // seuls les objets visibles prennent une des 8 places (le meneur compte de même : un accessoire caché ne coûte rien) ; les
  // mains du porteur (§17), quand elles sont dans le champ, prennent la dernière
  const vis=(Array.isArray(f.objets)?f.objets:[]).filter(o=>o&&!(o.visible===false||cacheObj.has(o.id)));
  const MO=mainsObj?(Array.isArray(mainsObj)?mainsObj:[mainsObj]):[];
  for(const o of [...vis.slice(0,8-MO.length),...MO]){
    // les creux (empreintes) après les autres formes : le lanceur de rayons les retranche de ce qui précède
    const formes=(Array.isArray(o.formes)?o.formes:[]).filter(x=>x&&FORMES[x.f]!==undefined).slice(0,24).sort((a,b)=>(a.creux>0?1:0)-(b.creux>0?1:0));
    if(!formes.length || row+formes.length>SEM0) continue;
    const R=repereObjet(o), {x,z,yaw,ech}=R;
    const y=R.y, c=Math.cos(yaw), sn=Math.sin(yaw), i=S.objN; let rad=.1;
    const mou=formes.some(fo=>fo.lisse>0||fo.creux>0||fo.bosse>0);
    formes.forEach((fo,k)=>{
      const p=(Array.isArray(fo.p)?fo.p:[0,0,0]).map(v=>clampN(v,-30,30,0)*ech);
      const t=(Array.isArray(fo.taille)?fo.taille:[1,1,1]).map(v=>clampN(v,.01,40,1)*ech*.5);
      const pe=Array.isArray(fo.penche)?fo.penche:[0,0], col=couleur(fo.couleur), r=(row+k)*16;
      ancrer(fo.f,p,t,pe,2);
      // objet mou (lisse, creux, bosse) : le creux s'écrit en lisse négatif ; la bosse dans la partie fractionnaire de la matière
      const cx=x+c*p[0]+sn*p[2], cz=z-sn*p[0]+c*p[2], ca=yaw+clampN(fo.cap,-360,360,0)*Math.PI/180, ar=clampN(fo.arrondi,0,.3,0)*ech;
      const li=fo.creux>0?-Math.max(.001,clampN(fo.creux,0,.5,0)*ech):clampN(fo.lisse,0,.5,0)*ech, bo=mou?clampN(fo.bosse,0,.4,0):0;
      shapesData.set([cx, y+p[1], cz, FORMES[fo.f]+8*dentsDe(fo),
                      t[0],t[1],t[2], ca,
                      col[0],col[1],col[2], (matIdx.has(fo.matiere)?16+matIdx.get(fo.matiere):MATIERES[fo.matiere]!==undefined?MATIERES[fo.matiere]:0)+bo,
                      li, ar, clampN(pe[0],-90,90,0)*Math.PI/180, clampN(pe[1],-90,90,0)*Math.PI/180], r);

      if(fo.vacille>0) S.vac.push([r,col[0],col[1],col[2],clampN(fo.vacille,0,1,0),k*1.7+i]);   // éclat qui tremble (flamme) : voir vaciller()
      rad=Math.max(rad,Math.hypot(p[0],p[1],p[2])+Math.hypot(t[0],t[1],t[2]));
    });
    shapesData.set([x,y,z,rad, row,formes.length, clampN(o.degage,0,12,0), (o.visible===false||cacheObj.has(o.id))?0:1], i*16);
    if(mou){ const kS=Math.max(0,...formes.map(fo=>clampN(fo.lisse,0,.5,0)*ech));
      shapesData.set([kS,kS,0,1], i*16+8);                          // objet mou : marge des boîtes (fondu, bourrelet), drapeau
      if(!(o.visible===false||cacheObj.has(o.id))) S.mou=true; }
    row+=formes.length; S.objN++; S.objRows=row-8;
    S.objTop=Math.max(S.objTop,y+rad-S.rel[2]*z);
  }
  packSemis(f);
  const terr=2.4*S.rel[0]+1+(S.relOn?1.2*S.relB[0]+S.relB[2]:0);   // au-dessus : plus rien, le rayon qui monte s'arrête
  S.yTop=Math.max(S.kit===0?23:5,terr+Math.max(S.objTop,...S.semTop));
  gl.bindTexture(gl.TEXTURE_2D,shapesT); gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,4,SH_ROWS,gl.RGBA,gl.FLOAT,shapesData);
  sceneDirty=true;
}
/* Une boîte posée au sol descend sous terre : sur une pente, sa base ne flotte pas (fondation, soubassement). */
function ancrer(f,p,t,pe,prof){
  if(f!=="boite"||pe[0]||pe[1]) return;
  const bas=p[1]-t[1], haut=p[1]+t[1];
  if(bas>.05||bas<-prof) return;
  t[1]=(haut+prof)/2; p[1]=(haut-prof)/2;
}
/* Semis : la fiche décrit un élément en formes (comme un objet), le moteur le répète sur une grille, un élément par cellule.
   Disposition dans uShapes : voir sdSemis dans monde.glsl. Le moteur borne la taille de l'élément pour qu'il reste dans sa cellule. */
const ORIENTS={aleatoire:0,trajet:1,fixe:2};
function packSemis(f){
  S.semN=0; S.semTop=[0,0,0,0];
  const L=(Array.isArray(f.semis)?f.semis:[]).filter(isObj).slice(0,4), M=.08, hw=S.traj[1];
  for(const c of L){
    const formes=(Array.isArray(c.formes)?c.formes:[]).filter(x=>x&&FORMES[x.f]!==undefined).slice(0,6);
    const dens=clampN(c.densite,0,1,.6);
    if(!formes.length||dens<=0) continue;
    const k=S.semN, r0=SEM0+k*SEM_L, tr=isObj(c.trajet)?c.trajet:{}, rg=tr.rangee===true;
    const cel=Array.isArray(c.cellule)?c.cellule:[c.cellule,c.cellule];
    const c0=clampN(cel[0],1.5,30,6), c1=clampN(cel[1]!==undefined?cel[1]:cel[0],1.5,30,c0);
    const C=rg?[c1,c0]:[c0,c1];                                  // rangée : [le long du trajet, en profondeur] ; grille libre : [x, z]
    const rot=clampN(c.rotation,-180,180,0)*Math.PI/180;
    const tmin=clampN(tr.min,0,200,hw+1), tmax=Math.max(tmin+.1,clampN(tr.max,0,400,rg?tmin+C[0]:400));
    const cote=tr.cote==="gauche"?-1:tr.cote==="droite"?1:0;
    const ori=ORIENTS[c.oriente]!==undefined?ORIENTS[c.oriente]:rg?1:0;
    const cap=clampN(c.cap,-360,360,0)*Math.PI/180, tourne=clampN(c.tourne,0,360,0)*Math.PI/180, pen=clampN(c.penche,0,25,0)*Math.PI/180;
    const pal=(Array.isArray(c.palette)?c.palette:[]).slice(0,8).map(couleur);
    // formes dans le repère de l'élément, et leur boîte englobante
    const mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
    formes.forEach((fo,j)=>{
      const p=(Array.isArray(fo.p)?fo.p:[0,0,0]).map(v=>clampN(v,-15,15,0));
      const t=(Array.isArray(fo.taille)?fo.taille:[1,1,1]).map(v=>clampN(v,.01,30,1)*.5);
      const pe=Array.isArray(fo.penche)?fo.penche:[0,0], fc=clampN(fo.cap,-360,360,0)*Math.PI/180, ar=clampN(fo.arrondi,0,.3,0);
      ancrer(fo.f,p,t,pe,3);
      const ca=Math.abs(Math.cos(fc)), sa=Math.abs(Math.sin(fc));
      let e=[t[0]*ca+t[2]*sa,fo.f==="capsule"?t[1]+t[0]:t[1],t[0]*sa+t[2]*ca];
      if(pe[0]||pe[1]){ const R=Math.hypot(...t)+(fo.f==="capsule"?t[0]:0); e=[R,R,R]; }
      for(let i=0;i<3;i++){ mn[i]=Math.min(mn[i],p[i]-e[i]-ar); mx[i]=Math.max(mx[i],p[i]+e[i]+ar); }
      const col=fo.couleur==="palette"&&pal.length?[-1,-1,-1]:couleur(fo.couleur);
      shapesData.set([p[0],p[1],p[2],FORMES[fo.f]+8*dentsDe(fo), t[0],t[1],t[2],fc,
                      col[0],col[1],col[2], matIdx.has(fo.matiere)?16+matIdx.get(fo.matiere):MATIERES[fo.matiere]!==undefined?MATIERES[fo.matiere]:0,
                      clampN(fo.lisse,0,.5,0), ar, clampN(pe[0],-90,90,0)*Math.PI/180, clampN(pe[1],-90,90,0)*Math.PI/180], (r0+4+j)*16);
    });
    // emprise dans les axes de la grille : selon l'orientation, l'élément peut tourner dans sa cellule
    const ex=Math.max(Math.abs(mn[0]),Math.abs(mx[0])), ez=Math.max(Math.abs(mn[2]),Math.abs(mx[2])), top=mx[1];
    const droit=a=>Math.abs(Math.sin(2*a))<1e-3;                  // multiple de 90°
    let gx, gz;
    if(ori===1&&(rg||(S.traj[0]===0&&droit(rot)))){ gx=ez; gz=ex; }
    else if(ori===2&&droit(cap)){ const sw=Math.abs(Math.sin(cap))>.5; gx=sw?ez:ex; gz=sw?ex:ez; }
    else if(ori===2){ const ca=Math.abs(Math.cos(cap)), sa=Math.abs(Math.sin(cap)); gx=ex*ca+ez*sa; gz=ex*sa+ez*ca; }
    else gx=gz=Math.hypot(ex,ez);
    if(tourne>0&&ori!==0){ const st=Math.sin(Math.min(tourne/2,Math.PI/2)); [gx,gz]=[gx+gz*st,gz+gx*st]; }
    const sy=Array.isArray(c.hauteur)?[clampN(c.hauteur[0],.3,3,1),clampN(c.hauteur[1],.3,3,1)]:[1,1];
    if(sy[1]<sy[0]) sy.reverse();
    gx+=top*sy[1]*Math.sin(pen); gz+=top*sy[1]*Math.sin(pen);
    let sc=Array.isArray(c.echelle)?[clampN(c.echelle[0],.2,4,1),clampN(c.echelle[1],.2,4,1)]:[1,1];
    if(sc[1]<sc[0]) sc.reverse();
    const ax=C[0]/2-M, az=C[1]/2-M, fit=Math.min(ax/Math.max(gx,1e-3),az/Math.max(gz,1e-3));
    if(sc[1]>fit){ const q=fit/sc[1]; sc=[sc[0]*q,sc[1]*q]; }       // l'élément doit rester dans sa cellule
    const des=clampN(c.desordre,0,1,1);
    const nR=rg?Math.max(1,Math.floor((tmax-tmin)/C[0]+1e-6)):0;
    const o=r0*16, gr=clampN(c.groupes,0,1,0), ge=clampN(c.groupes_echelle,5,400,40);
    shapesData.set([C[0],C[1],Math.cos(rot),Math.sin(rot), dens,gr,C[0]/ge,rg?1:0, tmin,tmax,cote,ori, cap,tourne,pen,clampN(c.teinte,0,1,0)],o);
    shapesData.set([Math.max(0,ax-gx*sc[1])*des,Math.max(0,az-gz*sc[1])*des,sc[0],sc[1], sy[0],sy[1],formes.length,nR,
                    (mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2,pal.length, (mx[0]-mn[0])/2,(mx[1]-mn[1])/2,(mx[2]-mn[2])/2,c.pose==="pente"?1:0],o+16);
    pal.forEach((cl,i)=>shapesData.set([cl[0],cl[1],cl[2],1],o+32+i*4));
    S.semTop[k]=top*sc[1]*sy[1]+S.pente*Math.hypot(C[0],C[1])/2+.3;
    S.semN++;
  }
}

/* Matières : des recettes, pas du code. La bibliothèque (src/matieres.json) et la fiche (champ "matieres") les décrivent ;
   on les range dans une texture de données lue par recette.glsl (fonction recette), une ligne par recette.
   Texels d'une ligne : 0 couleur, espace | 1 variation | 2 grain | 3-5 nuance et brillance | 6-11 motif | 12-16 palette
   | 17-32 quatre taches | 33-38 mousse | 39-40 salissure et relief | 41-44 deux bosses. */
const MAT_LIB=__MATIERES__;
const RT_W=48, RT_MAX=24, matData=new Float32Array(RT_W*RT_MAX*4);
const matT=gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D,matT); gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,RT_W,RT_MAX);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
const MOTIFS={aucun:0,feuilles:1,rides:2,fissures:3,planches:4,paves:5,fenetres:6,marquage:7};
let matVersion=0;
const matIdx=new Map();                                         // nom de recette -> ligne de la texture
const isObj=v=>v&&typeof v==="object"&&!Array.isArray(v);
function recettesDe(f){ return Object.assign({},MAT_LIB.recettes,isObj(f.matieres)?f.matieres:{}); }
function resoudre(nom,lib,depth=0){                              // "base" : la recette hérite d'une autre, champ par champ
  const r=lib[nom]; if(!isObj(r)) return null;
  if(typeof r.base!=="string"||depth>3||r.base===nom) return r;
  const b=resoudre(r.base,lib,depth+1); if(!b) return r;
  const o=Object.assign({},b);
  for(const [k,v] of Object.entries(r)) o[k]=isObj(v)&&isObj(b[k])?Object.assign({},b[k],v):v;
  return o;
}
function packRecette(r,row){
  const o=row*RT_W*4; matData.fill(0,o,o+RT_W*4);
  const put=(i,a)=>matData.set(a.map(x=>Number.isFinite(x)?x:0),o+i*4);
  const N=(v,a,b,d)=>clampN(v,a,b,d), Ob=v=>isObj(v)?v:{};
  const ech=(v,d)=>Array.isArray(v)?[0,1,2].map(i=>N(v[i],0,300,d)):(v=N(v,0,300,d),[v,v,v]);
  const seuils=(v,a,b)=>{ let s=Array.isArray(v)?[N(v[0],-2,3,a),N(v[1],-2,3,b)]:[a,b]; if(Math.abs(s[1]-s[0])<1e-3) s[1]=s[0]+1e-3; return s; };
  const opt=v=>Array.isArray(v)?seuils(v,0,1):[0,0];            // seuils facultatifs : absents = désactivés
  put(0,[...couleur(r.couleur),(r.espace==="volume"?1:0)+(r.couleur==="forme"?2:0)]);   // "forme" : la couleur de la forme qui porte la recette
  const va=Ob(r.variation), gr=Ob(r.grain), nu=Ob(r.nuance), mo=Ob(r.motif), re=Ob(r.relief), sa=Ob(r.salissure);
  put(1,[...ech(va.echelle,1),N(va.force,0,1.5,0)]);
  put(2,[...ech(gr.echelle,1),N(gr.force,0,1.5,0)]);
  if(r.nuance){ put(3,[...couleur(nu.couleur),N(nu.force,0,1,.5)]); put(4,[...ech(nu.echelle,1),nu.fbm?1:0]); }
  const ns=seuils(nu.seuils,.4,.7); put(5,[ns[0],ns[1],N(nu.decalage,-100,100,5),N(r.brillance,0,1,.05)]);
  const ty=MOTIFS[mo.type]||0;
  put(6,[ty,N(mo.opacite,0,1,1),N(mo.inclinaison,0,1,.5),N(re.motif,0,.05,0)]);
  put(7,[...ech(mo.echelle,ty===1?15:ty===2?26:ty===4?7:ty===5?5:ty>=6?1:[20,3,20]),N(mo.decalage,-100,100,0)]);
  if(mo.couleur!==undefined) put(8,[...couleur(mo.couleur),0]);
  if(ty===1){ put(9,[N(mo.deformation,0,.5,.12),N(mo.eclat,0,1.5,.5),N(mo.bord,0,1,.55),N(mo.recouvre,0,1,.8)]);
    put(10,[N(mo.couverture,0,1,1),N(mo.couverture_bruit,0,1,0),N(mo.taille,.05,mo.forme>0?1.2:1,1),N(mo.forme,0,1,0)]);   // forme > 0 : feuilles superposées (feuillesSup), largeur / longueur
    put(11,[N(mo.lobes,0,1,0),0,0,0]); }
  if(ty===2){ const mk=Ob(mo.masque), ms=seuils(mk.seuils,.25,.6);
    put(9,[N(mo.deformation,0,20,6),N(mk.echelle,0,5,.25),ms[0],ms[1]]); put(10,[N(mo.cap,-180,180,0)*Math.PI/180,0,0,0]); }
  if(ty===3){ const s=seuils(mo.seuils,.7,.97), fi=Ob(mo.fines), s2=seuils(fi.seuils,.8,.97);
    put(9,[s[0],s[1],N(mo.profondeur,0,1,.9),N(mo.assombrit,0,1,0)]);
    put(10,[s2[0],s2[1],mo.fines?N(fi.profondeur,0,1,.25):0,0]); put(11,[...ech(fi.echelle,[60,7,60]),N(fi.decalage,-100,100,4)]); }
  if(ty===4) put(9,[N(mo.joint,.005,.45,.08),N(mo.longueur,.2,20,2.4),N(mo.eclat,0,1.5,.5),mo.couchees?1:0]);
  if(ty===6){ const pas=N(mo.pas,.6,12,2.6), et=N(mo.etage,2,6,3), la=Math.min(N(mo.largeur,.2,10,1),pas-.15), ha=Math.min(N(mo.hauteur,.2,5,1.5),et-.2);
    put(9,[la,ha,pas,et]); put(10,[Math.min(N(mo.allege,0,3,.9),et-ha),N(mo.cadre,0,.4,.08),N(mo.rdc,0,8,0),N(mo.allumees,0,1,.4)]);
    put(11,[...couleur(mo.cadre_couleur||"#d8d4ca"),0]); put(12,[...couleur(mo.lumiere||"#ffc27a"),0]);
    if(mo.couleur===undefined) put(8,[...couleur("#20262c"),0]); }
  if(ty===7){ put(9,[N(mo.largeur,.05,.6,.14),N(mo.tiret,0,20,3),N(mo.intervalle,0,30,4.5),N(mo.bords,0,15,0)]);
    put(10,[{aucun:0,simple:1,double:2}[mo.axe]!==undefined?{aucun:0,simple:1,double:2}[mo.axe]:1,N(mo.passages,0,500,0),0,0]);
    if(mo.couleur===undefined) put(8,[...couleur("#c9c4b4"),0]); }
  if(ty===5) put(9,[N(mo.joint,.005,.45,.1),N(mo.decalage_rangs,0,1,.5),N(mo.eclat,0,1.5,.45),N(mo.bombe,0,2,.6)]);
  const pal=(Array.isArray(mo.palette)?mo.palette:[]).filter(isObj).slice(0,5);
  if(pal.length){ const tot=pal.reduce((s,p)=>s+N(p.part,0,1,.2),0)||1; let acc=0;
    for(let i=0;i<5;i++){ const p=pal[Math.min(i,pal.length-1)]; if(i<pal.length) acc+=N(p.part,0,1,.2)/tot; put(12+i,[...couleur(p.couleur),i>=pal.length-1?1.01:acc]); } }
  (Array.isArray(r.taches)?r.taches:[]).filter(isObj).slice(0,4).forEach((t,k)=>{
    const s=seuils(t.seuils,.5,.7), h=Array.isArray(t.hauteur)?[N(t.hauteur[0],-5,40,0),N(t.hauteur[1],-5,40,1)]:[0,1];
    if(h[0]===h[1]) h[1]+=.01;
    put(17+k*4,[...couleur(t.couleur),N(t.force,0,1,.5)]); put(18+k*4,[...ech(t.echelle,5),t.fbm?1:0]);
    put(19+k*4,[s[0],s[1],h[0],h[1]]); put(20+k*4,[N(t.biais,-2,2,0),N(t.creux,-1,1,0),N(t.decalage,-100,100,0),t.sous_motif?1:t.sur_motif?2:0]); });
  if(isObj(r.mousse)){ const m=r.mousse, s=seuils(m.seuils,.5,.7), g=Ob(m.grain);
    put(33,[...couleur(m.couleur||"#3a4927"),N(m.force,0,1,.8)]); put(34,[...ech(m.echelle,.5),m.fbm?1:0]);
    put(35,[s[0],s[1],N(m.decalage,-100,100,0),N(g.force,0,1.5,0)]);
    put(36,[...opt(m.dessus),N(m.pente_bruit,0,2,0),N(g.echelle,0,300,50)]);
    put(37,[...opt(m.cote),N(m.cote_force,0,1,1),N(m.adoucit,0,1,0)]);
    const hh=Array.isArray(m.hauteur)?[N(m.hauteur[0],-5,40,0),N(m.hauteur[1],-5,40,1)]:[0,0]; put(38,[hh[0],hh[1],N(m.pente_echelle,0,100,0),N(m.pente_decalage,-100,100,0)]); }
  const rg=Ob(re.grain);
  put(39,[N(sa.force,0,1,0),N(sa.hauteur,.01,10,.5),N(re.inclinaison,0,1,0),N(rg.force,0,.5,0)]);
  put(40,[N(rg.echelle,0,300,30),0,0,0]);
  (Array.isArray(re.bosses)?re.bosses:[]).filter(isObj).slice(0,2).forEach((b,k)=>{
    put(41+k*2,[...ech(b.echelle,4),N(b.force,0,.05,0)]); put(42+k*2,[b.fbm?1:0,N(b.decalage,-100,100,0),0,0]); });
  const tb=(Array.isArray(r.taches)?r.taches:[]).filter(isObj).slice(0,4).map(t=>t.brillance!==undefined?N(t.brillance,0,1,0)+1:0);
  while(tb.length<4) tb.push(0); put(46,tb);                       // brillance propre à une tache : humide par plaques, mate ailleurs
}
/* Chaque surface pointe vers une recette. Les kits fixent les surfaces par défaut ; la fiche peut les remplacer (champ "surfaces"). */
function buildMats(f){
  const lib=recettesDe(f), kit=["foret","dunes","nu"][kitDe(f)], sf=Object.assign({},MAT_LIB.surfaces[kit]);
  const fs=isObj(f.surfaces)?f.surfaces:{};
  for(const k of ["sol","trajet","rochers"]) if(typeof fs[k]==="string"&&resoudre(fs[k],lib)) sf[k]=fs[k];
  for(const k of ["arbres","perches"]) if(isObj(fs[k])) sf[k]=Object.assign({},sf[k]||{},fs[k]);
  matIdx.clear(); matData.fill(0);
  const use=nom=>{ if(typeof nom!=="string") return -1; if(matIdx.has(nom)) return matIdx.get(nom);
    const r=resoudre(nom,lib); if(!r||matIdx.size>=RT_MAX) return -1; const i=matIdx.size; matIdx.set(nom,i); packRecette(r,i); return i; };
  const ok=(nom,def)=>{ const i=use(nom); return i>=0?i:use(def); };
  const d=MAT_LIB.surfaces[kit], ar=sf.arbres||d.arbres||{}, pe=sf.perches||d.perches||{};
  S.surf=[ok(sf.sol,d.sol),ok(sf.trajet,d.trajet),ok(sf.rochers,d.rochers),0];
  S.surfT=[ok(ar.a,"ecorce-pin"),ok(ar.b,"ecorce-chene"),ok(pe.a,"ecorce-bouleau"),ok(pe.b,"ecorce-chataignier")];
  S.surfP=[clampN(ar.part,0,1,.45),clampN(pe.part,0,1,.5),kitDe(f)===0&&isObj(f.foret)?clampN(f.foret.variete,0,1,0):0,0];   // variété des troncs (troncVar, recette.glsl)
  for(const o of [...(Array.isArray(f.objets)?f.objets:[]),...(Array.isArray(f.semis)?f.semis:[])]) for(const fo of (o&&Array.isArray(o.formes))?o.formes:[])   // formes qui nomment une recette
    if(fo&&typeof fo.matiere==="string"&&isObj(lib[fo.matiere])) use(fo.matiere);
  if(MAINS) for(const k of ["manche","paume","pouce"]) if(isObj(MAINS[k])&&typeof MAINS[k].matiere==="string"&&isObj(lib[MAINS[k].matiere])) use(MAINS[k].matiere);   // les mains du porteur (§17)
  const rs=resoudre(sf.sol,lib)||resoudre(d.sol,lib);            // couleur du sol vue par la lumière indirecte
  S.solAlb=kitDe(f)===0?[.24,.15,.07]:couleur(rs&&rs.couleur||"#555555").map(v=>v*.9);
  gl.bindTexture(gl.TEXTURE_2D,matT); gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,RT_W,RT_MAX,gl.RGBA,gl.FLOAT,matData);
  sceneDirty=true; matVersion++;                                 // le tapis du sol (moteur v3) est à recuire
}
function validerRecettes(m){                                    // la fiche ne garde que des recettes de taille raisonnable
  if(!isObj(m)) return undefined; const out={};
  for(const [k,v] of Object.entries(m).slice(0,12)) if(isObj(v)&&/^[a-z0-9_-]{1,30}$/.test(k)&&JSON.stringify(v).length<4000) out[k]=JSON.parse(JSON.stringify(v));
  return Object.keys(out).length?out:undefined;
}

/* Le monde en JS (trajet, relief, objets de cellule, trouée) : src/lumiere.js (LUMIERE.mondeJS), MÊMES FORMULES que monde.glsl,
   à modifier des deux côtés. L'état est S (seed, relief, trajet, kit, houppiers, trouée, degage). */
S.degage=(x,z)=>degage(x,z);
const MJ=LUMIERE.mondeJS(S), sstep=LUMIERE.sstep, pathX=MJ.pathX, pathYaw=MJ.pathYaw, terrainH=MJ.terrainH, reliefDetail=MJ.reliefDetail;
const libreJS=(x,z)=>degage(x,z)||MJ.troue(x,z);                // cleared() de monde.glsl : objet qui dégage, ou trouée

/* ------------------------------------------------------------------ porteur de la caméra */
// le corps du porteur : seul le récit le déplace (haut : posture, part de la hauteur debout ; elev : perché au-dessus du sol,
// sur un arbre ou un rocher, en m ; pied : où il était au sol avant de monter ; perche : sur quoi)
const cam={ x:0, z:0, yaw:0, pitch:-.03, haut:1, elev:0, pied:null, perche:null, zoom:1, zoomCible:1 };   // zoom : zoom numérique du téléphone (cadrer une petite chose)
const look={ yaw:0, pitch:0 };                   // le regard du joueur, libre autour de la caméra
const queue=[];                                  // actions en attente : tourner, marcher, regarder, attendre
let sons=null, compteurSons=0;                    // les bruitages (src/son.js), créés plus bas ; compteur : deux gestes, deux tirages
let pauseQuand=null;                                            // essais : {type, t} (balade.pauseQuand)
let frozen=false, hold=false, pauseTest=false, walkDist=0, walking=false;   // pauseTest : balade.pause (captures d'essai), le corps s'arrête net
function pose(){
  let bob=walking?.022*Math.sin(walkDist*8.4):0, ty=0, tp=0;
  const ef=queue[0]&&queue[0].type==="effort"&&!frozen?queue[0]:null;
  if(ef){ const t=performance.now()/1000, k=.35+.65*ef.force;   // §20 : il pousse ; le téléphone sur la poitrine tremble et s'enfonce un peu par à-coups
    ty=k*(.006*Math.sin(t*31.7)+.004*Math.sin(t*53.1+1.3)); tp=k*(.008*Math.sin(t*27.3+.7)+.005*Math.sin(t*61.9)-.02*(.5+.5*Math.sin(t*2.1)));
    bob+=k*.012*Math.sin(t*2.1); }
  const env=sons?sons.enveloppe():0;               // le bruit de l'effort secoue le téléphone (son enveloppe, force comprise), même sans son
  if(env>.01){ const t=performance.now()/1000; ty+=env*(.007*Math.sin(t*71.3)+.004*Math.sin(t*113.7+.4)); tp+=env*(.01*Math.sin(t*83.1+1.1)+.005*Math.sin(t*131.9)); bob+=env*.008*Math.sin(t*97.3); }
  const yw=cam.yaw+look.yaw+ty, pt=Math.max(-1.2,Math.min(1.35,cam.pitch+look.pitch+tp));
  const cy=Math.cos(yw),sy=Math.sin(yw),cp=Math.cos(pt),sp=Math.sin(pt);
  const f=[sy*cp,sp,cy*cp], r=[cy,0,-sy], u=[f[1]*r[2]-f[2]*r[1],f[2]*r[0]-f[0]*r[2],f[0]*r[1]-f[1]*r[0]];
  return { pos:[cam.x,terrainH(cam.x,cam.z)+S.eye*cam.haut+cam.elev+bob,cam.z], mat:new Float32Array([r[0],r[1],r[2],u[0],u[1],u[2],f[0],f[1],f[2]]) };
}
function samePose(a,b){ if(!a||!b) return false;
  for(let i=0;i<3;i++) if(Math.abs(a.pos[i]-b.pos[i])>1e-5) return false;
  for(let i=0;i<9;i++) if(Math.abs(a.mat[i]-b.mat[i])>1e-6) return false;
  return true; }

function common(w,h,p){
  const P=progMonde(), u=P.u; gl.useProgram(P.p);
  gl.uniform2f(u.uRes,w,h); gl.uniform1f(u.uTick,(tick++)%60000);
  gl.uniform3fv(u.uCamPos,p.pos); gl.uniformMatrix3fv(u.uCam,false,p.mat);
  gl.uniform1f(u.uFish,1.09/(.5*Math.max(1,w/h))/cam.zoom);   // 125° sur le grand côté, divisé par le zoom
  gl.uniform1f(u.uFog,S.fog); gl.uniform3fv(u.uSeed,seed); gl.uniform3fv(u.uSunDir,S.sunDir);
  gl.uniform3fv(u.uSun,S.sun); gl.uniform3fv(u.uSky,S.sky); gl.uniform1f(u.uTorch,S.torch);
  bindTex(3,shapesT,u.uShapes); gl.uniform1i(u.uObjN,S.objN); gl.uniform4fv(u.uTrou||null,S.trou); gl.uniform4fv(u.uTrou2||null,S.trou2);
  gl.uniform2fv(u.uCan,S.can); gl.uniform4fv(u.uHoup,S.houp);
  gl.uniform4fv(u.uLoin,S.loin); gl.uniform4fv(u.uEau,S.eau||[0,0,0,0]); gl.uniform3fv(u.uLoinCol,S.loinCol); gl.uniform3fv(u.uLoinBas,S.loinBas);
  bindTex(4,matT,u.uMats); gl.uniform4iv(u.uSurf,S.surf); gl.uniform4iv(u.uSurfT,S.surfT); gl.uniform4fv(u.uSurfP,S.surfP);
  gl.uniform1i(u.uKit,S.kit); gl.uniform4fv(u.uKitP,S.kitP); gl.uniform1i(u.uMode,0);
  gl.uniform4fv(u.uRel,S.rel); gl.uniform4fv(u.uTraj,S.traj); gl.uniform4fv(u.uCreux,S.creux); gl.uniform2fv(u.uTerK,S.terK); gl.uniform1f(u.uYTop,S.yTop);
  if(u.uRelB){ gl.uniform4fv(u.uRelB,S.relB); gl.uniform4fv(u.uRelC,S.relC); gl.uniform2fv(u.uRelS,S.relS); }   // bosses et buttes (variante RELIEF)
  gl.uniform1i(u.uSemN,S.semN); gl.uniform4fv(u.uSemTop,S.semTop); gl.uniform3fv(u.uSolAlb,S.solAlb); gl.uniform1f(u.uNuit,S.lum);
  atmoUniformes(u,p,0);
  return u;
}
const pb=new Float32Array(16), pb8=new Uint8Array(16);
/* Lecture différée d'une cible (sonde, exposition) : readPixels dans un tampon de la puce (PBO), puis une barrière (fenceSync).
   On revient voir aux images suivantes ; tant que la barrière n'est pas passée, rien n'attend. Une lecture bloquante force la
   puce à finir tout ce qui est en file (7,6 ms mesurés pour la sonde sur Mali-G77, dont presque tout est de l'attente). */
function lectureDiff(){ return {buf:null,sync:null,taille:0,t:0}; }
function lireDiff(L,cible,w,h,n){                              // lance la lecture de w × h pixels RGBA flottants de la cible
  if(!L.buf||L.taille!==n*4){ if(L.buf) gl.deleteBuffer(L.buf); L.buf=gl.createBuffer(); L.taille=n*4;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER,L.buf); gl.bufferData(gl.PIXEL_PACK_BUFFER,L.taille,gl.STREAM_READ); }
  gl.bindFramebuffer(gl.FRAMEBUFFER,cible.f); gl.bindBuffer(gl.PIXEL_PACK_BUFFER,L.buf);
  gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
  if(L.sync) gl.deleteSync(L.sync);
  L.sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0); L.t=performance.now(); gl.flush();
}
function recevoirDiff(L,dst){                                  // vrai si la lecture lancée est arrivée (et copiée dans dst)
  if(!L.sync) return false;
  if(dst.length*4!==L.taille){ gl.deleteSync(L.sync); L.sync=null; return false; }   // la cible a changé de taille entre-temps
  if(gl.getSyncParameter(L.sync,gl.SYNC_STATUS)!==gl.SIGNALED) return false;
  gl.deleteSync(L.sync); L.sync=null;
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER,L.buf); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,dst,0,dst.length); gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
  return true;
}
const sondeL=lectureDiff();                                    // option sondeSync (OPT) : l'ancienne sonde bloquante, pour comparer
function probeDessin(x,y,z,cible=probeT){                      // distance au décor en (x, y, z), calculée par la sonde (ou le lanceur de rayons) dans la cible
  const P=sondeProg(); let u;
  if(P){ u=P.u; gl.useProgram(P.p); v3Monde(u,4,1,lastPose||pose()); gl.uniform2fv(u.uTerK,S.terK); }
  else { u=common(4,1,lastPose||pose()); gl.uniform1f(u.uAlpha,1); bindTex(0,dummy.t,u.uPrev); }
  gl.uniform1i(u.uMode,1); gl.uniform3f(u.uProbe,x,y,z);
  gl.bindFramebuffer(gl.FRAMEBUFFER,cible.f); gl.viewport(0,0,4,1); draw();
}
function probe(x,y,z){                                         // distance au décor, lue sur le GPU (bloquant)
  if(!sondeDispo()) return [9,9,9];                            // ni sonde ni lanceur de rayons encore compilés : pas de collision pour l'instant
  probeDessin(x,y,z);
  gl.readPixels(0,0,4,1,gl.RGBA,gl.UNSIGNED_BYTE,pb8);          // octets : le chemin de lecture rapide de toutes les puces
  const d=i=>(pb8[i]+pb8[i+1]/255)/255*9-1;
  return [d(0),d(4),d(8)];
}
function moveBy(dist){
  let nx=cam.x+Math.sin(cam.yaw)*dist, nz=cam.z+Math.cos(cam.yaw)*dist;
  // La sonde de collision est un calcul du lanceur de rayons sur quatre pixels. On ne sonde qu'une fois tous les 120 ms
  // (16 cm de marche), un demi-mètre devant ; près d'un obstacle, à chaque image. Par défaut la lecture est différée :
  // le résultat arrive une à trois images plus tard (moins de 10 cm de marche), ce que couvre le demi-mètre d'avance.
  const R=.42, now=performance.now();
  if(!OPT.sondeSync&&recevoirDiff(sondeL,pb)){ sonde.d=pb[0]; sonde.dx=pb[4]; sonde.dz=pb[8]; sonde.loin=!(sonde.d<R+.25); }
  const pres=sonde.d<R+.25;
  if((now-sonde.t>120||pres)&&(OPT.sondeSync||!sondeL.sync)){ const a=.5*Math.sign(dist||1); sonde.t=now;
    const av=pres?(OPT.sondeSync?0:.12*Math.sign(dist||1)):a;    // différée : on sonde là où l'on sera quand la réponse arrivera
    const sx=nx+Math.sin(cam.yaw)*av, sz=nz+Math.cos(cam.yaw)*av;
    if(OPT.sondeSync){ [sonde.d,sonde.dx,sonde.dz]=probe(sx,terrainH(sx,sz)+.75,sz); sonde.loin=!(sonde.d<R+.25); }
    else if(sondeDispo()){ probeDessin(sx,terrainH(sx,sz)+.75,sz); lireDiff(sondeL,probeT,4,1,16); } }
  const d=sonde.loin?Math.max(sonde.d,R):sonde.d, dx=sonde.dx, dz=sonde.dz;
  if(d<R){ let gx=(dx-d)/.05, gz=(dz-d)/.05; const l=Math.hypot(gx,gz)||1; nx+=gx/l*(R-d); nz+=gz/l*(R-d); }
  const M=MENEUR.REGLAGES.MARGE_CORPS;                             // les obstacles connus (troncs, perches, blocs, choses) : jamais à moins de la marge (§16)
  for(const o of obstaclesConnus()){ if(MENEUR.enjambable(o)) continue;   // ce qui est bas s'enjambe (§18)
    const ex=nx-o.x, ez=nz-o.z, m=Math.hypot(ex,ez), Ro=o.r+M;
    if(m<Ro&&Math.hypot(cam.x-o.x,cam.z-o.z)>=Ro-1e-3){ nx=o.x+ex/(m||1)*Ro; nz=o.z+ez/(m||1)*Ro; } }
  cam.x=nx; cam.z=nz; walkDist+=Math.abs(dist);
}
let idle=0, stuck=0;
const sonde={t:-1e9,d:9,dx:9,dz:9,loin:true};
let patience=10;                                               // secondes d'immobilité avant qu'elle reparte d'elle-même, en histoire
function pasHistoire(){                                        // quatre mètres le long du sentier, puis elle s'arrête : le rythme laisse la place au joueur
  const want=S.kit!==1?pathYaw(cam.z+Math.cos(cam.yaw)*6)+(Math.cos(cam.yaw)<0?Math.PI:0):cam.yaw;
  let d=want-cam.yaw; d=Math.atan2(Math.sin(d),Math.cos(d));
  queue.push({type:"tourner",rest:d},{type:"marcher",rest:4,libre:true});
}
function flaner(){                                            // sans consigne, il se promène : c'est le récit par défaut
  const want=S.kit!==1 ? pathYaw(cam.z+Math.cos(cam.yaw)*6)+(Math.cos(cam.yaw)<0?Math.PI:0)+(Math.random()-.5)*.5
                       : cam.yaw+(Math.random()-.5)*1.2;
  let d=want-cam.yaw; d=Math.atan2(Math.sin(d),Math.cos(d));
  queue.push({type:"tourner",rest:d},{type:"marcher",rest:6+Math.random()*9,libre:true},{type:"attendre",rest:1.5+Math.random()*3});
  if(Math.random()<.4) queue.push({type:"regarder",pitch:(Math.random()-.35)*.5},{type:"attendre",rest:2},{type:"regarder",pitch:-.03});
}
function simulate(dt){
  if(Math.abs(cam.zoom/cam.zoomCible-1)>.005){                    // le zoom glisse en une seconde ; l'accumulation repart (comme un téléphone qui refait sa mise au point)
    cam.zoom*=Math.pow(cam.zoomCible/cam.zoom,Math.min(1,dt*3)); if(Math.abs(cam.zoom/cam.zoomCible-1)<.01) cam.zoom=cam.zoomCible; sceneDirty=true; }
  walking=false; if(frozen||hold||pauseTest) return;
  depuisPensee+=dt;
  if(pauseQuand&&queue[0]&&queue[0].type===pauseQuand.type){        // essais : figer le corps à un instant précis d'un geste (planche du façonnage)
    const a=queue[0], t=a.type==="ramasser"?1-a.rest/a.duree:a.type==="faconner"&&a.G&&a.t0!==undefined&&!a.nau?a.t-a.t0-.4-(a.pause||0):-1;   // temps du geste (la nausée le suspend, §22.2)
    if(t>=pauseQuand.t){ pauseQuand=null; pauseTest=true; return; } }
  let v=0;
  if(!queue.length){ idle+=dt;
    if(immobile){}                                               // « arrête-toi » : il attend un autre ordre
    else if(meneur&&!meneurLibre){ if(idle>patience && !CFG.nowalk){ idle=0; patience=7; pasHistoire(); } }   // en histoire : petits pas, et elle attend la voix après chaque temps
    else if(errance && idle>2.5 && !CFG.auto && !CFG.nowalk){ idle=0; flaner(); } } else idle=0;
  const a=queue[0];
  if(a){
    if(a.type==="tourner"){ const d=Math.sign(a.rest)*Math.min(Math.abs(a.rest),1.5*dt); cam.yaw+=d; a.rest-=d; if(Math.abs(a.rest)<1e-3) queue.shift(); }
    else if(a.type==="marcher"&&cam.elev>.01) queue.unshift({type:"descendre"});   // perché : il descend avant de marcher
    else if(a.type==="marcher"){ cam.zoomCible=1; v=Math.sign(a.rest)*Math.min(1.35,Math.abs(a.rest)/Math.max(dt,1e-3)); a.rest-=v*dt; if(Math.abs(a.rest)<1e-4) queue.shift(); }   // pas plus loin que demandé, même avec une image lente
    else if(a.type==="regarder"){ const d=a.pitch-cam.pitch; cam.pitch+=Math.sign(d)*Math.min(Math.abs(d),1.1*dt); if(Math.abs(d)<.012) queue.shift(); }
    else if(a.type==="posture"){ const d=a.h-cam.haut; cam.haut+=Math.sign(d)*Math.min(Math.abs(d),.55*dt); if(Math.abs(d)<.005){ cam.haut=a.h; queue.shift(); } }   // se baisser, se relever
    else if(a.type==="viser"){ queue.shift(); const v=viserObjet(a.objet,a.cadre);   // vers un objet : la page calcule cap et inclinaison
      if(v&&v.raide&&!a.cadre) queue.unshift({type:"cadrer",objet:a.objet});              // presque sous lui : il recule et se baisse pour la voir
      else if(v) queue.unshift({type:"tourner",rest:v.yaw},{type:"regarder",pitch:v.pitch}); }   // vers un objet : la page calcule cap et inclinaison
    else if(a.type==="rejoindre"||a.type==="cadrer"||a.type==="monter"||a.type==="chercher"){ queue.shift(); queue.unshift(...planCorps(a)); }   // trajet calculé au moment de partir
    else if(a.type==="marche"){ queue.shift(); queue.unshift(...planMarchePage(a.metres)); }   // trajet calculé au moment de partir
    else if(a.type==="deplacer"){ queue.shift(); queue.unshift(...planDeplacerPage(a)); }   // « déplace-toi » : une direction dégagée, au moment de partir (§19)
    else if(a.type==="poser"){ queue.shift(); poserIci(a.ref); }                          // la place de la chose : là où il est arrivé (§19)
    else if(a.type==="attendreObjet"){ if(reserves.has(a.ref)&&a.rest>0) a.rest-=dt; else queue.shift(); }   // il attend la chose avant de repartir
    else if(a.type==="faconner") faconnerPas(a,dt);
    else if(a.type==="ramasser") ramasserPas(a,dt);
    else if(a.type==="finMarche"){ queue.shift(); finMarche(a); }
    else if(a.type==="penser"){ if(!a.espace||pensePeut(a.espace,a)){ queue.shift(); say(a.texte,a.bref); direVoix(a.texte); notePensee(a.texte,"file"); } }
    else if(a.type==="hesiter") hesiterPas(a,dt);
    else if(a.type==="essuyer") essuyerPas(a,dt);
    else if(a.type==="effort"){ a.ecoule=(a.ecoule||0)+dt;   // §20 : il pousse ; les bruits calés sur cet effort tombent à leur instant (src/son.js)
      if(a.bruits) for(const b of a.bruits) if(!b.joue&&a.ecoule>=b.t){ b.joue=true; jouerBruit(b); }
      a.rest-=dt; if(a.rest<=0){ queue.shift(); if(a.chute) chuteGeste(a.chute.masse); } }
    else if(a.type==="bloque"){ queue.shift(); if(!a.muet) say(a.texte||"Je passe pas, là. C'est bouché.",true); }   // il s'arrête devant, et il le dit
    else if(a.type==="elever"||a.type==="descendre") elever(a,dt);
    else if(a.type==="zoom"){ cam.zoomCible=clampN(a.z,1,8,1); queue.shift(); }
    else { a.rest-=dt; if(a.rest<=0) queue.shift(); }
  }
  if(v!==0){
    cam.pitch+=(-.03-cam.pitch)*Math.min(1,dt*1.5);              // en marchant, il regarde devant lui
    const x0=cam.x, z0=cam.z; moveBy(v*dt); walking=true;
    if(!gyro.on){ look.yaw*=Math.exp(-dt/2.5); look.pitch*=Math.exp(-dt/2.5); }           // en marche, le regard revient vers l'avant
    stuck=Math.hypot(cam.x-x0,cam.z-z0)<Math.abs(v*dt)*.3?stuck+dt:0;
    if(stuck>.6){ stuck=0; const m=queue.shift();
      if(m&&m.libre) queue.unshift({type:"tourner",rest:(Math.random()<.5?-1:1)*.9});   // en flânant, bloqué : il part ailleurs
      else if(m&&m.ordre){ const o=m.ordre, reste=Math.abs(m.rest);   // une marche demandée, arrêtée par ce que seule la sonde connaît : il essaie à côté (§18)
        while(queue.length&&queue[0].ordre===o) queue.shift();
        const k=o.essais=(o.essais||0)+1, da=[0,.52,-1.05,1.57,-2.09][k];   // ±30°, ±60° autour du cap demandé (cumulés)
        if(da!==undefined&&reste>.3){ queue.unshift({type:"tourner",rest:da,ordre:o},{type:"marcher",rest:Math.sign(m.rest)*reste,ordre:o},{type:"finMarche",ordre:o}); }
        else queue.unshift({type:"finMarche",ordre:o,arrete:true}); }
      else{ while(queue.length&&(queue[0].type==="marcher"||queue[0].type==="tourner")) queue.shift(); queue.unshift({type:"bloque"}); } }   // dirigé : il s'arrête devant, ne traverse pas
  }
}

/* ------------------------------------------------------------------ tampons et rendu */
const LEVELS=[1,.8,.64,.5];                   // résolutions de mouvement, en fraction de la résolution fixe
let W=0,H=0, pairs=[], bl1,bl2;
let hist=null, histPose=null, lastPose=null, n=0, row=0, sDst=null, sReproj=0, tick=0, frames=0;
let mLevel=0, msMotion=50, msPerRow=.25, exposure=1.2, expTarget=1.2, lastExpRead=0;
const coarse=matchMedia("(pointer:coarse)").matches;
/* Qualité : « mobile » tient un téléphone moyen ; « complète » est faite pour un ordinateur (pleine résolution, bien plus de grains,
   carte d'ombres plus fine). Par défaut : complète sans écran tactile, mobile sinon. Le choix est gardé dans le navigateur. */
var docile=!!CFG.docile; try{ if(localStorage.getItem("bodycam-docile")==="1") docile=true; }catch(_){}   // mode essai : il fait exactement ce qu'on demande
var errance=true;                                             // il se promène de lui-même ; dès qu'on lui parle, il attend qu'on lui dise quoi faire
var immobile=false;                                           // « arrête-toi » : ni flânerie ni petits pas tant qu'on ne lui dit pas autre chose
var meneurLibre=false;                                        // vrai quand le meneur tourne sans histoire écrite (promenade libre)
const QUAL={ full:CFG.full!==undefined?!!CFG.full:!coarse };
try{ const q=localStorage.getItem("bodycam-qualite"); if(q&&CFG.full===undefined) QUAL.full=q==="1"; }catch(_){}
const MAXS=CFG.maxSpp||400;
function pairAt(i){ if(!pairs[i]){ const w=Math.max(2,Math.round(W*LEVELS[i])), h=Math.max(2,Math.round(H*LEVELS[i]));
  pairs[i]={a:target(w,h,ACC_FMT,gl.NEAREST),b:target(w,h,ACC_FMT,gl.NEAREST)}; } return pairs[i]; }
function resize(){
  const dpr=Math.min(window.devicePixelRatio||1,QUAL.full?2:1.2);   // en mobile, le capteur simulé coûtait 12 ms à 720 × 1302
  const cw=Math.max(2,Math.round(canvas.clientWidth*dpr)), ch=Math.max(2,Math.round(canvas.clientHeight*dpr));
  canvas.width=cw; canvas.height=ch;
  const maxPx=CFG.maxPx||(QUAL.full?2000000:V3.on?115000:coarse?250000:440000);   // v3 en mobile : la résolution que le moteur à rayons tenait en marche   // mode complet : jusqu'à la pleine résolution de l'écran
  const s=Math.min(1,Math.sqrt(maxPx/(cw*ch)))*REG_RES;           // REG_RES : résolution réduite par le régulateur du budget
  W=CFG.w||Math.max(2,Math.round(cw*s)); H=CFG.h||Math.max(2,Math.round(ch*s));
  // Mobile en v3 : le capteur simulé coûte par pixel d'écran (17 ms mesurés à 432 × 781 sur Mali-G77). On le calcule à peine
  // plus fin que l'image interne et le navigateur agrandit : c'est aussi ce que fait un téléphone qui filme en basse définition.
  if(!QUAL.full&&V3.on&&!CFG.ecranPlein){ const k=CFG.ecranK||1.25; canvas.width=Math.min(cw,Math.round(W*k)); canvas.height=Math.min(ch,Math.round(H*k)); }
  pairs.forEach(p=>{ if(p){ freeT(p.a); freeT(p.b); } }); pairs=[]; freeT(bl1); freeT(bl2);
  const bs=128/Math.max(W,H);
  bl1=target(Math.max(8,Math.round(W*bs)),Math.max(8,Math.round(H*bs)),gl.RGBA16F,gl.LINEAR);
  bl2=target(bl1.w,bl1.h,gl.RGBA16F,gl.LINEAR);
  hist=null; n=0; row=0; mLevel=CFG.level!==undefined?CFG.level:1;
  V2.out=null; if(V3.gb) v3Libere(true);
}
const px1=new Float32Array(4);
function renderPass(dst,y0,rows,o,p){
  const u=common(dst.w,dst.h,p);
  gl.uniform1i(u.uQ,o.q); gl.uniform1f(u.uAlpha,hist?o.alpha:1); gl.uniform1i(u.uReproj,o.reproj); gl.uniform1f(u.uJit,o.jit);
  if(hist){ gl.uniform3fv(u.uPrevPos,histPose.pos); gl.uniformMatrix3fv(u.uPrevCam,false,histPose.mat); }
  bindTex(0,(hist||dummy).t,u.uPrev);
  gl.bindFramebuffer(gl.FRAMEBUFFER,dst.f); gl.viewport(0,0,dst.w,dst.h);
  gl.enable(gl.SCISSOR_TEST); gl.scissor(0,y0,dst.w,rows); draw(); gl.disable(gl.SCISSOR_TEST);
  gl.readPixels(0,y0,1,1,gl.RGBA,gl.FLOAT,px1);              // force la fin du calcul pour mesurer le temps réel
}
/* En mouvement : une image entière par trame, mélangée à l'historique reprojeté. La résolution s'adapte au GPU. */
function motionFrame(p){
  const P=pairAt(mLevel), dst=hist===P.a?P.b:P.a, t0=performance.now();
  renderPass(dst,0,dst.h,{q:0,alpha:sceneDirty?1:.14,reproj:1,jit:0},p);
  lastMotionMs=performance.now()-t0; msMotion=msMotion*.8+lastMotionMs*.2;
  hist=dst; histPose=p; n=mLevel===0?6:2; row=0; sceneDirty=false; frames++;
  if(CFG.level===undefined){
    if(msMotion>85 && mLevel<LEVELS.length-1){ mLevel++; msMotion=50; }       // une vidéo saccadée reste crédible, une vidéo pixelisée non
    else if(msMotion<30 && mLevel>0){ mLevel--; msMotion=50; }
  }
}
/* À l'arrêt : accumulation pleine résolution, par bandes pour ne jamais bloquer l'interface. */
function staticRows(p){
  const P=pairAt(0);
  if(row===0){ sDst=hist===P.a?P.b:P.a; sReproj=hist.w!==sDst.w?1:0; }
  const rows=Math.max(2,Math.min(H-row,Math.round(14/msPerRow))), t0=performance.now();
  renderPass(sDst,row,rows,{q:1,alpha:1/(n+1),reproj:sReproj,jit:1},p);
  msPerRow=Math.max(.002,msPerRow*.6+((performance.now()-t0)/rows)*.4);
  row+=rows;
  if(row>=H){ row=0; n++; hist=sDst; histPose=p; return true; }
  return false;
}
let blBuf=null, expoSpot=0; const expoL=lectureDiff();
function postFX(src){
  if(!P_CAM) return;                                           // capteur et halo pas encore compilés (postPret)
  gpuDebut("halo"); gl.useProgram(P_DOWN.p); bindTex(0,src.t,P_DOWN.u.uTex); gl.uniform2f(P_DOWN.u.uDstRes,bl1.w,bl1.h);
  gl.bindFramebuffer(gl.FRAMEBUFFER,bl1.f); gl.viewport(0,0,bl1.w,bl1.h); draw();
  const now=performance.now();
  // Exposition auto : moyenne logarithmique, pondérée au centre, toutes les 180 ms. La lecture est différée (option expoSync :
  // l'ancienne lecture bloquante) : sur une puce à tuiles, une lecture bloquante attend toute l'image en cours.
  if(!blBuf||blBuf.length!==bl1.w*bl1.h*4) blBuf=new Float32Array(bl1.w*bl1.h*4);
  let lu=false;
  if(!OPT.expoSync&&!CFG.expoDiff){                             // exposition sur la puce : un texel, aucune lecture
    const dtE=expoQuand?Math.min(1,(now-expoQuand)/1000):1e3; expoQuand=now;
    gl.useProgram(P_EXPO.p); bindTex(0,bl1.t,P_EXPO.u.uBloom); bindTex(1,expoT[expoI].t,P_EXPO.u.uPrev);
    gl.uniform1f(P_EXPO.u.uRate,1-Math.exp(-dtE/.45)); gl.uniform1f(P_EXPO.u.uMax,S.nuit?9:14);
    { const bas=-(cam.pitch+look.pitch), v=Math.max(Math.min(1,Math.max(0,(cam.zoom-1)/.5)),Math.min(1,Math.max(0,(bas-.4)/.35)));   // il cadre une chose de près (zoom, ou regard plongeant) : mesure au centre
      expoSpot+=(v-expoSpot)*Math.min(1,dtE*2.5); gl.uniform1f(P_EXPO.u.uSpot||null,CFG.expoSpot===false?0:expoSpot); }
    gl.bindFramebuffer(gl.FRAMEBUFFER,expoT[1-expoI].f); gl.viewport(0,0,1,1); draw(); expoI=1-expoI;
    gl.viewport(0,0,bl1.w,bl1.h);
  }
  else if(OPT.expoSync){ if(now-lastExpRead>180){ lastExpRead=now; gl.readPixels(0,0,bl1.w,bl1.h,gl.RGBA,gl.FLOAT,blBuf); lu=true; } }
  else { lu=recevoirDiff(expoL,blBuf); if(!expoL.sync&&now-lastExpRead>180){ lastExpRead=now; lireDiff(expoL,bl1,bl1.w,bl1.h,bl1.w*bl1.h*4); } }
  if(lu){
    let s=0,ws=0,any=false;
    for(let y=0;y<bl1.h;y++) for(let x=0;x<bl1.w;x++){ const i=(y*bl1.w+x)*4;
      const L=.2126*blBuf[i]+.7152*blBuf[i+1]+.0722*blBuf[i+2]; if(!(L>=0)||L===Infinity) continue;   // une valeur invalide ne doit jamais rendre l'écran noir
      if(L>0) any=true;
      const dx=x/bl1.w-.5, dy=y/bl1.h-.5, w=1-1.6*(dx*dx+dy*dy);
      s+=w*Math.log(Math.min(L,8)+.004); ws+=w; }
    if(any&&ws>0&&Number.isFinite(s)) expTarget=Math.min(S.nuit?9:14,Math.max(.25,.25/Math.exp(s/ws)));   // la nuit, le gain plafonne : le noir reste noir
  }
  gl.useProgram(P_BLUR.p);
  bindTex(0,bl1.t,P_BLUR.u.uTex); gl.uniform2f(P_BLUR.u.uDir,1/bl1.w,0); gl.bindFramebuffer(gl.FRAMEBUFFER,bl2.f); draw();
  bindTex(0,bl2.t,P_BLUR.u.uTex); gl.uniform2f(P_BLUR.u.uDir,0,1/bl1.h); gl.bindFramebuffer(gl.FRAMEBUFFER,bl1.f); draw();
}
const still=matchMedia("(prefers-reduced-motion:reduce)").matches || !!CFG.still;
let walkAmt=0;
/* Bougé du capteur (camera.frag, uFlou) : qualité mobile seulement (option flou : true l'impose, false le coupe). La pose de
   l'image montrée et celle de l'image d'avant donnent à chaque pixel son déplacement ; la part du bougé monte vite quand la
   caméra bouge et retombe en un quart de seconde à l'arrêt, le temps que l'accumulation reprenne la main. */
const FLOU={ pose:null, prev:null, s:0, t:0 };
function flouCapteur(u,t){
  const on=CFG.flou!==undefined?!!CFG.flou:!QUAL.full, p=V2.on?null:V3.on?V3.histPose:histPose;
  if(p&&p!==FLOU.pose){ FLOU.prev=FLOU.pose; FLOU.pose=p; }
  const bouge=on&&!!p&&!!FLOU.prev&&!samePose(FLOU.prev,p), dt=Math.max(0,Math.min(.25,t-FLOU.t)); FLOU.t=t;
  FLOU.s+=((bouge?1:0)-FLOU.s)*(1-Math.exp(-dt/(bouge?.03:.25))); if(!on||FLOU.s<.01) FLOU.s=0;
  gl.uniform1f(u.uFlou||null,FLOU.s); if(!FLOU.s) return;
  const q=FLOU.prev||p, w=V3.on?W:src0.w, h=V3.on?H:src0.h;
  gl.uniform1f(u.uFishC,1.09/(.5*Math.max(1,w/h))/cam.zoom);
  gl.uniform3fv(u.uPosC,p.pos); gl.uniformMatrix3fv(u.uCamC,false,p.mat); gl.uniform3fv(u.uPosA,q.pos); gl.uniformMatrix3fv(u.uCamA,false,q.mat);
}
let src0=null;
function display(src,t,cible){
  if(!P_CAM) return;
  if(!cible) gpuDebut("capteur");
  const u=P_CAM.u; gl.useProgram(P_CAM.p); src0=src;
  if(!cible) flouCapteur(u,t);
  else gl.uniform1f(u.uFlou||null,0);
  bindTex(0,src.t,u.uTex); bindTex(1,bl1.t,u.uBloom);
  gl.uniform2f(u.uSrcRes,src.w,src.h); gl.uniform2f(u.uOutRes,canvas.width,canvas.height);
  bindTex(2,expoT[expoI].t,u.uExpoT); gl.uniform1i(u.uExpoGpu,OPT.expoSync||CFG.expoDiff||CFG.expoFixe>0?0:1);
  gl.uniform1f(u.uExp,CFG.expoFixe>0?+CFG.expoFixe:exposure);   // mise au point : expoFixe impose l'exposition du capteur
  gl.uniform1f(u.uTime,still?0:t); gl.uniform1f(u.uSoft,0); gl.uniform1i(u.uLin,src.lin&&!OPT.capteur4?1:0);
  gl.uniform1f(u.uFlare||null,QUAL.full&&S.atmo&&S.atmo[0]?(CFG.flare!==undefined?+CFG.flare:1):0);   // optique face au soleil : grand écran, modèle atmosphère
  gl.uniform1f(u.uGrainPx||null,QUAL.full?Math.max(1,canvas.height/620):1);                          // grain d'une vidéo, pas d'un écran
  gl.uniform1f(u.uGain,Math.min(2.2,1+.28*Math.max(0,Math.log2(exposure))));   // gain élevé = davantage de bruit capteur
  if(still) gl.uniform3f(u.uShake,0,0,0);                     // sinon : dérive de la main et balancement de la marche
  else gl.uniform3f(u.uShake,
    .0030*(Math.sin(t*1.31)+.6*Math.sin(t*2.9+1)+.25*Math.sin(t*7.1))+.005*walkAmt*Math.sin(walkDist*4.2),
    .0036*(Math.sin(t*1.07+2)+.5*Math.sin(t*3.3)+.25*Math.sin(t*6.3+4)),
    .0040*(Math.sin(t*.83+2)+.5*Math.sin(t*2.3))+.010*walkAmt*Math.sin(walkDist*4.2+1));
  gl.bindFramebuffer(gl.FRAMEBUFFER,cible?cible.f:null); gl.viewport(0,0,canvas.width,canvas.height); draw();
}

/* ------------------------------------------------------------------ moteur v2 (essai) : tourner, puis projeter
   Voir docs/moteur-v2.md. Le path tracer tourne des panoramiques équirectangulaires (uMode 2 : seule la génération du rayon
   change) depuis des points du sentier, en avance sur le porteur, par bandes bornées dans le temps. Chaque image ne fait
   que projeter, comme des points, les texels des panoramiques les plus proches (couleur éclairée + distance).
   Options de test : v2, v2w/v2h (taille), v2passes, v2q (qualité du tournage : 1 = celle de l'arrêt, par défaut ; 0 = celle du mouvement, sans ombres d'arbres), v2pas (m),
   v2nb (panoramiques dessinés), v2budget (ms de tournage par image), v2fill (rayon de dilatation, 0 = aucune),
   v2trous (trous restants en magenta), v2scale (marge sur la taille des points), v2tour (liste imposée de z de tournage). */
const V2={ on:!!CFG.v2, pw:CFG.v2w||1024, ph:CFG.v2h||512, passes:CFG.v2passes||4, q:CFG.v2q!==undefined?CFG.v2q:1, pas:CFG.v2pas||2.5,
  nb:CFG.v2nb||3, max:CFG.v2max||6, budget:CFG.v2budget||12, fill:CFG.v2fill!==undefined?CFG.v2fill:2, marque:CFG.v2trous?1:0,
  scale:CFG.v2scale||1.25, panos:[], cur:null, spare:null, row:0, msPerRow:2, gp:null, tgt:null, tgt2:null, rb:null,
  out:null, lastPose:null, msProj:0, msProjAvg:0, nProj:0, pts:0, faits:[], maxPt:64 };
const ID3=new Float32Array([1,0,0,0,1,0,0,0,1]);
function v2Init(){
  if(V2.gp) return;
  V2.gp={ pts:prog(FS_V2PTS,VS_V2PTS), ciel:prog(FS_V2CIEL), trous:prog(FS_V2TROUS) };
  V2.maxPt=Math.min(64,gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]||1);
}
function v2Cibles(){                                          // cible de projection : même format que l'accumulation, plus une profondeur
  if(V2.tgt&&V2.tgt.w===W&&V2.tgt.h===H) return;
  v2LibereCibles();
  V2.tgt=target(W,H,ACC_FMT,gl.NEAREST); V2.tgt2=target(W,H,ACC_FMT,gl.NEAREST);
  V2.rb=gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER,V2.rb); gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,W,H);
  gl.bindFramebuffer(gl.FRAMEBUFFER,V2.tgt.f); gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,V2.rb);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) fail("Moteur v2 : cible de projection incomplète.");
  V2.out=null;
}
function v2LibereCibles(){ freeT(V2.tgt); freeT(V2.tgt2); if(V2.rb) gl.deleteRenderbuffer(V2.rb); V2.tgt=V2.tgt2=V2.rb=V2.out=null; }
function v2Vider(){ V2.panos.forEach(p=>freeT(p.t)); V2.panos=[]; V2.cur=null; V2.row=0; V2.out=null; }
function v2Pos(z){ const x=S.kit===0?pathX(z):cam.x; return [x,terrainH(x,z)+S.eye,z]; }   // sur le sentier, à hauteur d'œil (fiche forêt)
function v2Voulus(){                                          // points de tournage, du plus urgent au moins urgent
  if(Array.isArray(CFG.v2tour)) return CFG.v2tour.slice(0,V2.max).map(Number);
  const dir=Math.cos(cam.yaw)>=0?1:-1, g=Math.round(cam.z/V2.pas), c=[];
  for(let k=-2;k<=5;k++){ const z=+((g+k)*V2.pas).toFixed(3), dz=(z-cam.z)*dir; c.push({z,s:Math.abs(dz)+(dz<-.5*V2.pas?V2.pas:0)}); }
  return c.sort((a,b)=>a.s-b.s).slice(0,V2.max).map(o=>o.z);
}
/* Tournage par bandes de lignes, dans un budget de temps par image (comme staticRows). Rend vrai si une passe s'est terminée. */
function v2Tourner(budget){
  const voulus=v2Voulus();
  V2.panos=V2.panos.filter(p=>{ if(voulus.includes(p.z)) return true; if(p===V2.cur){ V2.cur=null; V2.row=0; } freeT(p.t); return false; });
  if(!V2.cur) for(const z of voulus){
    let p=V2.panos.find(o=>o.z===z);
    if(!p){ p={z,pos:v2Pos(z),t:null,n:0,tw0:0,gpu:0}; V2.panos.push(p); }
    if(p.n<V2.passes){ V2.cur=p; V2.row=0; break; }
  }
  const p=V2.cur; if(!p) return false;
  if(!V2.spare) V2.spare=target(V2.pw,V2.ph,ACC_FMT,gl.NEAREST);
  const t0=performance.now(); let fini=false;
  do{
    if(!p.tw0) p.tw0=performance.now();
    const rows=Math.max(1,Math.min(V2.ph-V2.row,Math.round(budget/V2.msPerRow))), t1=performance.now();
    const u=common(V2.pw,V2.ph,{pos:p.pos,mat:ID3});
    gl.uniform1i(u.uMode,2); gl.uniform1i(u.uQ,V2.q); gl.uniform1f(u.uAlpha,p.n?1/(p.n+1):1); gl.uniform1i(u.uReproj,0); gl.uniform1f(u.uJit,1);
    bindTex(0,(p.t||dummy).t,u.uPrev);
    gl.bindFramebuffer(gl.FRAMEBUFFER,V2.spare.f); gl.viewport(0,0,V2.pw,V2.ph);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0,V2.row,V2.pw,rows); draw(); gl.disable(gl.SCISSOR_TEST);
    gl.readPixels(0,V2.row,1,1,gl.RGBA,gl.FLOAT,px1);           // synchronise : le temps mesuré est le vrai temps GPU
    const ms=performance.now()-t1; p.gpu+=ms; V2.msPerRow=Math.max(.002,V2.msPerRow*.6+(ms/rows)*.4);
    V2.row+=rows;
    if(V2.row>=V2.ph){                                        // passe complète : l'accumulation devient le panoramique
      V2.row=0; const old=p.t; p.t=V2.spare; V2.spare=old; p.n++; fini=true;
      if(p.n>=V2.passes){ V2.faits.push({z:p.z,s:(performance.now()-p.tw0)/1000,gpu:p.gpu/1000,passes:p.n}); V2.cur=null; break; }
    }
  } while(performance.now()-t0<budget);
  return fini;
}
/* Projection : fond (ciel relu dans le panoramique le plus proche, trous ailleurs), puis les points avec test de profondeur. */
function v2Projeter(p){
  v2Init(); v2Cibles();
  const pr=V2.panos.filter(o=>o.n>0).map(o=>({o,d:Math.hypot(o.pos[0]-p.pos[0],o.pos[1]-p.pos[1],o.pos[2]-p.pos[2])}))
    .sort((a,b)=>a.d-b.d).slice(0,V2.nb).map(x=>x.o);
  const t0=performance.now(), fish=1.09/(.5*Math.max(1,W/H)), G=V2.gp;
  gl.bindFramebuffer(gl.FRAMEBUFFER,V2.tgt.f); gl.viewport(0,0,W,H);
  if(pr.length){ gl.useProgram(G.ciel.p); bindTex(0,pr[0].t.t,G.ciel.u.uPano); gl.uniform2f(G.ciel.u.uRes,W,H); gl.uniform1f(G.ciel.u.uFish,fish);
    gl.uniformMatrix3fv(G.ciel.u.uCam,false,p.mat); draw(); }
  else gl.clearBufferfv(gl.COLOR,0,[0,0,0,-1]);
  gl.clearBufferfv(gl.DEPTH,0,[1]);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
  const u=G.pts.u; gl.useProgram(G.pts.p);
  gl.uniform3fv(u.uCamPos,p.pos); gl.uniformMatrix3fv(u.uCam,false,p.mat); gl.uniform2f(u.uRes,W,H); gl.uniform1f(u.uFish,fish);
  gl.uniform1f(u.uScale,V2.scale); gl.uniform1f(u.uMaxPt,V2.maxPt);
  V2.pts=0;
  pr.forEach((o,k)=>{ bindTex(0,o.t.t,u.uPano); gl.uniform3fv(u.uPanoPos,o.pos); gl.uniform1f(u.uBias,.03*k);
    const N=o.t.w*o.t.h; gl.drawArrays(gl.POINTS,0,N); V2.pts+=N; });
  gl.disable(gl.DEPTH_TEST);
  V2.out=V2.tgt;
  if(V2.fill>0||V2.marque){ const g=G.trous; gl.useProgram(g.p); bindTex(0,V2.tgt.t,g.u.uTex); gl.uniform1i(g.u.uRayon,Math.min(3,V2.fill)); gl.uniform1i(g.u.uMarque,V2.marque);
    gl.bindFramebuffer(gl.FRAMEBUFFER,V2.tgt2.f); draw(); V2.out=V2.tgt2; }
  gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,px1);
  V2.msProj=performance.now()-t0; V2.msProjAvg=V2.nProj?V2.msProjAvg*.8+V2.msProj*.2:V2.msProj; V2.nProj++; V2.dessines=pr.length;
}
function v2Frame(p,dt){
  if(sceneDirty){ v2Vider(); sceneDirty=false; }
  const fini=v2Tourner(V2.budget);
  if(fini || !V2.out || !samePose(p,V2.lastPose)){
    v2Projeter(p); V2.lastPose=p; frames++;
    if(bench&&walking) bench.push({dt:dt*1000,ms:V2.msProj,lvl:-1,pts:V2.pts});
  }
  postFX(V2.out);
}
function v2Prets(){                                           // panoramiques terminés parmi les plus proches voulus (pour les tests)
  const v=v2Voulus().slice().sort((a,b)=>Math.abs(a-cam.z)-Math.abs(b-cam.z)).slice(0,V2.nb);
  return v.filter(z=>{ const o=V2.panos.find(q=>q.z===z); return o&&o.n>=V2.passes; }).length;
}
function v2Basculer(on){
  V2.on=on; $("v2").setAttribute("aria-pressed",String(on)); $("v2").textContent=on?"Moteur v2 · oui":"Moteur v2";
  if(on&&V3.on) v3Basculer(false);
  if(on){ v2Init(); V2.lastPose=null; V2.out=null; } else { hist=null; v2Vider(); freeT(V2.spare); V2.spare=null; v2LibereCibles(); }
}

/* ------------------------------------------------------------------ moteur v3 (essai) : on ne trace plus, on sème
   Voir docs/moteur-v3.md. Chaque image, à budget fixe : (1) carte d'ombres, les grains semés vus du soleil ; (2) tampon G,
   le sol en maillage polaire puis les grains vus de la caméra (v3_grains.vert : chaque grain se pose lui-même, à partir de
   son numéro) ; (3) une passe plein écran (v3_ombrage.frag) : recettes, lumière, ciel, accumulation reprojetée.
   Le monde (grilles, tirages, formules) est le code GLSL du lanceur de rayons, partagé par le build (monde.glsl).
   Options de test : v3, grains (budget de la caméra, 300 000 par défaut), grainsOmbre (budget du soleil, 60 % du précédent),
   v3k (recouvrement des grains), v3carte (largeur de la carte d'ombres), v3alpha (part d'image neuve en mouvement),
   v3max (images accumulées à l'arrêt), v3detail (chronomètre chaque passe : ajoute des synchronisations),
   v3net (soleil ponctuel, sans pénombre), v3pcf (flou de lecture de la carte, en texels), v3amb (niveau de l'ambiance,
   0,65 par défaut : réglé à l'œil sur ref/), v3voir (mise au point : 1 ombre, 2 albédo, 3 normale, 5 carte d'ombres, 6 élément de chaque pixel, magenta : rien de semé),
   v3prof (mise au point du coût de l'ombrage : 1 sans recette, 2 sans ambiance, 4 sans soleil, 8 sans pres(), 16 passe vide,
   64 sans recette au sol, 128 sans recette hors du sol).
   Optimisations de la qualité mobile (docs/moteur-v3.md, « Vers 30 images par seconde ») ; chacune se coupe pour comparer,
   aussi depuis l'adresse sur le téléphone (#v3&v3tapis=0) : v3tapis (tapis du sol, et ses réglages v3tapisN, v3tapisL,
   v3tapisS0, v3tapisBudget, v3tapisBias), v3damier, v3acc32 (accumulation en RGBA32F), capteur4 (capteur à quatre lectures
   par texel), sondeSync, expoSync (lectures bloquantes), v3sync (attente de la puce à chaque image), v3solPlein (ancien
   maillage du sol). Le bouton Mesurer les coupe tour à tour pendant la marche. */
const V3={ on:!!CFG.v3, grains:CFG.grains||(QUAL.full?2500000:300000), ombre:CFG.grainsOmbre||0, k:CFG.v3k||2.5,   // côté d'un grain = k × l'écart moyen : à 1,8 des grains ronds tirés au hasard laissaient 8 % de trous, à 2,5 moins de 1 %
   carte:CFG.v3carte||(QUAL.full?2048:1024),
  alpha:CFG.v3alpha||.18, max:CFG.v3max||64, detail:!!CFG.v3detail, gp:null, gb:null, sm:null, A:null, B:null, hist:null, histPose:null,
  n:0, frame:0, ms:0, msMoy:0, nImg:0, passes:{}, parts:null, semisT:null, semis:new Float32Array(4*SH_ROWS), maxPt:64, kf:CFG.v3kf||2.4,
  sol:{r0:.3, anneaux:96, secteurs:192, dmax:420},          // dmax : 150 m quand l'eau est à l'horizon (au-delà, le lanceur de rayons ne touche plus rien : c'est la mer)
  tap:{N:CFG.v3tapisN||512, L:Math.min(8,CFG.v3tapisL||7), s0:CFG.v3tapisS0||.01, budget:CFG.v3tapisBudget||32768, bias:CFG.v3tapisBias!==undefined?CFG.v3tapisBias:-.5, lv:[], f:[], t0:null, t1:null, cuits:0} };
/* Échelle de l'ombrage (docs/moteur-v3.md, « Échelle de l'ombrage » ; src/echelle.js). Le programme d'ombrage existe en deux
   tailles : le socle (#define SOCLE : soleil, carte d'ombres, ambiance, matière réduite), qui se compile partout, et la variante
   complète voulue par la fiche et la qualité (tapis, semis, atmosphère, rais). La page compile d'abord le socle et dessine dès
   qu'il est prêt ; ensuite seulement, sans bloquer, elle compile la variante complète et la met en service quand elle est prête.
   Le délai (DELAI_OMBRAGE, 40 s au moins) ne court que pendant la compilation RÉELLE de la variante : ni pendant qu'une autre
   compilation est encore en vol, ni pendant l'écran d'ouverture, ni page cachée. Dépassé, on reste au socle, mais la
   compilation continue en fond et sert si elle finit ; la variante se retente au chargement suivant. Seuls un plantage
   pendant sa compilation (« interrompu ») ou une erreur de compilation l'interdisent durablement sur cette machine
   (localStorage bodycam-ombrage). Hors ouverture, elle ne se lance qu'au calme : OMB.calme ms après la première image.
   CFG.ombrage : "socle" (rester au socle), "plein" (attendre la variante complète avant la première image : comportement
   d'avant, par défaut quand window.__CFG existe, pour que les captures de référence ne changent pas), "echelle" (défaut).
   Essais (tools/ombrage-essai.mjs) : CFG.ombrageJamais (la variante complète n'est jamais prête : échec simulé),
   CFG.ombrageDelai (délai d'abandon en ms, au lieu de DELAI_OMBRAGE). */
const OMB={ mode:CFG.ombrage||(window.__CFG?"plein":"echelle"), delai:CFG.ombrageDelai||ECHELLE.DELAI_OMBRAGE, calme:CFG.ombrageCalme!==undefined?CFG.ombrageCalme:12000, e:{}, mem:{}, empr:ECHELLE.empreinte(FS_V3OMBRAGE), sig:"", tSocle:0 };
addEventListener("pagehide",()=>{ if(OMB.perdu) return; try{ OMB.mem=ECHELLE.aLaFermeture(OMB.mem); localStorage.setItem(ECHELLE.CLE_OMBRAGE,JSON.stringify(OMB.mem)); }catch(_){} });   // fermeture normale : pas un plantage
try{ const r=ECHELLE.auDemarrage(ECHELLE.lireMemoire(localStorage.getItem(ECHELLE.CLE_OMBRAGE)),Date.now()); OMB.mem=r.mem;
  if(r.echecs.length){ localStorage.setItem(ECHELLE.CLE_OMBRAGE,JSON.stringify(OMB.mem)); r.echecs.forEach(k=>etapeGL("ombrage "+k+" : interrompu au chargement précédent, noté en échec")); } }catch(_){}
function ombMemoire(sig,evt,ms){ if(OMB.mode!=="echelle") return; OMB.mem=ECHELLE.noter(OMB.mem,sig,evt,{now:Date.now(),ms}); try{ localStorage.setItem(ECHELLE.CLE_OMBRAGE,JSON.stringify(OMB.mem)); }catch(_){} ombBouton(); }
function ombVoulue(){                                          // la variante complète que demandent la fiche et la qualité
  const atmo=S.atmo&&S.atmo[0]?1:0;
  const v={ tapis:!QUAL.full&&CFG.v3tapis!==false, semis:S.semN>0, atmo, rais:atmo&&QUAL.full?(CFG.rais!==undefined?Math.max(0,Math.min(16,CFG.rais|0)):10):0 };
  v.sig=ECHELLE.signature(v,OMB.empr); return v; }
function ombLancer(sig,defs,tapis,rais){                            // une variante, compilée sans attendre
  etapeGL("compilation : ombrage "+sig);
  const e={ sig, l:lancer(FS_V3OMBRAGE.replace("\n","\n"+defs+"\n"),VS,"ombrage "+(sig==="socle"?"socle":"complet")), t0:performance.now(), tv:performance.now(), cours:0, tapis, rais:rais||0, p:null, echec:"", ms:0 };
  return OMB.e[sig]=e; }                                       // le tapis du sol (qualité mobile) se compile après elle (ombAvancer)
function ombAvancer(e,socle){                                  // rend vrai quand la variante est prête ; au délai, reste au socle (la compilation continue)
  if(e.p) return true; if(e.echec&&e.echec!=="délai") return false;
  { const t=performance.now(), d=t-e.tv; e.tv=t;               // le délai ne court que pendant la compilation réelle de cette variante
    if(!ouvRepos&&!document.hidden&&!COMP.envol.some(x=>x!==e.l&&!x.note)) e.cours+=d; }
  let pret=(socle||!CFG.ombrageJamais)&&fini(e.l);
  if(pret&&e.tapis&&!V3.tapP){                                 // le tapis du sol va avec la variante qui le lit : lancé après elle, une compilation à la fois
    if(!V3.tapL){ if(compLibre(true)){ V3.tapL=lancer(v3Rel(FS_V3TAPIS),VS,"tapis du sol"); V3.tapRel=!!S.relOn; } pret=false; }
    else if(!fini(V3.tapL)) pret=false; }
  if(!pret){
    if(!socle&&!e.echec&&OMB.mode==="echelle"&&e.cours>OMB.delai){
      e.echec="délai"; ombMemoire(e.sig,"delai",e.cours); etapeGL("  ombrage "+e.sig+" : pas prêt en "+(OMB.delai/1000)+" s de compilation, on reste au socle (elle continue en fond)");
      if(!e.l.note){ e.l.nom+=" (délai)"; compNote(e.l); } }   // libère la file : la suite peut se compiler, on revient voir celle-ci à chaque image
    return false; }
  const fin=()=>{ e.p=finir(e.l); if(e.tapis&&!V3.tapP&&V3.tapL){ V3.tapP=finir(V3.tapL); V3.tapL=null; } };
  if(socle) fin();                                             // le socle (ou le mode plein) qui ne compile pas : l'erreur s'affiche, comme avant
  else try{ fin(); }
  catch(err){ e.echec="erreur"; e.p=null; e.tard=false; ombMemoire(e.sig,"erreur"); etapeGL("  ombrage "+e.sig+" : erreur de compilation, on reste au socle");
    const el=$("err"); if(!gl.isContextLost()){ el.style.display="none"; el.textContent=""; } return false; }
  e.tard=e.echec==="délai"; e.echec=""; e.ms=performance.now()-e.t0; if(!socle) ombMemoire(e.sig,"ok",e.ms);
  etapeGL("  compilé : ombrage "+e.sig+" en "+(e.ms/1000).toFixed(1)+" s"); return true; }
function v3Ombrage(){                                          // choisit le programme d'ombrage de cette image (V3.omb) ; faux : rien de prêt
  const v=ombVoulue(); OMB.sig=v.sig;
  for(const k in OMB.e){ const e=OMB.e[k]; if(!e.p&&(!e.echec||e.echec==="délai")&&k!=="socle") ombAvancer(e,false); }   // celles qui compilent encore (fiche quittée comprise)
  let P=OMB.e[v.sig]; const pleinePrete=!!(P&&P.p);
  let So=OMB.e.socle; const soclePret=!!(So&&So.p);
  // La variante complète se lance après la première image, ou pendant l'ouverture (le moteur s'y repose), une fois les formes compilées.
  const c=ECHELLE.choisir({ mode:OMB.mode, pleinePrete, soclePret, mem:OMB.mem, sig:v.sig, imageFaite:ouvRepos||(V3.nImg>0&&performance.now()-(V3.tImg1||1e12)>OMB.calme) });   // hors ouverture : au calme, pas dans les secondes qui suivent la première image
  if(c.socle&&!So&&compLibre(true)) So=ombLancer("socle","#define SOCLE 1\n#define TAPIS 0\n#define SEMO 0\n#define ATMO 0\n#define RAIS 0",false);
  if(c.socle&&So&&!soclePret&&ombAvancer(So,true)){ OMB.tSocle=So.ms; return v3Ombrage(); }
  if(c.tenter&&!P&&(OMB.mode==="plein"||v3Formes())&&compLibre(true)){ P=ombLancer(v.sig,"#define TAPIS "+(v.tapis?1:0)+"\n#define SEMO "+(v.semis?1:0)+"\n#define ATMO "+v.atmo+"\n#define RAIS "+v.rais,v.tapis,v.rais); if(OMB.mode==="echelle") ombMemoire(v.sig,"debut"); }
  if(OMB.mode==="plein"&&P&&!P.p&&ombAvancer(P,true)) return v3Ombrage();   // mode plein : comme avant, une erreur s'affiche
  V3.attendSocle=c.utiliser===null&&c.socle;
  const e=c.utiliser==="plein"?P:c.utiliser==="socle"?So:null; if(!e) return false;
  if(V3.omb!==e){                                              // mise en service : l'historique reprojeté se fond dans la nouvelle image (V3.n=0 : comme un mouvement), sans éclair
    if(V3.omb) V3.n=0;
    etapeGL("ombrage en service : "+(e===So?"socle":"complet "+e.sig)); V3.omb=e; }
  return true; }
function ombDiag(){                                           // pour le diagnostic (trois touches sur le chrono REC, et l'écran d'erreur)
  const L=[], e=V3.omb, So=OMB.e.socle, P=OMB.e[OMB.sig], f=ms=>(ms/1000).toFixed(1)+" s";
  L.push("Ombrage v3 ("+OMB.mode+") : "+(!e?"rien de prêt":e===So?"SOCLE":"complet "+e.sig));
  if(So) L.push("  socle : "+(So.p?"compilé en "+f(So.ms):"compilation depuis "+f(performance.now()-So.t0)));
  if(OMB.sig&&OMB.mode!=="socle") L.push("  voulu "+OMB.sig+" : "+(P?P.p?"compilé en "+f(P.ms)+(P.tard?" (après le délai)":""):P.echec==="délai"?"délai dépassé ("+f(P.cours)+" de compilation), continue en fond":P.echec?"échec ("+P.echec+")":"compilation depuis "+f(performance.now()-P.t0)+" ("+f(P.cours)+" comptées)":!ECHELLE.peutTenter(OMB.mem,OMB.sig)?"échec mémorisé, pas retenté":"pas encore lancé"));
  const m=ECHELLE.resumer(OMB.mem); if(m.length) L.push("  mémoire : "+m.join(" ; "));
  // Lancement (docs/moteur-v3.md, « Lancement sans gel ») : durée de chaque compilation, plus longue image des 10 premières secondes
  L.push("Compilations ("+COMP.lances+") : "+COMP.journal.map(j=>j.nom+" "+(j.ms/1000).toFixed(1)+" s").join(" · ")+(COMP.envol.some(x=>!x.note)?" · en cours : "+COMP.envol.filter(x=>!x.note).map(x=>x.nom).join(", "):""));
  if(COMP.premiers.length) L.push("Premiers dessins : "+COMP.premiers.map(x=>(x.ms/1000).toFixed(1)+" s"+(x.ouv?" (ouv.)":"")+" ["+x.noms+"]").join(" · "));
  L.push("Plus longue image des 10 premières s : "+Math.round(LONGUE.max)+" ms · gels : "+gelsTexte());
  const gk=Object.keys(GT.ms);
  L.push(GT.ext?"Puce (ms) : "+gk.map(k=>k+" "+GT.ms[k].toFixed(1)).join(" · ")+" · image "+(GT.total||0).toFixed(1):"Puce : pas de chronomètre (EXT_disjoint_timer_query_webgl2 absente), image "+Math.round(V3.msMoy)+" ms");
  const deux=Object.keys(GT.nImg).filter(k=>GT.nImg[k]>1); if(deux.length) L.push("  passes doublées : "+deux.map(k=>k+" ×"+GT.nImg[k]).join(", "));
  const r=regEtat(); L.push("Régulateur "+(REG.on?"":"(coupé) ")+": niveau "+REG.niveau+"/"+(REG_N.length-1)+", "+Math.round(REG.ms)+" ms pour "+regCible()+" · grains ×"+r.g+", feuilles ×"+r.fG+" ≤ "+r.fMax+" px, rais ×"+r.rais+", résolution ×"+r.res);
  return L.join("\n"); }
const ombPrepa=()=>{ const P=OMB.e[OMB.sig]; return !!(P&&!P.p&&!P.echec&&V3.omb===OMB.e.socle); };   // discret : la variante complète se compile (un léger à-coup est possible)
function ombBouton(){ const b=$("ombrage-raz"); if(b) b.hidden=!ECHELLE.echecs(OMB.mem).length; }
function ombRaz(){ try{ localStorage.removeItem(ECHELLE.CLE_OMBRAGE); }catch(_){} location.reload(); }   // remise à zéro de la mémoire : tout se retente
/* Variantes du semeur voulues par la fiche : RELIEF (bosses et buttes : terrainH) dans le semeur, le sol, les proches et le tapis ;
   HOUPPIER (charpentières et masses) dans le semeur et les proches. Jamais dans l'ombrage : il garde le terrainH d'origine
   (Direct3D), voir docs/moteur-v3.md, « Arbres habités et relief ». */
const v3Rel=src=>S.relOn?src.replace("\n","\n#define RELIEF 1\n"):src;
function v3Init(){                                             // rend vrai quand les programmes du semeur et un ombrage sont prêts (compilation sans bloquer)
  if((V3.gp||V3.lance) && (V3.avecRel!==!!S.relOn||V3.avecHp!==!!S.hpOn)){ V3.gp=null; V3.lance=null; }
  if(V3.tapRel!==!!S.relOn && (V3.tapP||V3.tapL)){ V3.tapP=null; V3.tapL=null; }   // le tapis cuit le sol (terrainH) : il suit la variante RELIEF
  if(V3.tapL&&!V3.tapP&&V3.omb&&V3.omb.p&&V3.omb.tapis&&fini(V3.tapL)){ V3.tapP=finir(V3.tapL); V3.tapL=null; }
  if(!V3.tapL&&!V3.tapP&&V3.omb&&V3.omb.p&&V3.omb.tapis&&compLibre(true)){ V3.tapL=lancer(v3Rel(FS_V3TAPIS),VS,"tapis du sol"); V3.tapRel=!!S.relOn; }
  if(!V3.gp){
  if(!V3.lance){ V3.avecRel=!!S.relOn; V3.avecHp=!!S.hpOn; V3.lance={}; etapeGL("compilation : moteur v3, un programme à la fois"); }
  // Les quatre programmes de la première image, un à un ; les deux variantes FORMES (objets, semis) viennent après le socle
  // (v3Formes), sauf en mode plein (captures de référence : tout avant la première image).
  const base=OMB.mode==="plein"?V3_PROGS:V3_PROGS.slice(0,8);
  for(const k of base){
    const x=V3.lance[k];
    if(!x){ if(compLibre(false)) V3.lance[k]=v3Lancer(k); V3.attendSocle=true; return false; }
    if(!fini(x)){ if(V3.attente!==k){ V3.attente=k; etapeGL("  en attente : v3 "+k); } V3.attendSocle=true; return false; }
  }
  const gp={}; for(const k of base){ gp[k]=finir(V3.lance[k]); delete V3.lance[k]; } V3.gp=gp; V3.nImg0=V3.nImg;   // montée progressive des grains (v3Budget)
  // Taille maximale d'un grain : plafonnée à 64 pixels, une surface vue de très près (tronc, bloc, mur) ne pouvait plus être couverte
  // et laissait voir à travers. Le plafond suit maintenant ce que la puce accepte, jusqu'à 320 pixels.
  V3.maxPt=Math.min(CFG.v3maxPt||320,gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]||1);
  V3.tapVide=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY,V3.tapVide); gl.texStorage3D(gl.TEXTURE_2D_ARRAY,1,gl.RGBA8,1,1,1);
  V3.semisT=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,V3.semisT); gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,1,SH_ROWS);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  }
  if(OMB.e.socle&&OMB.e.socle.p&&V3.gp.grainsF) v3Mou();        // après les formes : la pâte (petite, celle des gestes), compilée d'office avant la variante complète
  const r=v3Ombrage();
  if(OMB.e.socle&&OMB.e.socle.p) v3Formes();                   // après le socle : les variantes FORMES, puis (v3Ombrage) la complète
  return r;
}
/* Le tampon G et la carte d'ombres partagent un seul programme par variante du semeur (uVue dans v3_gbuf.frag) : sur Direct3D,
   le source de sommets du semeur était compilé deux fois (v3 grains 14,5 s et v3 ombre 11 s sur le PC de Toine). Et le semeur
   est coupé en un programme par famille (FAM dans v3_grains.vert : arbres, perches, blocs, feuilles), chacun dessinant sa
   tranche de grains : FXC compile bien plus vite quatre petits programmes qu'un gros. */
const V3_FAM={grainsA:1,grainsB:2,grainsR:3,grainsL:4};
const V3_PROGS=["sol","grainsA","grainsB","grainsR","grainsL","prochesO","prochesB","prochesT","grainsF"];
const V3_PF={prochesO:1,prochesB:2,prochesT:3,prochesM:1};    // éléments proches, une famille par programme (PF dans v3_proches) : formes (objets, semis), blocs, troncs ; objets mous (PATE)
function v3Tranches(G,ps,vue){                                 // [programme, premier grain, fin] de chaque famille ; vue du soleil : pas de feuilles de canopée
  const t=[[G.grainsA,0,ps.part[0]],[G.grainsB,ps.part[0],ps.part[1]],[G.grainsR,ps.part[1],ps.part[2]]];
  if(!vue) t.push([G.grainsL,ps.part[2],ps.part[3]]);
  t.push([BANC.v&&BANC.v.sansF?null:G.grainsF,ps.part[3],ps.total]); return t; }
function v3Lancer(k,compte){                                   // un programme du semeur, dans la variante voulue par la fiche (compte : PRXCOMPTE, essais)
  const F=src=>src.replace("\n","\n#define FORMES 1\n");   // variante du semeur pour les formes (objets, semis) : voir v3_grains.vert
  const R=v3Rel, Hp=src=>R(V3.avecHp?src.replace("\n","\n#define HOUPPIER 1\n"):src);
  const SP=V3_FAM[k]?[FS_V3GBUF,Hp(VS_V3GRAINS).replace("\n","\n#define FAM "+V3_FAM[k]+"\n")]:
    V3_PF[k]?[Hp(FS_V3PROCHES),Hp(VS_V3PROCHES)].map(x=>x.replace("\n","\n#define PF "+V3_PF[k]+(k==="prochesM"?"\n#define PATE 1":"")+(compte?"\n#define PRXCOMPTE 1":"")+"\n")):
    { sol:[FS_V3GBUF,R(VS_V3SOL)], grainsF:[F(FS_V3GBUF),F(R(VS_V3GRAINS))] }[k];
  return lancer(SP[0],SP[1],"v3 "+k+(compte?" (compte)":""));
}
function v3Formes(){                                           // rend vrai quand les deux variantes FORMES sont en service
  if(!V3.gp) return false; if(V3.gp.grainsF) return true;
  for(const k of ["grainsF"]){
    if(V3.gp[k]) continue;
    const x=V3.lance[k];
    if(!x){ if(compLibre(false)) V3.lance[k]=v3Lancer(k); return false; }
    if(!fini(x)) return false;
    V3.gp[k]=finir(x); delete V3.lance[k];
  }
  return true;
}
/* Objets mous (lisse, creux, bosse : pâte, boue, neige, chair) : la variante PATE du programme des formes proches, compilée
   seulement quand un tel objet est visible, au calme (comme un gros programme), jamais avant la première image. Tant
   qu'elle n'est pas prête, ses formes sont dessinées une à une, sans fondu (prochesO). */
function v3Mou(){
  if(!V3.gp||!V3.gp.prochesO) return false; if(V3.gp.prochesM) return true;
  const x=V3.lance.prochesM;
  if(!x){ if(compLibre(true)) V3.lance.prochesM=v3Lancer("prochesM"); return false; }
  if(!fini(x)) return false;
  V3.gp.prochesM=finir(x); delete V3.lance.prochesM; if(!ouvRepos) V3.chaufferMou=true; return true;   // premier dessin (vide) au calme, pas au premier geste
}
function v3Cibles(){                                          // tampon G (2 textures + profondeur), carte d'ombres, accumulation
  if(!V3.gb||V3.gb.w!==W||V3.gb.h!==H){
    v3Libere(true);
    const tex=fmt=>{ const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t); gl.texStorage2D(gl.TEXTURE_2D,1,fmt,W,H);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST); return t; };
    const g={w:W,h:H,t0:tex(gl.RGBA32F),t1:tex(CFG.v3g32?gl.RGBA32F:gl.RGBA16F),   // normale et distance : 16 bits suffisent, et la bande passante compte sur téléphone
      rb:gl.createRenderbuffer(),f:gl.createFramebuffer()};
    gl.bindRenderbuffer(gl.RENDERBUFFER,g.rb); gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,W,H);
    gl.bindFramebuffer(gl.FRAMEBUFFER,g.f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,g.t0,0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,g.t1,0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,g.rb);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) fail("Moteur v3 : tampon G incomplet.");
    // Qualité mobile : accumulation en RGBA16F filtrable (moitié moins d'octets à lire et écrire ; le capteur la lit en une
    // lecture filtrée au lieu de quatre). Option v3acc32 : l'ancienne accumulation en RGBA32F.
    const a16=(!QUAL.full||!!CFG.v3acc16)&&!CFG.v3acc32,   // v3acc16 : mise au point, accumulation en RGBA16F en qualité complète aussi
          fa=a16?gl.RGBA16F:ACC_FMT, fl=a16?gl.LINEAR:gl.NEAREST;
    V3.gb=g; V3.A=target(W,H,fa,fl); V3.B=target(W,H,fa,fl); V3.A.lin=V3.B.lin=a16;
    if(!V3.A.ok){ freeT(V3.A); freeT(V3.B); V3.A=target(W,H,ACC_FMT,gl.NEAREST); V3.B=target(W,H,ACC_FMT,gl.NEAREST); } V3.hist=null; V3.n=0;
  }
  const smH=Math.round(V3.carte*v3CarteH()/55);               // texels carrés : la carte est moins haute que large quand le soleil est bas
  if(!V3.sm||V3.sm.w!==V3.carte||V3.sm.h!==smH){
    if(V3.sm){ gl.deleteTexture(V3.sm.t); gl.deleteFramebuffer(V3.sm.f); }
    const s={w:V3.carte,h:smH,t:gl.createTexture(),f:gl.createFramebuffer()};
    gl.bindTexture(gl.TEXTURE_2D,s.t); gl.texStorage2D(gl.TEXTURE_2D,1,gl.DEPTH_COMPONENT24,s.w,s.h);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER,s.f); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,s.t,0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) fail("Moteur v3 : carte d'ombres incomplète.");
    V3.sm=s;
  }
}
function v3CarteH(){ const y=Math.max(.05,S.sunDir[1]); return Math.min(55,Math.round((55*y+14)/5)*5); }   // demi-hauteur de la carte d'ombres (m), arrondie
function v3Libere(seulementEcran){
  const g=V3.gb; if(g){ gl.deleteTexture(g.t0); gl.deleteTexture(g.t1); gl.deleteRenderbuffer(g.rb); gl.deleteFramebuffer(g.f); }
  freeT(V3.A); freeT(V3.B); V3.gb=V3.A=V3.B=V3.hist=null; V3.n=0;
  if(!seulementEcran&&V3.sm){ gl.deleteTexture(V3.sm.t); gl.deleteFramebuffer(V3.sm.f); V3.sm=null; V3.smP=null; }
  if(!seulementEcran&&V3.tap.t0){ const T=V3.tap; gl.deleteTexture(T.t0); gl.deleteTexture(T.t1); T.f.forEach(f=>gl.deleteFramebuffer(f)); T.t0=T.t1=null; T.f=[]; T.lv=[]; }
}
/* Tapis du sol (v3_tapis.frag) : la matière du sol cuite dans des textures ancrées au monde, L niveaux de N × N texels,
   texel de s0 au niveau 0 et doublé à chaque niveau (1 cm, 2 cm… 64 cm : de ±2,5 m à ±160 m autour de la caméra).
   Chaque niveau est un tore : quand la caméra avance, on ne cuit que les bandes de 16 texels qui entrent dans sa fenêtre.
   Au premier remplissage (ou après un saut), un niveau se cuit par tranches de lignes, dans un budget de texels par image :
   tant qu'il n'est pas prêt, l'ombrage revient à recette() pour ces pixels. Mémoire : 2 × L × N² × 4 octets (14,7 Mo par défaut).
   Options : v3tapis (false le coupe ; par défaut en qualité mobile seulement), v3tapisN, v3tapisL, v3tapisS0 (m),
   v3tapisBudget (texels cuits par image au plus), v3tapisBias (niveau choisi : négatif = plus fin). */
function v3TapisActif(){ return !!(V3.omb&&V3.omb.p&&V3.omb.tapis&&V3.tapP)&&(OPT.tapis!==undefined?!!OPT.tapis:!QUAL.full); }
function v3Tapis(p){
  const T=V3.tap; T.cuits=0;
  if(!v3TapisActif()) return false;
  const N=T.N, L=T.L, PAS=16;
  if(!T.t0){
    const arr=()=>{ const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY,t); gl.texStorage3D(gl.TEXTURE_2D_ARRAY,1,gl.RGBA8,N,N,L);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT); return t; };
    T.t0=arr(); T.t1=arr(); T.f=[]; T.lv=[];
    for(let k=0;k<L;k++){ const f=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,f);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,T.t0,0,k); gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,T.t1,0,k);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){ etapeGL("tapis du sol : cible incomplète, coupé"); T.panne=true; }
      T.f.push(f); T.lv.push({O:[0,0],pret:false,fill:-1}); }
  }
  if(T.panne) return false;
  const cle=JSON.stringify([seed,S.surf,S.traj,S.rel,S.relB,S.relC,S.creux,S.kit,matVersion,S.sunDir,S.kitP,S.can,S.houp,S.trou,S.trou2]);   // tout ce dont dépend la cuisson
  if(cle!==T.cle){ T.cle=cle; T.lv.forEach(l=>{ l.pret=false; l.fill=-1; }); }
  const G=V3.tapP, u=G.u; gl.useProgram(G.p); v3Monde(u,N,N,p); gl.uniform1i(u.uTapN,N);
  gl.viewport(0,0,N,N); gl.enable(gl.SCISSOR_TEST);
  let budget=T.budget;
  const md=v=>((v%N)+N)%N;
  const cuire=(k,O,x,y,w,h)=>{ gl.bindFramebuffer(gl.FRAMEBUFFER,T.f[k]); gl.uniform2i(u.uTapO,O[0],O[1]); gl.uniform1f(u.uTapS,T.s0*2**k);
    gl.scissor(x,y,w,h); draw(); budget-=w*h; T.cuits+=w*h; T.dernier=k; };
  const bande=(k,O,axe,a,n)=>{ const c0=md(a), n1=Math.min(n,N-c0);   // n colonnes (axe 0) ou lignes (axe 1) du monde à partir de a, rangées en tore
    for(const [c,m] of [[c0,n1],[0,n-n1]]) if(m>0){ if(axe===0) cuire(k,O,c,0,m,N); else cuire(k,O,0,c,N,m); } };
  for(let k=0;k<L&&budget>0;k++){
    const sk=T.s0*2**k, l=T.lv[k];
    const veut=[Math.round((Math.floor(p.pos[0]/sk)-N/2)/PAS)*PAS,Math.round((Math.floor(p.pos[2]/sk)-N/2)/PAS)*PAS];
    if(l.pret&&(Math.abs(veut[0]-l.O[0])>=N/2||Math.abs(veut[1]-l.O[1])>=N/2)){ l.pret=false; l.fill=-1; }   // saut : on recommence ce niveau
    if(!l.pret){
      if(l.fill<0){ l.O=veut; l.fill=0; }
      const rows=Math.min(N-l.fill,Math.floor(budget/N)); if(rows<=0) break;
      cuire(k,l.O,0,l.fill,N,rows); l.fill+=rows; if(l.fill>=N) l.pret=true;
      continue;
    }
    for(let axe=0;axe<2;axe++) while(budget>0&&veut[axe]!==l.O[axe]){   // la fenêtre glisse, bande par bande
      const d=Math.max(-PAS,Math.min(PAS,veut[axe]-l.O[axe])), O=l.O.slice(); O[axe]+=d;
      bande(k,O,axe,d>0?l.O[axe]+N:O[axe],Math.abs(d)); l.O=O;
    }
  }
  gl.disable(gl.SCISSOR_TEST);
  return T.lv.some(l=>l.pret);
}
const tapO=new Int32Array(16);
function v3TapisUniformes(u){
  const T=V3.tap; let pret=0;
  if(v3TapisActif()&&!T.panne&&T.t0){ T.lv.forEach((l,k)=>{ if(l.pret) pret|=1<<k; tapO[2*k]=l.O[0]; tapO[2*k+1]=l.O[1]; }); }
  gl.uniform1i(u.uTapL,pret?T.L:0); gl.uniform1i(u.uTapPret,pret);
  if(pret){ gl.uniform2iv(u.uTapO,tapO); gl.uniform1f(u.uTapS0,T.s0); gl.uniform1i(u.uTapN,T.N); gl.uniform1f(u.uTapBias,T.bias); }
  gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D_ARRAY,T.t0||V3.tapVide); gl.uniform1i(u.uTap0,7);
  gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D_ARRAY,T.t1||V3.tapVide); gl.uniform1i(u.uTap1,8);
}
/* Demi-ouverture du cap à semer. Au loin : le plus grand écart de cap parmi les directions du bord de l'image proches de
   l'horizon, plus une marge. Tout près : tout le tour si l'image contient le nadir ou le zénith (regard vers les pieds). */
function v3Cap(p){
  const m=p.mat, a=W/H, fish=1.09/(.5*Math.max(1,a)), cap=Math.atan2(m[6],m[8]);
  const dir=(x,y)=>{ const rr=Math.hypot(x,y)||1e-5, an=rr*fish, s=Math.sin(an)/rr, l=[x*s,y*s,Math.cos(an)];
    return [m[0]*l[0]+m[3]*l[1]+m[6]*l[2],m[1]*l[0]+m[4]*l[1]+m[7]*l[2],m[2]*l[0]+m[5]*l[1]+m[8]*l[2]]; };
  let pole=false;
  for(const sy of [-1,1]){                                     // zénith ou nadir dans l'image ?
    const l=[m[1]*sy,m[4]*sy,m[7]*sy], an=Math.acos(Math.max(-1,Math.min(1,l[2]))), sxy=Math.hypot(l[0],l[1])||1e-6;
    const u=l[0]/sxy*an/fish, v=l[1]/sxy*an/fish; if(Math.abs(u)<.5*a+.05&&Math.abs(v)<.55) pole=true; }
  let loin=0, tout=0;
  for(let i=0;i<64;i++){ const t=i/64*4, x=(t<1?t-.5:t<2?.5:t<3?2.5-t:-.5)*a, y=t<1?-.5:t<2?t-1.5:t<3?.5:3.5-t;
    const d=dir(x,y); let da=Math.atan2(d[0],d[2])-cap; da=Math.abs(Math.atan2(Math.sin(da),Math.cos(da)));
    tout=Math.max(tout,da); if(d[1]>-.35&&d[1]<.7) loin=Math.max(loin,da); }
  if(loin===0) loin=tout;
  return {cap,demi:Math.min(Math.PI,loin+.3),pres:pole?Math.PI:Math.min(Math.PI,tout+.3)};
}
function aireForme(ty,s){                                      // aire approchée d'une forme de base (demi-tailles s)
  const [x,y,z]=s; ty%=8;                                         // dents du peigne : même aire, à peu près
  if(ty===1){ const p=1.6; return 4*Math.PI*Math.pow((Math.pow(x*y,p)+Math.pow(x*z,p)+Math.pow(y*z,p))/3,1/p); }
  if(ty===2) return 2*Math.PI*x*2*y+2*Math.PI*x*x;
  if(ty===3) return Math.PI*x*(x+Math.hypot(x,2*y));
  if(ty===4) return 2*Math.PI*x*2*y+4*Math.PI*x*x;
  return 8*(x*y+y*z+x*z);
}
/* Objets de la fiche : poids de chaque objet (vu de la caméra : taille apparente ; vu du soleil : taille), aire de chaque
   forme. Couches de semis : aire de l'élément (ligne de tête de la couche), aire cumulée de chaque forme. Rangés dans une
   petite texture lue par les grains. */
function v3Semis(nb,vue,p){
  const d=V3.semis; d.fill(0);
  const ws=[], ai=[]; let tot=0;
  for(let i=0;i<S.objN;i++){ const o=i*16, row=shapesData[o+4], cn=shapesData[o+5], vis=shapesData[o+7]>.5, rad=shapesData[o+3];
    let a=0; for(let j=0;j<cn;j++){ const r=(row+j)*16; a+=shapesData[r+12]<0?0:aireForme(shapesData[r+3],[shapesData[r+4],shapesData[r+5],shapesData[r+6]]); }   // un creux n'est pas semé
    const dd=Math.max(1,Math.hypot(shapesData[o]-p.pos[0],shapesData[o+1]-p.pos[1],shapesData[o+2]-p.pos[2])-rad*.5);
    const w=vis?(vue===0?rad*rad/(dd*dd):rad*rad):0; ws.push(w); ai.push(a||1); tot+=w; }
  let cum=0;
  for(let i=0;i<S.objN;i++){ cum+=ws[i]; d[i*4]=tot>0?cum/tot:0; d[i*4+1]=tot>0?nb*(ws[i]/tot)/ai[i]:0;
    const o=i*16, row=shapesData[o+4], cn=shapesData[o+5]; let c=0;
    for(let j=0;j<cn;j++){ const r=(row+j)*16, a=shapesData[r+12]<0?0:aireForme(shapesData[r+3],[shapesData[r+4],shapesData[r+5],shapesData[r+6]]); c+=a;
      d[(row+j)*4]=c/ai[i]; d[(row+j)*4+1]=a; } }
  if(tot<=0) for(let i=0;i<S.objN;i++) d[i*4]=0;
  for(let k=0;k<S.semN;k++){ const r0=SEM0+k*SEM_L, a=semisAire(k); let c=0;
    d[r0*4]=a.tot; for(let j=0;j<a.formes.length;j++){ c+=a.formes[j]; d[(r0+4+j)*4]=c/a.tot; d[(r0+4+j)*4+1]=a.formes[j]; } }
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,V3.semisT); gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,1,SH_ROWS,gl.RGBA,gl.FLOAT,d);
  return tot>0;
}
function semisAire(k){                                         // aire des formes d'un élément de la couche k (repère de l'élément, arrondi compris)
  const r0=SEM0+k*SEM_L, cn=shapesData[(r0+1)*16+6], formes=[];
  for(let j=0;j<cn;j++){ const r=(r0+4+j)*16, ar=shapesData[r+13]; formes.push(aireForme(shapesData[r+3],[shapesData[r+4]+ar,shapesData[r+5]+ar,shapesData[r+6]+ar])); }
  return {formes,tot:formes.reduce((a,b)=>a+b,0)||1};
}
/* Partage du budget entre les familles, au prorata de la surface apparente qu'elles demandent (aire de l'objet / aire de
   sa cellule) : le recouvrement de l'écran reste le même pour toutes. Les grains tombés dans une cellule vide sont perdus :
   un monde plus dense en perd moins, il ne coûte pas plus. Une couche de semis demande la moitié de l'aire de son élément
   (la face vue) par cellule, fois sa densité ; une rangée n'occupe qu'une bande de part et d'autre du trajet, comptée pour
   la part d'une bande de 40 m qu'elle couvre. Le partage suit d'elle-même la fiche : une couche de plus, et chacun en reçoit moins. */
function v3Partage(N,vue,p){
  const tr=S.kit===0&&S.kitP[0]>0, pe=tr&&S.houp[3]>0, bl=S.kitP[1]>0;
  const coeur=S.houp[0]>.5?.36*2*2.2*14:0;                     // cœur des conifères (rayon moyen × hauteur, en gros)
  const hA=S.hpOn?S.surfP[0]*aireHoupJS(0,.245)+(1-S.surfP[0])*aireHoupJS(1,.245):0;   // houppiers : bois et masses de feuillage
  const hB=S.hpOn?S.surfP[1]*aireHoupJS(2,.07)+(1-S.surfP[1])*aireHoupJS(3,.07):0;
  const w=[tr?(6.8+coeur+hA)/36:0, pe?(.95+hB)/10.9:0, bl?3.4/72.25:0];
  const ws=[0,0,0,0], R=[0,0,0,0];
  for(let k=0;k<S.semN;k++){ const o=(SEM0+k*SEM_L)*16, A=[shapesData[o],shapesData[o+1]], dens=shapesData[o+4], rg=shapesData[o+7]>.5;
    const J=shapesData.subarray(o+16,o+32), sc=(J[2]+J[3])/2, sy=(J[4]+J[5])/2, a=semisAire(k).tot*sc*sc*(.3+.7*sy);
    const cotes=shapesData[o+10]===0?2:1, bande=rg?Math.min(1,cotes*J[7]*A[0]/40):1;
    ws[k]=.5*a*dens*(1-.5*shapesData[o+5])/(A[0]*A[1])*bande;
    R[k]=Math.hypot(J[12],J[14])*J[3]+Math.hypot(J[8],J[10])*J[3]+Math.hypot(J[0],J[1]); }   // demi-étendue horizontale de l'élément, décalage compris
  const fF=vue===0&&S.kit===0&&S.kitP[2]>0&&!S.hpOn?.28:0;      // avec des houppiers, les feuilles sont sur les arbres : plus de feuilles semées dans la voûte
  const ob=S.objN>0&&v3Semis(1,vue,p), fP=ob?(vue===0?(v3Proches().on?0:.12):.1):0;   // vus de la caméra, les objets sont dessinés en boîtes (v3Proches)
  if(!ob&&S.semN) v3Semis(1,vue,p);
  const sw=w[0]+w[1]+w[2]+ws[0]+ws[1]+ws[2]+ws[3], solide=N*(1-fF-fP);
  const n=x=>sw>0?Math.round(solide*x/sw):0;
  const nA=n(w[0]), nB=n(w[1]), nR=n(w[2]), nS=ws.map(n);
  const nF=Math.round(N*fF), nP=ob?Math.round(N*fP):0;
  if(ob) v3Semis(nP,vue,p);
  const fin=a=>{ const pS=[]; let c=a; for(let k=0;k<4;k++){ c+=nS[k]; pS.push(c); } return pS; };
  if(vue===1){ const traits=Math.round(nB*.95/(.95+hB)*.35), nBh=Math.round(nB*hB/(.95+hB));   // vue du soleil : les troncs des perches en traits (voir semeBTrait), leur houppier en grains
    const pO=nA+nBh+nR+nF+nP, pS=fin(pO);
    return {nA,nB:nBh,nR,nF,nP,nS,R,traits,part:[nA,nA+nBh,nA+nBh+nR,nA+nBh+nR+nF],partO:pO,partS:pS,total:pS[3]}; }
  const pO=nA+nB+nR+nF+nP, pS=fin(pO);
  return {nA,nB,nR,nF,nP,nS,R,traits:0,part:[nA,nA+nB,nA+nB+nR,nA+nB+nR+nF],partO:pO,partS:pS,total:pS[3]};
}
/* Éléments proches (v3_proches.vert) : une fenêtre fixe d'emplacements autour de la caméra. Toutes les formes des objets
   (64 au plus), 5 × 5 cellules de blocs, 3 × 3 cellules d'arbres (le tronc, et le cœur des conifères), 5 × 5 de perches, et pour chaque couche de semis la fenêtre de cellules qui couvre une dizaine de
   mètres (au plus 2 cellules de part et d'autre, une ou deux rangées par rive). Option v3proches (false : tout en grains). */
const PRX_VPS=6*5*5*6;                                          // sommets par emplacement (v3_proches.vert : NS = 5)
function v3Proches(){
  const on=CFG.v3proches!==false&&CFG.v3proches!==0&&!(BANC.v&&BANC.v.sansPrx);
  const r={on,o:0,b:0,a:0,p:0,n:[0,0,0,0],fin:[0,0,0,0],total:0};
  if(!on) return r;
  r.o=S.objRows||0; r.b=S.kitP[1]>0?25:0;
  r.a=S.kit===0&&S.kitP[0]>0?9:0; r.p=S.kit===0&&S.kitP[0]>0&&S.houp[3]>0?25:0;   // troncs (3 × 3 cellules), perches (5 × 5)
  let c=r.o+r.b+r.a+r.p;
  for(let k=0;k<4;k++){
    if(k<S.semN){ const o=(SEM0+k*SEM_L)*16, rg=shapesData[o+7]>.5, A=[shapesData[o],shapesData[o+1]], cn=shapesData[(SEM0+k*SEM_L+1)*16+6];
      const n=Math.max(0,Math.min(2,Math.ceil(10/(rg?A[1]:Math.max(A[0],A[1])))-0)), w=2*n+1;
      const cells=rg?w*Math.min(2,shapesData[(SEM0+k*SEM_L+1)*16+7])*(shapesData[o+10]===0?2:1):w*w;
      r.n[k]=n; c+=cells*cn; }
    r.fin[k]=c; }
  r.total=c; return r;
}
function v3Grains(u,ps){                                       // uniformes du partage, communs aux deux vues
  gl.uniform4iv(u.uPart,ps.part); gl.uniform1i(u.uPartO,ps.partO); gl.uniform4iv(u.uPartS,ps.partS); gl.uniform1i(u.uTotal,ps.total);
  gl.uniform4fv(u.uNbS,ps.nS); gl.uniform4fv(u.uSemR,ps.R); gl.uniform1f(u.uKf,V3.kf);
}
function v3Monde(u,w,h,p){                                    // uniformes de monde.glsl (mêmes valeurs que common())
  gl.uniform2f(u.uRes||null,w,h); gl.uniform3fv(u.uCamPos||null,p.pos); gl.uniformMatrix3fv(u.uCam||null,false,p.mat);
  gl.uniform1f(u.uFish||null,1.09/(.5*Math.max(1,w/h))/cam.zoom); gl.uniform1f(u.uFog||null,S.fog); gl.uniform3fv(u.uSeed||null,seed);
  gl.uniform3fv(u.uSunDir||null,S.sunDir); gl.uniform3fv(u.uSun||null,S.sun); gl.uniform3fv(u.uSky||null,S.sky); gl.uniform1f(u.uTorch||null,S.torch);
  gl.uniform1i(u.uKit||null,S.kit); gl.uniform4fv(u.uKitP||null,S.kitP); gl.uniform1i(u.uMode||null,0);
  gl.uniform2fv(u.uCan||null,S.can); gl.uniform4fv(u.uHoup||null,S.houp);
  gl.uniform4fv(u.uLoin||null,S.loin); gl.uniform3fv(u.uLoinCol||null,S.loinCol); gl.uniform3fv(u.uLoinBas||null,S.loinBas);
  if(u.uShapes) bindTex(3,shapesT,u.uShapes); gl.uniform1i(u.uObjN||null,S.objN); gl.uniform4fv(u.uTrou||null,S.trou); gl.uniform4fv(u.uTrou2||null,S.trou2);
  if(u.uMats){ bindTex(4,matT,u.uMats); gl.uniform4iv(u.uSurf,S.surf); gl.uniform4iv(u.uSurfT,S.surfT); gl.uniform4fv(u.uSurfP,S.surfP); }
  gl.uniform4fv(u.uRel||null,S.rel); gl.uniform4fv(u.uTraj||null,S.traj); gl.uniform4fv(u.uCreux||null,S.creux);   // relief et trajet de la fiche
  if(u.uRelB){ gl.uniform4fv(u.uRelB,BANC.v&&BANC.v.sansRel?[0,S.relB[1],0,S.relB[3]]:S.relB); gl.uniform4fv(u.uRelC,S.relC); gl.uniform2fv(u.uRelS,S.relS); }   // bosses et buttes (variante RELIEF ; banc : sans)
  if(u.uHp) gl.uniform4fv(u.uHp,S.hp); if(u.uHpC) gl.uniform3fv(u.uHpC,S.hpC);   // houppiers (variante HOUPPIER)
  gl.uniform1i(u.uSemN||null,S.semN); gl.uniform4fv(u.uSemTop||null,S.semTop); gl.uniform1f(u.uNuit||null,S.lum);
  gl.uniform4fv(u.uEau||null,S.eau||[0,0,0,0]);
  atmoUniformes(u,p,Math.round((V3.omb&&V3.omb.rais||0)*regEtat().rais));   // le régulateur peut réduire les pas des rais (borne : RAIS)
}
/* Atmosphère : uAtmo (modèle, trouble, brume basse au sol, hauteur d'échelle) et uAtmo2 (sol de référence de la brume basse :
   celui de la caméra ; force du rebord ; pas des rais dans la carte d'ombres, v3 en qualité complète seulement ; troncs par
   mètre pour l'ombre statistique). Le nombre de pas est une constante de la variante compilée (#define RAIS) ; uAtmo2.z n'en est
   que l'écho. Option rais : nombre de pas (0 : sans rais, 16 au plus). */
function troncsParMetre(){ return S.kit===0?(S.kitP[0]>0?S.kitP[0]/36*.5:0)+(S.houp[3]>0?S.kitP[0]*.8*S.houp[3]/10.9*.14:0):0; }
function atmoUniformes(u,p,rais){
  if(!u.uAtmo) return;
  gl.uniform4fv(u.uAtmo,S.atmo||[0,0,0,1]);
  gl.uniform4f(u.uAtmo2||null,terrainH(p.pos[0],p.pos[2]),S.atmo&&S.atmo[0]?S.atmoRebord:0,S.atmo&&S.atmo[0]?rais:0,troncsParMetre());
}
const px3=new Float32Array(4);
/* Attendre la fin du calcul graphique d'UNE cible : sur une puce à tuiles (Mali), lire un pixel ne force que la cible lue.
   Lire une autre cible (comme le faisait la première version) ne mesure rien : le vrai travail se cachait jusqu'à l'affichage. */
const u8s=new Uint8Array(4);
function v3Sync(t){
  if(t===null){ gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,u8s); return; }
  gl.bindFramebuffer(gl.FRAMEBUFFER,(t||dummy).f);
  if(t&&t.u8) gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,u8s); else gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,px3);   // une cible RGBA8 ne se lit qu'en octets
}
/* Temps de la puce par passe (EXT_disjoint_timer_query_webgl2, quand la carte le propose) : une requête par passe, lue
   quelques images plus tard sans attendre. Sans l'extension, seul l'intervalle entre deux images est connu. GT.n compte les
   passes d'une image : aucune ne doit tourner deux fois (diagnostic). Option chronoGpu:false pour couper. */
const GT={ ext:CFG.chronoGpu===false?null:gl.getExtension("EXT_disjoint_timer_query_webgl2"), libres:[], attente:[], cur:null, ms:{}, n:{}, nImg:{}, img:0 };
function gpuDebut(nom){
  if(!GT.ext) return; gpuFin();
  const q=GT.libres.pop()||gl.createQuery(); gl.beginQuery(GT.ext.TIME_ELAPSED_EXT,q); GT.cur={q,nom,img:GT.img,v:BANC.vi};
  GT.n[nom]=(GT.n[nom]||0)+1; }
function gpuFin(){ if(!GT.cur) return; gl.endQuery(GT.ext.TIME_ELAPSED_EXT); GT.attente.push(GT.cur); GT.cur=null; }
function gpuImage(){                                           // fin d'une image : passes comptées, résultats arrivés
  for(const k in GT.n){ GT.nImg[k]=GT.n[k]; } GT.n={}; GT.img++;
  if(!GT.ext) return;
  const dj=gl.getParameter(GT.ext.GPU_DISJOINT_EXT);
  while(GT.attente.length){ const a=GT.attente[0];
    if(!gl.getQueryParameter(a.q,gl.QUERY_RESULT_AVAILABLE)) break;
    GT.attente.shift(); const ms=gl.getQueryParameter(a.q,gl.QUERY_RESULT)/1e6; GT.libres.push(a.q);
    if(dj) continue;
    if(a.v>=0&&BANC.rec) BANC.rec.push({v:a.v,nom:a.nom,ms,img:a.img});
    GT.ms[a.nom]=GT.ms[a.nom]===undefined?ms:GT.ms[a.nom]*.8+ms*.2;
    if(a.img!==GT.dernImg){ if(GT.dernImg!==undefined) GT.total=GT.somme; GT.somme=0; GT.dernImg=a.img; } GT.somme+=ms; }
  if(GT.attente.length>48) GT.attente.splice(0,GT.attente.length-48).forEach(a=>GT.libres.push(a.q));
}
/* Régulateur du budget (triptyque : le coût par image est fixe, c'est la finesse qui s'adapte). Si l'image dépasse sa cible
   (18 ms en qualité complète, 33 ms en mobile) pendant une seconde, on descend d'un niveau ; avec de la marge (moins de 65 %
   de la cible) pendant trois secondes, on remonte. Mesure : temps de la puce quand il est connu, sinon intervalle entre images.
   Niveaux, dans l'ordre : feuilles proches moins recouvertes et plus petites, moins de grains, moins de pas de rais,
   résolution interne plus basse. Option regulateur:false (défaut des captures d'essai, window.__CFG) pour le couper. */
/* Un geste lourd à l'écran (effort accroupi, ramassage, façonnage : mains et pâte de près, cadrage zoomé) : le régulateur
   réagit plus vite, réduit d'abord grains, feuilles et rais (ce qui ne se voit pas alors) et garde la résolution ; la carte
   d'ombres n'est refaite qu'une image sur six. */
const enGeste=()=>!!mainsObj||cam.zoom>1.05||!!(queue[0]&&/^(effort|ramasser|faconner)$/.test(queue[0].type));
const REG_G=[ {g:1, fG:.6, fMax:128, rais:1, res:1}, {g:.7, fG:.5, fMax:48, rais:.5, res:1}, {g:.5, fG:.4, fMax:32, rais:0, res:1},
  {g:.35, fG:.4, fMax:28, rais:0, res:1}, {g:.28, fG:.4, fMax:28, rais:0, res:.85}, {g:.22, fG:.4, fMax:24, rais:0, res:.7} ];
const REG_N=[ {g:1, fG:.6, fMax:128, rais:1, res:1}, {g:1, fG:.6, fMax:64, rais:1, res:1}, {g:.75, fG:.5, fMax:48, rais:1, res:1},
  {g:.55, fG:.5, fMax:40, rais:.5, res:1}, {g:.4, fG:.4, fMax:32, rais:.3, res:.85}, {g:.32, fG:.4, fMax:28, rais:0, res:.7} ];
const REG={ on:CFG.regulateur!==undefined?!!CFG.regulateur:!window.__CFG, niveau:0, ms:0, haut:0, bas:0, t:0, change:0, vu:{}, quand:{} };
function regCible(){ return CFG.cibleMs||(QUAL.full?18:33); }
function regMesure(dt,dtBrut){                                 // après chaque image v3 en marche ou accumulée
  if(!REG.on) return;
  // Sans chronomètre de la puce : l'intervalle entre deux images (il ne descend pas sous celui de l'écran, 16,7 ms à 60 Hz :
  // on remonte alors dès qu'on tient la cible, au lieu d'attendre une marge qu'on ne peut pas voir).
  const puce=GT.ext&&GT.total>0, m=puce?GT.total:dtBrut; if(!(m>0)||m>2000) return;
  REG.ms=REG.ms?REG.ms*.85+m*.15:m;
  const c=regCible(), now=performance.now(), g=enGeste();
  if(REG.geste&&!g){ REG.vu={}; }                              // fin du geste : la scène a changé, les niveaux quittés pendant le geste se retentent
  if(g!==REG.geste){ REG.geste=g; regNiveau(REG.niveau); }      // l'échelle change (REG_G / REG_N) au même niveau
  if(REG.ms>c*1.1) { REG.haut+=dt*(g?4:1); REG.bas=0; } else if(REG.ms<c*(puce?.65:.95)) { REG.bas+=dt; REG.haut=0; } else { REG.haut=0; REG.bas=0; }
  if(now-REG.change<(g?400:1500)) return;                      // le temps que le niveau précédent se mesure (geste : vite)
  let k=REG.niveau;
  /* Pas de pompage : on ne remonte pas vers un niveau qu'on vient de quitter parce qu'il dépassait la cible (mesuré au-dessus
     de 100 % il y a moins de 20 s). Passé ce temps (la scène a pu changer), on réessaie. */
  const retour=j=>!(REG.vu[j]>c&&now-REG.quand[j]<20000);
  if(REG.haut>1&&k<REG_N.length-1) k++; else if(REG.bas>3&&k>0&&retour(k-1)) k--;
  if(k!==REG.niveau) regNiveau(k);
}
function regNiveau(k){
  const avant=REG_N[REG.niveau]; REG.vu[REG.niveau]=REG.ms; REG.quand[REG.niveau]=performance.now();   // ce que coûtait le niveau quitté
  REG.niveau=k; REG.haut=REG.bas=0; REG.change=performance.now(); REG.ms=0;
  etapeGL("régulateur : niveau "+k);
  const L=REG.geste?REG_G:REG_N; if(REG_RES!==L[k].res){ REG_RES=L[k].res; REG.redim=true; }   // au début de l'image suivante (frame) : pas au milieu de celle-ci
}
const regEtat=()=>(REG.on&&REG.geste?REG_G:REG_N)[REG.on?REG.niveau:0];
/* Montée progressive au démarrage : les premières images ne sèment qu'une part du budget (la puce compile peut-être encore,
   et la première seconde ne doit pas cumuler compilation et rendu plein pot). Pas dans les captures d'essai (window.__CFG). */
function v3Budget(){
  const k=regEtat().g, r=CFG.rampe!==undefined?!!CFG.rampe:!window.__CFG, m=r?Math.min(1,.2+.08*(V3.nImg-(V3.nImg0||0))):1;
  return Math.max(20000,Math.round(V3.grains*k*m*(BANC.v&&BANC.v.g||1)));
}
/* Remplissage des grains de la caméra (balade.remplissage(), mise au point) : chaque fragment ajoute 1 dans une cible RGBA16F,
   sans test de profondeur ; 1 : fragments tramés (ce que paie la puce), 2 : fragments gardés (après la découpe des feuilles et
   des grains ronds). Lecture bloquante : jamais dans la boucle normale. */
function v3Compter(semer){
  const c=V3.compte; V3.compte=null;
  const t=[0,1].map(()=>{ const x=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,x); gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA16F,W,H); return x; });
  const fb=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  t.forEach((x,i)=>gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,x,0)); gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
  const r={ pixels:W*H };
  for(const k of [1,2]){
    gl.clearBufferfv(gl.COLOR,0,[0,0,0,0]); gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE);
    semer(k); gl.disable(gl.BLEND);
    const b=new Float32Array(W*H*4); gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,b);
    let n=0, mx=0; const parts=[0,0,0]; for(let i=0;i<b.length;i+=4){ n+=b[i]; if(b[i]>mx) mx=b[i]; parts[0]+=b[i+1]; parts[1]+=b[i+2]; parts[2]+=b[i+3]; }
    r[k===1?"trames":"gardes"]=Math.round(n); r[k===1?"tramesFeuillesBoisBlocs":"gardesFeuillesBoisBlocs"]=parts.map(Math.round); if(k===1) r.maxParPixel=mx;
  }
  gl.deleteFramebuffer(fb); t.forEach(x=>gl.deleteTexture(x));
  gl.bindFramebuffer(gl.FRAMEBUFFER,V3.gb.f); gl.enable(gl.DEPTH_TEST);
  c(r);
}
/* Coût des éléments proches (essais : balade.prochesCompte) : la même passe, avec les variantes PRXCOMPTE (compilées à la
   demande, de façon bloquante : jamais dans la boucle normale), dans une cible flottante additive, sans profondeur. Rend les
   pixels couverts (au moins un fragment), les fragments (chacun marche son rayon), les formes évaluées, par pixel couvert. */
function v3PrxCompte(p,px,jc,jit,e1,e2,e3){
  const ok=V3.prxCompte; V3.prxCompte=null; const C=V3.prxC||(V3.prxC={});
  const G=V3.gp, PM=S.mou&&G.prochesM?"prochesM":"prochesO";
  for(const k of new Set([PM,"prochesO","prochesB","prochesT"])) if(!C[k]) C[k]=finir(v3Lancer(k,true));
  const f32=!!gl.getExtension("EXT_float_blend"), t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t); gl.texStorage2D(gl.TEXTURE_2D,1,f32?gl.RGBA32F:gl.RGBA16F,W,H);
  const t2=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t2); gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA16F,W,H);
  const fb=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,t2,0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]); gl.clearBufferfv(gl.COLOR,0,[0,0,0,0]); gl.clearBufferfv(gl.COLOR,1,[0,0,0,0]);
  gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE);
  for(const [k,de,a] of [[PM,0,e1],["prochesB",e1,e2],["prochesT",e2,e3],["prochesO",e3,px.total]]){ if(a<=de) continue;
    const P=C[k], u=P.u; gl.useProgram(P.p); v3Monde(u,W,H,p); gl.uniform2fv(u.uJit,jc); gl.uniform2fv(u.uJitPx,jit);
    gl.uniform1i(u.uPrxO,px.o); gl.uniform1i(u.uPrxB,px.b); gl.uniform1i(u.uPrxA,px.a); gl.uniform1i(u.uPrxP,px.p); gl.uniform4iv(u.uPrxS,px.fin); gl.uniform4iv(u.uPrxN,px.n);
    gl.drawArrays(gl.TRIANGLES,de*PRX_VPS,(a-de)*PRX_VPS); }
  gl.disable(gl.BLEND);
  const b=new Float32Array(W*H*4); gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,b);
  let couverts=0, frag=0, ev=0, touches=0, mx=0, mxe=0, boites=0;
  for(let i=0;i<b.length;i+=4){ if(b[i]>0){ couverts++; frag+=b[i]; ev+=b[i+1]; touches+=b[i+2]; boites+=b[i+3]; if(b[i]>mx) mx=b[i]; if(b[i+1]>mxe) mxe=b[i+1]; } }
  gl.deleteFramebuffer(fb); gl.deleteTexture(t); gl.deleteTexture(t2);
  gl.bindFramebuffer(gl.FRAMEBUFFER,V3.gb.f); gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]); gl.enable(gl.DEPTH_TEST);
  const r=x=>Math.round(x*100)/100;
  ok({pixels:W*H,couverts,partCouverte:r(couverts/(W*H)),fragments:Math.round(frag),fragParPixel:r(frag/Math.max(1,couverts)),evaluations:Math.round(ev),evalParPixel:r(ev/Math.max(1,couverts)),
    evalParFragment:r(ev/Math.max(1,frag)),testsBoiteParPixel:r(boites/Math.max(1,couverts)),touches:Math.round(touches),maxFragPixel:mx,maxEvalPixel:mxe,mou:PM==="prochesM",zoom:cam.zoom});
}
function v3Image(p){
  v3Cibles();
  const G=V3.gp, f=++V3.frame, bouge=V3.n===0, t0=performance.now(); let tp=t0;
  const chrono=(nom,cible)=>{ if(!V3.detail) return; if(cible) v3Sync(cible); const t=performance.now(); V3.passes[nom]=(V3.passes[nom]||0)*.8+(t-tp)*.2; (V3.passesD||(V3.passesD={}))[nom]=t-tp; tp=t; };
  const rnd=Math.random;
  const jit=bouge?[0,0]:[rnd()-.5,rnd()-.5];                   // décalage sous-pixel, seulement à l'arrêt
  // soleil de cette image : tiré dans le disque solaire (pénombre par accumulation)
  const sd0=S.sunDir, t1=normz(cross3(sd0,[0,1,0])), b1=cross3(t1,sd0), ra=CFG.v3net?0:Math.sqrt(rnd())*.011, aa=6.2832*rnd();
  const sd=normz([0,1,2].map(i=>sd0[i]+(t1[i]*Math.cos(aa)+b1[i]*Math.sin(aa))*ra));
  const right=normz(cross3(sd,[0,1,0])), up=cross3(right,sd);
  const fwd=[p.mat[6],p.mat[8]], fl=Math.hypot(fwd[0],fwd[1])||1;
  const cx=p.pos[0]+fwd[0]/fl*25, cz=p.pos[2]+fwd[1]/fl*25, C=[cx,terrainH(cx,cz)+5,cz], E=55, D=120;
  const Ey=V3.sm.h/V3.sm.w*E;                                 // la carte vue du soleil bas est surtout large : on serre la hauteur
  const sh=Math.hypot(sd[0],sd[2])||1, recul=Math.min(30,14/Math.max(.25,sd[1]/sh)*.5);
  const zone=[cx+sd[0]/sh*recul*.5,cz+sd[2]/sh*recul*.5,E+recul*.5];
  const soleilM=new Float32Array([...right,...up,...sd]), soleilE=[E,Ey,D,2*E/V3.carte];
  const az=v3Cap(p), dmin=.35, L=Math.log(160/dmin);
  // (1) carte d'ombres
  // En marche, la carte n'est refaite qu'une image sur trois : le soleil ne bouge pas, et c'était une grosse part du coût mesuré sur téléphone.
  if(BANC.on) V3.smP=null;                                    // banc d'essai : la carte d'ombres à chaque image (mesurée)
  const refaire=!V3.smP||V3.smP.w!==V3.sm.w||(!V3.sansOmbre&&(!bouge||f%(enGeste()&&!BANC.on?6:3)===0));   // geste : une image sur six
  let u;
  if(refaire){ V3.smP={C,soleilM,soleilE,sd,w:V3.sm.w}; gpuDebut("ombre");
  const Ns=V3.ombre||Math.round(v3Budget()*.6);
  const ps=v3Partage(Ns,1,p);
  gl.bindFramebuffer(gl.FRAMEBUFFER,V3.sm.f); gl.viewport(0,0,V3.sm.w,V3.sm.h);
  gl.clearBufferfv(gl.DEPTH,0,[1]); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
  for(const [P,de,a] of v3Tranches(G,ps,1)){                   // une famille par programme : arbres, perches, blocs ; puis formes (objets, semis)
    if(!P) continue;                                           // variante FORMES pas encore compilée (v3Formes) : les formes viendront
    if(a<=de&&!(P===G.grainsB&&ps.traits>0)) continue;
    u=P.u; gl.useProgram(P.p); v3Monde(u,W,H,p);
    gl.uniform1ui(u.uFrame,f*2+1); gl.uniform1i(u.uVue,1); v3Grains(u,ps); gl.uniform1i(u.uPrx,0);
    gl.uniform4f(u.uAz,az.cap,az.demi,dmin,L); gl.uniform3fv(u.uZone,zone); gl.uniform4f(u.uNb,ps.nA,ps.nB,ps.nR,ps.nF);
    gl.uniform1f(u.uK,V3.k); gl.uniform1f(u.uMaxPt,V3.maxPt); gl.uniform2f(u.uFeuil||null,70,W*H); { const r=regEtat(), fg=CFG.feuilG||[r.fG,0,r.fMax*Math.max(1,H/480)]; gl.uniform3f(u.uFeuilG||null,fg[0],fg[1],fg[2]); }   // feuilG : [part, seuil px, max px] imposés (essais)
    gl.uniform3fv(u.uSoleilC,C); gl.uniformMatrix3fv(u.uSoleilM,false,soleilM); gl.uniform4fv(u.uSoleilE,soleilE); gl.uniform3fv(u.uSd,sd);
    gl.uniform2f(u.uJit||null,0,0); bindTex(5,V3.semisT,u.uSemis);
    gl.uniform1i(u.uTrait,0); gl.uniform2i(u.uBanc||null,BANC.v&&BANC.v.pt1?1:0,BANC.v&&BANC.v.feuil|0);
    gl.uniform1f(u.uAzPres,0); gl.uniform4i(u.uPrxN,0,0,0,0); gl.uniform4f(u.uAncre||null,0,0,0,0); gl.uniform1i(u.uPts,0); gl.uniform1i(u.uCompte||null,0);   // programme partagé avec le tampon G : les valeurs d'un programme à part
    if(u.uOmbreG){ bindTex(9,dummy.t,u.uOmbreG); gl.uniform1i(u.uOmbreOk,0); }   // la carte se dessine : les feuilles ne la lisent pas
    if(a>de) gl.drawArrays(gl.POINTS,de,a-de);
    if(P===G.grainsB&&ps.traits>0){ gl.uniform1i(u.uTrait,1); gl.uniform4f(u.uNb,ps.nA,ps.traits,ps.nR,ps.nF); gl.drawArrays(gl.LINES,0,2*ps.traits); }
  }
  }
  const SP=V3.smP; const note=V3.nImg<3?etapeGL:()=>{};
  note("v3 image "+V3.nImg+" : ombres faites ("+V3.sm.w+" × "+V3.sm.h+"), semis de "+V3.grains+" grains à "+W+" × "+H);
  chrono("ombre");                                            // carte de profondeur : illisible, son coût retombe sur la passe qui la consulte
  // (2) tampon G : le sol, puis les grains
  const g=V3.gb; gl.bindFramebuffer(gl.FRAMEBUFFER,g.f); gl.viewport(0,0,W,H); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
  gl.clearBufferfv(gl.COLOR,0,[0,0,0,-1]); gl.clearBufferfv(gl.COLOR,1,[0,1,0,1e4]); gl.clearBufferfv(gl.DEPTH,0,[1]);
  const jc=[jit[0]*2/W,jit[1]*2/H], so=V3.sol; so.dmax=S.eau&&S.eau[3]>0?150:420;
  chrono("avant"); gpuDebut("sol"); u=G.sol.u; gl.useProgram(G.sol.p); v3Monde(u,W,H,p); gl.uniform2fv(u.uJit,jc); gl.uniform1i(u.uPts,0);
  if(CFG.v3solPlein){                                         // l'ancien maillage : six sommets par quadrilatère, tout le tour
    gl.uniform4f(u.uSolP,so.r0,Math.log(so.dmax/so.r0)/so.anneaux,Math.PI,so.secteurs); gl.uniform1i(u.uSolIdx,0);
    so.tri=so.anneaux*so.secteurs*2; gl.drawArrays(gl.TRIANGLES,0,so.anneaux*so.secteurs*6);
  } else {                                                    // sommets partagés (tampon d'indices), seulement sur le cap utile
    if(!so.idx){ const R=so.anneaux, N=so.secteurs, ix=new Uint16Array(R*N*6); let k=0;
      for(let sg=0;sg<N;sg++) for(let r=0;r<R;r++){ const a=sg*(R+1)+r, b=a+1, c=a+R+1, d=c+1; ix.set([a,b,c,b,d,c],k); k+=6; }
      so.idx=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,so.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,ix,gl.STATIC_DRAW); }
    const demi=Math.min(Math.PI,az.pres), ns=Math.min(so.secteurs,Math.ceil(so.secteurs*demi/Math.PI));
    gl.uniform4f(u.uSolP,so.r0,Math.log(so.dmax/so.r0)/so.anneaux,demi,ns); gl.uniform1i(u.uSolIdx,1); gl.uniform1i(u.uSolR,so.anneaux);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,so.idx); so.tri=so.anneaux*ns*2; gl.drawElements(gl.TRIANGLES,so.anneaux*ns*6,gl.UNSIGNED_SHORT,0);
  }
  // les éléments proches, en boîtes (v3_proches) : avant les grains, ils couvrent les grandes surfaces proches sans trou
  const px=v3Proches();
  if(px.total>0){ gpuDebut("proches");                         // dans l'ordre des emplacements : objets, blocs, troncs et perches, semis
    const e1=px.o, e2=e1+px.b, e3=e2+px.a+px.p;
    const PM=S.mou&&v3Mou()?G.prochesM:G.prochesO;            // objets mous : formes fondues (variante PATE), dès qu'elle est prête
    for(const [P,de,a] of [[PM,0,e1],[G.prochesB,e1,e2],[G.prochesT,e2,e3],[G.prochesO,e3,px.total]]){ if(a<=de) continue;
    u=P.u; gl.useProgram(P.p); v3Monde(u,W,H,p); gl.uniform2fv(u.uJit,jc); gl.uniform2fv(u.uJitPx,jit);
    gl.uniform1i(u.uPrxO,px.o); gl.uniform1i(u.uPrxB,px.b); gl.uniform1i(u.uPrxA,px.a); gl.uniform1i(u.uPrxP,px.p); gl.uniform4iv(u.uPrxS,px.fin); gl.uniform4iv(u.uPrxN,px.n);
    gl.drawArrays(gl.TRIANGLES,de*PRX_VPS,(a-de)*PRX_VPS); }
    chrono("proches",g);
    if(V3.prxCompte) v3PrxCompte(p,px,jc,jit,e1,e2,e3); }
  const pc=v3Partage(v3Budget(),0,p); V3.parts=pc; gpuDebut("grains");
  const semer=compte=>{
  for(const [P,de,a] of v3Tranches(G,pc,0)){
    if(!P||a<=de) continue;
    u=P.u; gl.useProgram(P.p); v3Monde(u,W,H,p);
    gl.uniform1ui(u.uFrame,f*2); gl.uniform1i(u.uVue,0); v3Grains(u,pc);
    gl.uniform1i(u.uPrx,px.on?1:0); gl.uniform4iv(u.uPrxN,px.n);
    gl.uniform4f(u.uAz,az.cap,az.demi,dmin,L); gl.uniform1f(u.uAzPres,az.pres); gl.uniform3fv(u.uZone,zone); gl.uniform4f(u.uNb,pc.nA,pc.nB,pc.nR,pc.nF);
    gl.uniform1f(u.uK,V3.k); gl.uniform1f(u.uMaxPt,V3.maxPt); gl.uniform2f(u.uFeuil||null,70,W*H); { const r=regEtat(), fg=CFG.feuilG||[r.fG,0,r.fMax*Math.max(1,H/480)]; gl.uniform3f(u.uFeuilG||null,fg[0],fg[1],fg[2]); }   // feuilG : [part, seuil px, max px] imposés (essais)
    gl.uniform3fv(u.uSoleilC,SP.C); gl.uniformMatrix3fv(u.uSoleilM,false,SP.soleilM); gl.uniform4fv(u.uSoleilE,SP.soleilE); gl.uniform3fv(u.uSd,SP.sd);
    gl.uniform2fv(u.uJit,jc); gl.uniform1i(u.uPts,1); gl.uniform1i(u.uTrait,0); bindTex(5,V3.semisT,u.uSemis); gl.uniform2i(u.uBanc||null,BANC.v&&BANC.v.pt1?1:0,BANC.v&&BANC.v.feuil|0);
    if(u.uOmbreG){ bindTex(9,V3.sm.t,u.uOmbreG); gl.uniform1i(u.uOmbreOk,1); }   // houppiers : chaque feuille lit son ombre dans la carte de cette image
    { const cap=Math.atan2(fwd[0],fwd[1]), q=Math.PI/4;       // ancre des feuilles : la position arrondie à 4 m, le cap arrondi à 45°
      gl.uniform4f(u.uAncre||null,Math.round(p.pos[0]/4)*4,Math.round(p.pos[2]/4)*4,bouge&&!CFG.v3libre?1:0,Math.round(cap/q)*q); }
    gl.uniform1i(u.uCompte||null,compte|0);
    gl.drawArrays(gl.POINTS,de,a-de);
  } };
  if(V3.compte) v3Compter(semer);                              // mesure du remplissage (balade.remplissage) : avant le vrai semis, même tirage
  semer(0);
  gl.disable(gl.DEPTH_TEST);
  if(V3.nImg<3&&CFG.v3premieres){ v3Sync(g); note("  semis fait"); }   // lecture bloquante : seulement sur demande (elle fige le processus graphique)
  chrono("tamponG",g);
  // (3) tapis du sol : les bandes qui entrent dans les fenêtres, par tranches
  gpuDebut("tapis"); v3Tapis(p); if(V3.tap.cuits) chrono("tapis",{f:V3.tap.f[V3.tap.dernier],u8:true}); else chrono("tapis");
  // (4) matière, lumière, ciel, accumulation
  const dst=V3.hist===V3.A?V3.B:V3.A;
  gpuDebut("ombrage"); const GO=V3.omb.p; u=GO.u; gl.useProgram(GO.p); v3Monde(u,W,H,p);
  bindTex(0,g.t0,u.uG0); bindTex(1,g.t1,u.uG1); bindTex(2,V3.sm.t,u.uOmbre); bindTex(6,(V3.hist||dummy).t,u.uPrev);
  gl.uniform1ui(u.uFrame,f); gl.uniform2fv(u.uJitPx,jit);
  gl.uniform3fv(u.uSoleilC,SP.C); gl.uniformMatrix3fv(u.uSoleilM,false,SP.soleilM); gl.uniform4fv(u.uSoleilE,SP.soleilE); gl.uniform3fv(u.uSd,SP.sd);
  const occ=troncsParMetre();                                   // troncs par mètre : densité × diamètre
  gl.uniform1f(u.uOccT,occ); gl.uniform1i(u.uVoir,CFG.v3voir|0); gl.uniform1i(u.uProf||null,CFG.v3prof|0); v3TapisUniformes(u); gl.uniform1f(u.uPcf,CFG.v3pcf!==undefined?CFG.v3pcf:1); gl.uniform1f(u.uAmb,CFG.v3amb||.65);   // flou de lecture de la carte, en texels
  const alpha=!V3.hist?1:bouge?V3.alpha:1/(V3.n+1);
  gl.uniform1f(u.uAlpha,alpha); gl.uniform1i(u.uReproj,bouge?1:0);
  const damier=bouge&&!!V3.hist&&(OPT.damier!==undefined?!!OPT.damier:!QUAL.full);   // en marche, qualité mobile
  gl.uniform1i(u.uDamier,damier?1:0); gl.uniform1f(u.uAlphaD,1-(1-alpha)*(1-alpha));
  if(V3.hist){ gl.uniform3fv(u.uPrevPos,V3.histPose.pos); gl.uniformMatrix3fv(u.uPrevCam,false,V3.histPose.mat); }
  gl.bindFramebuffer(gl.FRAMEBUFFER,dst.f); gl.viewport(0,0,W,H); draw();
  gpuFin();
  if(V3.nImg<3&&CFG.v3premieres){ v3Sync(dst); note("  matière et lumière faites"); }
  chrono("ombrage",dst);
  // Plus d'attente de la puce à chaque image (option v3sync pour la remettre) : elle empêchait le processeur de préparer
  // l'image suivante pendant que la puce finit celle-ci. Sans elle, V3.ms est l'intervalle entre deux images v3.
  if(V3.detail||OPT.v3sync){ v3Sync(dst); V3.ms=performance.now()-t0; }
  else { V3.ms=V3.tPrec&&t0-V3.tPrec<250?t0-V3.tPrec:performance.now()-t0; V3.tPrec=t0; } V3.msMoy=V3.nImg?V3.msMoy*.8+V3.ms*.2:V3.ms; if(!V3.nImg) V3.tImg1=performance.now(); V3.nImg++;
  V3.hist=dst; V3.histPose=p; V3.n++;
}
function v3Frame(p,dt){
  if(v3Init()) V3.t0prep=0;
  else { const d=performance.now()-(V3.t0prep||(V3.t0prep=performance.now()));
    if(d>2500) say(d>25000&&V3.attendSocle?"La préparation du moteur dure anormalement. Touche trois fois le chrono REC… ou recharge la page. Dernière étape : "+(ETAPES[ETAPES.length-1]||""):"Préparation du moteur graphique…",true);
    return; }                                        // programmes encore en compilation
  if(sceneDirty||!V3.hist||!samePose(p,V3.histPose)){ V3.n=0; sceneDirty=false; }
  else if(V3.n>=V3.max) return;                               // image posée : on ne recalcule plus
  v3Image(p); frames++; if(!ouvRepos&&!BANC.on) regMesure(dt,V3.dtBrut||0);   // pas les images de réchauffe de l'ouverture (premiers dessins) ni le banc
  if(bench&&walking) bench.push({dt:dt*1000,ms:V3.ms,lvl:-1,grains:V3.parts?V3.parts.total:0,cuits:V3.tap.cuits,t:performance.now()});
  // Halo et exposition : 28 ms mesurés sur Mali-G77 pour trois petites passes. En mobile, une image sur quatre suffit (ils varient lentement).
  if(QUAL.full||CFG.haloToujours||V3.nImg%4===0||!bl1.fait){ postFX(V3.hist); bl1.fait=true; }
}
function qualite(full){                                        // bascule mobile / complète : tout se réalloue à la nouvelle taille
  QUAL.full=!!full; try{ localStorage.setItem("bodycam-qualite",full?"1":"0"); }catch(_){}
  if(!CFG.grains) V3.grains=full?2500000:300000;
  if(!CFG.v3carte) V3.carte=full?2048:1024;
  v3Libere(false); resize(); sceneDirty=true;
  V3.t0prep=0;                                                 // la variante de l'ombrage dépend de la qualité : v3Ombrage() la monte, socle d'abord
  $("qualite").textContent="Qualité : "+(full?"complète":"mobile"); $("qualite").setAttribute("aria-pressed",String(!!full));
}
function v3Basculer(on){
  if(!on&&PT_KO&&!v3Refus()){ say("Le moteur à rayons ne se compile pas sur cette machine : on reste sur le v3.",true); return; }
  if(on&&v3Refus()) on=false;                                  // fiche que le semeur ne sait pas rendre : on reste sur le lanceur de rayons
  if(on&&V2.on) v2Basculer(false);
  V3.on=on; V3.repli=false; v3Bouton();
  if(on){ V3.hist=null; V3.n=0; }                              // les programmes se compilent depuis frame(), un à un (v3Init) else { hist=null; v3Libere(false); }
  if(typeof W==="number"&&W>0&&!CFG.w) resize();                    // la résolution interne dépend du moteur
}
/* Ce que le semeur ne sait pas encore rendre (docs/moteur-v3.md, « Le v3 rend tous les mondes »). Rend la raison, ou "" si la
   fiche est rendue. La liste est vide : semis, kit nu, dunes, relief et trajet réglés, nuit à la lampe, conifères en cône et eau
   à l'horizon sont semés. La fonction reste le point d'entrée (bouton « Moteur v3 · pas ici », repli sur le lanceur de rayons). */
function v3Refus(){
  return "";
}
function v3Bouton(){
  const b=$("v3"); if(!b) return;
  const r=v3Refus();
  b.disabled=!!r; b.setAttribute("aria-pressed",String(V3.on));
  b.textContent=r?"Moteur v3 · pas ici":V3.on?"Moteur v3 · oui":"Moteur v3";
  b.title=r?"Le moteur v3 ne sait pas encore rendre ce lieu ("+r+")":"Essai : semer des grains au lieu de lancer des rayons";
}
function v3Fiche(){                                            // après chaque changement de fiche : repli sur le lanceur de rayons, et retour au v3 sur une fiche qu'il sait rendre
  if(V3.on&&v3Refus()){ v3Basculer(false); V3.repli=true; }
  else if(V3.repli&&!v3Refus()) v3Basculer(true);
  v3Bouton();
}
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normz=a=>{ const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; };

/* ------------------------------------------------------------------ boucle */
const LONGUE={max:0}, REPOS={t:0}; let lastT0=0;
let ptDit=false, lastT=0, vide=null, bench=null, prof=null, profTexte="", lastMotionMs=0; const startT=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(CFG.dtMax||.1,(now-lastT)/1000), dtBrut=now-lastT; lastT=now; V3.dtBrut=dtBrut;   // dtMax : essais en rendu logiciel, le récit avance malgré des images lentes
  if(vide){ vide.push(dtBrut); return; }                         // mesure de la cadence que la page obtient sans rien calculer
  gelNote(now,dtBrut);
  COMP.img++;
  if(REG.redim){ REG.redim=false; resize(); }
  let chauffe=false;
  if(ouvRepos){ prechauffer(); if(dbgOn&&now-lastHud>250){ lastHud=now; dbgMaj(); } chauffe=ouvChauffe(); if(!chauffe) return; }   // une image cachée quand un programme est prêt
  // Page cachée ou sans le focus (vue embarquée dans une application, l'utilisateur est ailleurs) : au repos, dix images par
  // seconde au plus et pas de gros programme lancé (compLibre) ; le processus graphique est partagé avec l'application hôte.
  if(!window.__CFG||CFG.repos){ if(document.hidden) return; if(!document.hasFocus()&&now-REPOS.t<100) return; REPOS.t=now; }                         // l'ouverture pose sa question : rien n'est rendu derrière, mais tout se compile, un programme à la fois (docs/ouverture.md)
  if(!postPret()&&!V3.on){ return; }                              // capteur et halo d'abord (le v3 compile les siens à la suite, dans v3Init)
  // Profil (bouton Mesurer) : chaque étape est suivie d'une lecture qui attend la fin du calcul graphique, pour savoir où part le temps.
  const pf=prof?{dt:dtBrut}:null; let pt=performance.now(); const etape=(k,cible)=>{ if(!pf) return; if(cible!==undefined) v3Sync(cible); const t=performance.now(); pf[k]=t-pt; pt=t; };
  if(!chauffe&&!BANC.on) simulate(dt); etape("sim");
  if(BANC.on) sceneDirty=true;                                  // banc d'essai : pose figée, chaque image recalculée
  walkAmt+=((walking?1:0)-walkAmt)*(1-Math.exp(-dt/.2));
  const p=pose(); lastPose=p;
  const v2pret=V2.on&&!sceneDirty&&V2.panos.some(o=>o.t);         // tant qu'aucun panoramique n'est tourné, on garde l'image du moteur actuel : jamais d'écran noir
  if(V2.on&&!v2pret){ if(sceneDirty) v2Vider(); v2Tourner(V2.budget); }
  if(v2pret) v2Frame(p,dt);
  else if(V3.on) v3Frame(p,dt);
  else if(!ptDispo()){ if(!ptEnCours()&&!ptDit){ ptDit=true; say("Ce lieu demande le moteur à rayons, qui ne se compile pas sur cette machine."); } }
  else if(!hist || sceneDirty || !samePose(p,histPose)){ motionFrame(p); postFX(hist); if(bench&&walking) bench.push({dt:dt*1000,ms:lastMotionMs,lvl:mLevel}); }
  else if(n<MAXS){
    const t0=performance.now(); let done=false;
    do{ done=staticRows(p); } while(!done && performance.now()-t0<20);
    if(done && (n<14||n%4===0)) postFX(hist);
  }
  etape("rendu",v2pret?V2.out||hist:V3.on?V3.hist||hist:hist);
  exposure+=(expTarget-exposure)*(1-Math.exp(-dt/.45));
  if(!(exposure>0)||!Number.isFinite(exposure)){ exposure=1.2; if(!(expTarget>0)) expTarget=1.2; }
  display(v2pret?V2.out||hist:V3.on?V3.hist||dummy:hist||dummy,(now-startT)/1000);
  gpuFin(); gpuImage();
  if(chauffe||V3.chaufferMou){ V3.chaufferMou=false; v3ChaufferFroids(); }   // ouverture, ou la pâte vient d'être prête : premier dessin au calme
  premiersDessins();
  if(BANC.on&&BANC.vi>=0&&!GT.ext){ syncPuce(); const t=performance.now(); if(BANC.tFin) BANC.rec.push({v:BANC.vi,nom:"image",ms:t-BANC.tFin,img:V3.nImg}); BANC.tFin=t; }   // sans chronomètre de la puce : intervalle entre deux fins d'image (syncPuce, ici seulement)
  if(now-t00<10000&&lastT0>0) LONGUE.max=Math.max(LONGUE.max,dtBrut);   // plus longue image des dix premières secondes (diagnostic)
  lastT0=1;
  etape("aff",null); hud(now);
  if(pf&&walking) prof.push(pf);
}
let lastHud=0;
function hud(now){
  if(now-lastHud<250) return; lastHud=now;
  const s=Math.floor((now-startT)/1000), p2=v=>String(v).padStart(2,"0"), d=new Date();
  $("rec").textContent=p2(Math.floor(s/60))+":"+p2(s%60);
  $("clock").textContent=d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate())+" "+p2(d.getHours())+":"+p2(d.getMinutes())+":"+p2(d.getSeconds());
  $("camid").textContent="CAM 07 · GRAINE "+seedN;
  if(dbgOn&&!meneur) dbgMaj();
  $("stat").textContent=V3.on&&!(V3.gp&&V3.omb)?"V3 · PRÉPARATION…":!V3.on&&ptEnCours()?"PRÉPARATION…":V3.on?"V3 · "+Math.round((V3.parts?V3.parts.total:V3.grains)/1000)+" K GRAINS · "+Math.round(V3.msMoy)+" MS"+(ombPrepa()?" · IMAGE COMPLÈTE…":""):V2.on?"V2 · "+V2.panos.filter(o=>o.n>=V2.passes).length+" PANOS"+(V2.cur?" · TOURNAGE "+Math.round(100*(V2.cur.n+V2.row/V2.ph)/V2.passes)+" %":"")
    :frozen?"FIGÉ · "+n+" PASSES":walking?"EN MARCHE":n>=MAXS?"NET":n+" PASSES";
  window.__state={n:CFG.auto?frames:V2.on?v2Prets():V3.on?V3.n:n,
    v3:V3.on?{ombrage:V3.omb?(V3.omb===OMB.e.socle?"socle":"plein"):"",ombrageSig:OMB.sig,ms:+V3.ms.toFixed(1),msMoy:+V3.msMoy.toFixed(1),images:V3.nImg,grains:V3.parts,grainsOmbre:V3.ombre||Math.round(V3.grains*.6),tapis:V3.tap.lv.map(l=>l.pret?1:0).join(''),passes:Object.fromEntries(Object.entries(V3.passes).map(([k,v])=>[k,+v.toFixed(1)]))}:undefined,
    v2:V2.on?{msProj:+V2.msProj.toFixed(1),msProjMoy:+V2.msProjAvg.toFixed(1),points:V2.pts,dessines:V2.dessines,faits:V2.faits.slice(),msParLigne:+V2.msPerRow.toFixed(2)}:undefined,W,H,mLevel,msMotion:+msMotion.toFixed(1),msImage:+lastMotionMs.toFixed(1),msPerRow,exposure,x:cam.x,z:cam.z,file:queue.length,kit:S.kit,titre:fiche.titre,nuit:S.nuit,fog:S.fog,kitP:S.kitP.slice()};
}

/* ------------------------------------------------------------------ commandes directes */
$("lieu").onclick=()=>{ fermerOutils(); atelier.basculer(); };   // la banque de scènes (constructeur de monde)
/* « Plus » : les commandes de réglage et d'essai du moteur, rangées au-dessus de la rangée du bas pour qu'elle tienne au pouce. */
function fermerOutils(){ $("outils").hidden=true; $("plus").setAttribute("aria-expanded","false"); }
$("plus").onclick=()=>{ const on=$("outils").hidden; $("outils").hidden=!on; $("plus").setAttribute("aria-expanded",String(on)); if(on){ const b=[...$("outils").querySelectorAll("button")].find(x=>!x.hidden); if(b) b.focus(); } };
$("outils").addEventListener("keydown",e=>{ if(e.key==="Escape"){ e.stopPropagation(); e.preventDefault(); fermerOutils(); $("plus").focus(); } });
$("outils").addEventListener("click",e=>{ const b=e.target.closest("button"); if(b&&!b.hasAttribute("aria-pressed")) setTimeout(fermerOutils,0); });   // un interrupteur laisse le menu ouvert : on voit son nouvel état
document.addEventListener("pointerdown",e=>{ if(!$("outils").hidden&&!e.target.closest("#outils,#plus")) fermerOutils(); });
let dragId=null, px=0, py=0;
canvas.addEventListener("pointerdown",e=>{ dragId=e.pointerId; px=e.clientX; py=e.clientY; canvas.setPointerCapture(e.pointerId); canvas.classList.add("drag"); });
canvas.addEventListener("pointermove",e=>{ if(e.pointerId!==dragId) return;
  const k=3.4/Math.min(canvas.clientWidth,canvas.clientHeight);   // un glissé sur la largeur de l'écran = un demi-tour
  if(gyro.on) gyro.off-=(e.clientX-px)*k;                 // téléphone-caméra : le glisser ne fait que recaler le cap
  else { look.yaw-=(e.clientX-px)*k; look.pitch=Math.max(-1.3,Math.min(1.4,look.pitch+(e.clientY-py)*k)); }
  px=e.clientX; py=e.clientY; $("hint").classList.add("off"); });
const endDrag=e=>{ if(e.pointerId===dragId){ dragId=null; canvas.classList.remove("drag"); } };
canvas.addEventListener("pointerup",endDrag); canvas.addEventListener("pointercancel",endDrag);
addEventListener("keydown",e=>{ if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA") return;
  if(e.key==="ArrowLeft") look.yaw-=.06; else if(e.key==="ArrowRight") look.yaw+=.06;
  else if(e.key==="ArrowUp") look.pitch=Math.min(1.4,look.pitch+.05); else if(e.key==="ArrowDown") look.pitch=Math.max(-1.3,look.pitch-.05); });
addEventListener("resize",resize);

/* Le téléphone comme caméra : on l'oriente comme pour filmer, le regard suit. Le déplacement reste celui du porteur.
   Demande un contexte sécurisé (https) et, sur iOS, une permission accordée sur un geste. Sans capteur, le glisser reste seul. */
const gyro={ on:false, dispo:false, coupe:false, asked:false, yaw0:null, off:0, yaw:0, pitch:0 };
function orientation(alpha,beta,gamma){                       // angles du téléphone (degrés) -> cap et site de sa caméra arrière
  const k=Math.PI/360, c1=Math.cos(beta*k),s1=Math.sin(beta*k),c2=Math.cos(alpha*k),s2=Math.sin(alpha*k),c3=Math.cos(-gamma*k),s3=Math.sin(-gamma*k);
  const ax=s1*c2*c3+c1*s2*s3, ay=c1*s2*c3-s1*c2*s3, az=c1*c2*s3-s1*s2*c3, aw=c1*c2*c3+s1*s2*s3, h=Math.SQRT1_2;
  const x=(ax-aw)*h, y=(ay-az)*h, z=(az+ay)*h, w=(aw+ax)*h;
  const fx=-2*(x*z+w*y), fy=-2*(y*z-w*x), fz=-(1-2*(x*x+y*y));
  return { yaw:Math.atan2(fx,-fz), pitch:Math.asin(Math.max(-1,Math.min(1,fy))) };
}
function surOrientation(e){
  if(e.alpha==null||e.beta==null) return;
  if(!gyro.dispo){ gyro.dispo=true; $("suivi").hidden=false; $("hint").textContent="Oriente le téléphone comme pour filmer"; }   // le capteur répond : on propose l'interrupteur
  if(gyro.coupe) return;
  const o=orientation(e.alpha,e.beta,e.gamma||0);
  if(gyro.yaw0===null){ gyro.yaw0=o.yaw; gyro.yaw=0; gyro.pitch=o.pitch; gyro.off=look.yaw; gyro.on=true; }   // reprise : on repart du regard courant
  let d=o.yaw-gyro.yaw0-gyro.yaw; d=Math.atan2(Math.sin(d),Math.cos(d));
  gyro.yaw+=d*.35; gyro.pitch+=(o.pitch-gyro.pitch)*.35;        // léger lissage : la main tremble déjà assez dans le capteur simulé
  look.yaw=gyro.yaw+gyro.off; look.pitch=Math.max(-1.3,Math.min(1.4,gyro.pitch-cam.pitch));
}
function activerGyro(){                                        // au premier toucher : iOS n'accorde le capteur que sur un geste
  if(gyro.asked||typeof DeviceOrientationEvent==="undefined") return; gyro.asked=true;
  const go=()=>addEventListener("deviceorientation",surOrientation);
  try{ if(typeof DeviceOrientationEvent.requestPermission==="function") DeviceOrientationEvent.requestPermission().then(r=>{ if(r==="granted") go(); }).catch(()=>{}); else go(); }catch(_){}
}
addEventListener("pointerdown",activerGyro,{passive:true});
$("suivi").onclick=()=>{                                       // suivi du téléphone : activable et désactivable à tout moment
  gyro.coupe=!gyro.coupe; gyro.on=false; gyro.yaw0=null;
  try{ localStorage.setItem("bodycam-suivi",gyro.coupe?"0":"1"); }catch(_){}
  $("suivi").setAttribute("aria-pressed",String(!gyro.coupe)); $("suivi").textContent=gyro.coupe?"Suivi du téléphone : non":"Suivi du téléphone : oui";
};
try{ if(localStorage.getItem("bodycam-suivi")==="0"){ gyro.coupe=true; $("suivi").setAttribute("aria-pressed","false"); $("suivi").textContent="Suivi du téléphone : non"; } }catch(_){}

/* ------------------------------------------------------------------ voix dans sa tête
   Le monde se fige, le joueur parle, le porteur de la caméra pense à voix basse puis agit.
   Avec Claude (capacité « sample » de la page) la réponse est libre ; sans, un petit lexique de commandes prend le relais. */
let sampler=null; const echanges=[], tempsFaits=[];
if(window.claude && window.claude.use) window.claude.use("sample").then(s=>{ sampler=s; }).catch(()=>{});
let sayTimer=0;
function montrerDit(t){ const el=$("dit"); t=String(t||"").trim(); el.textContent=t?"« "+t+" »":""; el.classList.toggle("on",!!t&&!CFG.nohud);
  const d=document.getElementById("debug-meneur"); el.style.top=d&&!d.hidden?"calc(env(safe-area-inset-top,0px) + 168px)":""; }
function say(text,bref){ const el=$("pensee"); el.textContent=text; el.classList.toggle("on",!!text);
  clearTimeout(sayTimer); if(text) sayTimer=setTimeout(()=>el.classList.remove("on"),bref?3500:9000); }
/* Obstacles devant (1,5 m, 3 m, 5 m) : le meneur les lit deux fois par seconde. Lecture différée comme la sonde : on rend
   la dernière réponse arrivée et on relance ; seule la toute première lecture attend. */
const devant={L:[0,1,2].map(lectureDiff),T:null,v:null,b:new Float32Array(16)};
function obstaclesDevant(){
  const pts=[1.5,3,5].map(d=>{ const x=cam.x+Math.sin(cam.yaw)*d, z=cam.z+Math.cos(cam.yaw)*d; return [x,terrainH(x,z)+.75,z]; });
  if(OPT.sondeSync||!devant.v||!sondeDispo()){ devant.v=pts.map(q=>probe(...q)[0]); return devant.v; }
  devant.L.forEach((L,i)=>{ if(recevoirDiff(L,devant.b)) devant.v[i]=devant.b[0]; });
  if(devant.L.every(L=>!L.sync)){
    if(!devant.T) devant.T=[0,1,2].map(()=>target(4,1,ACC_FMT,gl.NEAREST));
    pts.forEach((q,i)=>{ probeDessin(q[0],q[1],q[2],devant.T[i]); lireDiff(devant.L[i],devant.T[i],4,1,16); });
  }
  return devant.v;
}
function perception(){
  const ahead=obstaclesDevant();
  return { lieu:fiche.titre, inspiration:fiche.inspiration, kit:fiche.kit,
    position:{x:+cam.x.toFixed(1),z:+cam.z.toFixed(1)}, cap_degres:Math.round(((cam.yaw*180/Math.PI)%360+360)%360),
    sur_le_sentier:S.kit!==1?Math.abs(cam.x-pathX(cam.z))<1.3:null,
    obstacle_devant_m:ahead[0]<.5?1.5:ahead[1]<.5?3:ahead[2]<.5?5:null,
    lumiere:S.nuit?"nuit":"jour", lampe:S.torch>0, brume:S.fog };
}
const clampN=(v,a,b,d)=>{ v=Number(v); return Number.isFinite(v)?Math.min(b,Math.max(a,v)):d; };
function enqueue(actions){
  if(Array.isArray(actions)&&actions.some(a=>a&&a.type==="effort"&&a.exploit)&&MODELES.exploit&&MODELES.exploit.bruit){   // les bruits de l'effort, calés entre les souffles (docs/bruitages.md)
    try{ const r=SON.caler(actions,MODELES.exploit.bruit,{graine:seedN,compteur:++compteurSons}); actions=r.actions;
      const fe=actions.filter(a=>a&&a.type==="effort"&&a.exploit).pop(); if(fe&&fe.exploit.masse) fe.chute={masse:clampN(fe.exploit.masse,.01,500,1)};   // elle tombe à la fin de l'effort : on l'entend à ce moment, arrivée ou pas
      if(sons) sons.preparer(r.plan.bruits); journalSons.push({t:+(performance.now()/1000).toFixed(2),plan:r.plan.bruits.map(b=>({t:b.t_abs,duree:b.duree,f0:b.f0,force:b.force,principal:b.principal})),souffles:r.plan.souffles,pose_t:r.plan.pose_t}); }
    catch(e){ console.warn("sons :",e&&e.message); } }
  for(const a of (Array.isArray(actions)?actions:[]).slice(0,12)){   // 8 gestes au plus, plus les marqueurs de la page (poser, attendreObjet, §19)
    if(!a||typeof a!=="object") continue;
    if(a.type==="tourner") queue.push({type:"tourner",rest:clampN(a.degres,-180,180,0)*Math.PI/180});
    else if(a.type==="marcher") queue.push({type:"marche",metres:clampN(a.metres,-10,30,0)});   // « avance de N m » : le trajet est calculé au moment de partir (§18)
    else if(a.type==="regarder") queue.push({type:"regarder",pitch:clampN(a.degres,-60,75,0)*Math.PI/180});
    else if(a.type==="attendre") queue.push({type:"attendre",rest:clampN(a.secondes,0,5,1)});
    else if(a.type==="posture") queue.push({type:"posture",h:clampN(a.hauteur,.35,1,1)});
    else if(a.type==="viser"&&typeof a.objet==="string") queue.push({type:"viser",objet:a.objet.slice(0,30)});
    else if((a.type==="rejoindre"||a.type==="cadrer")&&typeof a.objet==="string") queue.push({type:a.type,objet:a.objet.slice(0,30),sur_place:a.sur_place===true});
    else if(a.type==="monter") queue.push({type:"monter",sur:typeof a.sur==="string"?a.sur.slice(0,30):""});
    else if(a.type==="descendre") queue.push({type:"descendre"});
    else if(a.type==="chercher"&&typeof a.quoi==="string") queue.push({type:"chercher",quoi:a.quoi.slice(0,60)});
    else if(a.type==="faconner"&&typeof a.objet==="string") queue.push({type:"faconner",objet:a.objet.slice(0,30),t:0,i:-1,attente:0,degout:degoutSur(a.degout)});
    else if(a.type==="hesiter"||a.type==="essuyer") queue.push({type:a.type,rest:clampN(a.secondes,.3,6,2),duree:clampN(a.secondes,.3,6,2),force:clampN(a.force,0,1,.5)});   // §22 : il hésite avant, il s'essuie les mains après
    else if(a.type==="poser"&&typeof a.ref==="string") queue.push({type:"poser",ref:a.ref.slice(0,12)});   // §19 : la place de la chose se prend ici, au geste
    else if(a.type==="attendreObjet"&&typeof a.ref==="string") queue.push({type:"attendreObjet",ref:a.ref.slice(0,12),rest:clampN(a.secondes,0,30,20)});
    else if(a.type==="deplacer") queue.push({type:"deplacer",metres:clampN(a.metres,1,30,4),rayon:clampN(a.rayon,0,3,.3)});
    else if(a.type==="effort") queue.push({type:"effort",rest:clampN(a.secondes,0,12,3),force:clampN(a.force,0,1,.3),bruits:Array.isArray(a.bruits)?a.bruits.slice(0,6):null,chute:a.chute||null});   // §20 : accroupi, il pousse ; la caméra force et tremble
    else if(a.type==="penser"&&typeof a.texte==="string") queue.push({type:"penser",texte:a.texte.slice(0,240),bref:a.bref===true,espace:clampN(a.espace,0,10,0)});   // une pensée dite quand la file l'atteint (souffle, réaction après avoir vu)
  }
}
function patchScene(sc){                                      // ce qu'il imagine peut changer le monde
  if(!sc||typeof sc!=="object") return;
  const a=Object.assign({},fiche.ambiance||{});
  if(sc.brume!==undefined) a.brume=clampN(sc.brume,0,.06,a.brume);
  if(sc.soleil&&typeof sc.soleil==="object") a.soleil={azimut:clampN(sc.soleil.azimut,-180,180,-33),hauteur:clampN(sc.soleil.hauteur,-10,60,21)};
  if(typeof sc.lampe==="boolean") a.lampe=sc.lampe;
  if(Array.isArray(sc.cacher)||Array.isArray(sc.montrer)){ (sc.cacher||[]).forEach(id=>cacheObj.add(id)); (sc.montrer||[]).forEach(id=>cacheObj.delete(id));
    if(Array.isArray(sc.montrer)&&Array.isArray(fiche.objets)) fiche=Object.assign({},fiche,{objets:fiche.objets.map(o=>o&&sc.montrer.includes(o.id)?Object.assign({},o,{visible:true}):o)});   // sinon visible:false l'emporte
    buildShapes(fiche); }
  fiche=Object.assign({},fiche,{ambiance:a}); applyAmbiance(a);
}
function lexique(t){                                          // secours sans IA : quelques ordres simples
  t=t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  const num=(t.match(/(\d+)/)||[])[1], out={pensee:"",actions:[],scene:null};
  if(/stop|arrete|attends/.test(t)){ queue.length=0; out.pensee="Je m'arrête."; return out; }
  if(/demi.?tour|retourne/.test(t)){ out.actions.push({type:"tourner",degres:180}); out.pensee="Demi-tour."; }
  else if(/gauche/.test(t)){ out.actions.push({type:"tourner",degres:-(num||(/(un peu|leger)/.test(t)?30:90))}); out.pensee="À gauche, d'accord."; }
  else if(/droite/.test(t)){ out.actions.push({type:"tourner",degres:+(num||(/(un peu|leger)/.test(t)?30:90))}); out.pensee="À droite, d'accord."; }
  if(/recule/.test(t)){ out.actions.push({type:"marcher",metres:-(num||4)}); out.pensee=out.pensee||"Je recule."; }
  else if(/avance|marche|continue|tout droit|\bva\b|vas-y/.test(t)){ out.actions.push({type:"marcher",metres:+(num&&!/gauche|droite/.test(t)?num:8)}); out.pensee=out.pensee||"J'avance."; }
  if(/en haut|ciel|leve/.test(t)){ out.actions.push({type:"regarder",degres:50}); out.pensee=out.pensee||"Je lève la caméra."; }
  else if(/en bas|sol|pieds|baisse/.test(t)){ out.actions.push({type:"regarder",degres:-40}); out.pensee=out.pensee||"Je regarde par terre."; }
  else if(/devant|horizon/.test(t)){ out.actions.push({type:"regarder",degres:-2}); }
  if(/eteins/.test(t)) out.scene={lampe:false}; else if(/lampe|torche|allume/.test(t)) out.scene={lampe:true};
  if(/nuit/.test(t)) out.scene=Object.assign(out.scene||{},{soleil:{azimut:-33,hauteur:-10}});
  else if(/jour|matin|soleil/.test(t)) out.scene=Object.assign(out.scene||{},{soleil:{azimut:-33,hauteur:21},lampe:false});
  if(/brouillard|brume/.test(t)) out.scene=Object.assign(out.scene||{},{brume:.035});
  if(!out.pensee) out.pensee=out.scene?"Tiens, ça change autour de moi.":"Je n'ai pas compris. Dis-moi gauche, droite, avance, regarde en haut…";
  return out;
}
async function entendre(texte){
  montrerDit(texte);                                            // ce que le joueur vient de dire reste en haut pendant qu'il y pense et répond en bas
  if(!meneur&&typeof MENEUR!=="undefined"&&!CFG.sansMeneur) demarrerLibre();   // promenade libre : le même meneur, sans histoire écrite
  if(meneur) return meneurEntendre(texte);                      // une histoire se joue : voir « meneur de jeu »
  say("…");
  let rep=null;
  if(sampler){
    const consigne=`Tu es Sam, une personne qui marche seule en portant une caméra-piéton. Une voix (le joueur) te parle dans ta tête : le monde se fige pendant qu'elle parle. Tu lui fais confiance sans être un robot : tu penses à voix basse, à la première personne, en une ou deux phrases courtes et naturelles, puis tu agis.
Réponds uniquement par un objet JSON de cette forme :
{"pensee": "ce que tu te dis", "actions": [ ... ], "scene": { ... }}
Actions possibles, dans l'ordre d'exécution, six au plus :
{"type":"tourner","degres":-180..180} (négatif = vers la gauche), {"type":"marcher","metres":-10..30}, {"type":"regarder","degres":-60..75} (positif = vers le haut), {"type":"attendre","secondes":0..5}.
"scene" est facultatif : ne le mets que si ce que la voix évoque change le monde autour de toi. Champs possibles : "brume" (0 à 0.06), "soleil" {"azimut","hauteur"} (hauteur négative = nuit), "lampe" (true ou false).
${fiche.histoire?`L'histoire que tu vis sans la connaître d'avance (ne la récite pas, laisse-la arriver) : ${JSON.stringify(fiche.histoire)}
Temps du récit déjà passés : ${JSON.stringify(tempsFaits)}. Si ce moment déclenche un nouveau temps, ajoute "temps": "son id".
`:""}Ce que tu perçois : ${JSON.stringify(perception())}
Échanges précédents : ${JSON.stringify(echanges.slice(-6))}
La voix dit : ${JSON.stringify(texte)}`;
    try{ rep=await sampler.json(consigne,{modelTier:"quick",cache:false}); }
    catch(e){ if(e&&e.code==="not_granted") sampler=null; }
  }
  if(!rep||typeof rep!=="object") rep=lexique(texte);
  const pensee=String(rep.pensee||"").slice(0,280);
  echanges.push({voix:texte,pensee});
  if(rep.temps && fiche.histoire && !tempsFaits.includes(rep.temps)){            // un temps du récit se déclenche
    const t=(fiche.histoire.temps||[]).find(x=>x.id===rep.temps);
    if(t){ tempsFaits.push(t.id); patchScene(t.scene); }
  }
  patchScene(rep.scene); enqueue(rep.actions); penser(pensee);
}

/* ------------------------------------------------------------------ décrire un monde
   Le joueur décrit un lieu, à la voix ou au clavier. Claude écrit une fiche de lieu ; le moteur la borne et la fabrique.
   Sans Claude, quelques mots-clés suffisent à composer une fiche. */
const validerFiche=(f,o)=>CONSTRUCTEUR.validerFiche(f,o);       // bornes de la fiche : src/constructeur.js (constructeur de monde)
/* Secours sans IA pour les lieux bâtis : quelques éléments de semis génériques, que le lexique assemble.
   Ce ne sont pas des objets en dur du moteur : ce sont des données de fiche, comme Claude en écrirait. */
const LEX={
  facade:{ base:"facade", couleur:"forme" },
  maison:(larg,haut,toit)=>({ id:"maisons", nom:"maisons alignées le long de la rue", cellule:[larg,10], trajet:{rangee:true}, densite:.95, hauteur:[.85,1.2], teinte:.12,
    palette:["#c9bba3","#b9ad9a","#d2c4a8","#a9a08e","#c7b08f"],
    formes:[ {f:"boite",p:[0,haut/2,-.4],taille:[larg-.3,haut,8.6],couleur:"palette",matiere:"lex-facade"},
             ...(toit?[{f:"toit",p:[0,haut+.8,-.4],taille:[larg-.1,1.6,9.2],couleur:"#6e4a3a",matiere:"tuile"}]:[{f:"boite",p:[0,haut+.25,-.3],taille:[larg-.2,.5,9],couleur:"#d8d3c8",matiere:"mat"}]),
             {f:"boite",p:[-1,1.05,3.87],taille:[1.1,2.1,.08],couleur:"#4a3a2c",matiere:"planches"} ] }),
  lampadaire:{ id:"lampadaires", nom:"lampadaires", cellule:[18,3], trajet:{rangee:true}, densite:1,
    formes:[ {f:"cylindre",p:[0,2.4,-.6],taille:[.12,4.8,.12],couleur:"#2c2e30",matiere:"metal"},
             {f:"boite",p:[0,4.75,-.1],taille:[.08,.08,1.1],couleur:"#2c2e30",matiere:"metal"},
             {f:"boule",p:[0,4.6,.45],taille:[.35,.3,.35],couleur:"#ffd9a0",matiere:"lumineux"} ] },
  voiture:{ id:"voitures", nom:"voitures garées", cellule:[5.6,2.6], trajet:{rangee:true}, densite:.6, pose:"pente", tourne:4, teinte:.1,
    palette:["#2b2e33","#8b9096","#d9d9d4","#5a2424","#2f3d52"],
    formes:[ {f:"boite",p:[0,.68,0],taille:[4.3,.75,1.75],couleur:"palette",matiere:"metal",arrondi:.12},
             {f:"boite",p:[-.25,1.32,0],taille:[2.2,.6,1.55],couleur:"#1b1e22",matiere:"verre",arrondi:.14},
             {f:"cylindre",p:[1.35,.33,0],taille:[.66,1.8,.66],penche:[90,0],couleur:"#151515"},
             {f:"cylindre",p:[-1.35,.33,0],taille:[.66,1.8,.66],penche:[90,0],couleur:"#151515"} ] },
  tombe:{ id:"tombes", nom:"tombes en rangs", cellule:[2.4,3.2], rotation:0, trajet:{min:2.5}, densite:.85, oriente:"fixe", cap:180, tourne:6, penche:4, teinte:.2, desordre:.15,
    formes:[ {f:"boite",p:[0,.45,-.9],taille:[.75,.9,.16],couleur:"#8e8b84",matiere:"beton",arrondi:.03},
             {f:"boite",p:[0,.12,.1],taille:[.9,.24,1.9],couleur:"#77746d",matiere:"beton"} ] },
};
function mondeLexique(texte){                                 // secours sans IA
  const t=texte.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  if(/interieur|entrepot|hangar|usine|couloir|\bsalle|\bhall\b|parking souterrain|\bcave\b|sous-sol|tunnel/.test(t)) return mondeInterieur(texte,t);
  const bati=/\bville|\brue|ruelle|venelle|impasse|avenue|boulevard|quartier|immeuble|centre-ville|san francisco|new york|\bvillage|hameau|bourg|cimetiere/.test(t);
  if(bati) return mondeBati(texte,t);
  if(/plage|bord de mer|littoral|ocean|\bmer\b|crique/.test(t)) return mondePlage(texte,t);
  const f={ titre:texte.charAt(0).toUpperCase()+texte.slice(1,70), inspiration:texte, kit:/desert|dune|sable|sahara|erg|plage/.test(t)?"dunes":"foret",
    ambiance:{soleil:{azimut:-33,hauteur:21}}, foret:{}, dunes:{} };
  const a=f.ambiance;
  if(/nuit|minuit|nocturne|obscur/.test(t)) a.soleil={azimut:120,hauteur:-10};
  else if(/aube|matin|lever/.test(t)) a.soleil={azimut:80,hauteur:8};
  else if(/soir|couch|crepuscule/.test(t)) a.soleil={azimut:-70,hauteur:6};
  else if(/midi|plein soleil/.test(t)) a.soleil={azimut:10,hauteur:55};
  if(/brouillard|brume/.test(t)) a.brume=.035; else if(f.kit==="dunes") a.brume=.003;
  if(/hiver|neige|gel/.test(t)) a.saison="hiver"; else if(/ete|printemps|vert/.test(t)) a.saison="ete";
  if(/gris|couvert|voile|nuage|pluie/.test(t)) a.meteo="voile";
  if(/montagne|mont |alpe|sommet|pic |massif|glacier|pyrenee/.test(t)){ f.lointain={hauteur:20,decoupe:.7,neige:.5}; f.foret.densite=.3; f.foret.feuillage=1; f.foret.houppier="cone"; f.foret.perches=.1; f.surfaces={sol:/neige|hiver/.test(t)?"neige":"herbe"}; }
  if(/sapin|epicea|conifere|meleze/.test(t)){ f.foret.houppier="cone"; f.foret.feuillage=1; }
  if(!f.lointain&&/colline|vallon/.test(t)) f.lointain={hauteur:5,decoupe:.2,neige:0};
  if(/dense|epais|touffu|jungle|sombre/.test(t)){ f.foret.densite=.95; f.foret.feuillage=1.3; }
  else if(/clairsem|clairiere|ouvert|lande/.test(t)){ f.foret.densite=.3; f.foret.feuillage=.6; }
  if(/sans rocher/.test(t)){ f.foret.rochers=0; } else if(/rocher|roche|pierre|gres|chaos|caillou/.test(t)){ f.foret.rochers=1.4; f.dunes.rochers=1; }
  f.note="Sans Claude, je ne lis que des mots-clés : désert, plage, montagne, nuit, matin, soir, brume, saison, dense, rochers, ville, rue, ruelle, village, cimetière, intérieur. Les objets demandent Claude.";
  return f;
}
function soleilLexique(t){ return /nuit|minuit|nocturne|obscur/.test(t)?{azimut:120,hauteur:-10}:/aube|matin|lever/.test(t)?{azimut:80,hauteur:6}:/soir|couch|crepuscule|apres-midi/.test(t)?{azimut:-100,hauteur:10}:{azimut:-30,hauteur:40}; }
function mondePlage(texte,t){                                  // plage : sable, mer à l'horizon, parasols
  const so=soleilLexique(t);
  return { titre:texte.charAt(0).toUpperCase()+texte.slice(1,70), inspiration:texte, kit:"nu",
    relief:{amplitude:.3,echelle:90,pente:-.14}, trajet:{sinuosite:.2,largeur:2.5,creux:.02,bord:"irregulier"},   // le sol descend vers la mer : sinon on ne la voit pas
    matieres:{ "lex-sable":{base:"sable-dunes",couleur:"#d8c6a2",motif:{type:"rides",echelle:30,deformation:6,couleur:"#cbb893",opacite:.1,inclinaison:.04}} }, surfaces:{sol:"lex-sable",trajet:"lex-sable"},
    lointain:{hauteur:.1,decoupe:0,couleur:"#6d8f99",couleur_bas:"#5d7f89",eau:"#3d6b78"},
    ambiance:{saison:"ete",meteo:/gris|couvert|pluie|brume/.test(t)?"voile":"clair",soleil:so,brume:/brume|brouillard/.test(t)?.03:.005,lampe:so.hauteur<0},
    semis:/hiver|nuit|desert|vide|sauvage/.test(t)?[]:[{ id:"parasols", nom:"parasols", cellule:[6,6], rotation:10, trajet:{min:3,max:16}, densite:.5, groupes:.4, tourne:30, penche:6,
      palette:["#d23c32","#2f6fb0","#f0c43a","#ece6da"], formes:[ {f:"cylindre",p:[0,1.1,0],taille:[.06,2.2,.06],couleur:"#e8e4dc",matiere:"metal"}, {f:"cone",p:[0,2.25,0],taille:[2.2,.5,2.2],couleur:"palette",matiere:"tissu"} ] }],
    note:"Sans Claude : du sable, la mer à l'horizon et des parasols. La vague et l'eau proche demandent Claude." };
}
function mondeInterieur(texte,t){                              // intérieur : murs en rangée, piliers, plafond posé au-dessus du trajet
  const nuit=/nuit|obscur|noir|abandonn/.test(t);
  return { titre:texte.charAt(0).toUpperCase()+texte.slice(1,70), inspiration:texte, kit:"nu",
    relief:{amplitude:0,echelle:300,pente:0,niveler:true}, trajet:{sinuosite:0,largeur:4,creux:0,bord:"net"}, surfaces:{sol:"beton",trajet:"beton"},
    ambiance:{saison:"automne",meteo:"voile",soleil:{azimut:120,hauteur:nuit?-10:30},lampe:true,brume:.004},
    semis:[ { id:"murs", nom:"murs", cellule:[8,1], trajet:{rangee:true,min:7}, densite:1, formes:[ {f:"boite",p:[0,3.5,0],taille:[8,7,.8],couleur:"#6a4a3a",matiere:"brique"} ] },
            { id:"piliers", nom:"piliers", cellule:[8,1], trajet:{rangee:true,min:2.6}, densite:1, formes:[ {f:"boite",p:[0,3.5,0],taille:[.5,7,.5],couleur:"#8a867e",matiere:"beton"} ] },
            { id:"neons", nom:"néons", cellule:[12,1], trajet:{rangee:true,min:1.2,cote:"gauche"}, densite:.7, formes:[ {f:"boite",p:[0,6.4,0],taille:[1.6,.1,.18],couleur:"#dfeeff",matiere:"lumineux"} ] } ],
    objets:[ { id:"plafond", nom:"plafond", devant:40, cote:0, oriente:"trajet", formes:[ {f:"boite",p:[-20,7.2,0],taille:[40,.4,16],couleur:"#3a3836",matiere:"beton"}, {f:"boite",p:[20,7.2,0],taille:[40,.4,16],couleur:"#3a3836",matiere:"beton"} ] } ],
    note:"Sans Claude, un intérieur est une grande salle : murs, piliers, plafond et néons. Le mobilier demande Claude." };
}
function mondeBati(texte,t){                                  // ville, rue, village, cimetière : un monde nu composé de semis
  const nuit=/nuit|minuit|nocturne|obscur/.test(t), soir=/soir|couch|crepuscule|apres-midi/.test(t);
  const f={ titre:texte.charAt(0).toUpperCase()+texte.slice(1,70), inspiration:texte, kit:"nu",
    ambiance:{ saison:/hiver|neige/.test(t)?"hiver":"ete", meteo:/gris|couvert|pluie|brume|brouillard/.test(t)?"voile":"clair",
      soleil:nuit?{azimut:120,hauteur:-10}:soir?{azimut:-110,hauteur:9}:{azimut:-40,hauteur:30}, brume:/brouillard|brume/.test(t)?.03:.008 },
    matieres:{ "lex-facade":LEX.facade }, semis:[] };
  const pente=/colline|pente|san francisco|montee|butte/.test(t);
  if(/ruelle|venelle|impasse/.test(t)){                       // ruelle : façades hautes et serrées, pas de voitures
    Object.assign(f,{ relief:{amplitude:.5,echelle:200,pente:pente?.12:.04,niveler:true}, trajet:{sinuosite:.25,largeur:3,creux:.03,bord:"net"}, surfaces:{sol:"paves",trajet:"paves"} });
    const m=LEX.maison(6,12,false); m.trajet={rangee:true,min:1.9}; m.hauteur=[1,1.3]; m.palette=["#c98f52","#d6a35e","#b9734a","#d8b27a","#bfb2a0"]; f.semis.push(m);
    f.semis.push(Object.assign({},LEX.lampadaire,{cellule:[14,1],trajet:{rangee:true,min:1.2,cote:"gauche"},formes:LEX.lampadaire.formes.map(x=>Object.assign({},x,{p:[x.p[0],x.p[1]-1,x.p[2]-.4]}))}));
  } else if(/cimetiere/.test(t)){
    Object.assign(f,{ relief:{amplitude:1,echelle:120}, trajet:{sinuosite:.2,largeur:2.4,creux:.05,bord:"net"}, surfaces:{sol:"herbe",trajet:"gravier"} });
    f.semis.push(LEX.tombe); f.lointain={hauteur:4,decoupe:.3};
  } else if(/village|hameau|bourg/.test(t)){
    Object.assign(f,{ relief:{amplitude:1.2,echelle:180,pente:pente?.08:.02}, trajet:{sinuosite:.35,largeur:5,creux:.08,bord:"net"}, surfaces:{sol:"dalles",trajet:"paves"} });
    const m=LEX.maison(7,5.5,true); m.trajet={rangee:true,min:4}; m.formes[0].p[1]=2.75; f.semis.push(m);
    f.semis.push(Object.assign({},LEX.lampadaire,{trajet:{rangee:true,min:1.6}})); f.lointain={hauteur:4,decoupe:.25};
  } else {
    Object.assign(f,{ relief:{amplitude:pente?2.5:.4,echelle:250,pente:pente?-.22:0,niveler:true}, trajet:{sinuosite:0,largeur:9,creux:.15,bord:"net"}, surfaces:{sol:"dalles",trajet:"chaussee"} });
    const m=LEX.maison(8,12,false); m.trajet={rangee:true,min:7}; m.hauteur=[.8,1.6]; f.semis.push(m);
    f.semis.push(Object.assign({},LEX.voiture,{trajet:{rangee:true,min:2.2}}));
    f.semis.push(Object.assign({},LEX.lampadaire,{trajet:{rangee:true,min:3.4}}));
    f.lointain={hauteur:pente?4:2,decoupe:.3,eau:/baie|mer|port|san francisco/.test(t)};
  }
  if(nuit) f.ambiance.lampe=true;
  f.note="Sans Claude, je compose ce lieu avec quelques éléments génériques : rue, maisons, voitures, lampadaires, tombes.";
  return f;
}
/* ------------------------------------------------------------------ constructeur de monde (src/constructeur.js, src/atelier.js)
   Une description part dans une chaîne en plusieurs temps : plan, fiche, contrôle sans image, relecture sur des vues
   capturées ici, puis la banque de scènes. Elle tourne en tâche de fond : l'image n'est jamais figée, on peut l'arrêter.
   Ici, seulement ce qui touche au moteur : appliquer une fiche, sa géométrie, et capturer des vues. Voir docs/constructeur-de-monde.md. */
function attendreImage(passes,delai,signal){                  // attend que l'image soit posée (accumulation à l'arrêt), ou le délai
  return new Promise((ok,ko)=>{ const t0=performance.now(); let n0=-1;
    const tic=()=>{ if(signal&&signal.aborted) return ko({code:"cancelled",message:"arrêté"});
      const k=V3.on?V3.n:n, prete=!sceneDirty&&(V3.on||!ptEnCours())&&(V3.on?!!V3.hist:!!hist);   // en v3, le lanceur de rayons ne sert pas
      if(prete&&n0<0) n0=k;                                     // première image après le déplacement (une image en mouvement compte pour plusieurs passes)
      const voulu=V3.on?Math.min(passes,V3.max):passes;
      if((prete&&k>=Math.min(n0+voulu,V3.on?V3.max:MAXS))||performance.now()-t0>delai) return ok(k);
      setTimeout(tic,100); };
    setTimeout(tic,100); });
}
/* Le canevas WebGL n'est lisible que dans l'image où il vient d'être dessiné (pas de preserveDrawingBuffer). frame() se
   réinscrit en tête de chaque image : un rappel inscrit ensuite passe juste après lui, dans la même image, avant l'affichage. */
function lireImage(largeur){
  return new Promise(ok=>requestAnimationFrame(()=>{
    const w=Math.max(16,Math.min(largeur,canvas.width)), h=Math.max(16,Math.round(canvas.height*w/canvas.width));
    const c=document.createElement("canvas"); c.width=w; c.height=h; const x=c.getContext("2d"); x.drawImage(canvas,0,0,w,h);
    const d=x.getImageData(0,0,w,h).data; let s=0,k=0; for(let i=0;i<d.length;i+=32){ s+=d[i]+d[i+1]+d[i+2]; k+=3; }
    const vw=Math.min(120,w), v=document.createElement("canvas"); v.width=vw; v.height=Math.round(h*vw/w); v.getContext("2d").drawImage(c,0,0,v.width,v.height);
    let vignette=v.toDataURL("image/jpeg",.62); if(vignette.length>CONSTRUCTEUR.BANQUE.vignetteMax) vignette=v.toDataURL("image/jpeg",.4);
    c.toBlob(b=>ok({blob:b,url:b?URL.createObjectURL(b):"",vignette,moyenne:k?s/k:0,w,h}),"image/jpeg",.82);
  }));
}
async function capturerVues(vues,o={}){                         // repérage : la caméra se pose sur chaque vue, attend l'image, la lit
  const avant=hold, out=[]; hold=true; queue.length=0;
  try{
    for(const v of vues){
      if(o.signal&&o.signal.aborted) throw {code:"cancelled",message:"arrêté"};
      cam.x=v.x; cam.z=v.z; cam.yaw=v.yaw; cam.pitch=v.pitch!==undefined?v.pitch:-.03; look.yaw=0; look.pitch=0; sceneDirty=true;
      await attendreImage(o.vite?Math.min(4,CFG.capPasses||10):CFG.capPasses||10,CFG.capDelai||9000,o.signal);
      let im=await lireImage(CFG.capLargeur||384);
      for(let k=0;k<2&&im.moyenne<2;k++) im=await lireImage(CFG.capLargeur||384);   // image noire : on relit à l'image suivante
      out.push(Object.assign(im,{legende:v.legende}));
    }
  } finally {
    hold=avant; auDepart(); sceneDirty=true;
  }
  return out;
}
let stockage=null; try{ localStorage.setItem("bodycam-essai","1"); localStorage.removeItem("bodycam-essai"); stockage=localStorage; }catch(_){}
const capacite=nom=>window.claude&&window.claude.use?Promise.resolve().then(()=>window.claude.use(nom)).catch(()=>null):Promise.resolve(null);
const atelier=ATELIER.creerAtelier({ C:CONSTRUCTEUR, embarquees:FICHES, stockage, db:capacite("db"), sansImages:!!CFG.sansImages,
  moteur:{ appliquer:f=>applyFiche(CONSTRUCTEUR.resoudreFiche(f)), geo:()=>({pathX,terrainH,kit:S.kit}), recettes:Object.keys(MAT_LIB.recettes), capturer:capturerVues, lexique:t=>mondeLexique(t) },
  sample:()=>sampler, oublierClaude:()=>{ sampler=null; },
  appliquer:(f,d)=>{ if(d&&d.index!==undefined) ficheIdx=d.index; applyFiche(CONSTRUCTEUR.resoudreFiche(f)); if(d&&d.lectureSeule&&!VIGN[d.id]) prendreVignette(d.id); },   // « oriente » des objets traduit en cap
  vignettes:id=>VIGN[id]||"",
  sceneVoulue:window.__CFG?null:(()=>{ try{ return localStorage.getItem("bodycam-scene"); }catch(_){ return null; } })(),
  dire:(t,bref)=>say(t,bref),
  dicteeDispo:capacite("dictation").then(d=>!!d), dicter:el=>{ if(!dict) return; dictEl=el; ecouter(); }, arreterDictee:()=>{ if(dict&&listening) dict.stop().catch(()=>{}); },
  occupe:()=>{} });
/* Vignettes des scènes du jeu (scenes/*.json) : prises une fois, quand on y passe, et gardées dans ce navigateur (8 × ~6 Ko). */
const VIGN=(()=>{ try{ const v=JSON.parse(localStorage.getItem("bodycam-vignettes")||"{}"); return v&&typeof v==="object"?v:{}; }catch(_){ return {}; } })();
let vignetteJeton=0;
async function prendreVignette(id){
  const k=++vignetteJeton;
  try{ await attendreImage(4,20000); }catch(_){ return; }
  if(k!==vignetteJeton||(atelier.job()&&!atelier.job().termine)) return;    // une autre scène entre-temps, ou une fabrication qui tient la caméra
  const im=await lireImage(120); if(im.url) URL.revokeObjectURL(im.url);
  if(k!==vignetteJeton||im.moyenne<3) return;
  VIGN[id]=im.vignette; try{ localStorage.setItem("bodycam-vignettes",JSON.stringify(VIGN)); }catch(_){}
  atelier.rafraichir();
}
function creerMonde(texte){                                     // « Décrire un monde » : la fabrication part en tâche de fond
  if(!atelier.creer(texte)) return Promise.resolve(null);
  say("Je fabrique ce monde. Tu peux suivre la fabrication en haut de l'écran.",true);
  return atelier.attendre().then(j=>j&&j.doc?j.doc.fiche:null);
}

/* ------------------------------------------------------------------ panneau de parole : au clavier ou à la voix */
let mode="parler", dict=null, listening=false, dictBase="", dictEl=null;   // dictEl : champ qui reçoit la dictée (par défaut la barre de parole)
if(window.claude && window.claude.use) window.claude.use("dictation").then(d=>{ if(!d) return; dict=d; $("mic").hidden=false;
  d.onPartial(({text})=>{ (dictEl||$("msg")).value=(dictBase+" "+text).trim(); });
  d.onFinal(({text})=>{ dictBase=(dictBase+" "+text).trim(); (dictEl||$("msg")).value=dictBase; });
  d.onState(({state})=>{ listening=state==="listening"; $("mic").setAttribute("aria-pressed",String(listening)); $("mic").textContent=listening?"J'écoute":"Micro";
    if(dictEl){ atelier.dictee(listening); if(!listening) dictEl=null; } });
}).catch(()=>{});
function ecouter(){                                           // appelé directement depuis un clic, sans rien attendre avant
  if(!dict||listening) return;
  dictBase=(dictEl||$("msg")).value.trim();
  dict.start().catch(e=>{ if(e&&e.code==="not_granted"){ dict=null; $("mic").hidden=true; } });
}
$("mic").onclick=()=>{ if(appui.avaleMic){ appui.avaleMic=false; return; } if(listening) dict.stop().catch(()=>{}); else ecouter(); };
function setFrozen(v,m,sansClavier){
  if(!v && listening && dict) dict.stop().catch(()=>{});
  frozen=v; mode=v?(m||"parler"):"parler"; $("dire").hidden=!v; if(sons) sons.baisser(v);   // le joueur parle : le bruit baisse
  $("parler").textContent=v&&mode==="parler"?"Reprendre":"Lui parler";
  $("msg").placeholder=mode==="monde"?"Décris le monde que tu veux…":"Dis-lui quoi faire…";
  $("envoi").textContent=mode==="monde"?"Générer":"Dire";
  if(v){ $("msg").value=""; $("hint").classList.add("off"); if(!sansClavier) setTimeout(()=>$("msg").focus(),50); }
}
// Le texte d'abord : le micro ne s'ouvre que si l'on touche « Micro » (une dictée ouverte d'office captait des bribes de conversation).
$("parler").onclick=()=>{ if(appui.avale){ appui.avale=false; return; } const on=!(frozen&&mode==="parler"); setFrozen(on,"parler"); };
/* Appuyer pour parler : tant qu'on garde le doigt (ou la souris) sur « Lui parler » ou sur « Micro », il écoute ; au relâcher, la phrase
   part aussitôt. Un appui bref garde l'ancien comportement (ouvrir la barre, ou basculer le micro). La dictée démarre dès l'appui, dans
   le geste même, pour que le navigateur l'accepte ; un appui bref la referme sans rien garder. */
const appui={bouton:null,t0:0,tenu:false,minuterie:0,avale:false,ecoute:false};
const APPUI_MS=280;
function appuiDebut(b,e){
  if(e.button!==undefined&&e.button!==0) return;
  if(!dict||mode==="monde"&&frozen) return;                     // sans dictée, ou pendant « Décrire un monde » : le bouton reste un bouton
  appui.bouton=b; appui.t0=performance.now(); appui.tenu=false;
  try{ b.setPointerCapture(e.pointerId); }catch(_){}
  appui.entendu=false;
  clearTimeout(appui.minuterie);
  appui.minuterie=setTimeout(()=>{ if(appui.bouton!==b) return; appui.tenu=true;
    if(!frozen) setFrozen(true,"parler",true);
    if(!listening&&dict) ecouter();                               // la souris garde son geste pendant ce court délai ; au doigt, voir appuiFin
    b.classList.add("tenu"); $("parler").textContent="Relâche pour envoyer"; $("msg").placeholder="Je t'écoute…"; },APPUI_MS);
}
async function appuiFin(b,annule){
  if(appui.bouton!==b) return; clearTimeout(appui.minuterie); appui.bouton=null; b.classList.remove("tenu");
  if(!appui.tenu) return;                                         // appui bref : le clic qui suit fait son travail habituel
  appui.tenu=false; appui.avale=b.id==="parler"; appui.avaleMic=b.id==="mic"; setTimeout(()=>{ appui.avale=false; appui.avaleMic=false; },400);
  if(!annule&&dict&&!listening&&!$("msg").value.trim()){          // la dictée n'a pas pu partir pendant l'appui (au doigt, certains navigateurs
    $("parler").textContent="Reprendre"; $("msg").placeholder="Dis-lui quoi faire…"; ecouter(); return; }   // n'acceptent le micro qu'au relâcher) : elle part ici, on touche « Dire » ou « Micro » pour finir
  if(dict){ try{ await dict.stop(); }catch(_){} }                 // même si l'état « écoute » n'est pas remonté : on veut la phrase entière
  for(let i=0;i<12&&listening;i++) await new Promise(r=>setTimeout(r,60));   // la fin de phrase arrive juste après l'arrêt
  await new Promise(r=>setTimeout(r,120));
  $("parler").textContent=frozen&&mode==="parler"?"Reprendre":"Lui parler"; $("msg").placeholder="Dis-lui quoi faire…";
  if(annule) return;
  if($("msg").value.trim()) $("dire").requestSubmit();            // relâché : la phrase part
  else setTimeout(()=>$("msg").focus(),50);                       // rien entendu : la barre reste ouverte, on peut taper
}
for(const id of ["parler","mic"]){ const b=$(id);
  b.addEventListener("pointerdown",e=>appuiDebut(b,e));
  b.addEventListener("pointerup",()=>appuiFin(b,false));
  b.addEventListener("pointercancel",()=>appuiFin(b,true));
  b.addEventListener("contextmenu",e=>{ if(appui.bouton===b||appui.tenu) e.preventDefault(); }); }
$("monde").onclick=()=>{ fermerOutils(); if(frozen) setFrozen(false); atelier.ouvrir({nouvelle:true}); };   // la description se tape dans la banque de scènes
$("dire").addEventListener("submit",async e=>{ e.preventDefault();
  if(listening && dict){ try{ await dict.stop(); }catch(_){} }
  const t=$("msg").value.trim(); if(!t) return;
  const m=mode; $("msg").value=""; $("msg").blur(); $("envoi").disabled=true;
  try{ if(m==="monde") creerMonde(t); else await entendre(t); } finally { $("envoi").disabled=false; setFrozen(false); } });

/* ------------------------------------------------------------------ voix du personnage (src/voix.js) : ses pensées lues à voix haute
   Capacité « tts » de l'artefact, sinon la voix du navigateur. Éteinte par défaut (« Voix » dans « Plus »), allumée par CFG.demo. */
const voixP=VOIX.creerVoix({ tts:capacite("tts"), locale:VOIX.voixNavigateur(window), reglages:{voix:CFG.voix,debit:CFG.voixDebit,debitLocal:CFG.voixDebitLocal},
  onParle:p=>{ $("taire").hidden=!p; } });
function penser(t){ say(t); direVoix(t); notePensee(t,"meneur"); }
const journalPensees=[]; window.balPensees=journalPensees;   // essais (tools/demo.mjs) : chaque pensée et son instant
let depuisPensee=1e9;                                          // secondes de jeu depuis la dernière pensée (§22 : au plus une toutes les ~3 s)
/* §22 : une pensée qui demande de l'espace attend qu'il y ait eu « espace » secondes depuis la précédente, et qu'aucun gros
   bruitage ne joue (si la page en a : test « quelque chose joue », sinon ignoré) ; elle n'attend jamais plus de 2 s pour le son. */
function sonOccupe(){ try{ return !!(sons&&sons.occupe()>0); }catch(_){ return false; } }   // un gros bruit (docs/bruitages.md) joue encore
function pensePeut(espace,a){ if(depuisPensee<espace) return false; if(sonOccupe()&&(a.attSon=(a.attSon||0)+1/60)<2) return false; return true; }
function notePensee(t,source,phase){ depuisPensee=0; journalPensees.push({t:+(performance.now()/1000).toFixed(2),texte:String(t||""),source,phase:phase||undefined,file:queue.map(a=>a.type).slice(0,4)}); if(journalPensees.length>80) journalPensees.shift(); }                  // une pensée du personnage : affichée, et dite si la voix est allumée
function voixInter(on){ voixP.actif(on); $("voix-inter").setAttribute("aria-pressed",String(on)); $("voix-inter").textContent=on?"Voix : oui":"Voix : non"; return on; }
voixInter(!!CFG.demo||(()=>{ try{ return localStorage.getItem("bodycam-voix")==="1"; }catch(_){ return false; } })());
$("voix-inter").onclick=()=>{ const on=voixInter(!voixP.actif()); try{ localStorage.setItem("bodycam-voix",on?"1":"0"); }catch(_){} };
$("taire").onclick=()=>voixP.taire();
/* ------------------------------------------------------------------ les bruitages (src/son.js, src/bruitages.json, docs/bruitages.md)
   Le contexte audio naît au premier geste du joueur ; « Sons » dans « Plus », allumé par défaut, mémorisé ; coupé quand la page
   est cachée ; plus bas quand le joueur parle ; une pensée n'est pas dite par-dessus un gros bruit (elle attend qu'il finisse). */
const journalSons=[]; window.balSons=journalSons;   // essais (tools/demo.mjs, tools/son.mjs) : chaque plan et chaque bruit, avec son instant
sons=SON.creerSons({ bruitages:BRUITAGES, maintenant:()=>performance.now()/1000, journal:m=>console.warn(m),
  fabriquer:()=>{ const C=window.AudioContext||window.webkitAudioContext; return C?new C({latencyHint:"interactive"}):null; } });
function jouerBruit(b){ const x=sons.jouer(b); journalSons.push({t:+(performance.now()/1000).toFixed(2),recette:b.recette,rang:b.rang,principal:!!b.principal,duree:b.duree,f0:b.f0,force:b.force,gain:b.gain,masse:b.masse,audio:!!(x&&x.audio)}); if(journalSons.length>80) journalSons.shift(); }
let chuteRecente=0;
function chuteGeste(masse){ chuteRecente=performance.now(); try{ jouerBruit(Object.assign(SON.planChute(BRUITAGES.recettes.chute,{masse,distance:.8,graine:seedN,cle:++compteurSons}),{recette:"chute"})); }catch(e){ console.warn("chute :",e&&e.message); } }
function chuteSon(ob){ try{ const F=(ob.formes||[]).filter(f=>f&&Array.isArray(f.taille)), e=ob.echelle||1, w=posObjet(ob);
  const masse=Math.max(.01,Math.min(500,MENEUR.volumeFormes(F)*e*e*e*500));   // une chose pleine à moitié d'eau : un ordre de grandeur suffit au son
  jouerBruit(Object.assign(SON.planChute(BRUITAGES.recettes.chute,{masse,distance:Math.hypot(w.x-cam.x,w.z-cam.z),graine:seedN,cle:++compteurSons}),{recette:"chute"})); }catch(e){ console.warn("chute :",e&&e.message); } }
function direVoix(t){ const r=sons.occupe(); if(r>0){ setTimeout(()=>voixP.dire(t),r*1000+200); journalSons.push({t:+(performance.now()/1000).toFixed(2),voix_differee_s:+r.toFixed(2),texte:String(t).slice(0,40)}); } else voixP.dire(t); }
function sonsInter(on,geste){ sons.actif(on); $("sons-inter").setAttribute("aria-pressed",String(on)); $("sons-inter").textContent=on?"Sons : oui":"Sons : non"; if(on&&geste) sons.geste(); return on; }   // le contexte ne naît que dans un geste
sonsInter(CFG.sons!==undefined?!!CFG.sons:(()=>{ try{ return localStorage.getItem("bodycam-sons")!=="0"; }catch(_){ return true; } })());
$("sons-inter").onclick=()=>{ const on=sonsInter(!sons.actif(),true); try{ localStorage.setItem("bodycam-sons",on?"1":"0"); }catch(_){} };
addEventListener("pointerdown",()=>sons.geste(),true); addEventListener("keydown",()=>sons.geste(),true); $("dire").addEventListener("submit",()=>sons.geste());
document.addEventListener("visibilitychange",()=>sons.masquer(document.hidden));
{ const c=BRUITAGES.prises_credit; if(c&&$("sons-credit")) $("sons-credit").textContent="Sons : synthèse par code, et des prises de « "+c.titre+" », "+c.auteur+", "+c.licence+" (transformées)."; }   // crédit des prises (docs/bruitages.md)
window.sons={ etat:()=>sons.etat(), actif:v=>v===undefined?sons.actif():sonsInter(!!v), journal:journalSons };
for(const id of ["parler","mic","banque-dicter"]) if($(id)) $(id).addEventListener("click",()=>voixP.taire());   // le joueur prend la parole : il se tait
$("msg").addEventListener("input",()=>voixP.taire());
capacite("dictation").then(d=>{ if(d&&typeof d.onState==="function") d.onState(({state})=>{ if(state==="listening") voixP.taire(); }); });
addEventListener("pointerdown",e=>{ if(!(e.target.closest&&e.target.closest("#dire,#parler,#mic,#taire,#voix-inter"))) voixP.geste(); },true);   // premier son : après un geste du joueur
addEventListener("keydown",e=>{ if(e.key!=="Escape"&&!(e.target.closest&&e.target.closest("input,textarea"))) voixP.geste(); },true);
window.voix={ dire:t=>voixP.dire(t), taire:()=>voixP.taire(), actif:v=>v===undefined?voixP.actif():voixInter(!!v), etat:()=>voixP.etat() };

/* ------------------------------------------------------------------ mesure sur l'appareil
   Dix mètres de marche puis l'arrêt : images par seconde, résolution choisie, temps d'une passe fixe.
   La dernière ligne estime le « tournage » d'un panoramique du moteur v2 (docs/moteur-v2.md). */
async function mesurer(){
  const out=$("mesure-txt"), wait=ms=>new Promise(r=>setTimeout(r,ms)), med=a=>{ a=a.slice().sort((x,y)=>x-y); return a.length?a[a.length>>1]:0; };
  $("mesure").hidden=false; $("mesure-copier").disabled=true;
  out.textContent="Mesure en cours, une vingtaine de secondes.\nNe touche pas l'écran…";
  setFrozen(false); hold=false; queue.length=0; look.yaw=0; look.pitch=0; cam.pitch=-.03;
  await wait(600);
  bench=[]; queue.push({type:"marcher",rest:11}); await wait(8000);
  const f=bench.slice(Math.min(10,bench.length>>2)); bench=null; queue.length=0;
  await wait(300); prof=[]; queue.push({type:"marcher",rest:6}); await wait(3500);      // second passage, étape par étape
  { const q=prof.slice(3), m=k=>med(q.map(x=>x[k]||0)), fx=v=>v.toFixed(1).replace(".",","); prof=null; queue.length=0;
    vide=[]; await wait(1500); const dv=med(vide.slice(5)); vide=null;
    profTexte=q.length?["","UNE IMAGE EN MARCHE, ÉTAPE PAR ÉTAPE ("+q.length+" images)","Déplacement      "+fx(m("sim"))+" ms","Rendu du monde   "+fx(m("rendu"))+" ms","Capteur, écran   "+fx(m("aff"))+" ms","Entre deux images "+fx(m("dt"))+" ms","","CADENCE DE LA PAGE, SANS RIEN CALCULER","Images/seconde   "+(dv?fx(1000/dv):"non mesuré")+" ("+(location.hostname||"fichier local")+")"].join("\n"):""; }
  hold=true;
  await wait(400);
  if(V2.on) return mesurerV2(f,wait,med);
  if(V3.on) return mesurerV3(f,wait,med);
  const n0=n, t0=performance.now(); let n1=n0, t1=t0;
  while(performance.now()-t0<14000 && n<n0+6){ await wait(100); if(n!==n1){ n1=n; t1=performance.now(); } }
  hold=false;
  const sPass=n1>n0?(t1-t0)/1000/(n1-n0):null, lv=med(f.map(x=>x.lvl)), P=pairAt(lv).a, dt=med(f.map(x=>x.dt)), ms=med(f.map(x=>x.ms));
  const dbg=gl.getExtension("WEBGL_debug_renderer_info"), gpu=dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):"inconnu";
  const fx=(v,d=1)=>v==null?"non mesuré":v.toFixed(d).replace(".",",");
  out.textContent=[
    "MESURE · "+(fiche.titre||fiche.id),
    "",
    "Écran            "+canvas.width+" × "+canvas.height+" (×"+(window.devicePixelRatio||1).toFixed(2)+")",
    "Puce graphique   "+gpu,
    "",
    "EN MARCHE ("+f.length+" images)",
    "Images/seconde   "+(dt?fx(1000/dt):"non mesuré"),
    "Calcul par image "+fx(ms,0)+" ms",
    "Résolution       "+P.w+" × "+P.h+" (niveau "+(lv+1)+" sur "+LEVELS.length+")",
    "",
    "À L'ARRÊT",
    "Résolution       "+W+" × "+H,
    "Une passe        "+(sPass==null?"plus de 14 s":fx(sPass,2)+" s"),
    "",
    "MOTEUR V2, ESTIMATION",
    "Un panoramique   "+(sPass==null?"non mesuré":fx(sPass/(W*H)*5e5*4,1)+" s (500 000 points, 4 passes)"),
  ].join("\n");
  $("mesure-copier").disabled=false;
}
/* Moteur v2 : la marche ne fait que projeter (le tournage continue en tâche de fond, dans son budget par image) ;
   à l'arrêt, on attend qu'un panoramique de plus soit tourné pour le chronométrer. */
async function mesurerV2(f,wait,med){
  const out=$("mesure-txt"), k0=V2.faits.length, t0=performance.now();
  out.textContent="Marche mesurée. Tournage d'un panoramique à l'arrêt (30 s au plus)…";
  while(performance.now()-t0<30000 && V2.faits.length===k0) await wait(200);   // porteur retenu : seul le tournage avance
  hold=false;
  const fx=(v,d=1)=>v==null?"non mesuré":v.toFixed(d).replace(".",",");
  const dt=med(f.map(x=>x.dt)), ms=med(f.map(x=>x.ms)), pts=med(f.map(x=>x.pts||0));
  const fa=V2.faits.slice(-4), last=V2.faits.length>k0?V2.faits[V2.faits.length-1]:null;
  const dbg=gl.getExtension("WEBGL_debug_renderer_info"), gpu=dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):"inconnu";
  out.textContent=[
    "MESURE · MOTEUR V2 · "+(fiche.titre||fiche.id),
    "",
    "Écran            "+canvas.width+" × "+canvas.height+" (×"+(window.devicePixelRatio||1).toFixed(2)+")",
    "Puce graphique   "+gpu,
    "",
    "EN MARCHE, PROJECTION ("+f.length+" images)",
    "Images/seconde   "+(dt?fx(1000/dt):"non mesuré"),
    "Projection       "+fx(ms,1)+" ms par image",
    "Points dessinés  "+Math.round(pts).toLocaleString("fr-FR")+" ("+V2.nb+" panoramiques au plus)",
    "Résolution       "+W+" × "+H,
    "",
    "TOURNAGE",
    "Panoramique      "+V2.pw+" × "+V2.ph+", "+V2.passes+" passes, qualité "+(V2.q?"fixe":"mouvement"),
    "Un panoramique   "+(last?fx(last.s,1)+" s ("+fx(last.gpu,1)+" s de calcul)":"plus de 30 s"),
    "Derniers         "+(fa.length?fa.map(x=>fx(x.s,1)).join(" · ")+" s":"aucun"),
    "Budget           "+V2.budget+" ms par image, espacement "+fx(V2.pas,1)+" m",
  ].join("\n");
  $("mesure-copier").disabled=false;
}
/* Moteur v3 : en marche, chaque image sème le budget de grains entier ; à l'arrêt, on chronomètre aussi chaque passe.
   Puis chaque optimisation de la qualité mobile est coupée tour à tour pendant quelques mètres de marche (images/s sur
   l'horloge réelle), et les passes qui ne se voient pas dans la marche sont chronométrées seules : cuisson du tapis,
   capteur, sonde. Chaque attente lit un pixel de la cible concernée (sur puce à tuiles, lire une autre cible ne mesure rien),
   et l'aller-retour d'une lecture quand rien n'est en file est mesuré à part, pour être retranché. */
async function mesurerV3(f,wait,med){
  const out=$("mesure-txt"), fx=(v,d=1)=>v==null||!isFinite(v)?"non mesuré":v.toFixed(d).replace(".",",");
  const ipsDe=b=>{ b=b.slice(3); return b.length>2?(b.length-1)/((b[b.length-1].t-b[0].t)/1000):null; };
  // (1) marche : chaque optimisation coupée tour à tour
  const opt0=Object.assign({},OPT), variantes=[
    ["toutes les optimisations",{}],
    ["sans damier",{damier:false}],
    ["capteur à 4 lectures/texel",{capteur4:true}],
    ["sonde bloquante",{sondeSync:true}],
    ["exposition bloquante",{expoSync:true}],
    ["attente à chaque image",{v3sync:true}],
    ["sans tapis du sol",{tapis:false}],
    ["aucune (comme avant)",{tapis:false,damier:false,capteur4:true,sondeSync:true,expoSync:true,v3sync:true}]], ab=[];
  if(V3.on&&!QUAL.full){
    for(const [nom,o] of variantes){
      out.textContent="Marche : "+nom+"…";
      Object.assign(OPT,opt0,o); hold=false; bench=[]; queue.length=0; queue.push({type:"marcher",rest:6}); await wait(3200);
      const b=bench; bench=null; queue.length=0;
      ab.push(nom.padEnd(30)+fx(ipsDe(b))+" images/s"+(b.length? ", tapis "+fx(b.reduce((a,x)=>a+(x.cuits||0),0)/b.length/1000)+" k texels cuits/image":""));
    }
    Object.assign(OPT,opt0); hold=true; await wait(500);
  }
  out.textContent="Marche mesurée. Détail des passes à l'arrêt…";
  const det=V3.detail; V3.detail=true; V3.passes={}; V3.n=0; V3.max=Math.max(V3.max,1);
  const k0=V3.nImg; while(V3.nImg<k0+12) { V3.n=0; await wait(60); }
  const pa=Object.assign({},V3.passes);
  // (2) l'ombrage sans le tapis (même image), puis la cuisson du tapis : niveaux recuits de zéro, par tranches
  let sansTap=null, cuisson=null;
  if(v3TapisActif()&&V3.tap.t0){
    const t0=OPT.tapis; OPT.tapis=false; V3.passes={}; { const k1=V3.nImg; while(V3.nImg<k1+10){ V3.n=0; await wait(40); } } sansTap=V3.passes.ombrage; OPT.tapis=t0;
    V3.tap.cle=null; let ms=0, tx=0; const k1=V3.nImg, t9=performance.now();
    while(V3.nImg<k1+12&&performance.now()-t9<8000){ const i=V3.nImg; V3.passes={}; V3.n=0; await wait(40); if(V3.nImg>i&&V3.tap.cuits){ ms+=V3.passes.tapis||0; tx+=V3.tap.cuits; } }
    cuisson=tx?{ms:ms/tx*1e4,tx}:null;
  }
  const g0=V3.grains, essais=[];                              // le coût réel d'une image selon le budget de grains
  for(const g of [1000,150000,300000,700000]){
    out.textContent="Coût réel avec "+Math.round(g/1000)+" k grains…";
    V3.grains=g; V3.passes={}; const k1=V3.nImg, t9=performance.now(); while(V3.nImg<k1+10 && performance.now()-t9<6000){ V3.n=0; await wait(40); }
    essais.push((g<2000?"sol seul":Math.round(g/1000)+" k")+" : semis "+fx(V3.passes.tamponG||0,0)+" + lumière "+fx(V3.passes.ombrage||0,0)+" ms");
  }
  V3.grains=g0; V3.passes={}; V3.sansOmbre=true;               // la même image sans refaire la carte d'ombres : sa part du coût
  { const k1=V3.nImg, t9=performance.now(); while(V3.nImg<k1+10 && performance.now()-t9<6000){ V3.n=0; await wait(40); } }
  essais.push("sans refaire les ombres : semis "+fx(V3.passes.tamponG||0,0)+" + lumière "+fx(V3.passes.ombrage||0,0)+" ms"); V3.sansOmbre=false;
  V3.grains=g0; V3.n=0; V3.detail=det;
  // (3) passes seules : aller-retour à vide, capteur, halo, sonde (médiane de 7)
  out.textContent="Capteur et sonde, seuls…";
  const chrono7=async fn=>{ const t=[]; for(let i=0;i<7;i++){ await wait(30); v3Sync(dummy); const a=performance.now(); fn(); t.push(performance.now()-a); } return med(t); };
  const vide=await chrono7(()=>v3Sync(dummy));
  const ec=Object.assign(target(canvas.width,canvas.height,gl.RGBA8,gl.NEAREST),{u8:true}), src=V3.hist||dummy, tt=(performance.now()-startT)/1000;
  const cap=await chrono7(()=>{ display(src,tt,ec); v3Sync(ec); });
  const c4=OPT.capteur4; OPT.capteur4=true; const cap4=await chrono7(()=>{ display(src,tt,ec); v3Sync(ec); }); OPT.capteur4=c4;
  const halo=await chrono7(()=>{ postFX(src); v3Sync(bl1); });
  freeT(ec);
  const sondeB=sondeDispo()?await chrono7(()=>probe(cam.x,terrainH(cam.x,cam.z)+.75,cam.z)):null;
  hold=false;
  const ms=med(f.map(x=>x.ms)), gr=V3.parts||{};
  const ips=f.length>1?(f.length-1)/((f[f.length-1].t-f[0].t)/1000):null;   // horloge réelle : dt est plafonné à 100 ms dans la boucle
  const dbg=gl.getExtension("WEBGL_debug_renderer_info"), gpu=dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):"inconnu";
  const k=v=>Math.round((v||0)/1000)+" k", T=V3.tap;
  out.textContent=[
    "MESURE · MOTEUR V3 · "+(fiche.titre||fiche.id),
    "",
    "Écran            "+canvas.width+" × "+canvas.height+" (×"+(window.devicePixelRatio||1).toFixed(2)+")",
    "Puce graphique   "+gpu,
    "Qualité          "+(QUAL.full?"complète":"mobile")+", accumulation "+(V3.A&&V3.A.lin?"RGBA16F filtrée":"RGBA32F"),
    "",
    "EN MARCHE ("+f.length+" images)",
    "Images/seconde   "+fx(ips),
    "Résolution       "+W+" × "+H,
    ...(ab.length?["","EN MARCHE, UNE OPTIMISATION COUPÉE À LA FOIS (3 s chacune)",...ab]:[]),
    "",
    "BUDGET DE GRAINS",
    "Caméra           "+k(gr.total)+" (arbres "+k(gr.nA)+", perches "+k(gr.nB)+", blocs "+k(gr.nR)+", feuilles "+k(gr.nF)+", objets "+k(gr.nP)+(gr.nS&&S.semN?", semis "+gr.nS.slice(0,S.semN).map(k).join(" + "):"")+")",
    "Soleil           "+k(V3.ombre||V3.grains*.6)+", carte "+V3.sm.w+" × "+V3.sm.h,
    "Sol              "+(V3.sol.tri||0)+" triangles dessinés ("+(CFG.v3solPlein?"tout le tour, sommets répétés":"cap utile, sommets partagés")+")",
    "Tapis du sol     "+(v3TapisActif()?T.L+" niveaux de "+T.N+" × "+T.N+", texel "+Math.round(T.s0*1000)/10+" cm à "+Math.round(T.s0*2**(T.L-1)*100)+" cm":"coupé"),
    "",
    "PAR PASSE (à l'arrêt, attente réelle de la puce)",
    "Semis des grains "+fx(pa.tamponG,1)+" ms",
    "Ombres, matière, lumière "+fx(pa.ombrage,1)+" ms"+(sansTap!=null?" (sans tapis : "+fx(sansTap,1)+" ms)":""),
    "Cuisson du tapis "+(cuisson?fx(cuisson.ms,2)+" ms pour 10 k texels ("+k(cuisson.tx)+" cuits)":"non mesurée"),
    "",
    "PASSES SEULES (médiane de 7, aller-retour à vide retranché)",
    "Aller-retour     "+fx(vide,1)+" ms (une lecture quand rien n'est en file)",
    "Capteur          "+fx(cap-vide,1)+" ms à "+canvas.width+" × "+canvas.height+" (à 4 lectures/texel : "+fx(cap4-vide,1)+" ms)",
    "Halo, exposition "+fx(halo-vide,1)+" ms",
    "Sonde bloquante  "+(sondeB!=null?fx(sondeB-vide,1)+" ms de calcul, "+fx(sondeB,1)+" ms d'attente ("+(SONDE.p?"programme de sonde":"lanceur de rayons")+" ; en marche : lecture différée, "+(OPT.sondeSync?"coupée":"active")+")":"sonde pas encore compilée"),
    "",
    "COÛT RÉEL D'UNE IMAGE SELON LE BUDGET",
    ...essais,
  ].join("\n");
  $("mesure-copier").disabled=false;
}
/* Banc des passes : que coûte, sur cette puce, une passe de rendu presque vide, selon le format et la taille de la cible ?
   Sur le Mali-G77 de Toine, trois petites passes de halo prenaient 28 à 42 ms : si le prix est par passe et non par pixel,
   c'est le nombre de passes par image qu'il faut réduire. Dix (ou cent) passes en ping-pong, une seule attente à la fin. */
function bancPasses(){
  const L=[], fx=v=>v.toFixed(2).replace(".",","), f32=new Float32Array(4), u8=new Uint8Array(4);
  const lire=(t,flo)=>{ gl.bindFramebuffer(gl.FRAMEBUFFER,t.f); if(flo) gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,f32); else gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,u8); };
  const essai=(nom,fmt,flo,w,h,N)=>{
    const a=target(w,h,fmt,gl.NEAREST), b=target(w,h,fmt,gl.NEAREST); if(!a.ok||!b.ok){ freeT(a); freeT(b); L.push(nom.padEnd(30)+"cible refusée"); return; }
    gl.useProgram(P_DOWN.p); gl.uniform2f(P_DOWN.u.uDstRes,w,h); gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST);
    const tour=n=>{ let src=a, dst=b; for(let i=0;i<n;i++){ bindTex(0,src.t,P_DOWN.u.uTex); gl.bindFramebuffer(gl.FRAMEBUFFER,dst.f); gl.viewport(0,0,w,h); draw(); const x=src; src=dst; dst=x; } return src; };
    lire(tour(2),flo);                                            // mise en route
    const m=[]; for(let k=0;k<5;k++){ lire(a,flo); const t0=performance.now(); const fin=tour(N); lire(fin,flo); m.push((performance.now()-t0)/N); }
    m.sort((x,y)=>x-y); L.push(nom.padEnd(30)+fx(m[2])+" ms par passe ("+N+" passes)");
    freeT(a); freeT(b);
  };
  essai("RGBA8, 128 × 128",gl.RGBA8,false,128,128,10);
  essai("RGBA16F, 128 × 128",gl.RGBA16F,true,128,128,10);
  essai("RGBA32F, 128 × 128",gl.RGBA32F,true,128,128,10);
  essai("RGBA8, taille de l'image",gl.RGBA8,false,W,H,10);
  essai("RGBA16F, taille de l'image",gl.RGBA16F,true,W,H,10);
  essai("RGBA32F, taille de l'image",gl.RGBA32F,true,W,H,10);
  essai("RGBA8, 128 × 128, à la chaîne",gl.RGBA8,false,128,128,100);
  essai("RGBA16F, 128 × 128, à la chaîne",gl.RGBA16F,true,128,128,100);
  return ["","BANC DES PASSES (une passe presque vide)",...L].join("\n");
}
$("mesurer").onclick=()=>{ mesurer().then(()=>{ let banc=""; try{ banc=bancPasses(); }catch(e){ banc="\nBanc des passes : "+(e&&e.message||e); } $("mesure-txt").textContent+="\n"+profTexte+"\n"+banc; }).catch(e=>{ hold=false; bench=null; $("mesure-txt").textContent="La mesure a échoué : "+(e&&e.message||e); }); };
$("banc").onclick=()=>{ fermerOutils(); banc().then(t=>{ $("mesure-txt").textContent=t; $("mesure").hidden=false; $("mesure-copier").disabled=false; }).catch(e=>{ BANC.on=false; $("mesure-txt").textContent="Le banc d'essai a échoué : "+(e&&e.message||e); }); };
$("mesure-fermer").onclick=()=>{ $("mesure").hidden=true; $("mesure").classList.remove("banc"); };
/* Banc d'essai (docs/moteur-v3.md, « Banc d'essai ») : environ 15 s, caméra figée sur deux poses de la fiche courante (de face,
   regard levé dans les houppiers), régulateur coupé, chaque image recalculée (comme en marche) et la carte d'ombres refaite à
   chaque image. Pour chaque variante, temps de la puce (EXT_disjoint_timer_query_webgl2, médiane de 8 images) des passes grains,
   proches, ombre, ombrage, et la somme ; sans le chronomètre, l'intervalle entre deux fins d'image (attente de la puce, dans le banc
   seulement). Les variantes passent par des uniformes et des drapeaux (uBanc du semeur, BANC.v), aucun programme nouveau. */
const BANC_VAR=[
  {nom:"référence (100 % des grains)"},
  {nom:"grains 50 %",g:.5},
  {nom:"grains 25 %",g:.25},
  {nom:"grains d'un pixel (sommets seuls)",pt1:1},
  {nom:"sans feuilles (rejetées)",feuil:1},
  {nom:"feuilles seules",feuil:2},
  {nom:"sans troncs ni branches",feuil:3},
  {nom:"sans semis ni objets",sansF:1},
  {nom:"sans relief de détail",sansRel:1,si:()=>!!S.relOn},
  {nom:"résolution interne × 0,5",res:.5},
  {nom:"sans proches (en grains)",sansPrx:1} ];
const imagesV3=n=>new Promise(ok=>{ const n0=V3.nImg, t0=performance.now(); const f=()=>{ if(V3.nImg>=n0+n||performance.now()-t0>8000) ok(); else requestAnimationFrame(f); }; f(); });
async function banc(){
  if(BANC.on) return "Banc d'essai déjà en cours.";
  if(!V3.on||!V3.gp||!V3.omb||!V3.omb.p) return "Banc d'essai : le moteur v3 n'est pas prêt (il compile encore, ou le moteur à rayons est en service).";
  const el=$("mesure"), tx=$("mesure-txt"); el.classList.add("banc"); el.hidden=false; $("mesure-copier").disabled=true;
  const av={pitch:cam.pitch,ly:look.yaw,lp:look.pitch,reg:REG.on,niv:REG.niveau,res:REG_RES,walking,regMs:Math.round(REG.ms)};
  BANC.on=true; BANC.rec=[]; REG.on=false; walking=false; if(REG_RES!==1){ REG_RES=1; resize(); }
  const poses=[["de face",-.03],["vers le haut",.75]], vars=BANC_VAR.filter(v=>!v.si||v.si()), R={}, t0=performance.now();
  try{
    for(let pi=0;pi<poses.length;pi++){
      cam.pitch=poses[pi][1]; look.yaw=0; look.pitch=0;
      for(let vi=0;vi<vars.length;vi++){
        const v=vars[vi], id=pi*100+vi;
        tx.textContent="Banc d'essai… pose « "+poses[pi][0]+" », "+(vi+1)+"/"+vars.length+" : "+v.nom+"\n\nNe touche à rien (environ 15 s).";
        BANC.v=v; if(v.res){ REG_RES=v.res; resize(); }
        await imagesV3(v.res?6:3); BANC.vi=id; BANC.tFin=0; await imagesV3(8); BANC.vi=-1;
        if(v.res){ REG_RES=1; resize(); } BANC.v=null; R[id]=v;
      } }
    await imagesV3(6);                                           // les dernières requêtes du chronomètre arrivent quelques images plus tard
  } finally {
    BANC.on=false; BANC.v=null; BANC.vi=-1; cam.pitch=av.pitch; look.yaw=av.ly; look.pitch=av.lp; REG.on=av.reg; walking=av.walking;
    if(REG_RES!==av.res){ REG_RES=av.res; resize(); } sceneDirty=true; }
  const med=a=>{ if(!a.length) return null; const b=a.slice().sort((x,y)=>x-y); return b[b.length>>1]; };
  const passes=GT.ext?["grains","proches","ombre","ombrage","image"]:["image"];
  const cell=(id,k)=>{ const r=BANC.rec.filter(x=>x.v===id);
    if(k==="image"&&GT.ext){ const par={}; r.forEach(x=>{ par[x.img]=(par[x.img]||0)+x.ms; }); return med(Object.values(par)); }
    return med(r.filter(x=>x.nom===k).map(x=>x.ms)); };
  const f=v=>v===null?"   –":v.toFixed(1).padStart(5), L=[];
  const dbg=(()=>{ try{ const d=gl.getExtension("WEBGL_debug_renderer_info"); return d?gl.getParameter(d.UNMASKED_VENDOR_WEBGL)+" · "+gl.getParameter(d.UNMASKED_RENDERER_WEBGL):"(WEBGL_debug_renderer_info absente)"; }catch(_){ return "?"; } })();
  L.push("BANC D'ESSAI v3 · "+new Date().toISOString().slice(0,16).replace("T"," ")+" · "+((performance.now()-t0)/1000).toFixed(0)+" s");
  L.push("Machine : "+dbg);
  L.push("Navigateur : "+navigator.userAgent.replace(/^Mozilla\/5\.0 /,""));
  L.push("Fiche : "+(fiche.id||fiche.titre||"?")+" · qualité "+(QUAL.full?"complète":"mobile")+" · interne "+W+" × "+H+" · écran "+canvas.width+" × "+canvas.height+" · ×"+(devicePixelRatio||1));
  L.push("Grains : "+V3.grains.toLocaleString("fr")+" (budget, niveau 0) · ombre ×0,6 · régulateur avant le banc : niveau "+av.niv+", "+av.regMs+" ms");
  L.push("Chrono de la puce (EXT_disjoint_timer_query_webgl2) : "+(GT.ext?"oui, médiane de 8 images, ms":"NON : intervalle entre deux fins d'image avec attente de la puce (lecture d'un pixel), ms (la passe seule est inconnue)"));
  L.push("Ombrage : "+(V3.omb===OMB.e.socle?"socle":"complet "+V3.omb.sig)+" · KHR_parallel_shader_compile : "+(parallele?"oui":"non"));
  for(let pi=0;pi<poses.length;pi++){
    L.push(""); L.push("— "+poses[pi][0].toUpperCase()+" —"); L.push("variante".padEnd(36)+passes.map(k=>k.padStart(8)).join(""));
    for(let vi=0;vi<vars.length;vi++){ const id=pi*100+vi; L.push(vars[vi].nom.padEnd(36)+passes.map(k=>("   "+f(cell(id,k))).padStart(8)).join("")); } }
  L.push(""); L.push("Compilations ("+COMP.lances+") : "+COMP.journal.map(j=>j.nom+" "+(j.ms/1000).toFixed(1)+" s").join(" · "));
  L.push("Premiers dessins : "+(COMP.premiers.length?COMP.premiers.map(x=>(x.ms/1000).toFixed(2)+" s"+(x.ouv?" (ouverture)":"")+" ["+x.noms+"]").join(" · "):"aucun mesuré"));
  L.push("Plus longue image des 10 premières s : "+Math.round(LONGUE.max)+" ms");
  L.push("Gels (intervalles de plus de 250 ms entre deux images, ouverture comprise) : "+gelsTexte());
  const txt=L.join("\n"); tx.textContent=txt; $("mesure-copier").disabled=false; BANC.dernier=txt; return txt;
}
$("mesure-copier").onclick=()=>{ const t=$("mesure-txt"), b=$("mesure-copier"), ok=()=>{ b.textContent="Copié"; setTimeout(()=>b.textContent="Copier",1500); };
  const sel=()=>{ const r=document.createRange(); r.selectNodeContents(t); const s=getSelection(); s.removeAllRanges(); s.addRange(r); };
  try{ navigator.clipboard.writeText(t.textContent).then(ok,sel); }catch(_){ sel(); } };

/* ------------------------------------------------------------------ meneur de jeu (src/meneur.js, docs/meneur-de-jeu.md)
   Une histoire se joue par-dessus la promenade : deux fois par seconde, le meneur lit la perception et rend des ordres
   (pensée, scène, gestes, fin). Sans histoire, rien ici n'agit et la promenade libre reste celle d'avant. */
const HIST=typeof HISTOIRES!=="undefined"?HISTOIRES:[];
let meneur=null, meneurTimer=0, meneurT=0, histoireId=null;
function objetsPercus(){                                      // distance, direction par rapport au corps, « vu » : visible, à portée, dans le champ
  const rel=a=>((a*180/Math.PI)%360+540)%360-180, yw=cam.yaw+look.yaw, out=[];
  for(const o of (Array.isArray(fiche.objets)?fiche.objets:[]).slice(0,16)){
    if(!o||!o.id) continue;
    const dv=clampN(o.devant,-60,400,12), ct=clampN(o.cote,-120,120,3), a=1.15;           // même placement que buildShapes
    const x=S.kit!==1?pathX(dv)+ct:Math.sin(a)*dv+Math.cos(a)*ct, z=S.kit!==1?dv:Math.cos(a)*dv-Math.sin(a)*ct;
    const dx=x-cam.x, dz=z-cam.z, m=Math.hypot(dx,dz), dir=Math.atan2(dx,dz);
    const visible=!(o.visible===false||cacheObj.has(o.id)), lum=(o.formes||[]).some(f=>f&&f.matiere==="lumineux");
    const portee=lum?90:S.nuit?(S.torch>0?12:4):30;
    const me=mesureObjet(o);
    out.push({id:o.id, nom:o.nom||o.id, m:+m.toFixed(1), angle:Math.round(rel(dir-cam.yaw)), visible, vu:visible&&m<=portee&&Math.abs(rel(dir-yw))<=50, taille:+me.taille.toFixed(2), haut:+me.haut.toFixed(2)});
  }
  return out;
}
const PATIENCE_APRES_TEMPS=45;                                 // secondes d'attente après un temps de la trame, si le joueur ne dit rien
function percevoirMeneur(){ const p=perception(), x0=S.depart?S.depart.x:S.kit!==1?pathX(0):0, z0=S.depart?S.depart.z:0;
  p.avance_m=+cam.z.toFixed(1); p.depart_m=+Math.hypot(cam.x-x0,cam.z-z0).toFixed(1); p.objets=objetsPercus();
  p.supports=supportsProches().map(({id,nom,m,angle,haut})=>({id,nom,m,angle,haut})); p.hauteur_m=+cam.elev.toFixed(1); return p; }
function executer(o){                                         // les ordres du meneur, traduits pour le moteur
  if(o.type==="pensee") penser(o.texte);
  else if(o.type==="scene") patchScene(o.scene);
  else if(o.type==="actions"){ if(o.vider){ cam.zoomCible=1; queue.length=0; patience=PATIENCE_APRES_TEMPS; libererPoses(); } enqueue(o.actions); }   // un temps vient d'arriver : elle s'arrête et attend la voix
  else if(o.type==="pulse") $("parler").classList.toggle("pulse",!!o.on);
  else if(o.type==="figer"){ if(!frozen) setFrozen(true,"parler"); }
  else if(o.type==="arret"){ hold=true; queue.length=0; libererPoses(); }
  else if(o.type==="stop"){ queue.length=0; immobile=true; errance=false; libererPoses(); }     // « arrête-toi » : tout de suite, sans attendre Claude
  else if(o.type==="reprendre") immobile=false;
  else if(o.type==="apercu") penser(o.texte);                       // la pensée, dès qu'elle est écrite
  else if(o.type==="objet") objetMeneur(o);
  else if(o.type==="fin"){ $("fin-titre").textContent=o.titre; $("fin-texte").textContent=o.replique||""; $("fin").hidden=false; setFrozen(false); }
}
/* Objets du meneur (accessoiriste, suites) : ajoutés à la fiche en cours, bornés par validerFiche, rangés par buildShapes
   (une texture de données) : le lieu n'est pas rechargé. Placés par rapport au porteur, ou près d'un objet déjà là. */

function posObjet(o){ const dv=clampN(o.devant,-60,400,12), ct=clampN(o.cote,-120,120,3), a=1.15;   // même placement que buildShapes
  return S.kit!==1?{x:pathX(dv)+ct,z:dv}:{x:Math.sin(a)*dv+Math.cos(a)*ct,z:Math.cos(a)*dv-Math.sin(a)*ct}; }
function versFiche(x,z){ if(S.kit!==1) return {devant:z,cote:x-pathX(z)}; const a=1.15; return {devant:Math.sin(a)*x+Math.cos(a)*z,cote:Math.cos(a)*x-Math.sin(a)*z}; }
/* §19 : la place d'une chose se prend AU GESTE, quand la file atteint le marqueur {type:"poser", ref} (après la marche que la
   phrase demande d'abord), jamais au tour de voix. reserves : ref -> {ou, distance, pos (null tant qu'il n'y est pas), attente
   (la chose arrivée trop tôt, posée au marqueur)}. Sans marqueur dans la file (ancien ordre, file vidée), la place se prend
   tout de suite. Une place prise reste la sienne s'il bouge ensuite sans qu'on le lui demande. */
const reserves=new Map();
const differes=new Map(), faconnages=new Map(), retenus=new Map();               // façonnage (§15.3) : ce qu'il rapporte (posé à son retour) ; les états à jouer
let dernierLieu=null;                                          // où il est allé chercher (tests, démo)
const marquePose=ref=>queue.some(a=>a.type==="poser"&&a.ref===ref);
function poserIci(ref){                                          // la file atteint le geste : la place se prend ici ; la chose arrivée trop tôt y est posée
  const rs=reserves.get(ref); if(!rs||rs.pos) return;
  rs.pos=placeGeste(rs); journalPoses.push({ref,x:+cam.x.toFixed(2),z:+cam.z.toFixed(2),t:+(performance.now()/1000).toFixed(1)}); if(journalPoses.length>20) journalPoses.shift();
  if(rs.attente){ const o=rs.attente; delete rs.attente; objetMeneur(o); } }
function libererPoses(){                                         // file vidée (nouvel ordre, stop) : une chose qui attendait son geste est posée là où il est
  for(const [ref,rs] of reserves) if(rs.attente&&!marquePose(ref)){ const o=rs.attente; delete rs.attente; rs.pos=null; objetMeneur(o); } }
const journalPoses=[]; window.balPoses=journalPoses;   // essais (tools/ordre.mjs) : où chaque place a été prise
function placeGeste(o){ const q=MENEUR.placePose(cam.x,cam.z,cam.yaw,o.ou,o.distance); return versFiche(q.x,q.z); }   // par rapport au corps, au tour de voix (MENEUR.OU_POSE)
function objetMeneur(o){
  const L=Array.isArray(fiche.objets)?fiche.objets.slice():[], id=o.id||(o.objet&&o.objet.id), i=L.findIndex(x=>x&&x.id===id);
  if(o.op==="reserver"){ reserves.set(o.ref,o.au_geste&&marquePose(o.ref)?{ou:o.ou,distance:o.distance,pos:null}:{pos:placeGeste(o)}); if(reserves.size>8) reserves.delete(reserves.keys().next().value); return; }
  if(o.op==="abandon"){ reserves.delete(o.ref); return; }          // l'accessoiriste n'a rien donné : il n'attend plus
  if(o.op==="creer"&&o.retenu){ retenus.set(o.retenu,Object.assign({},o,{retenu:undefined})); return; }   // §22.2 : ce qu'il laisse en vomissant, posé à ce moment-là
  if(o.op==="creer"&&o.differe){ differes.set(o.differe,[...(differes.get(o.differe)||[]),o]); return; }   // ramassé : posé près de la chose quand il revient
  if(o.op==="faconner"){ faconnages.set(id,o); if(!queue.some(a=>a.type==="faconner"&&a.objet===id)) faconnerTout(id); return; }
  if(o.op==="creer"){
    const visibles=L.filter(x=>x&&!(x.visible===false||cacheObj.has(x.id))).length;
    if(i>=0||visibles>=8||!o.objet){ if(o.reserve) reserves.delete(o.reserve); return; }
    const rs=o.reserve&&reserves.get(o.reserve);
    if(rs&&!rs.pos&&!o.pres_de&&marquePose(o.reserve)){ rs.attente=o; return; }   // il n'y est pas encore : posée quand la file atteindra le geste
    if(rs) reserves.delete(o.reserve);
    const base=o.pres_de&&L.find(x=>x&&x.id===o.pres_de), d=Array.isArray(o.decale)?o.decale:[0,0];
    const voisin=typeof o.contre==="string"&&L.find(x=>x&&x.id===o.contre);   // « juste à côté de l'autre » : tout contre elle, côté porteur
    let pos;
    if(base){ const b=posObjet(base); pos=versFiche(b.x+(+d[0]||0),b.z+(+d[1]||0)); }
    else if(voisin){ const b=posObjet(voisin), F=(o.objet.formes||[]).filter(f=>f&&Array.isArray(f.p)&&Array.isArray(f.taille));
      const rB=Math.max(0,...F.map(f=>Math.hypot(f.p[0],f.p[2])+Math.max(f.taille[0],f.taille[2])/2)), e=mesureObjet(voisin).taille/2+rB+.05, dx=cam.x-b.x, dz=cam.z-b.z, l=Math.hypot(dx,dz)||1;
      pos=versFiche(b.x+dx/l*e,b.z+dz/l*e); }
    else if(rs&&rs.pos) pos=rs.pos;
    else pos=placeGeste(o);
    { const w=posObjet(pos), F=(o.objet.formes||[]).filter(f=>f&&Array.isArray(f.p)&&Array.isArray(f.taille));   // jamais dans le corps du porteur
      const r=Math.max(0,...F.map(f=>Math.hypot(f.p[0],f.p[2])+Math.max(f.taille[0],f.taille[2])/2)), corps={x:cam.x,z:cam.z,yaw:cam.yaw};
      const haut=Math.max(.02,...F.map(f=>f.p[1]+f.taille[1]/2));
      // ni sur lui (derrière les talons si elle sort du corps), ni sur une autre chose, un tronc, un rocher, ni DANS ou SOUS un
      // élément de semis (cailloux, branches mortes, tombes : cas réel, une crotte cadrée à travers un éclat de grès)
      const occupe=p=>semisSous(p.x,p.z,r,haut);
      // ni contre une autre chose, sauf si le joueur l'a demandé (écart fonction des deux envergures, MENEUR.ecartChoses, §19)
      const q=base?(occupe(w)?MENEUR.placeLibre(w,r,[],{x:posObjet(base).x,z:posObjet(base).z},MENEUR.REGLAGES.MARGE_CORPS,occupe):w)
        :voisin?MENEUR.placeLibre(w,r,obstaclesConnus().filter(x=>x.id!==voisin.id),posObjet(voisin),MENEUR.REGLAGES.MARGE_CORPS,occupe,{contre:true})
        :MENEUR.placeLibre(MENEUR.horsDuCorps(w,corps,r,MENEUR.REGLAGES.MARGE_CORPS,o.ou),r,obstaclesConnus(),corps,MENEUR.REGLAGES.MARGE_CORPS,occupe);
      if(q.x!==w.x||q.z!==w.z) pos=versFiche(q.x,q.z); }
    const v=validerFiche({kit:"foret",objets:[Object.assign({},o.objet,pos)]}).objets;   // borné comme un objet de fiche décrite
    if(!v||!v[0]) return;
    v[0].id=String(id).slice(0,30); v[0].devant=pos.devant; v[0].cote=pos.cote; L.push(v[0]);
    if(o.reserve&&!(chuteRecente&&performance.now()-chuteRecente<30000)) chuteSon(v[0]);   // une chose demandée arrive au sol : on l'entend tomber (sauf si son geste l'a déjà fait entendre)
    chuteRecente=0;
  } else if(i<0) return;
  else if(o.op==="retirer") L.splice(i,1);
  else if(o.op==="remplacer"){                                    // retouchée sur place : mêmes id, place et cap ; d'autres formes
    const v=validerFiche({kit:"foret",objets:[Object.assign({},L[i],{formes:o.formes})]}).objets;
    if(!v||!v[0]||!v[0].formes||!v[0].formes.length) return;
    L[i]=Object.assign({},L[i],{formes:v[0].formes},o.nom?{nom:String(o.nom).slice(0,60)}:{},o.echelle!==undefined?{echelle:clampN(o.echelle,.1,5,1)}:{}); }
  else { const x=Object.assign({},L[i]);
    if(o.echelle!==undefined) x.echelle=clampN(o.echelle,.1,5,1);
    if(Array.isArray(o.decale)){ const b=posObjet(x), q=versFiche(b.x+(+o.decale[0]||0),b.z+(+o.decale[1]||0)); x.devant=q.devant; x.cote=q.cote; }
    if(o.vacille!==undefined||o.lumineux===false) x.formes=x.formes.map(f=>f.matiere!=="lumineux"?f:o.lumineux===false?Object.assign({},f,{matiere:"mat",couleur:"#1f1a16",vacille:0},f.vacille>0?{p:[f.p[0],f.p[1]*.12,f.p[2]],taille:[f.taille[0]*.9,f.taille[1]*.12,f.taille[2]*.9]}:{}):Object.assign({},f,{vacille:clampN(o.vacille,0,1,0)}));
    L[i]=x; }
  fiche=Object.assign({},fiche,{objets:L});
  // une forme qui nomme une recette pas encore chargée (une chose fabriquée en cours de partie) : les recettes sont rechargées,
  // sinon la forme retombe sur la matière « mat » (avant : la recette d'un modèle n'était jamais chargée en promenade)
  const lib=recettesDe(fiche); if(L.some(x=>x&&(x.formes||[]).some(f=>f&&typeof f.matiere==="string"&&isObj(lib[f.matiere])&&!matIdx.has(f.matiere)))) buildMats(fiche);
  buildShapes(fiche);
}
/* Le façonnage, joué par la page (§15.3) : accroupi devant la chose, il pose ce qu'il a rapporté, la tourne vers lui, puis
   elle change d'état environ chaque seconde pendant que la caméra bouge un peu (quelqu'un qui travaille de ses mains) ;
   à la fin, ce qui a servi disparaît. Les états viennent du meneur (accessoiriste ou etapesFaconnage) : rien n'est propre à un objet. */
function reveler(id){
  const L=differes.get(id); differes.delete(id); if(!L) return;
  const b=(Array.isArray(fiche.objets)?fiche.objets:[]).find(x=>x&&x.id===id); if(!b) return;
  const q=posObjet(b), r=Math.max(.08,mesureObjet(b).taille/2), dx=cam.x-q.x, dz=cam.z-q.z, l=Math.hypot(dx,dz)||1, ux=dx/l, uz=dz/l;
  // devant elle, un peu de côté, côté porteur : dans le champ pendant qu'il travaille (la main y prend ce qu'il faut)
  L.forEach((o,k)=>{ const s=k%2?-1:1, c=r*.5+.08, v=r*.6+.04; objetMeneur(Object.assign({},o,{differe:undefined,pres_de:id,decale:[uz*s*c+ux*v,-ux*s*c+uz*v]})); });
}
function tournerVers(id){                                        // sa face (+z) vers le porteur : c'est de ce côté qu'il la façonne
  const L=Array.isArray(fiche.objets)?fiche.objets.slice():[], i=L.findIndex(x=>x&&x.id===id); if(i<0) return;
  const o=L[i], q=posObjet(o), dv=clampN(o.devant,-60,400,12);
  const y0=S.kit!==1?Math.atan2(pathX(dv-4)-q.x,-4):1.15+Math.PI, y1=Math.atan2(cam.x-q.x,cam.z-q.z);
  L[i]=Object.assign({},o,{cap:Math.round(wrapA(y1-y0)*180/Math.PI)}); fiche=Object.assign({},fiche,{objets:L}); buildShapes(fiche);
}
function faconnerTout(id){                                       // pas de geste en cours : le résultat tout de suite
  const op=faconnages.get(id); faconnages.delete(id); if(!op) return; reveler(id);
  objetMeneur({type:"objet",op:"remplacer",id,formes:op.etapes[op.etapes.length-1],nom:op.nom,echelle:op.echelle});
  for(const c of op.consomme||[]) objetMeneur({type:"objet",op:"retirer",id:c});
}
function faconnerPas(a,dt){
  if(!a.vise){ a.vise=true; const v=viserObjet(a.objet); if(v){ queue.unshift({type:"tourner",rest:v.yaw},{type:"regarder",pitch:Math.max(-1.05,v.pitch)}); return; } }
  const op=faconnages.get(a.objet);
  if(!a.base) a.base={yaw:cam.yaw,pitch:cam.pitch,haut:cam.haut};
  a.t+=dt; const t=a.t, B=a.base;
  const fin=()=>{ cam.yaw=B.yaw; cam.pitch=B.pitch; cam.haut=B.haut; mainsObj=null; mainsEtat.H=null; buildShapes(fiche,true); queue.shift(); };
  const objet=()=>(Array.isArray(fiche.objets)?fiche.objets:[]).find(x=>x&&x.id===a.objet);
  if(!op){ a.attente+=dt; const o=objet();                        // l'accessoiriste n'a pas encore répondu : il pétrit déjà
    if(o){ const R=repereObjet(o), F=o.formes||[], g=F.reduce((m,f)=>Math.max(m,Math.max(...f.taille)),.05);
      const c=versMonde(R,[0,Math.max(...F.map(f=>f.p[1]),.03)*.6,0]); mainsVers(mainsPetrir(c,g*R.ech/2,t).H,dt); bougerCamera(a,c,t); buildShapes(fiche,true); }
    if(a.attente>30) fin(); return; }
  if(a.i<0){ reveler(a.objet); tournerVers(a.objet); a.G=preparerGeste(a.objet,op,a); a.i=0; a.t0=t; a.k=-1; return; }
  const G=a.G;
  // §22.2 : la nausée, une fois, à la fin de la dernière phase de contact (par son nom) : le geste est suspendu (la chose reste
  // dans l'état atteint), il se détourne, vomit, s'essuie la bouche, revient ; puis le geste reprend au même point
  if(G&&G.D&&G.D.nausee&&(a.nau||!a.nauFait&&t-a.t0-.4-(a.pause||0)>=G.D.nausee.t)){
    if(!a.nau){ a.nau={t:0,e:-1,p:0,base:{yaw:cam.yaw,pitch:cam.pitch,haut:cam.haut}}; a.nauFait=true; mainsObj=null; mainsEtat.H=null; buildShapes(fiche,true); }
    a.pause=(a.pause||0)+dt; if(nauseePas(a.nau,G.D.nausee,dt,a.objet,a.degout)) a.nau=null; return; }
  let tt=t-a.t0-.4-(a.pause||0), k=0;                             // un temps pour poser ce qu'il a rapporté
  while(G&&k<G.T.length&&tt>G.T[k].duree){ tt-=G.T[k].duree; k++; }
  if(!G||k>=G.T.length){                                          // fini : l'état final exact, ce qui a servi disparaît
    objetMeneur({type:"objet",op:"remplacer",id:a.objet,formes:op.etapes[op.etapes.length-1],nom:op.nom,echelle:op.echelle});
    for(const c of op.consomme||[]) objetMeneur({type:"objet",op:"retirer",id:c});
    faconnages.delete(a.objet); fin(); return; }
  const tr=G.T[k], u=Math.min(1,Math.max(0,tt/tr.duree)), ue=u*u*(3-2*u);
  if(G.D){ const tg=t-a.t0-.4-(a.pause||0);                                     // §22 : les pensées de dégoût, à leurs instants (au plus une toutes les ~3 s)
    while(G.dites<G.D.pensees.length&&tg>=G.D.pensees[G.dites].t&&pensePeut(3,G)){ const q=G.D.pensees[G.dites++]; say(q.texte); direVoix(q.texte); notePensee(q.texte,"degout",q.phase); } }
  if(k!==a.k){ a.k=k; a.i=k; if(tr.pile!==null&&tr.pile!==undefined&&G.tas) G.pris.add(tr.pile); }   // la main prend dans le tas : il quitte le tas
  let F=MENEUR.etatGeste(tr,ue);
  // le budget fixe (64 formes) : les miettes de pâte d'abord ; les ajouts (_k « j » : ce qu'on plante ou presse, petits mais
  // lisibles, les yeux) jamais avant elles, ce sont les derniers à recycler
  if(F.length>G.place){ const aj=f=>/^j/.test(f._k||"")?1:0; F=F.slice().sort((p,q)=>aj(q)-aj(p)||Math.max(...q.taille)-Math.max(...p.taille)).slice(0,G.place); }
  const L=fiche.objets.slice(), i=L.findIndex(x=>x&&x.id===a.objet); if(i<0){ fin(); return; }
  if(G.tas){ const j=L.findIndex(x=>x&&x.id===G.tas); if(j>=0){ const reste=G.tasF.filter((f,n)=>!G.pris.has(n)); L[j]=Object.assign({},L[j],{formes:reste.length?reste:[Object.assign({},G.tasF[0],{taille:[.01,.01,.01]})]}); } }
  // les mains : où elles vont pour cette opération, et ce qu'elles tiennent (la matière suit la main qui la porte)
  const M=mainsGeste(tr,u,t,F,G);
  { const X=F.find(f=>f._k===tr.cle); a.dbg={op:tr.op,sol:!!tr.sol,r:X?+(Math.max(...X.taille)/2*G.R.ech).toFixed(3):0,X:X?versMonde(G.R,X.p).map(v=>+v.toFixed(3)):null,H:M.H.map(h=>h.p.map(v=>+v.toFixed(3)))}; }
  mainsVers(M.H,dt);
  if(M.tenu&&mainsEtat.H){ const d=[0,0,0]; let n=0;              // l'écart entre la main réelle (elle glisse) et sa cible
    for(const h of M.tenu.mains){ for(let j=0;j<3;j++) d[j]+=mainsEtat.H[h].p[j]-M.H[h].p[j]; n++; }
    const f=F.find(x=>x._k===M.tenu.cle); if(f&&n){ const w=versMonde(G.R,f.p); f.p=versLocal(G.R,[w[0]+d[0]/n,w[1]+d[1]/n,w[2]+d[2]/n]); } }
  // les empreintes : là où une paume appuie, la matière molle se creuse ; la main partie, le creux se résorbe
  F=F.concat(empreintes(G,M.appui||[],t));
  L[i]=Object.assign({},L[i],{formes:F,echelle:G.E});
  fiche=Object.assign({},fiche,{objets:L});
  bougerCamera(a,M.vise||versMonde(G.R,[0,.3,0]),t,G.D?MENEUR.detourneA(G.D,t-a.t0-.4-(a.pause||0)):null);
  buildShapes(fiche,true);
}
/* Le façonnage préparé une fois (§17) : la chose et ce qu'il a rapporté, dans le repère de la chose, puis la suite des
   transitions (MENEUR.gesteFaconnage) ; place : combien de formes elle peut prendre sans sortir du budget fixe (64). */
function preparerGeste(id,op,a={}){
  const L=Array.isArray(fiche.objets)?fiche.objets:[], o=L.find(x=>x&&x.id===id); if(!o) return null;
  const e0=clampN(o.echelle,.1,5,1), E=op.echelle!==undefined?clampN(op.echelle,.1,5,1):e0;
  const avant=(o.formes||[]).map(f=>Object.assign({},f,{p:f.p.map(v=>v*e0/E),taille:f.taille.map(v=>v*e0/E)}));
  const R=repereObjet(Object.assign({},o,{echelle:E})), tas=(op.consomme||[]).map(c=>L.find(x=>x&&x.id===c)).find(Boolean)||null;
  let tasL=[], tasF=[];
  if(tas){ const Rp=repereObjet(tas); tasF=(tas.formes||[]).slice();
    tasL=tasF.map(f=>Object.assign({},f,{p:versLocal(R,versMonde(Rp,f.p)),taille:f.taille.map(v=>v*Rp.ech/E),cap:(f.cap||0)+(Rp.yaw-R.yaw)*180/Math.PI})); }
  const apres=op.etapes[op.etapes.length-1], T=MENEUR.gesteFaconnage(avant,apres,tasL,{echelle:R.ech});
  const autres=L.filter(x=>x&&x.id!==id&&!(x.visible===false||cacheObj.has(x.id))).reduce((n,x)=>n+Math.min(24,(x.formes||[]).length),0);
  const dom=(T[0]&&T[0].a.find(f=>/^m/.test(f._k))||{}).matiere;
  const D=a.degout?MENEUR.planDegout(T,a.degout,typeof MODELES!=="undefined"&&MODELES?MODELES.degout:null):null;   // §22 : pensées et regards détournés, datés sur les phases
  return {T,R,E,dom,tas:tas&&tas.id,tasF,pris:new Set(),emp:[],place:Math.max(8,Math.min(22,64-autres-2*MAINS_N-2)),D,dites:0};   // 2 : les empreintes
}
/* ---- Les mains à l'ouvrage (§17, §23). Deux mains en formes fondues (src/modeles.json, corps.mains : avant-bras sortant d'une
   manche, paume, pouce, quatre doigts ; poses clés interpolées), attachées au corps sous la caméra, chacune un objet (sa boîte :
   variante PATE des proches). Une main se décrit par sa paume : p (centre), n (normale, vers ce qu'elle touche), d (vers les
   doigts, sinon dans le prolongement de l'avant-bras) et sa pose. Jamais figées : un peu de tremblé toujours. */
const mainsEtat={H:null}, MAINS_N=9;
const v3a=(a,b,k=1)=>[a[0]+b[0]*k,a[1]+b[1]*k,a[2]+b[2]*k], v3s=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], v3d=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const v3x=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], v3n=a=>{ const l=Math.hypot(...a)||1; return a.map(v=>v/l); };
function poseVec(nom){ const P=(MAINS&&MAINS.poses)||{}, p=P[nom]||P.ouverte||{}, dg=Array.isArray(p.doigts)?p.doigts:[0,1,2,3].map(()=>+p.doigts||0), po=Array.isArray(p.pouce)?p.pouce:[40,10];
  return [...[0,1,2,3].map(i=>+dg[i]||0),+p.ecart||0,+po[0]||0,+po[1]||0]; }
const main=(p,n,pose,d=null)=>({p,n:v3n(n),d:d?v3n(d):null,v:Array.isArray(pose)?pose:poseVec(pose)});
function corpsAxes(){ const y=cam.yaw; return {e:[cam.x,terrainH(cam.x,cam.z)+S.eye*cam.haut+cam.elev,cam.z],f:[Math.sin(y),0,Math.cos(y)],r:[Math.cos(y),0,-Math.sin(y)]}; }
function mainsRepos(){ const {e,f,r}=corpsAxes(), q=(MAINS&&MAINS.repos)||[.16,-.3,.3];
  return [-1,1].map(s=>main([e[0]+r[0]*s*q[0]+f[0]*q[2],e[1]+q[1],e[2]+r[2]*s*q[0]+f[2]*q[2]],[-r[0]*s*.3,-1,-r[2]*s*.3],"ouverte")); }
const EP=()=>(((MAINS&&MAINS.paume&&MAINS.paume.taille)||[0,.026,0])[1]/2);   // demi-épaisseur de la paume
/* Les axes du travail autour d'un point c : v vers lui (horizontal), sx sur le côté (sa droite), y en haut. */
function axesTravail(c){ const {e,r}=corpsAxes(), dx=e[0]-c[0], dz=e[2]-c[2], l=Math.hypot(dx,dz)||1; return {v:[dx/l,0,dz/l],sx:r,y:[0,1,0]}; }
/* Pétrir une masse de centre c et de rayon r : les deux paumes de part et d'autre, en coupe, qui pressent en rythme. */
function mainsPetrir(c,r,t){
  const {v,sx}=axesTravail(c), H=[], appui=[];
  [-1,1].forEach((s,i)=>{ const pr=.5+.5*Math.sin(t*6.5+(s>0?0:2.4)), n=v3n(v3a(v3a(v3a([0,0,0],sx,-s*.8),v,-.6),[0,-1,0],.2));
    const ct=v3a(v3a(c,sx,s*r*.8),v,r*.6), p=v3a(ct,n,-EP()*1.6+pr*.014);
    H.push(main(p,n,"coupe",v3a([0,1,0],v,-.4))); if(pr>.55) appui.push({i,p,n,k:(pr-.55)/.45}); });
  return {H,appui,pr:[.5+.5*Math.sin(t*6.5+2.4),.5+.5*Math.sin(t*6.5)]};
}
/* Où vont les mains pour une transition du geste, et ce qu'elles tiennent. F : les formes de la chose à cet instant. */
function mainsGeste(tr,u,t,F,G){
  const R=G.R, W=p=>versMonde(R,p), op=tr.op||tr.geste, ech=R.ech, tr0=(k,a)=>.003*Math.sin(t*k+a);
  const forme=k=>F.find(f=>f._k===k), rayon=f=>f?Math.max(...f.taille)/2*ech:.05, haut=f=>f?f.taille[1]/2*ech:.05;
  const masse=forme(tr.masse||"mm")||F.filter(f=>f.matiere===G.dom).sort((p,q)=>Math.max(...q.taille)-Math.max(...p.taille))[0]||F[0];
  const X=tr.cle&&forme(tr.cle), Xc=X?W(X.p):W(masse.p), {v,sx}=axesTravail(Xc), up=[0,1,0], e=EP();
  const repos=mainsRepos();
  if(op==="petrir"){ const c=W(masse.p), r=rayon(masse), m=mainsPetrir(c,r,t);   // la masse s'écrase entre les paumes
    const sq=(m.pr[0]+m.pr[1])/2; masse.taille=[masse.taille[0]*(1-.1*sq),masse.taille[1]*(1+.05*sq),masse.taille[2]*(1+.05*sq)];
    return {H:m.H,appui:m.appui,vise:c}; }
  if(tr.sol&&(op==="diviser"||op==="rouler"||op==="poser")){   // une grosse boule : arrachée à deux mains, roulée au sol, portée à deux mains
    const r=rayon(X), hX=haut(X), w=t*5.5;
    if(op==="rouler"){ const H=[-1,1].map((s,i)=>{ const pr=.5+.5*Math.sin(w+(s>0?0:Math.PI)), n=v3n(v3a(v3a([0,0,0],v,-.75),[0,-1,0],.65));
        const c=v3a(v3a(Xc,v,(r+e)*.72),up,(hX+e)*.62+pr*.01); return main(v3a(c,sx,s*r*.38),n,"plat",v3a(v3a([0,0,0],v,-.6),up,.8)); });
      return {H,tenu:{cle:tr.cle,mains:[0,1]},appui:H.map((h,i)=>({i,p:h.p,n:h.n,k:.5})),vise:Xc}; }
    const dessus=op==="poser"&&u>.62, pr=dessus?Math.sin(Math.PI*Math.min(1,(u-.62)/.38)):0;
    const H=[-1,1].map(s=>{ if(dessus) return main(v3a(v3a(Xc,up,hX+e-pr*.015),sx,s*r*.4),[0,-1,0],"plat",v3a(v,[0,0,0],-1));
      const n=v3n(v3a(v3a([0,0,0],sx,-s*.8),v,-.6)), c=v3a(v3a(v3a(Xc,sx,s*r*.8),v,r*.6),up,hX*.15);   // les paumes sur l'avant des flancs, les doigts autour
      return main(v3a(c,n,-e*1.6),n,"coupe",v3a(up,v,-.2)); });
    if(op==="diviser"&&u<.25){ const M=W(masse.p), rM=rayon(masse); H.forEach((h,i)=>{ const s=i?1:-1, g=v3a(v3a(M,sx,s*rM*.7),v,rM*.5); h.p=v3a(g,v3s(h.p,g),u/.25); }); }
    return {H,tenu:(op==="diviser"&&u>.2)||(op==="poser"&&u<.85)?{cle:tr.cle,mains:[0,1]}:null,appui:H.map((h,i)=>({i,p:h.p,n:h.n,k:dessus?pr:.4})),vise:v3a(Xc,up,-r*.3)}; }
  if(op==="diviser"){ const M=W(masse.p), rM=rayon(masse), rX=rayon(X), w=Math.min(1,u/.25);
    const top=v3a(Xc,up,haut(X)+e), saisie=v3a(v3a(M,up,haut(masse)*.6+e),v,rM*.2);   // la main droite saisit dans la boule, puis tire
    const pd=u<.25?v3a(saisie,v3s(top,saisie),0):top;
    const H=[main(v3a(v3a(M,sx,-rM*.9),up,haut(masse)*.25),v3a(sx,up,-.3),"plat",v3a(up,v,-.5)), main(v3a(pd,up,tr0(9,1)),[0,-1,0],w<1?"coupe":"pince",v3a(v,v3a([0,0,0],sx,-.3),-1))];
    H[1].v=H[1].v.map((x,j)=>x+(poseVec("pince")[j]-x)*Math.min(1,Math.max(0,(u-.2)/.3)));
    return {H,tenu:u>.2?{cle:tr.cle,mains:[1]}:null,appui:[{i:0,p:H[0].p,n:H[0].n,k:.6}],vise:v3a(M,v3s(Xc,M),.5)}; }
  if(op==="rouler"){ const r=rayon(X), w=t*7.5, off=v3a(v3a([0,0,0],sx,Math.cos(w)*r*.35),v,Math.sin(w)*r*.35);
    const H=[main(v3a(v3a(Xc,up,-(haut(X)+e)),off,-1),up,"coupe",v3a(v,[0,0,0],-1)), main(v3a(v3a(Xc,up,haut(X)+e),off),[0,-1,0],"coupe",v3a(v3a([0,0,0],v,-1),sx,-.3))];
    return {H,tenu:{cle:tr.cle,mains:[0,1]},vise:Xc}; }
  if(op==="poser"){ const r=rayon(X), pr=Math.max(0,Math.sin(Math.PI*Math.min(1,Math.max(0,(u-.6)/.4)))), pose=u>.6?"plat":"coupe";
    const H=[main(v3a(Xc,sx,-(rayon(X)+e)),sx,pose,v3a(v,[0,0,0],-1)), main(v3a(Xc,up,haut(X)+e-pr*.012+tr0(8,0)),[0,-1,0],pose,v3a(v3a([0,0,0],v,-1),sx,-.25))];
    return {H,tenu:u<.85?{cle:tr.cle,mains:[0,1]}:null,appui:pr>.3?[{i:1,p:H[1].p,n:H[1].n,k:pr}]:[],vise:v3a(Xc,up,-r*.3)}; }
  if(op==="planter"||op==="presser"){
    const corpsF=F.filter(f=>f.matiere===G.dom).sort((p,q)=>q.p[1]-p.p[1]), haute=corpsF[Math.min(1,corpsF.length-1)]||masse, cH=W(haute.p);
    // la main du côté de ce qu'on ajoute le porte ; l'autre tient l'ouvrage par le flanc opposé (aucun bras ne traverse l'ouvrage)
    const cible=tr.a.find(f=>f._k===tr.cle), cote=v3d(v3s(W(cible?cible.p:X.p),cH),sx)>=0?1:-1, ip=cote>0?1:0, rH=rayon(haute);
    const nt=v3n(v3a(v3a([0,0,0],sx,cote*.8),v,-.6)), tient=main(v3a(v3a(v3a(v3a(cH,sx,-cote*rH*.8),v,rH*.6),up,-haut(haute)*.2),nt,-e*1.6),nt,"coupe",v3a(up,v,-.2));
    const paire=P=>ip?[tient,P]:[P,tient];
    if(u<.25&&tr.pile!==null&&tr.pile!==undefined){ const de=tr.de.find(f=>f._k===tr.cle), c=W(de.p), w=u/.25;
      const P=main(v3a(c,up,de.taille[1]/2*ech+e+.01*(1-w)),[0,-1,0],"ouverte",v3a(v,[0,0,0],-1)); P.v=P.v.map((x,j)=>x+(poseVec("poing")[j]-x)*Math.max(0,(w-.6)/.4));
      return {H:paire(P),vise:v3a(c,v3s(cH,c),.5)}; }
    const ax=tr.axe?v3n(versMonde({...R,x:0,y:0,z:0,ech:1},tr.axe)):up, L=X?Math.max(...X.taille)*ech:.1;
    let P;
    if(op==="planter"){ const g=v3a(Xc,ax,L*.32); let n=v3s([0,0,0],v); n=v3n(v3s(n,v3a([0,0,0],ax,v3d(n,ax))));
      P=main(v3a(g,n,-(X.taille[0]/2*ech+e)),n,"poing",v3x(ax,n)); }
    else { const n=v3n(v3a(v3s([0,0,0],v),sx,-cote*.5)); P=main(v3a(v3a(v3a(Xc,v,rayon(X)+e+.03),sx,cote*.05),up,-.02),n,"pince",v3a(up,sx,-cote*.6)); }
    return {H:paire(P),tenu:u<.97?{cle:tr.cle,mains:[ip]}:null,appui:[{i:1-ip,p:tient.p,n:tient.n,k:.5}],vise:v3a(Xc,v3s(cH,Xc),.3)}; }
  // lisser : les deux paumes à plat sur l'ouvrage, en arcs
  const corpsF=F.filter(f=>f.matiere===G.dom).sort((p,q)=>q.p[1]-p.p[1]), hautF=corpsF[0]||masse, mil=corpsF[1]||hautF;
  const a1=Math.sin(t*4.8), a2=Math.sin(t*4.8+2);
  const n0=v3n(v3a(sx,[0,-1,0],.3)), c1=W(mil.p);
  const H=[-1,1].map((s,i)=>{ const f=i?hautF:mil, c=W(f.p), r=rayon(f), n=v3n(v3a(v3a([0,0,0],sx,-s*.7),v,-.7));
    return main(v3a(v3a(v3a(v3a(c,sx,s*r*.7),v,r*.7),up,(i?a1:a2)*r*.35),n,-e*1.4),n,"plat",v3a(up,sx,s*.2)); });
  if(u>.7){ const w=(u-.7)/.3; H.forEach((h,i)=>{ h.p=v3a(h.p,v3s(repos[i].p,h.p),w*w); }); }
  return {H,appui:u<.7?[{i:1,p:H[1].p,n:H[1].n,k:.4+.3*Math.abs(a1)}]:[],vise:W(mil.p)};
}
/* Empreintes : une paume qui appuie creuse la matière molle de la chose (forme « creux », une par main) ; la main partie, le
   creux remonte et se résorbe en deux secondes et demie. */
function empreintes(G,appui,t){
  const P=(MAINS&&MAINS.paume&&MAINS.paume.taille)||[.082,.026,.088], R=G.R;
  for(const a of appui){ const h=mainsEtat.H&&mainsEtat.H[a.i]; if(!h) continue; G.emp[a.i]={p:h.p.slice(),n:h.n.slice(),k:Math.min(1,a.k),t}; }
  const out=[];
  G.emp.forEach(e=>{ if(!e) return; const w=Math.max(0,1-(t-e.t)/2.5)*e.k; if(w<.05) return;
    const c=v3a(e.p,e.n,-(1-w)*P[1]*1.2);
    out.push(axeForme(R,"boule",c,e.n,[P[0]*.9/R.ech,P[1]*1.3/R.ech,P[2]*.9/R.ech],"#000000","mat",{creux:.012/R.ech,_k:"emp"})); });
  return out;
}
/* Une forme dont l'axe (y) suit d dans le monde, dans le repère R d'un objet : cap et penche (même repère que sdPrim). */
function axeForme(R,f0,c,d,taille,couleur,matiere,extra){ let [dx,dy,dz]=v3n(d); if(dy<0){ dx=-dx; dy=-dy; dz=-dz; }
  const w=Math.acos(Math.min(1,dy)), Y=Math.atan2(dz,-dx), cap=((Y-R.yaw)*180/Math.PI%360+540)%360-180;
  return Object.assign({f:f0,p:versLocal(R,c),taille,cap,penche:[0,w*180/Math.PI],couleur,matiere},extra||{}); }
/* Les mains glissent vers leurs cibles (jamais de saut d'une transition à l'autre), poses comprises, puis leurs objets sont refaits. */
function mainsVers(H,dt,quelles=[0,1]){                          // quelles : les mains dans le champ (0 gauche, 1 droite)
  if(!MAINS) return;
  if(!mainsEtat.H) mainsEtat.H=mainsRepos();
  const k=Math.min(1,dt*12);
  mainsEtat.H=mainsEtat.H.map((h,i)=>{ let c=H[i]; if(!c) return h; if(Array.isArray(c)) c=main(c,[0,-1,0],"ouverte");   // une simple position : main ouverte, paume en bas
    return {p:h.p.map((x,j)=>x+(c.p[j]-x)*k),n:v3n(h.n.map((x,j)=>x+(c.n[j]-x)*k)),d:c.d?v3n((h.d||c.d).map((x,j)=>x+(c.d[j]-x)*k)):null,v:h.v.map((x,j)=>x+(c.v[j]-x)*k)}; });
  mainsObj=objetMains(mainsEtat.H,quelles);
}
function objetMains(Hs,quelles=[0,1]){
  const M=MAINS, {e,f,r}=corpsAxes(), q=versFiche(cam.x,cam.z), rad=Math.PI/180;
  const ep=M.epaule||[.19,-.13,-.08], ma=M.manche||{}, ab=M.avant_bras||{}, pa=M.paume||{}, dg=M.doigts||{}, po=M.pouce||{}, li=+M.lisse||.011;
  const pt=pa.taille||[.082,.026,.088], DL=dg.long||[.074,.082,.077,.062], dr=dg.rayon||.0092, pas=dg.pas||.0205, PL=po.long||[.042,.036], pr=po.rayon||.0115;
  const objs=[];
  Hs.forEach((H,i)=>{ if(!quelles.includes(i)) return;
    const o={id:"·main"+i,nom:"",devant:q.devant,cote:q.cote,formes:[]}, R=repereObjet(o), s=i?1:-1;
    const peau=(f0,c,d,t,col,mat)=>o.formes.push(axeForme(R,f0,c,d,t,col||pa.couleur||"#c39577",mat||pa.matiere||"peau",{lisse:li}));
    const Sh=[e[0]+r[0]*s*ep[0]+f[0]*ep[2],e[1]+ep[1],e[2]+r[2]*s*ep[0]+f[2]*ep[2]], n=H.n, P=H.p;
    let d0=H.d||v3s(P,Sh); d0=v3s(d0,v3a([0,0,0],n,v3d(d0,n))); const d=v3n(v3d(d0,d0)>1e-6?d0:f), sl=v3x(n,d), uT=i?sl:v3s([0,0,0],sl);
    const Wr=v3a(P,d,-(pt[2]/2+.004)), ra=ab.rayon||.026, lm=ma.long||.3, rm=ma.rayon||.045, lb=ab.long||.25;
    // le coude : bras et avant-bras de longueurs données, plié vers le dehors et le bas (au-delà de la portée : tendu)
    const sw=v3s(Wr,Sh), dw=Math.hypot(...sw)||1, uw=sw.map(x=>x/dw), xe=Math.min(lm,(lm*lm-lb*lb+dw*dw)/(2*dw)), he=Math.sqrt(Math.max(0,lm*lm-xe*xe));
    let pl=v3a(v3a([0,0,0],r,s),[0,-1,0],.8); pl=v3n(v3s(pl,v3a([0,0,0],uw,v3d(pl,uw))));
    const E=dw>=lm+lb?v3a(Sh,uw,dw*lm/(lm+lb)):v3a(v3a(Sh,uw,xe),pl,he);
    const fa=v3s(Wr,E), La=Math.hypot(...fa), da=v3n(fa), ub=v3s(E,Sh), Lb=Math.hypot(...ub);
    // bras dans sa manche (dure), avant-bras, paume
    o.formes.push(axeForme(R,"capsule",v3a(Sh,ub,.5),ub,[2*rm,Math.max(.01,Lb-2*rm+.03),2*rm],ma.couleur||"#2b2f36",ma.matiere||"tissu"));
    peau("capsule",v3a(E,fa,.5),da,[2*ra,Math.max(.01,La-2*ra),2*ra],ab.couleur,ab.matiere);
    peau("boule",P,n,[pt[0],pt[1],pt[2]]);
    // quatre doigts : de l'index (côté pouce) à l'auriculaire, fléchis à la jointure vers la paume
    const V=H.v;
    // loin de la caméra (main au sol, hors gros plan) : les quatre doigts en une seule forme et le pouce d'une pièce (5 formes
    // au lieu de 9 : moins de formes évaluées à chaque pas, aucune différence à cette taille une fois l'image salie)
    if(Math.hypot(...v3s(P,e))>.55){ const fl=(V[0]+V[1]+V[2]+V[3])/4*rad, dir=v3n(v3a(v3a([0,0,0],d,Math.cos(fl)),n,Math.sin(fl))), Lm=(DL[1]||.08);
      peau("capsule",v3a(v3a(P,d,pt[2]/2-.008),dir,Lm/2),dir,[pas*3.4,Math.max(.006,Lm-pas*1.7),2*dr],dg.couleur,dg.matiere);
      const Bp=v3a(v3a(Wr,d,.03),uT,pt[0]*.36), d1=v3n(v3a(v3a([0,0,0],d,Math.cos(V[5]*rad+.35)),uT,Math.sin(V[5]*rad+.35))), Lp=PL[0]+PL[1]*.8;
      peau("capsule",v3a(Bp,d1,Lp/2),d1,[2*pr,Math.max(.006,Lp-2*pr),2*pr],po.couleur,po.matiere);
      objs.push(o); return; }
    for(let j=0;j<4;j++){ const K=v3a(v3a(v3a(P,d,pt[2]/2-.008),uT,pas*(1.5-j)),n,.002), ea=V[4]*(1.5-j)*rad, c=V[j]*rad;
      const dj=v3n(v3a(v3a([0,0,0],d,Math.cos(ea)),uT,Math.sin(ea))), dir=v3n(v3a(v3a([0,0,0],dj,Math.cos(c)),n,Math.sin(c))), Lj=DL[j]||.07;
      peau("capsule",v3a(K,dir,Lj/2),dir,[2*dr*(j===3?.88:1),Math.max(.006,Lj-2*dr),2*dr*(j===3?.88:1)],dg.couleur,dg.matiere); }
    // pouce : deux phalanges, ouvert (vers le côté) et fléchi (vers la paume)
    const Bp=v3a(v3a(v3a(Wr,d,.03),uT,pt[0]*.36),n,.004), oo=V[5]*rad, fl=V[6]*rad;
    let d1=v3n(v3a(v3a([0,0,0],d,Math.cos(oo+.35)),uT,Math.sin(oo+.35))); d1=v3n(v3a(v3a([0,0,0],d1,Math.cos(fl*.5)),n,Math.sin(fl*.5)));
    const nn=v3n(v3s(n,v3a([0,0,0],d1,v3d(n,d1)))), d2=v3n(v3a(v3a([0,0,0],d1,Math.cos(fl)),v3a(nn,uT,-.35),Math.sin(fl)));
    peau("capsule",v3a(Bp,d1,PL[0]/2),d1,[2*pr,Math.max(.006,PL[0]-2*pr),2*pr],po.couleur,po.matiere);
    const b2=v3a(Bp,d1,PL[0]-pr*.6);
    peau("capsule",v3a(b2,d2,PL[1]/2),d2,[2*pr*.92,Math.max(.006,PL[1]-2*pr),2*pr*.92],po.couleur,po.matiere);
    objs.push(o); });
  return objs;
}
/* Pendant qu'il travaille, la caméra (sur sa poitrine) suit un peu ses mains : elle se penche vers l'ouvrage, bouge avec les gestes. */
function bougerCamera(a,c,t,dg){
  const B=a.base, {e}=corpsAxes(), yv=Math.atan2(c[0]-e[0],c[2]-e[2]), pv=Math.atan2(c[1]-e[1],Math.hypot(c[0]-e[0],c[2]-e[2]));
  const dy=wrapA(yv-B.yaw);
  cam.yaw=B.yaw+.4*dy+.03*Math.sin(t*1.3+.5)+.01*Math.sin(t*4.3);
  cam.pitch=Math.max(-1.1,B.pitch*.65+pv*.35+.035*Math.sin(t*2.1)-.03*Math.abs(Math.sin(t*3.7)));
  cam.haut=B.haut+.015*Math.sin(t*2.9);
  if(dg){ cam.yaw+=dg.yaw; cam.pitch=Math.min(.4,cam.pitch+dg.pitch); }   // §22 : il détourne la tête par à-coups (dégoût)
}
/* §22 : ce que le meneur dit du dégoût d'un façonnage, borné (pensées courtes, intensité 0..1). */
function degoutSur(d){
  if(!d||typeof d!=="object") return null; const T=x=>typeof x==="string"&&x.trim()?x.slice(0,200):null;
  return {intensite:clampN(d.intensite,0,1,.5),palier:d.palier==="fort"?"fort":"leger",contact:T(d.contact),autre:T(d.autre),pendant:(Array.isArray(d.pendant)?d.pendant:[]).map(T).filter(Boolean).slice(0,3),
    nausee:d.nausee&&typeof d.nausee==="object"?d.nausee:null};
}
/* §22 : avant de toucher une chose répugnante, il marque un temps : la caméra recule un peu, le regard fuit vers le haut et de
   côté, puis revient à l'ouvrage. */
function hesiterPas(a,dt){
  if(!a.base) a.base={yaw:cam.yaw,pitch:cam.pitch,haut:cam.haut};
  a.rest-=dt; const u=Math.min(1,1-Math.max(0,a.rest)/a.duree), k=.5+.5*a.force;
  const w=Math.sin(Math.PI*u);                                    // aller et retour
  cam.pitch=a.base.pitch+(.55-a.base.pitch*.3)*w*k+.02*Math.sin(u*23); cam.yaw=a.base.yaw+.22*k*w*Math.sin(u*2.4+.4); cam.haut=a.base.haut+.05*w;
  if(u<.3) moveBy(-.12*dt/(.3*a.duree));                          // il recule un peu
  if(a.rest<=0){ cam.yaw=a.base.yaw; cam.pitch=a.base.pitch; cam.haut=a.base.haut; queue.shift(); }
}
/* §22.2 : la nausée. N (MENEUR.planDegout) : étapes datées (lâcher, se détourner, se pencher, vomir, souffler, s'essuyer la
   bouche, revenir), pensées datées, angle. Il se tourne du côté le plus dégagé, à l'opposé de l'ouvrage, fait un petit pas, se
   penche (la caméra plonge, à-coups), et ce qu'il laisse (gardé par la page, `retenus`) est posé devant lui à ce moment ; un
   événement « nausee » est exposé pour le bruitage. Rend true quand il est revenu face à l'ouvrage. */
function evenementSon(nom,detail){                               // l'accroche des bruitages (le lot des sons s'y branche) ; essais : balSons
  const d=Object.assign({evenement:nom,t:+(performance.now()/1000).toFixed(2)},detail||{}); journalSons.push(d); if(journalSons.length>40) journalSons.shift();
  try{ const s=window.balSon||window.SON; if(s&&typeof s.evenement==="function") s.evenement(nom,d); }catch(_){}
  try{ dispatchEvent(new CustomEvent("balade-son",{detail:d})); }catch(_){}
}
function nauseePas(n,N,dt,idOuvrage,dg){
  n.t+=dt; const B=n.base, et=N.etapes;
  while(n.e+1<et.length&&n.t>=et[n.e+1].t0){ const e=et[++n.e];
    if(e.quoi==="detourner"){ const A=N.angle*Math.PI/180, o=(fiche.objets||[]).find(x=>x&&x.id===idOuvrage), q=o?posObjet(o):null;
      const libre=s=>{ const y=B.yaw+s*A, px=cam.x+Math.sin(y)*.8, pz=cam.z+Math.cos(y)*.8; let m=9; for(const b of obstaclesConnus()) m=Math.min(m,Math.hypot(b.x-px,b.z-pz)-b.r); return m-(semisSous(px,pz,.2,.1)?1:0); };
      n.cote=libre(1)>=libre(-1)?1:-1; if(q){ const a=wrapA(Math.atan2(q.x-cam.x,q.z-cam.z)-B.yaw); if(Math.abs(a)>.25) n.cote=a>0?-1:1; } n.A=A; }
    if(e.quoi==="vomir"){ const fl=retenus.get(idOuvrage); if(fl){ retenus.delete(idOuvrage); objetMeneur(fl); }
      evenementSon("nausee",{intensite:dg?dg.intensite:.8,duree:e.duree,instants:et.map(x=>({quoi:x.quoi,t0:x.t0,duree:x.duree}))}); } }
  while(n.p<N.pensees.length&&n.t>=N.pensees[n.p].t){ const q=N.pensees[n.p++]; say(q.texte); direVoix(q.texte); notePensee(q.texte,"nausee",q.phase); }
  const e=et[Math.max(0,n.e)], u=Math.min(1,Math.max(0,(n.t-e.t0)/e.duree)), sm=u*u*(3-2*u), A=(n.cote||1)*(n.A||1.5);
  const j=(k,f)=>k*Math.sin(n.t*f), pv=-.95;
  if(e.quoi==="lacher"){ cam.pitch=B.pitch+.05*sm+j(.01,17); }
  else if(e.quoi==="detourner"){ cam.yaw=B.yaw+A*sm; cam.pitch=B.pitch+(.1-B.pitch*.5)*sm; if(u>.6&&!n.pas){ n.pas=true; moveBy(.15); } }
  else if(e.quoi==="pencher"){ cam.yaw=B.yaw+A; cam.pitch=B.pitch*.5+.1+(pv-(B.pitch*.5+.1))*sm+j(.03,9); cam.haut=B.haut-.06*sm; }
  else if(e.quoi==="vomir"){ cam.yaw=B.yaw+A+j(.03,7); cam.pitch=pv+.09*Math.abs(Math.sin(n.t*5.5))-.04*Math.sin(n.t*13); cam.haut=B.haut-.06-.02*Math.abs(Math.sin(n.t*5.5)); }
  else if(e.quoi==="souffler"){ cam.yaw=B.yaw+A; cam.pitch=pv+.25*sm+j(.02,2.6); cam.haut=B.haut-.06+.03*sm; }
  else if(e.quoi==="essuyer"){ cam.yaw=B.yaw+A; cam.pitch=pv+.25+j(.015,3);               // le revers de la manche passe devant la caméra
    const {e:o,f,r}=corpsAxes(), rep=mainsRepos(), x=.18-.36*sm, H=[rep[0],main([o[0]+f[0]*.13+r[0]*x,o[1]-.05,o[2]+f[2]*.13+r[2]*x],f,"poing",[-r[0],.3,-r[2]])];
    mainsVers(H,dt,[1]); buildShapes(fiche,true); }
  else if(e.quoi==="revenir"){ if(mainsObj){ mainsObj=null; mainsEtat.H=null; buildShapes(fiche,true); } if(!n.retour){ n.retour=true; if(n.pas) moveBy(-.15); }
    cam.yaw=B.yaw+A*(1-sm); cam.pitch=(pv+.25)+(B.pitch-(pv+.25))*sm; cam.haut=B.haut-.03*(1-sm); }
  if(n.t>=N.duree){ cam.yaw=B.yaw; cam.pitch=B.pitch; cam.haut=B.haut; mainsObj=null; mainsEtat.H=null; buildShapes(fiche,true); return true; }
  return false;
}
/* §22 : après, il s'essuie les mains : elles descendent hors du champ (l'herbe, le pantalon) et frottent, la tête un peu tournée. */
function essuyerPas(a,dt){
  if(!a.base) a.base={yaw:cam.yaw,pitch:cam.pitch};
  a.rest-=dt; const u=Math.min(1,1-Math.max(0,a.rest)/a.duree), {e,f,r}=corpsAxes(), w=Math.sin(Math.PI*u);
  const H=[-1,1].map(s=>{ const fr=.06*Math.sin(u*a.duree*11+(s>0?0:Math.PI)); return main([e[0]+r[0]*s*.2+f[0]*(.22+fr),e[1]-.62-.08*w,e[2]+r[2]*s*.2+f[2]*(.22+fr)],[-r[0]*s,-.3,-r[2]*s],"plat",f); });
  mainsVers(H,dt); buildShapes(fiche,true);
  cam.pitch=a.base.pitch-.25*w; cam.yaw=a.base.yaw+.18*a.force*w;
  if(a.rest<=0){ cam.yaw=a.base.yaw; cam.pitch=a.base.pitch; mainsObj=null; mainsEtat.H=null; buildShapes(fiche,true); queue.shift(); }
}
/* Aller chercher : accroupi, la main droite va au sol, ramasse, revient (§17). */
function ramasserPas(a,dt){
  a.rest-=dt; const u=1-Math.max(0,a.rest)/a.duree, {e,f,r}=corpsAxes(), rep=mainsRepos();
  if(!a.sol){ const x=e[0]+f[0]*.45+r[0]*.06, z=e[2]+f[2]*.45+r[2]*.06; a.sol=[x,terrainH(x,z)+.035,z]; }
  const k=u<.45?(u/.45)**2*(3-2*u/.45):u<.62?1:1-((u-.62)/.38)**2*(3-2*(u-.62)/.38);
  const so=v3a(a.sol,[0,1,0],EP()+.01), H=[rep[0],main(rep[1].p.map((v,i)=>v+(so[i]-v)*k+(i===1&&u>.45&&u<.62?.01*Math.sin(u*80):0)),[0,-1,0],u>.5&&u<.75?"poing":"ouverte",f)];
  mainsVers(H,dt,[1]); buildShapes(fiche,true);
  if(a.rest<=0){ queue.shift(); mainsObj=null; mainsEtat.H=null; buildShapes(fiche,true); }
}
function viserObjet(id,cadre){                                 // cap (relatif au corps) et inclinaison vers un objet de la fiche ou un support
  const q=cibleMonde(id); if(!q) return null;
  const dx=q.x-cam.x, dz=q.z-cam.z, m=Math.max(.3,Math.hypot(dx,dz));
  const haut=cadre?Math.max(.01,q.haut/2):Math.max(.05,q.milieu);   // vers le milieu de l'objet (cadrer : le milieu de sa hauteur, comme MENEUR.planCadrage)
  let yaw=Math.atan2(dx,dz)-cam.yaw; yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
  const dy=terrainH(q.x,q.z)+haut-(terrainH(cam.x,cam.z)+S.eye*cam.haut+cam.elev);
  return {yaw,pitch:Math.max(-1.05,Math.min(1.3,Math.atan2(dy,m))),raide:Math.atan2(dy,m)<-1.05};
}
/* Taille d'un objet de la fiche : envergure (m) et hauteur du dessus, échelle comprise. */
function mesureObjet(o){ const k=clampN(o.echelle,.1,5,1), F=(o.formes||[]).filter(f=>f&&Array.isArray(f.p)&&Array.isArray(f.taille));
  return { taille:MENEUR.envergure(F)*k, haut:Math.max(0,...F.map(f=>f.p[1]+f.taille[1]/2))*k, milieu:Math.max(0,...F.map(f=>f.p[1]))*k*.6+.02 }; }
/* Ce qu'une action peut viser, rejoindre ou escalader : un objet de la fiche (id), ou un élément du monde proche (« arbre », « rocher »). */
function cibleMonde(id){
  const o=(Array.isArray(fiche.objets)?fiche.objets:[]).find(x=>x&&x.id===id);
  if(o){ const q=posObjet(o), me=mesureObjet(o); return {id, x:q.x, z:q.z, taille:me.taille, haut:me.haut, milieu:me.milieu, rayon:me.taille/2, sorte:"objet"}; }
  const s=supportsProches().find(x=>x.id===id);
  return s?Object.assign({milieu:Math.min(s.haut*.5,1.6),taille:s.rayon*2},s):null;
}
/* Les éléments du monde où l'on peut monter, les plus proches : un arbre (tronc), un rocher. Les paramètres viennent des
   fonctions de cellule de monde.glsl (arbreA, blocGres), recopiées ici en flottants 32 bits : MÊMES FORMULES, à modifier
   des deux côtés (comme terrainH et pathX). La sonde (balade.sonde) sert à vérifier qu'il y a bien un tronc à l'endroit dit. */
const F32=LUMIERE.F32, fr32=LUMIERE.fr32, h42=LUMIERE.h42, h21=LUMIERE.h21, vnoise2=LUMIERE.vnoise2;   // src/lumiere.js : au bit près comme le shader
function degage(wx,wz){ for(const o of (Array.isArray(fiche.objets)?fiche.objets:[])){ if(!o||o.visible===false||cacheObj.has(o.id)||!(o.degage>0)) continue;
  const q=posObjet(o); if(Math.hypot(wx-q.x,wz-q.z)<clampN(o.degage,0,12,0)) return true; } return false; }
let supportsCache={t:-1,x:0,z:0,L:[]};
function supportsProches(){
  if(supportsCache.t===S.objN*1e6+seedN&&Math.hypot(cam.x-supportsCache.x,cam.z-supportsCache.z)<.3) return supportsCache.L;
  const rel=a=>((a*180/Math.PI)%360+540)%360-180, L=[], sx=F32(seed[0]), sy=F32(seed[1]);
  const ajoute=(id,x,z,haut,rayon)=>{ const m=Math.hypot(x-cam.x,z-cam.z); if(m<25) L.push({id,nom:id==="arbre"?"un arbre":"un rocher",x,z,m:+m.toFixed(1),angle:Math.round(rel(Math.atan2(x-cam.x,z-cam.z)-cam.yaw)),haut:+haut.toFixed(2),rayon:+rayon.toFixed(2),sorte:id}); };
  if(S.kit===0&&S.kitP[0]>0){                                     // arbreA : grille tournée de 6 m
    const CA=6, qx=.8776*cam.x-.4794*cam.z, qz=.4794*cam.x+.8776*cam.z, i0=Math.floor(qx/CA), j0=Math.floor(qz/CA);
    let best=null;
    for(let i=i0-4;i<=i0+4;i++) for(let j=j0-4;j<=j0+4;j++){
      const h=h42(i+sx,j+sy); if(h[0]>S.kitP[0]) continue;
      const ox=(h[1]-.5)*3.8, oz=(h[2]-.5)*3.8, vx=(i+.5)*CA+ox, vz=(j+.5)*CA+oz;
      const wx=.8776*vx+.4794*vz, wz=-.4794*vx+.8776*vz;           // v*RA
      if(Math.abs(wx-pathX(wz))<1.5||libreJS(wx,wz)) continue;
      const m=Math.hypot(wx-cam.x,wz-cam.z); if(!best||m<best.m) best={m,x:wx,z:wz,H:11+6*h[3],r0:.16+.17*fr32(h[3]*7.31)};
    }
    if(best) ajoute("arbre",best.x,best.z,best.H,best.r0);
  }
  if(S.kit!==2&&S.kitP[1]>0){                                     // blocGres : grille de 8,5 m
    const CC=8.5, i0=Math.floor(cam.x/CC), j0=Math.floor(cam.z/CC); let best=null;
    for(let i=i0-3;i<=i0+3;i++) for(let j=j0-3;j<=j0+3;j++){
      const h=h42(i+sx+13,j+sy+13), mask=vnoise2(i*.37+sx,j*.37+sy);
      if(h[0]>(sstep(.32,.68,mask)*.9+.08)*S.kitP[1]) continue;
      const R=.7+1.6*h[3]*h[3], ox=(h[1]-.5)*2*(.5*CC-.3-1.25*R), oz=(h[2]-.5)*2*(.5*CC-.3-1.25*R), wx=(i+.5)*CC+ox, wz=(j+.5)*CC+oz;
      if(Math.abs(wx-pathX(wz))<R*1.1+.5||libreJS(wx,wz)) continue;
      const m=Math.hypot(wx-cam.x,wz-cam.z); if(!best||m<best.m) best={m,x:wx,z:wz,top:R*.22+R*(.62+.3*fr32(h[2]*7)),r:R*Math.max(1+.25*fr32(h[1]*9),.8+.3*fr32(h[3]*11))};
    }
    if(best) ajoute("rocher",best.x,best.z,best.top,best.r);
  }
  supportsCache={t:S.objN*1e6+seedN,x:cam.x,z:cam.z,L};
  return L;
}
/* Le corps autour d'une chose : y aller (rejoindre), la filmer à la bonne distance (cadrer), monter dessus (monter).
   Distances : MENEUR.distanceArret, MENEUR.planCadrage, MENEUR.hauteurPerchee (les mêmes que dans les tests). */
/* Aller vers (x, z) et s'arrêter à « arret » m, sans rien traverser (§16) : MENEUR.planTrajet sur les obstacles connus, un
   tourner et un marcher par point de passage ; s'il ne peut pas passer, il s'arrête devant et le dit (action bloque).
   cible : l'obstacle qu'on rejoint (on s'arrête à sa surface plus la marge, on ne le contourne pas). */
const wrapA=d=>Math.atan2(Math.sin(d),Math.cos(d));
function versPoint(x,z,arret,cible){
  const obs=obstaclesConnus(), c=cible||(obs.find(o=>Math.hypot(o.x-x,o.z-z)<.05)||{}).id||null;
  const p=MENEUR.planTrajetSouple({x:cam.x,z:cam.z},{x,z},obs,{arret,cible:c}), out=[];   // ce qui est bas s'enjambe (§18)
  let px=cam.x, pz=cam.z, yaw=cam.yaw;
  p.points.forEach((q,k)=>{ const L=Math.hypot(q.x-px,q.z-pz); if(L<.05) return;
    let d=wrapA(Math.atan2(q.x-px,q.z-pz)-yaw);
    if(k===p.points.length-1&&Math.hypot(x-px,z-pz)<arret&&Math.abs(d)>Math.PI/2){ d=wrapA(d+Math.PI); out.push({type:"tourner",rest:d},{type:"marcher",rest:-L}); }   // trop près : il recule, face à elle
    else out.push({type:"tourner",rest:d},{type:"marcher",rest:L});
    yaw+=d; px=q.x; pz=q.z; });
  if(out.length&&cam.haut<.95) out.unshift({type:"posture",h:1});
  if(p.bloque){ const o=obs.find(o=>o.id===p.bloque); out.push({type:"bloque",texte:o&&o.nom?`Je peux pas passer : ${o.nom}, juste là.`:"Je passe pas, là. C'est bouché."}); }
  out.push({type:"tourner",rest:wrapA(Math.atan2(x-px,z-pz)-yaw)});
  return out;
}
/* « Avance de N mètres », « recule » (§18) : il se relève, dézoome, puis marche N m dans cette direction générale, en
   contournant ce qui est haut et en enjambant ce qui est bas (MENEUR.planMarche, sur les obstacles connus). En arrière, il
   garde son cap et recule. Ce qu'il n'a pas pu faire, il le dit à la fin (finMarche) ; « c'est bouché » seulement s'il ne
   peut pas faire un mètre dans aucune direction voisine (±60°). Ce que seule la sonde connaît : essais à côté (simulate). */
function planMarchePage(metres){
  const obs=obstaclesConnus(), p=MENEUR.planMarche({x:cam.x,z:cam.z,yaw:cam.yaw},metres,obs), recul=metres<0, cap0=cam.yaw;
  const ordre={x:cam.x,z:cam.z,demande:p.demande,plan:p,nom:p.bloque?((obs.find(o=>o.id===p.bloque)||{}).nom||null):null};
  const out=[]; if(cam.haut<.95) out.push({type:"posture",h:1}); out.push({type:"zoom",z:1});
  let px=cam.x, pz=cam.z, yaw=cam.yaw;
  for(const q of p.points){ const L=Math.hypot(q.x-px,q.z-pz); if(L<.03) continue;
    const d=wrapA(Math.atan2(q.x-px,q.z-pz)+(recul?Math.PI:0)-yaw);
    out.push({type:"tourner",rest:d,ordre},{type:"marcher",rest:recul?-L:L,ordre}); yaw+=d; px=q.x; pz=q.z; }
  const fin=wrapA(cap0-yaw); if(Math.abs(fin)>.02&&p.points.length) out.push({type:"tourner",rest:fin,ordre});   // il reprend le cap demandé
  out.push({type:"finMarche",ordre});
  console.log("marche : "+p.demande.toFixed(1)+" m demandés, "+p.fait.toFixed(1)+" m possibles"+(p.angle?", à "+p.angle+"°":"")+(p.bloque?", arrêté par "+p.bloque:"")+(p.enjambe?", enjambe":"")+(p.bouche?", bouché":""));
  return out;
}
/* « Déplace-toi » sans distance ni cible (§19) : une direction dégagée, le long du sentier d'abord (devant, puis derrière), pas
   vers une chose toute proche, arrivée loin des choses déjà là (MENEUR.planDeplacement) ; il se tourne, puis c'est une marche. */
function planDeplacerPage(a){
  const caps=S.kit!==1?[pathYaw(cam.z)+(Math.cos(cam.yaw-pathYaw(cam.z))<0?Math.PI:0)]:[]; if(caps.length) caps.push(caps[0]+Math.PI);
  const d=MENEUR.planDeplacement({x:cam.x,z:cam.z,yaw:cam.yaw},a.metres,obstaclesConnus(),{caps,rayon:a.rayon});
  console.log("déplacement : "+a.metres.toFixed(1)+" m à "+Math.round(d.cap*180/Math.PI)+"°"+(d.libre?"":", pas de place loin des choses"));
  return [{type:"tourner",rest:wrapA(d.cap-cam.yaw)},{type:"marche",metres:a.metres}];
}
function finMarche(a){                                           // à la fin d'une marche demandée : ce qu'il a fait, ce qui l'arrête
  const o=a.ordre; if(!o||o.dit) return; o.dit=true;
  const fait=Math.hypot(cam.x-o.x,cam.z-o.z), bouche=fait<1&&(o.plan.bouche||a.arrete);
  const t=MENEUR.texteMarche({demande:o.demande,fait,bouche},o.nom);
  journalMarche.push({demande:o.demande,fait:+fait.toFixed(2),texte:t||null}); if(journalMarche.length>20) journalMarche.shift();
  if(t) say(t,true);
}
const journalMarche=[];
/* Les obstacles connus autour du porteur (30 m), en cercles {x, z, r, id, nom} : les troncs (arbreA), les perches (percheB) et
   les blocs (blocGres) recopiés de monde.glsl (MÊMES FORMULES, à modifier des deux côtés), et les choses de la fiche. Les
   éléments de semis (murs, tombes…) ne sont connus que de la sonde du moteur (moveBy). */
let obsCache={k:"",x:1e9,z:1e9,L:[]};
function obstaclesConnus(){
  const k=seedN+"|"+S.objVer+"|"+S.kit+"|"+S.kitP.join(",");
  if(obsCache.k===k&&Math.hypot(cam.x-obsCache.x,cam.z-obsCache.z)<4) return obsCache.L;
  const L=[], sx=F32(seed[0]), sy=F32(seed[1]), loin=(x,z)=>Math.hypot(x-cam.x,z-cam.z)>34;
  if(S.kit===0&&S.kitP[0]>0){                                     // arbreA : grille tournée de 6 m
    const CA=6, qx=.8776*cam.x-.4794*cam.z, qz=.4794*cam.x+.8776*cam.z, i0=Math.floor(qx/CA), j0=Math.floor(qz/CA);
    for(let i=i0-6;i<=i0+6;i++) for(let j=j0-6;j<=j0+6;j++){
      const h=h42(i+sx,j+sy); if(h[0]>S.kitP[0]) continue;
      const vx=(i+.5)*CA+(h[1]-.5)*3.8, vz=(j+.5)*CA+(h[2]-.5)*3.8, wx=.8776*vx+.4794*vz, wz=-.4794*vx+.8776*vz;
      if(Math.abs(wx-pathX(wz))<1.5||libreJS(wx,wz)||loin(wx,wz)) continue;
      L.push({id:"arbre:"+i+","+j,nom:"un tronc",x:wx,z:wz,r:(.16+.17*fr32(h[3]*7.31))*1.3}); }
    if(S.houp[3]>0){                                              // percheB : grille tournée de 3,3 m
      const CB=3.3, qx=.6216*cam.x+.7833*cam.z+17.3, qz=-.7833*cam.x+.6216*cam.z+17.3, i0=Math.floor(qx/CB), j0=Math.floor(qz/CB);
      for(let i=i0-10;i<=i0+10;i++) for(let j=j0-10;j<=j0+10;j++){
        const h=h42(i+sx+71,j+sy+71); if(h[0]>S.kitP[0]*.8*S.houp[3]) continue;
        const vx=(i+.5)*CB+(h[1]-.5)*1.9-17.3, vz=(j+.5)*CB+(h[2]-.5)*1.9-17.3, wx=.6216*vx-.7833*vz, wz=.7833*vx+.6216*vz;
        if(Math.abs(wx-pathX(wz))<1.15||libreJS(wx,wz)||loin(wx,wz)) continue;
        L.push({id:"perche:"+i+","+j,nom:"un tronc",x:wx,z:wz,r:(.035+.07*fr32(h[3]*5.3))*1.3+.06}); } }
  }
  if(S.kit!==2&&S.kitP[1]>0){                                     // blocGres : grille de 8,5 m
    const CC=8.5, i0=Math.floor(cam.x/CC), j0=Math.floor(cam.z/CC);
    for(let i=i0-4;i<=i0+4;i++) for(let j=j0-4;j<=j0+4;j++){
      const h=h42(i+sx+13,j+sy+13), mask=vnoise2(i*.37+sx,j*.37+sy);
      if(h[0]>(sstep(.32,.68,mask)*.9+.08)*S.kitP[1]) continue;
      const R=.7+1.6*h[3]*h[3], ox=(h[1]-.5)*2*(.5*CC-.3-1.25*R), oz=(h[2]-.5)*2*(.5*CC-.3-1.25*R), wx=(i+.5)*CC+ox, wz=(j+.5)*CC+oz;
      if(Math.abs(wx-pathX(wz))<R*1.1+.5||libreJS(wx,wz)||loin(wx,wz)) continue;
      L.push({id:"rocher:"+i+","+j,nom:"un rocher",x:wx,z:wz,r:R*Math.max(1+.25*fr32(h[1]*9),.8+.3*fr32(h[3]*11))+.1*R,haut:R*.22+R*(.62+.3*fr32(h[2]*7))}); }
  }
  for(const o of (Array.isArray(fiche.objets)?fiche.objets:[])){ if(!o||o.visible===false||cacheObj.has(o.id)) continue;
    const q=posObjet(o), k2=clampN(o.echelle,.1,5,1), F=(o.formes||[]).filter(f=>f&&Array.isArray(f.p)&&Array.isArray(f.taille));
    if(!F.length||loin(q.x,q.z)) continue;
    L.push({id:o.id,nom:o.nom||o.id,x:q.x,z:q.z,r:Math.max(.02,...F.map(f=>Math.hypot(f.p[0],f.p[2])+Math.max(f.taille[0],f.taille[2])/2))*k2,haut:mesureObjet(o).haut,chose:true}); }
  obsCache={k,x:cam.x,z:cam.z,L};
  return L;
}
/* Les éléments de semis (cailloux, branches mortes, tombes, murs…) recopiés de semisGrille, semisElem, semisLocal et sdSemis
   (monde.glsl) en flottants 32 bits, lus dans la même texture de formes (shapesData) : MÊMES FORMULES, à modifier des deux
   côtés. Sert à ne jamais poser une chose dans ou derrière un élément du décor, et à cadrer une chose sans rien entre elle et la
   caméra. Un élément reste dans sa cellule : seule la cellule sous le point compte. Rend une distance (m) au plus proche
   élément, positive dehors ; 9 sans semis. Vérifiable avec la sonde du moteur (option v3sonde, balade.semis et balade.sonde). */
const tx4=(row,col)=>{ const o=(row*4+col)*4; return [shapesData[o],shapesData[o+1],shapesData[o+2],shapesData[o+3]]; };
function sdPrimJS(q,ty,s){
  const L=v=>Math.hypot(v[0],v[1],v[2]);
  if(ty<.5){ const d=[Math.abs(q[0])-s[0],Math.abs(q[1])-s[1],Math.abs(q[2])-s[2]]; return Math.min(Math.max(...d),0)+L(d.map(v=>Math.max(v,0))); }
  if(ty<1.5) return (L([q[0]/s[0],q[1]/s[1],q[2]/s[2]])-1)*Math.min(...s);
  if(ty<2.5){ const dx=Math.hypot(q[0],q[2])-s[0], dy=Math.abs(q[1])-s[1]; return Math.min(Math.max(dx,dy),0)+Math.hypot(Math.max(dx,0),Math.max(dy,0)); }
  if(ty<3.5){ const r=s[0]*Math.min(1,Math.max(0,.5-q[1]/(2*s[1]))); return Math.max(Math.hypot(q[0],q[2])-r,Math.abs(q[1])-s[1])*.7; }
  if(ty<4.5){ const y=q[1]-Math.min(s[1],Math.max(-s[1],q[1])); return Math.hypot(q[0],y,q[2])-s[0]; }
  return Math.max(Math.abs(q[0])-s[0],Math.abs(q[1])-s[1],Math.abs(q[2])-s[2]);   // toit : sa boîte
}
function semisDist(x,y,z){
  let best=9; const sx=F32(seed[0]), sy=F32(seed[1]);
  for(let k=0;k<S.semN;k++){
    const r0=SEM0+k*SEM_L, A=tx4(r0,0), B=tx4(r0,1), T=tx4(r0,2), K=tx4(r0+1,1), rg=B[3]>.5;
    let side=1;
    if(rg){ const u=x-pathX(z); side=u<0?-1:1; if(T[2]*side<-.5) continue; const gx=Math.abs(u)-T[0]; if(gx<0||gx-K[3]*A[0]>0) continue; }
    const G=(px,pz)=>rg?[side*(px-pathX(pz))-T[0],pz]:[A[2]*px-A[3]*pz,A[3]*px+A[2]*pz];
    const W=g=>rg?[pathX(g[1])+side*(g[0]+T[0]),g[1]]:[g[0]*A[2]+g[1]*A[3],-g[0]*A[3]+g[1]*A[2]];
    const g=G(x,z), id=[Math.floor(g[0]/A[0]),Math.floor(g[1]/A[1])];
    const h=h42(F32(F32(id[0]+sx)+F32(13.7*(k+1))+(side<0?41.3:0)),F32(F32(id[1]+sy)+F32(71.3*(k+1))+(side<0?7.9:0)));
    let dens=B[0]; if(B[1]>0) dens*=1+(sstep(.3,.7,vnoise2(id[0]*B[2]+sx+k*17,id[1]*B[2]+sy+k*17))-1)*B[1];
    if(h[0]>=dens) continue;
    const J=tx4(r0+1,0), D=tx4(r0,3), E=tx4(r0+1,3);
    const gc=[(id[0]+.5)*A[0]+(h[1]-.5)*2*J[0],(id[1]+.5)*A[1]+(h[2]-.5)*2*J[1]], w=W(gc);
    let dx=0;
    if(!rg){ dx=w[0]-pathX(w[1]); if(Math.abs(dx)<T[0]||Math.abs(dx)>T[1]||dx*T[2]<0) continue; }
    if(libreJS(w[0],w[1])) continue;
    const h2=h42(F32(id[0]*1.37+h[1]*91+k*3.1+side),F32(id[1]*1.37+h[2]*91+k*3.1+side));
    let yaw=D[0];
    if(T[3]<.5) yaw=h2[2]*6.2832;
    else if(T[3]<1.5){ if(rg) yaw=-1.5708; else { const sg=dx<0?-1:1, zz=w[1], sl=S.traj[0]*(.1504*Math.cos(zz*.047+seed[2])+.1808*Math.cos(zz*.113+1.7+seed[2]*2)); yaw=Math.atan2(-sg,sg*sl)-Math.atan2(A[3],A[2]); } }
    yaw+=(h2[3]-.5)*D[1];
    const th0=terrainH(w[0],w[1]); let sl=[0,0];
    if(E[3]>.5){ const w1=W([gc[0]+1,gc[1]]), w2=W([gc[0],gc[1]+1]); sl=[terrainH(w1[0],w1[1])-th0,terrainH(w2[0],w2[1])-th0]; }
    const s=J[2]+(J[3]-J[2])*h2[0], syy=K[0]+(K[1]-K[0])*h2[1], sh=1/Math.sqrt(1+sl[0]*sl[0]+sl[1]*sl[1]);
    // semisLocal
    const gp=G(x,z); let lp=[gp[0]-gc[0],y-th0,gp[1]-gc[1]];
    lp[1]-=sl[0]*lp[0]+sl[1]*lp[2];
    { const c=Math.cos(yaw), sn=Math.sin(yaw); lp=[c*lp[0]-sn*lp[2],lp[1],sn*lp[0]+c*lp[2]]; }
    if(rg&&side<0) lp[0]=-lp[0];
    if(D[2]>0){ const pa=[(fr32(h2[2]*17.31)-.5)*2*D[2],(fr32(h2[3]*17.31)-.5)*2*D[2]], c1=Math.cos(pa[0]), s1=Math.sin(pa[0]), c2=Math.cos(pa[1]), s2=Math.sin(pa[1]);
      lp=[c1*lp[0]+s1*lp[1],-s1*lp[0]+c1*lp[1],lp[2]]; lp=[lp[0],-s2*lp[2]+c2*lp[1],c2*lp[2]+s2*lp[1]]; }
    lp=[lp[0]/s,lp[1]/s/syy,lp[2]/s];
    let od=1e5;
    for(let j=0;j<K[2];j++){ const row=r0+4+j, a=tx4(row,0), b=tx4(row,1), ee=tx4(row,3);
      let q=[lp[0]-a[0],lp[1]-a[1],lp[2]-a[2]], c=Math.cos(b[3]), sn=Math.sin(b[3]);
      q=[c*q[0]-sn*q[2],q[1],sn*q[0]+c*q[2]];
      if(ee[3]!==0){ c=Math.cos(ee[3]); sn=Math.sin(ee[3]); q=[c*q[0]+sn*q[1],-sn*q[0]+c*q[1],q[2]]; }
      if(ee[2]!==0){ c=Math.cos(ee[2]); sn=Math.sin(ee[2]); q=[q[0],c*q[1]+sn*q[2],-sn*q[1]+c*q[2]]; }
      od=Math.min(od,sdPrimJS(q,a[3]%8,[b[0],b[1],b[2]])-ee[1]); }
    best=Math.min(best,od*s*Math.min(1,syy)*sh);
  }
  return best;
}
/* Une chose ronde (centre x, z, rayon r, hauteur haut) posée là touche-t-elle un élément de semis (marge m) ? */
function semisSous(x,z,r,haut,m=.03){
  const y0=terrainH(x,z), H=Math.max(.02,haut||r);
  for(const f of [0,.5,1]) for(let i=0;i<(f?8:1);i++){ const a=i*Math.PI/4, px=x+Math.sin(a)*r*f, pz=z+Math.cos(a)*r*f;
    for(const yy of [.01,H*.5,H]) if(semisDist(px,terrainH(px,pz)+yy,pz)<m) return true; }
  return y0!==y0;
}
/* La vue de l'œil (ex, ey, ez) vers une chose (centre x, z, rayon r, hauteur haut) est-elle dégagée ? Rien entre les deux : ni
   élément de semis, ni tronc, ni rocher, ni autre chose (les obstacles connus, sauf la chose elle-même, id). Quatre visées :
   le milieu, le dessus, les deux bords. */
function vueDegagee(ex,ey,ez,x,z,r,haut,id){
  const y0=terrainH(x,z), H=Math.max(.02,haut||r), dx=x-ex, dz=z-ez, l=Math.hypot(dx,dz)||1, px=-dz/l, pz=dx/l;
  const cibles=[[x,y0+H*.5,z],[x,y0+H*.95,z],[x+px*r*.8,y0+H*.4,z+pz*r*.8],[x-px*r*.8,y0+H*.4,z-pz*r*.8]];
  const obs=obstaclesConnus().filter(o=>o.id!==id);
  for(const c of cibles){
    const L=Math.hypot(c[0]-ex,c[1]-ey,c[2]-ez), n=Math.max(4,Math.ceil(L/.04));
    for(let i=1;i<n;i++){ const t=i/n, qx=ex+(c[0]-ex)*t, qy=ey+(c[1]-ey)*t, qz=ez+(c[2]-ez)*t;
      if(Math.hypot(qx-x,qz-z)<r+.02) break;                      // arrivé à la chose
      if(semisDist(qx,qy,qz)<.005) return false;
      if(obs.some(o=>Math.hypot(qx-o.x,qz-o.z)<o.r*.8&&qy<terrainH(o.x,o.z)+(o.haut||9))) return false; } }
  return true;
}
function planCorps(a){
  const pre=cam.elev>.01&&a.type!=="monter"?[{type:"descendre"}]:[];
  if(a.type==="monter"){
    const L=supportsProches(), q=a.sur?cibleMonde(a.sur):L.slice().sort((p,r)=>p.m-r.m)[0];
    if(!q){ console.warn("monter : aucun support",a.sur); return []; }
    if(cam.perche===q.id&&cam.elev>.01) return [];                   // déjà dessus
    return [...(cam.elev>.01?[{type:"descendre"}]:[]),...versPoint(q.x,q.z,q.rayon+.45,q.sorte==="objet"?q.id:null),{type:"elever",q,h:MENEUR.hauteurPerchee(q.sorte,q.haut)},
      ...(q.sorte==="arbre"?[{type:"tourner",rest:2.2}]:[]),{type:"regarder",pitch:-.3}];   // là-haut, il se détourne du tronc et regarde en bas
  }
  if(a.type==="chercher"){                                          // aller chercher : un endroit plausible, il y va, se baisse, ramasse, se relève
    const L=supportsProches(), lieu=MENEUR.lieuChercher(a.quoi,{x:cam.x,z:cam.z,yaw:cam.yaw},L,z=>S.kit!==1?pathX(z):cam.x,S.traj[1]||1,MODELES);
    dernierLieu=lieu;
    return [...pre,...versPoint(lieu.x,lieu.z,0),{type:"posture",h:.42},{type:"regarder",pitch:-.8},{type:"ramasser",rest:1.6,duree:1.6},{type:"tourner",rest:.45},{type:"ramasser",rest:1.5,duree:1.5},
      {type:"posture",h:1},{type:"regarder",pitch:-.1}];
  }
  const q=cibleMonde(a.objet); if(!q) return [];
  if(a.type==="rejoindre") return [...pre,...versPoint(q.x,q.z,MENEUR.distanceArret(q.taille),q.sorte==="objet"?q.id:null)];
  const pl=MENEUR.planCadrage(q.taille,S.eye,q.haut), m=Math.hypot(q.x-cam.x,q.z-cam.z);
  if(m>12) return [{type:"viser",objet:a.objet}];                    // trop loin pour y aller : il la montre d'où il est
  if(a.sur_place) return [...pre,{type:"posture",h:pl.hauteur},{type:"viser",objet:a.objet,cadre:true},{type:"zoom",z:MENEUR.zoomPour(q.taille,m,S.eye*pl.hauteur)}];   // d'où il est
  const P=q.sorte==="objet"?pointDeVue(q,pl):null;
  if(P&&P.da) return [...pre,...versPoint(P.x,P.z,0,null),{type:"posture",h:pl.hauteur},{type:"viser",objet:a.objet,cadre:true},{type:"zoom",z:pl.zoom}];   // la vue directe est bouchée : il se décale
  return [...pre,...versPoint(q.x,q.z,pl.m,q.sorte==="objet"?q.id:null),{type:"posture",h:pl.hauteur},{type:"viser",objet:a.objet,cadre:true},{type:"zoom",z:pl.zoom}];
}
/* D'où cadrer une chose (planCadrage : distance, hauteur des yeux) sans RIEN entre elle et la caméra : un élément de semis
   (un éclat de pierre, une branche morte), un tronc, un rocher, une autre chose (cas réel : un éclat de grès entre la caméra accroupie et la
   crotte, grossi par le zoom, remplissait l'image). D'abord du côté où il est, puis en tournant autour d'elle ; null si rien
   n'est dégagé (il cadre d'où il peut). da : de combien il s'est décalé autour d'elle (radians). */
function pointDeVue(q,pl){
  const a0=Math.atan2(cam.x-q.x,cam.z-q.z), obs=obstaclesConnus().filter(o=>o.id!==q.id), r=q.taille/2;
  for(const k of [0,1,-1,2,-2,3,-3,4,-4,5,-5,6,-6,7,-7,8]){ const da=k*.38, a=a0+da;
    for(const m of [pl.m,pl.m*1.25]){ const x=q.x+Math.sin(a)*m, z=q.z+Math.cos(a)*m, y=terrainH(x,z)+S.eye*pl.hauteur;
      if(obs.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+MENEUR.REGLAGES.MARGE_CORPS)||semisSous(x,z,.2,S.eye*pl.hauteur)) continue;
      if(vueDegagee(x,y,z,q.x,q.z,r,q.haut,q.id)){ if(k) console.log("cadrage : vue bouchée, il se décale de "+Math.round(da*57.3)+"°"); return {x,z,da:k||m!==pl.m?da||1e-3:0}; } } }
  return null;
}
function elever(a,dt){                                           // monter (sur q, à la hauteur h) ou descendre (vers le pied)
  if(a.type==="elever"&&!a.de){ const q=a.q; cam.pied={x:cam.x,z:cam.z};
    let tx=q.x, tz=q.z;
    if(q.sorte==="arbre"){ const dx=cam.x-q.x, dz=cam.z-q.z, l=Math.hypot(dx,dz)||1, e=q.rayon*1.3+MENEUR.REGLAGES.MARGE_CORPS; tx=q.x+dx/l*e; tz=q.z+dz/l*e; }   // contre le tronc, à la marge
    a.de={x:cam.x,z:cam.z,e:cam.elev}; a.vers={x:tx,z:tz,e:a.h}; a.k=0; cam.perche=q.id; }
  if(a.type==="descendre"&&!a.de){ if(cam.elev<=.01&&!cam.pied){ cam.elev=0; queue.shift(); return; }
    a.de={x:cam.x,z:cam.z,e:cam.elev}; a.vers=cam.pied||{x:cam.x,z:cam.z}; a.vers=Object.assign({},a.vers,{e:0}); a.k=0; }
  const dur=Math.max(1,Math.abs(a.vers.e-a.de.e)/(a.type==="elever"?.6:1.2));   // grimper prend du temps, descendre moins
  a.k=Math.min(1,a.k+dt/dur); const k=a.k*a.k*(3-2*a.k);
  cam.x=a.de.x+(a.vers.x-a.de.x)*k; cam.z=a.de.z+(a.vers.z-a.de.z)*k; cam.elev=a.de.e+(a.vers.e-a.de.e)*k; walkDist+=dt*.5; walking=a.k<1;
  if(a.k>=1){ queue.shift(); if(a.type==="descendre"){ cam.elev=0; cam.pied=null; cam.perche=null; } }
}
/* Une forme « vacille » : son éclat tremble. On ne touche qu'aux couleurs dans la texture d'objets, sans relancer
   l'accumulation (sceneDirty) : l'image reste nette, la reprojection lisse le tremblement. Le vrai effet (lumière portée qui
   danse) demande une lumière ponctuelle dans le moteur : voir docs/meneur-de-jeu.md §13. */
setInterval(()=>{ if(!S.vac||!S.vac.length||document.hidden) return; const t=performance.now()/1000;
  for(const [r,c0,c1,c2,a,ph] of S.vac){ const k=Math.max(.2,1+a*(.32*Math.sin(t*8.3+ph)+.22*Math.sin(t*21.7+ph*2.3)+.3*(Math.random()-.5)));
    shapesData[r+8]=c0*k; shapesData[r+9]=c1*Math.pow(k,1.3); shapesData[r+10]=c2*Math.pow(k,1.6); }
  gl.bindTexture(gl.TEXTURE_2D,shapesT); gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,4,SH_ROWS,gl.RGBA,gl.FLOAT,shapesData); },100);
function ticMeneur(){
  if(!meneur) return;
  const now=performance.now(), dt=Math.min(5,(now-meneurT)/1000); meneurT=now;
  meneur.tic(dt,percevoirMeneur(),{gel:frozen});
  if(dbgOn) dbgMaj();
  if(meneur.fini()) clearInterval(meneurTimer);
}
function meneurEntendre(texte){ say("…"); activite.entendre(texte);
  if(meneurLibre){                                             // promenade libre : une fois qu'on lui a parlé, il ne repart plus tout seul
    const t=texte.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    errance=/promene|balade-toi|balade toi|continue ta|reprends ta|comme tu veux|ou tu veux|fais ta vie/.test(t);
  }                                                             // « stop » : c'est le meneur qui l'ordonne, en histoire comme ici
  return meneur.voix(texte); }
function interfaceHistoire(on){
  for(const id of ["monde","lieu","mesurer","banc","histoire","v3"]) if($(id)) $(id).hidden=on;
  if($("journal")) $("journal").hidden=!on&&!dernierJournal;
  $("hint").textContent=on?"Glisse pour regarder · « Lui parler » pour lui dire quelque chose":"Glisse pour regarder autour de lui";
  $("hint").classList.remove("off"); $("parler").classList.remove("pulse"); $("fin").hidden=true;
}
/* Promenade libre : pas d'histoire écrite, mais le même meneur. Le personnage y fait ce qu'on lui demande, ce qu'il fait
   apparaît et peut avoir des suites, comme dans une histoire ; simplement, rien n'est prévu d'avance et rien ne finit.
   Le contrat est fabriqué à la volée à partir du lieu courant, au premier mot du joueur. */
function histoireLibre(f){ return MENEUR.histoireLibre(f); }   // le contrat de la promenade : src/meneur.js
function demarrerLibre(){
  const h=histoireLibre(fiche), v=MENEUR.validerHistoire(h,{fiches:FICHES});
  if(!v.ok){ console.warn("Promenade libre : contrat refusé",v.erreurs); return false; }
  meneur=MENEUR.creerMeneur({ histoire:h, modeles:MODELES, reglages:docile?{DOCILE:true}:undefined, graine:CFG.graine||((Date.now()%1e9)+1), secours:t=>{ const r=lexique(t); r.compris=!/pas compris/.test(r.pensee); return r; },
    demander:(c,opt)=>sampler?sampler.json(c,opt).catch(e=>{ if(e&&e.code==="not_granted") sampler=null; throw e; }):Promise.reject(new Error("sans Claude")),
    emettre:executer, surEvenement:e=>activite.evt(e) });
  meneurLibre=true; histoireId="libre"; meneurT=performance.now(); clearInterval(meneurTimer); meneurTimer=setInterval(ticMeneur,500); ticMeneur();
  if($("journal")) $("journal").hidden=false;
  return true;
}
function quitterLibre(){ if(meneurLibre&&meneur){ journal(); meneur=null; clearInterval(meneurTimer); } meneurLibre=false; }
/* Mode essai (« debug ») : un interrupteur toujours visible. Activé, le personnage fait exactement ce qu'on demande, la caméra
   se tourne vers ce qu'il vient de faire, et la ligne de mise au point s'affiche. Il prend effet à la prochaine phrase en
   promenade libre, à la prochaine partie pour une histoire en cours. */
{ const b=document.createElement("button"); b.type="button"; b.id="docile"; b.className="ghost";
  const maj=()=>{ b.textContent="Debug : "+(docile?"oui":"non"); b.setAttribute("aria-pressed",String(docile)); };
  b.onclick=()=>{ docile=!docile; try{ localStorage.setItem("bodycam-docile",docile?"1":"0"); }catch(_){} maj();
    if(meneurLibre) quitterLibre();
    else if(meneur) say(docile?"Mode debug : il prendra effet à la prochaine partie (Rejouer).":"Mode debug coupé à la prochaine partie.",true);
    };                                                          // le mode docile ne montre plus la ligne de mise au point : elle gâchait la vue (trois touches sur REC pour la voir)
  $("outils").appendChild(b); maj(); }
function jouerHistoire(id){
  const h=HIST.find(x=>x.id===id)||(id===undefined||id===true?HIST.find(x=>MENEUR.ficheDe(x)):null);
  if(!h){ console.warn("Histoire inconnue :",id,"— disponibles :",HIST.map(x=>x.id)); return null; }
  const v=MENEUR.validerHistoire(h,{fiches:FICHES});
  if(!v.ok){ console.warn("Histoire invalide :",v.erreurs); return null; }
  quitterLibre(); quitterHistoire(true);
  applyFiche(MENEUR.ficheDe(h,FICHES)||fiche);
  meneur=MENEUR.creerMeneur({ histoire:h, modeles:MODELES, reglages:docile?{DOCILE:true}:undefined, graine:CFG.graine||((Date.now()%1e9)+1), secours:t=>{ const r=lexique(t); r.compris=!/pas compris/.test(r.pensee); return r; },
    demander:(c,opt)=>sampler?sampler.json(c,opt).catch(e=>{ if(e&&e.code==="not_granted") sampler=null; throw e; }):Promise.reject(new Error("sans Claude")),
    emettre:executer, surEvenement:e=>activite.evt(e) });
  histoireId=h.id; hold=false; patience=10; cam.haut=1; cam.elev=0; immobile=false; setFrozen(false); interfaceHistoire(true);
  meneurT=performance.now(); clearInterval(meneurTimer); meneurTimer=setInterval(ticMeneur,500); ticMeneur();
  return meneur.partie();
}
function quitterHistoire(garderLieu){
  if(!meneur) return; journal(); meneur=null; clearInterval(meneurTimer); hold=false; cam.haut=1; cam.elev=0; immobile=false; interfaceHistoire(false); dbgEl.textContent="";
  if(!garderLieu) applyFiche(FICHES[ficheIdx]);
}
/* Pour l'auteur : une ligne discrète avec le verdict du sas et le temps en cours. CFG.debug, ou trois touches rapides
   sur le chrono REC (réglage gardé dans le navigateur) : utile dans l'artefact sur téléphone, sans console. */
let dbgOn=!!CFG.debug; try{ localStorage.removeItem("bodycam-debug"); }catch(_){}   // jamais affichée par défaut, ni mémorisée d'une visite à l'autre
const dbgEl=document.body.appendChild(document.createElement("div")); dbgEl.id="debug-meneur"; dbgEl.setAttribute("aria-hidden","true"); dbgEl.hidden=!dbgOn;
/* Pendant l'écran d'ouverture (« Quel monde veux-tu filmer ? », au-dessus de tout), les mêmes trois touches se font sur la ligne
   « CAM 07 » au point rouge, ou dans le coin haut gauche de l'écran : le diagnostic s'affiche par-dessus, avec la file de
   compilation en direct (dbgMaj, appelée aussi quand le moteur se repose et ne fait que compiler). */
function dbgTexte(){ return (meneur?meneur.debug()+"\n":"")+(V3.on?ombDiag():"Moteur à rayons"+(ptEnCours()?" : compilation en cours":""))+compFile(); }
function dbgMaj(){ const o=!!(ouverture&&ouverture.ouvert()); dbgEl.classList.toggle("sur-ouv",o); if(dbgOn) dbgEl.textContent=dbgTexte(); }
function dbgBascule(){ dbgOn=!dbgOn; dbgEl.hidden=!dbgOn; dbgEl.textContent=""; dbgMaj(); }
function compFile(){                                            // la file de compilation, en direct (diagnostic)
  const t=performance.now(), x=COMP.envol.filter(e=>!e.note);
  return "\nFile : "+(x.length?x.map(e=>e.nom+" depuis "+((t-e.t0)/1000).toFixed(1)+" s").join(", "):"rien en compilation")+(ouvRepos?" · ouverture (le moteur ne fait que compiler)":""); }
{ const triple=()=>{ let n=0,t=0; return ()=>{ const now=performance.now(); n=now-t<450?n+1:1; t=now; if(n<3) return false; n=0; return true; }; };
  const chip=document.querySelector(".hud.top .chip"), tc=triple(), to=triple(); chip.style.pointerEvents="auto";
  chip.addEventListener("pointerdown",()=>{ if(tc()) dbgBascule(); });
  addEventListener("pointerdown",ev=>{ if(!(ouverture&&ouverture.ouvert())) return;
    const coin=ev.clientX<72&&ev.clientY<72, sur=ev.target&&ev.target.closest&&ev.target.closest(".ouv-sur");
    if((coin||sur)&&to()) dbgBascule(); },true); }
if(HIST.some(x=>MENEUR.ficheDe(x))){ const b=document.createElement("button"); b.type="button"; b.id="histoire"; b.textContent="Jouer l'histoire";
  $("outils").prepend(b); b.onclick=()=>{ fermerOutils(); jouerHistoire(); }; }
/* Journal de partie : ce que le joueur peut copier et envoyer. Chaque tour : ce qu'il a dit, le verdict du sas,
   la pensée, les actions, le délai de Claude ou le secours ; plus les temps et la fin. Lisible sans outil. */
let dernierJournal="";
function journal(){
  if(!meneur) return dernierJournal;
  const t=meneur.trace(), L=[], f=v=>Number(v).toFixed(1).replace(".",",");
  const dbg=gl.getExtension("WEBGL_debug_renderer_info");
  L.push("JOURNAL · "+t.histoire+" · graine "+t.graine+" · "+(sampler?"avec Claude":"SANS Claude (secours)")+(t.reglages&&t.reglages.DOCILE?" · MODE DEBUG (il fait exactement ce qu'on demande)":"")+" · "+(dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):"")+" · "+new Date().toISOString().slice(0,16));
  const items=[];
  for(const a of t.appels||[]){
    const dit=(String(a.consigne||"").match(/La voix dit : (".*")\s*$/)||[])[1], r=a.reponse;
    let l="["+f(a.min)+" min] "+a.type.toUpperCase()+(dit?" · joueur : "+dit:"")+" · "+a.statut+(a.ms?" en "+f(a.ms/1000)+" s":"");
    if(r&&typeof r==="object"){
      if(r.sas) l+="\n    sas : "+[r.sas.verdict,r.sas.regle,r.sas.motif].filter(Boolean).join(" · ");
      l+="\n    "+(r.attitude?"("+r.attitude+") ":"")+"« "+String(r.pensee||"").slice(0,400)+" »";
      const ac=(r.actions||[]).map(x=>x.type+" "+(x.degres??x.metres??x.secondes??"")).join(", "); if(ac) l+="\n    actions : "+ac;
      if(r.objet&&typeof r.objet==="object") l+="\n    objet : "+String(r.objet.nom||"")+" ("+((r.objet.formes||[]).length)+" formes)";
      if(r.suite&&typeof r.suite==="object") l+="\n    suite : "+((r.suite.etapes||[]).length)+" étapes";
      if(r.retouche&&typeof r.retouche==="object") l+="\n    retouche : "+JSON.stringify(r.retouche).slice(0,300);
      for(const k of ["temps","fin","scene","faits","question","resume","fabrique","modifie","defaire"].concat(typeof r.suite==="string"?["suite"]:[])) if(r[k]!==undefined&&r[k]!==null&&r[k]!=="") l+="\n    "+k+" : "+(typeof r[k]==="string"?r[k]:JSON.stringify(r[k])).slice(0,300);
    }
    items.push({min:a.min,o:0,l});
  }
  for(const e of t.evenements||[]){
    if(e.type==="pensee"&&e.source==="ia") continue;                    // déjà dans l'appel
    const x=Object.assign({},e); delete x.min; delete x.type;
    items.push({min:e.min,o:1,l:"["+f(e.min)+" min] "+e.type+" · "+(e.type==="pensee"?e.source+" · « "+e.texte+" »":Object.entries(x).map(([k,v])=>k+" "+(typeof v==="string"?v:JSON.stringify(v))).join(" · "))});
  }
  items.sort((a,b)=>a.min-b.min||a.o-b.o).forEach(i=>L.push(i.l));
  const p=t.final||{};
  L.push("ÉTAT · "+f(p.horloge?p.horloge.minutes:0)+" min · tours "+(p.horloge?p.horloge.tours:0)+" · temps passés "+((p.trame&&p.trame.passes)||[]).map(x=>x.id+"("+x.cause+")").join(", ")+" · fin "+((p.trame&&p.trame.fin)||"—")+" · peur "+(p.porteur?p.porteur.peur:"")+" confiance "+(p.porteur?p.porteur.confiance:"")+" agacement "+(p.porteur?p.porteur.agacement:""));
  return dernierJournal=L.join("\n");
}
function montrerJournal(){ $("mesure-txt").textContent=journal()||"Aucune partie jouée."; $("mesure").hidden=false; $("mesure-copier").disabled=false; }
{ const b=document.createElement("button"); b.type="button"; b.id="journal"; b.className="ghost"; b.textContent="Journal"; b.hidden=true; $("parler").after(b); b.onclick=montrerJournal;
  const c=document.createElement("button"); c.type="button"; c.className="ghost"; c.textContent="Journal de la partie"; $("fin-quitter").after(c); c.onclick=montrerJournal; }
$("fin-rejouer").onclick=()=>jouerHistoire(histoireId);
$("fin-quitter").onclick=()=>quitterHistoire(false);

/* ------------------------------------------------------------------ panneau d'activité (docs/activite.md)
   Une colonne à droite, sur PC : ce que la page fait pendant que Claude réfléchit, dans le petit langage de src/activite.js.
   Lignes vraies (analyse locale, appel en cours, journal du meneur, file d'actions) ; seule la frappe est de l'habillage.
   Mise à jour par lots, 10 fois par seconde au plus, et seulement entre une phrase et la fin de ce qu'elle déclenche. */
const activite=(()=>{
  let on=true; try{ on=localStorage.getItem("bodycam-activite")!=="0"; }catch(_){}
  const st=document.createElement("style"); st.textContent="#activite{position:fixed;right:max(16px,env(safe-area-inset-right,0px));top:22vh;width:340px;max-height:52vh;overflow:hidden;z-index:6;pointer-events:none;"
    +"font-family:var(--f-mono);font-size:12.5px;line-height:1.45;color:#cfd8c4;background:rgba(6,8,6,.46);border-left:2px solid rgba(160,200,140,.35);padding:8px 10px;border-radius:4px;"
    +"opacity:0;transition:opacity .8s;white-space:pre-wrap;word-break:break-word;display:flex;flex-direction:column;justify-content:flex-end}#activite.on{opacity:1}"
    +"#activite .l{display:flex;gap:6px}#activite .h{flex:none;width:2.6em;color:#7d8a74;font-size:10.5px;padding-top:1px}#activite .s{flex:none;width:1em}"
    +"#activite .k-gt .s,#activite .k-gt{color:#fff}#activite .k-lt{color:#a9d6f0}#activite .k-ex{color:#f0b47a}#activite .k-go{color:#e8e39a}#activite .k-ok{color:#8fbf7f}#activite .k-ti{color:#9ab}"
    +"#activite .c{display:inline-block;width:.55em;background:#cfd8c4;animation:actc 1s steps(1) infinite}@keyframes actc{50%{opacity:0}}@media (max-width:760px),(orientation:portrait){#activite{display:none}}";
  document.head.appendChild(st);
  const el=document.body.appendChild(document.createElement("div")); el.id="activite"; el.setAttribute("aria-hidden","true");
  const classe={">":"k-gt"," ":"","~":"k-ti","<":"k-lt","·":"","!":"k-ex","▶":"k-go","✓":"k-ok"};
  let L=[], t0=0, timer=0, sale=false, appel=null, fab=null, act=null, finQ=0, tFin=0, repondu=false;
  const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"})[c]);
  const ms=()=>Math.round(performance.now()-t0);
  function ajouter(x){ if(!x) return null; const l={k:x.k,t:x.t,n:0,h:ms()}; L.push(l); if(L.length>40) L.shift(); sale=true; tFin=0; return l; }
  function rendre(){
    // frappe : la première ligne pas encore écrite avance ; s'il y en a beaucoup en retard, les anciennes s'écrivent d'un coup
    const att=L.filter(l=>l.n<l.t.length); att.slice(0,Math.max(0,att.length-3)).forEach(l=>l.n=l.t.length);
    if(att.length){ const l=att.find(l=>l.n<l.t.length); l.n=Math.min(l.t.length,l.n+14); sale=true; }
    if(!sale) return; sale=false;
    const V=L.slice(-16), dern=V.findIndex(l=>l.n<l.t.length);
    el.innerHTML=V.map((l,i)=>'<div class="l '+(classe[l.k]||"")+'" style="opacity:'+(.45+.55*Math.min(1,(i+1)/(V.length-6||1)))+'"><span class="h">'+(l.h/1000).toFixed(1)+'</span><span class="s">'+esc(l.k)+'</span><span>'
      +esc(l.t.slice(0,l.n))+(i===dern||(dern<0&&i===V.length-1&&tFin===0)?'<span class="c">&nbsp;</span>':'')+'</span></div>').join("");
  }
  function pas(){
    const now=performance.now();
    if(meneur){
      const v=meneur.enVol(), a=meneur.atelier&&meneur.atelier();
      if(v&&v.type==="voix"){ if(!appel||appel.id!==v.id) appel={id:v.id,d:now,l:ajouter(ACTIVITE.ligneAppel("interprète",0))};
        appel.l.t=ACTIVITE.ligneAppel("interprète",(now-appel.d)/1000).t; appel.l.n=Math.max(appel.l.n,appel.l.t.length-4); sale=true; }
      else if(appel){ appel.l.k="✓"; appel.l.t="interprète  répondu en "+((now-appel.d)/1000).toFixed(1)+" s"; appel.l.n=appel.l.t.length; appel=null; repondu=true; sale=true; }
      if(a){ if(!fab||fab.id!==a.id) fab={id:a.id,d:now,l:ajouter(ACTIVITE.ligneAppel("accessoiriste",0))};
        fab.l.t=ACTIVITE.ligneAppel("accessoiriste",(now-fab.d)/1000).t; fab.l.n=Math.max(fab.l.n,fab.l.t.length-4); sale=true; }
      else if(fab){ fab.l.k="✓"; fab.l.t="accessoiriste  rendu en "+((now-fab.d)/1000).toFixed(1)+" s"; fab.l.n=fab.l.t.length; fab=null; sale=true; }
    }
    const q=queue[0];
    if(q!==(act&&act.a)){
      if(act){ act.l.k="✓"; act.l.t=act.l.t.replace(/ [█░]+$/,""); act.l.n=act.l.t.length; }
      act=null;
      if(q){ const t=ACTIVITE.ligneAction(q), p=L[L.length-1];
        // pas d'un même trajet (tourner, marcher, tourner…) : une seule ligne qui compte
        if(p&&p.k==="✓"&&p.type===q.type&&/^(marcher|tourner)$/.test(q.type)){ p.k="▶"; p.x=(p.x||1)+1; p.t=t+" ×"+p.x; p.n=p.t.length; act={a:q,l:p,r0:q.rest}; }
        else { const l=ajouter({k:"▶",t}); l.type=q.type; act={a:q,l,r0:q.rest}; } }
      sale=true;
    } else if(act&&q.type==="effort"&&act.r0>0){ act.l.t=ACTIVITE.ligneAction({type:"effort",secondes:act.r0})+" "+ACTIVITE.barre(1-q.rest/act.r0); act.l.n=act.l.t.length; sale=true; }
    rendre();
    // la fin : plus d'appel, plus de fabrication, la file vide ; on laisse lire 4 s, puis fondu
    const calme=repondu&&!appel&&!fab&&!queue.length;
    if(!calme){ finQ=0; tFin=0; }
    else if(!finQ) finQ=now;
    else if(now-finQ>4000&&!tFin){ tFin=now; el.classList.remove("on"); }
    if(tFin&&now-tFin>1200||now-t0>90000){ clearInterval(timer); timer=0; el.classList.remove("on"); }
  }
  return {
    entendre(texte){ if(!on||typeof ACTIVITE==="undefined") return; t0=performance.now(); L=[]; appel=fab=act=null; finQ=tFin=0; repondu=false;
      try{ ACTIVITE.analyser(texte,MENEUR,MODELES).forEach(ajouter); }catch(e){ console.warn("activité",e); }
      el.classList.add("on"); if(!timer) timer=setInterval(pas,100); pas(); },
    evt(e){ if(!on||!timer) return; const x=ACTIVITE.ligneEvenement(e); if(x) ajouter(x); },
    bascule(){ on=!on; try{ localStorage.setItem("bodycam-activite",on?"1":"0"); }catch(_){} if(!on){ clearInterval(timer); timer=0; el.classList.remove("on"); } return on; },
    on:()=>on, lignes:()=>L.map(l=>l.k+" "+l.t)
  };
})();
{ const b=document.createElement("button"); b.type="button"; b.id="activite-bouton"; b.className="ghost";
  const maj=()=>{ b.textContent="Activité : "+(activite.on()?"oui":"non"); b.setAttribute("aria-pressed",String(activite.on())); };
  b.onclick=()=>{ activite.bascule(); maj(); }; $("outils").appendChild(b); maj(); }
window.balActivite=activite;   // essais : balActivite.lignes()

/* ------------------------------------------------------------------ la régie : un petit bandeau à gauche pendant le jeu
   Une illustration de démo (pas une mesure) : des « agents » par domaine, dont le voyant s'allume quand leur domaine travaille
   (file d'actions, attente de la réponse, son, marche). Aucun coût de rendu : quatre mises à jour par seconde, opacité seulement. */
const regie=(()=>{
  if(window.__CFG&&!CFG.regie) return null;
  const el=document.createElement("div"); el.id="regie"; el.setAttribute("aria-hidden","true");
  const L=[["ciel","Ciel · lumière"],["monde","Monde · terrain"],["histoire","Histoire"],["evenements","Événements"],["corps","Comportement"],["son","Son · voix"]];
  el.innerHTML='<p class="rg-t">Agents · régie</p>'+L.map(([k,n])=>'<p class="rg-l" data-k="'+k+'"><i></i><span>'+n+'</span><b></b></p>').join("");
  document.body.appendChild(el);
  const N={}; for(const p of el.querySelectorAll(".rg-l")) N[p.dataset.k]={p,b:p.querySelector("b"),n:0,t:0};
  const etats={ciel:["veille","exposition","brume"],monde:["veille","sème","relief"],histoire:["écoute","écrit","décide"],evenements:["veille","prépare","déclenche"],corps:["repos","planifie","agit"],son:["silence","mixe","joue"]};
  let i=0;
  setInterval(()=>{ i++;
    const jeu=!(ouverture&&ouverture.ouvert())&&!document.hidden&&innerWidth>=760&&activite.on()&&!CFG.nohud;
    el.classList.toggle("on",jeu); if(!jeu) return;
    const attente=$("pensee").textContent==="…", q=queue.length, type=q?queue[0].type:"", parle=$("pensee").classList.contains("on")&&!attente;
    const sonne=!!(window.balSon&&window.balSon.occupe&&window.balSon.occupe());
    const v={ ciel:(i%23<3)||Math.abs(exposure-expTarget)>.08?1:0, monde:walking?2:(i%17<2?1:0), histoire:attente?2:parle?1:0,
      evenements:/effort|poser|faconner|chercher/.test(type)?2:q>2?1:0, corps:q?(/attendre|penser/.test(type)?1:2):0, son:sonne?2:parle||listening?1:0 };
    for(const k in N){ const o=N[k], n=v[k]; if(n!==o.n){ o.n=n; o.p.dataset.n=n; o.b.textContent=etats[k][n]; } }
  },250);
  for(const k in N){ N[k].p.dataset.n=0; N[k].b.textContent=etats[k][0]; }
  return el;
})();

/* ------------------------------------------------------------------ API : ce qu'un metteur en scène (IA ou script) peut piloter */
window.balade={
  banc,                                                         // banc d'essai (rend le tableau, l'affiche en plein écran)
  reessayerOmbrage:ombRaz,                                     // oublie les variantes d'ombrage notées en échec, et recharge
  ombrage:()=>({mode:OMB.mode,enService:V3.omb?V3.omb.sig:"",voulu:OMB.sig,memoire:OMB.mem}),
  exposition(){ const b=new Float32Array(4); gl.bindFramebuffer(gl.FRAMEBUFFER,expoT[expoI].f); gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,b);   // exposition tenue sur la puce
    return {puce:b[0],cible:b[1],processeur:exposure}; },
  reessayerRayons(){ try{ localStorage.removeItem("bodycam-rayons-2"); }catch(_){} location.reload(); },
  fiches:()=>FICHES.map(f=>f.id),
  lieu(i){ ficheIdx=((i%FICHES.length)+FICHES.length)%FICHES.length; applyFiche(FICHES[ficheIdx]); },
  fiche(f){ applyFiche(f); },
  ambiance(a){ patchScene(a); },
  agir(actions){ enqueue(actions); },
  dire(texte){ return entendre(texte); },
  monde(texte){ return creerMonde(texte); },
  scenes:()=>atelier.docs().map(d=>({id:d.id,titre:d.titre,source:d.source,historique:d.historique.length})),   // banque de scènes (constructeur de monde)
  atelier:()=>atelier,
  figer(v){ setFrozen(!!v); },
  percevoir:()=>meneur?percevoirMeneur():perception(),
  histoires:()=>HIST.map(h=>h.id),
  objets:()=>(Array.isArray(fiche.objets)?fiche.objets:[]).map(o=>({id:o.id,nom:o.nom,devant:+(+o.devant).toFixed(2),cote:+(+o.cote).toFixed(2),x:+posObjet(o).x.toFixed(3),z:+posObjet(o).z.toFixed(3),echelle:o.echelle,formes:(o.formes||[]).length,lumineux:(o.formes||[]).some(f=>f.matiere==="lumineux")})),
  marches:()=>journalMarche.slice(),   // §18 : les marches demandées, ce qu'il a fait, ce qu'il a dit
  corps:()=>({x:cam.x,z:cam.z,yaw:cam.yaw,pitch:cam.pitch,haut:cam.haut,elev:cam.elev,zoom:cam.zoom,perche:cam.perche,immobile,file:queue.map(a=>a.type)}),
  supports:()=>supportsProches(),
  obstacles:()=>obstaclesConnus().map(o=>({id:o.id,nom:o.nom,x:+o.x.toFixed(2),z:+o.z.toFixed(2),r:+o.r.toFixed(2)})),   // §16 : ce que le corps contourne
  lieuCherche:()=>dernierLieu,
  pause(v){ pauseTest=!!v; },
  objet(o){ objetMeneur(o); },                                   // essais : un ordre de l'accessoiriste, tel quel (creer, faconner, retirer…)
  pauseQuand(type,t){ pauseQuand={type,t:+t}; },                 // figer quand le geste en tête de file (ramasser : part 0..1 ; faconner : secondes) atteint t
  enPause:()=>pauseTest,
  grains(n){ if(n>0) V3.grains=Math.round(n); return V3.grains; },
  remplissage(){ return new Promise(ok=>{ V3.compte=ok; V3.n=0; sceneDirty=true; }); },
  prochesCompte(){ return new Promise(ok=>{ V3.prxCompte=ok; V3.n=0; sceneDirty=true; }); },   // essais : coût des éléments proches sur la prochaine image (v3PrxCompte)
  passes(){ return Object.assign({},V3.passesD||{}); },                                        // essais (option v3detail) : durée de la dernière de chaque passe, attente de la puce comprise   // fragments des grains de la caméra sur la prochaine image (v3Compter)
  regulateur(){ return { niveau:REG.niveau, ms:REG.ms, cible:regCible(), etat:regEtat(), puce:GT.ms, total:GT.total||0 }; },          // essais : budget de grains du v3 (gestes à petit budget, captures au budget normal)                                    // essais : figer le corps sans ouvrir le canal (le meneur continue)
  mainsP:()=>mainsEtat.H?mainsEtat.H.map(h=>h.p.map(v=>+v.toFixed(3))):null,   // essais : centres des paumes
  faconnage:()=>({attente:[...differes.keys()],etats:[...faconnages.keys()],mains:mainsObj?[].concat(mainsObj).reduce((n,o)=>n+o.formes.length,0):0,
    file:queue.filter(a=>a.type==="faconner").map(a=>({objet:a.objet,i:a.i,attente:+a.attente.toFixed(1),t:a.G&&a.t0!==undefined?+(a.t-a.t0-.4-(a.pause||0)).toFixed(2):-1,nausee:!!a.nau,pause:+(a.pause||0).toFixed(2),
      total:a.G?+a.G.T.reduce((s,x)=>s+x.duree,0).toFixed(2):0,geste:a.G&&a.k>=0&&a.G.T[a.k]?a.G.T[a.k].geste:"",n:a.G?a.G.T.length:0,dbg:a.dbg}))}),
  vueLocale(id){ const o=(Array.isArray(fiche.objets)?fiche.objets:[]).find(x=>x&&x.id===id); if(!o) return null;   // essais : les formes de la chose et la caméra dans son repère (MENEUR.ajoutsVus)
    return {formes:o.formes||[],oeil:versLocal(repereObjet(o),corpsAxes().e),echelle:repereObjet(o).ech,zoom:cam.zoom}; },
  vue(id){ const q=cibleMonde(id); if(!q) return null; const c=corpsAxes().e; return vueDegagee(c[0],c[1],c[2],q.x,q.z,q.taille/2,q.haut,id); },   // rien entre la caméra et la chose ?
  resolution(px){ CFG.maxPx=+px||undefined; resize(); },        // pixels internes (essais : finesse d'une capture)
  sonde:(x,y,z)=>probe(x,y,z)[0],
  semis:(x,y,z)=>semisDist(x,y,z),
  semisSous:(x,z,r,h)=>semisSous(x,z,r,h),
  placer(x,z,yaw){ queue.length=0; cam.x=+x; cam.z=+z; if(Number.isFinite(+yaw)) cam.yaw=+yaw; cam.elev=0; sceneDirty=true; },   // essais : poser le corps à un endroit précis                               // la copie JS des éléments de semis (comparer à la sonde, option v3sonde)
  jouer:id=>jouerHistoire(id),
  quitter:()=>quitterHistoire(false),
  partie:()=>meneur?meneur.partie():null,
  trace:()=>meneur?meneur.trace():null,
  histoire:()=>({ temps_passes:tempsFaits.slice(), echanges:echanges.slice() }),
  sol:(x,z)=>({ hauteur:terrainH(x,z), trajet:pathX(z) }),     // relief et trajet tels que le moteur les calcule
  etat:()=>({ fiche:fiche.id, graine:seedN, x:cam.x, z:cam.z, yaw:cam.yaw, pitch:cam.pitch, passes:n, file:queue.length }),
};

/* ------------------------------------------------------------------ démarrage */
if(CFG.nohud) document.querySelectorAll(".hud").forEach(e=>e.style.display="none");
if(typeof CFG.scene==="number") ficheIdx=CFG.scene;
applyFiche(typeof CFG.scene==="object"&&CFG.scene?CFG.scene:FICHES[ficheIdx]);
if(CFG.histoire) jouerHistoire(CFG.histoire===true?undefined:CFG.histoire);   // la page démarre sur l'histoire
if(CFG.seed){ setSeed(CFG.seed); cam.x=S.kit!==1?pathX(0):0; }
if(CFG.z!==undefined){ cam.z=CFG.z; if(S.kit!==1){ cam.x=pathX(cam.z); cam.yaw=pathYaw(cam.z); } }
if(CFG.yaw!==undefined) cam.yaw+=CFG.yaw;
if(CFG.dx!==undefined) cam.x+=CFG.dx;                            // tests : écart au trajet (m) et cap absolu (radians, 0 = +z)
if(CFG.cap!==undefined) cam.yaw=CFG.cap;
if(CFG.pitch!==undefined) cam.pitch=CFG.pitch;
if(CFG.auto) enqueue(CFG.auto);
if(CFG.lookYaw) look.yaw=CFG.lookYaw;
if(CFG.zoom) cam.zoom=cam.zoomCible=clampN(CFG.zoom,1,8,1);       // tests : zoom numérique du téléphone
if(V2.on){ v2Basculer(true); window.__v2=V2; }                // accès de test (tools/v2essai.mjs)
$("v2").onclick=()=>v2Basculer(!V2.on);
if((bureau||PT_KO)&&!V3.on&&(!window.__CFG||CFG.bureau)&&!v3Refus()) V3.on=true;   // ordinateur : le moteur v3 d'emblée
if(V3.on){ v3Basculer(true); window.__v3=V3; window.__v3lire=(x,y)=>{ const b=new Float32Array(4); gl.bindFramebuffer(gl.FRAMEBUFFER,V3.hist.f); gl.readPixels(x,y,1,1,gl.RGBA,gl.FLOAT,b); return Array.from(b); }; }               // accès de test (tools/v3essai.mjs)
$("qualite").onclick=()=>qualite(!QUAL.full); $("qualite").textContent="Qualité : "+(QUAL.full?"complète":"mobile"); $("qualite").setAttribute("aria-pressed",String(QUAL.full));
$("v3").onclick=()=>v3Basculer(!V3.on);
$("ombrage-raz").onclick=ombRaz; ombBouton();
if(CFG.say) setTimeout(()=>entendre(CFG.say),400);
if(CFG.world) setTimeout(()=>creerMonde(CFG.world),400);
resize();
sondeProg();                                                     // option v3sonde : la sonde se compile dès le départ, sans bloquer
requestAnimationFrame(frame);

/* ------------------------------------------------------------------ ouverture de démo et arrivée dans un lieu
   Le code est dans src/ouverture.js (OUVERTURE) et ouvertures/*.json (OUVERTURES, journaux de préparation réels) ; ici, les
   raccords. Voir docs/ouverture.md. La voix du personnage est ailleurs (window.voix, quand elle existe). */
function reglage(cle,cfg,defaut){ if(cfg!==undefined) return !!cfg; try{ const v=localStorage.getItem(cle); if(v!==null) return v==="1"; }catch(_){} return defaut; }
function memoriser(cle,on){ try{ localStorage.setItem(cle,on?"1":"0"); }catch(_){} }
const DEMO=CFG.demo!==undefined?!!CFG.demo:/[?&#]demo(\b|=1)/.test(location.search+location.hash)||reglage("bodycam-demo",undefined,!window.__CFG);   // démarrer sur l'ouverture
let mentionRejeu=reglage("bodycam-demo-mention",CFG.demoMention,false);   // « rejeu accéléré d'une génération enregistrée » : éteinte par défaut
{ const o=$("outils"), d=document.createElement("button"); d.type="button"; d.id="demo"; d.className="ghost"; d.textContent="Démo"; o.prepend(d); d.onclick=()=>{ fermerOutils(); lancerOuverture(); };
  const m=document.createElement("button"); m.type="button"; m.id="mention"; m.className="ghost"; o.appendChild(m);
  const maj=()=>{ m.setAttribute("aria-pressed",String(mentionRejeu)); m.textContent="Mention rejeu : "+(mentionRejeu?"oui":"non"); }; maj();
  m.onclick=()=>{ mentionRejeu=!mentionRejeu; memoriser("bodycam-demo-mention",mentionRejeu); if(ouverture) ouverture.mention(mentionRejeu); maj(); }; }
function pensee(t){ penser(t); }

/* Arrivée dans un lieu (hors histoire) : il ne part pas se promener, il regarde autour de lui et se demande ce qu'il fait là.
   Il ne repart que si on le lui dit (« promène-toi », « fais ta vie » : meneurEntendre). Les outils de capture (window.__CFG)
   gardent l'ancien comportement (promenade), sauf avec l'option arrivee. */
const ARRIVEE=["Qu'est-ce que je fous là ?","Attends… je suis où, là ?","Bon. Et maintenant, je fais quoi ?","Personne m'a dit ce que je venais faire ici."];
function arriveeActive(){ return !window.__CFG||!!CFG.arrivee; }
var arriveeJeton=0, ouverture=null, ouvRepos=false;                              // var : applyFiche passe par arrivee() dès le démarrage, avant ces lignes
function arrivee(){                                               // appelée par applyFiche à chaque nouveau lieu ; rend la valeur d'errance
  if(!arriveeActive()) return true;
  const k=++arriveeJeton; setTimeout(()=>tourHorizon(k),1600);
  return false;
}
function tourHorizon(k){
  if(k!==arriveeJeton||(meneur&&!meneurLibre)||frozen||(ouverture&&ouverture.ouvert())) return;
  queue.length=0;                                                 // un tour d'horizon sur place : tourner et lever la tête, aucun pas
  queue.push({type:"attendre",rest:.6},{type:"tourner",rest:-.55},{type:"attendre",rest:.9},{type:"regarder",pitch:.18},{type:"tourner",rest:1.1},
    {type:"attendre",rest:.7},{type:"regarder",pitch:-.03},{type:"tourner",rest:-.55});
  setTimeout(()=>{ if(k===arriveeJeton&&!(meneur&&!meneurLibre)) pensee(ARRIVEE[(seedN>>>0)%ARRIVEE.length]); },2200);   // même fiche, même phrase
}

/* Pendant l'ouverture, aucune image du monde n'est rendue, mais tout ce qu'il faut pour la première se compile, un programme
   à la fois (compLibre) : capteur et halo, semeur, socle, formes, puis la variante complète. La fiche de la suggestion est
   appliquée en coulisse dès l'ouverture : c'est la plus probable, et la question laisse le temps de compiler. */
function prechauffer(){ if(!postPret()) return; if(V3.on) v3Init(); else if(!PT_KO) compilerPT(varCourante()); }
/* Réchauffe pendant l'ouverture : dès qu'un programme du moteur devient prêt (semeur, proches, socle, formes, variante complète,
   tapis), une image réelle est rendue derrière l'écran d'ouverture (opaque) : chaque programme fait son premier dessin là, avec
   ses vraies cibles, et pas dans les premières secondes du monde. Les programmes qu'aucune image n'a encore utilisés (famille
   absente du champ) font un dessin vide (sommet rejeté) dans chacune de leurs cibles (v3ChaufferFroids). */
const OUVCH={sig:""};
function ouvChauffe(){
  if(!V3.on||!V3.gp||!V3.omb||!V3.omb.p||CFG.ouvChauffe===false) return false;
  const sig=Object.keys(V3.gp).filter(k=>V3.gp[k]).join()+"|"+V3.omb.sig+"|"+(V3.tapP?1:0);
  if(sig===OUVCH.sig) return false;
  OUVCH.sig=sig; sceneDirty=true; return true; }
function v3ChaufferFroids(){
  if(!V3.on||!V3.gp||!V3.gb||!V3.sm) return;
  for(let i=0;i<16;i++){ gl.activeTexture(gl.TEXTURE0+i); gl.bindTexture(gl.TEXTURE_2D,null); gl.bindTexture(gl.TEXTURE_2D_ARRAY,null); }   // aucune boucle cible-texture : le dessin n'est pas refusé
  for(const k in V3.gp){ const P=V3.gp[k]; if(!P||P.p.__chaud||k==="sol") continue;
    const u=P.u; gl.useProgram(P.p);
    if(V3_PF[k]){ gl.bindFramebuffer(gl.FRAMEBUFFER,V3.gb.f); for(const n of ["uPrxO","uPrxB","uPrxA","uPrxP"]) gl.uniform1i(u[n]||null,0); gl.uniform4i(u.uPrxS||null,0,0,0,0); gl.drawArrays(gl.TRIANGLES,0,3); }
    else { gl.uniform1i(u.uTotal||null,0); gl.uniform1i(u.uTrait||null,0);
      for(const [f,v] of [[V3.gb.f,0],[V3.sm.f,1]]){ gl.bindFramebuffer(gl.FRAMEBUFFER,f); gl.uniform1i(u.uVue||null,v); gl.drawArrays(gl.POINTS,0,1); } } }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
}
const OUV_ATTENTE=CFG.ouvAttente||5000, OUV_PLEIN=CFG.ouvPlein||25000;   // ms : attente de la première image ; de la variante complète si elle compile encore
const ombEnVol=()=>{ const P=OMB.e[OMB.sig]; return !!(V3.on&&P&&!P.p&&!P.echec); };                          // ms : au-delà, le fondu part sur ce qui est prêt (socle), même sans image
let ouvCoulisse=null, ouvMesure=null;
function etatPrep(){                                             // l'étape en cours, pour la ligne « Le monde se construit »
  const x=COMP.envol.find(e=>!e.note);
  if(x) return "compilation : "+x.nom;
  if(V3.on&&!(V3.gp&&V3.omb)) return "programmes du moteur";
  return "première image";
}
function pretOuverture(){                                        // fin du rejeu : le moteur se réveille ; rend la main dès la première image, ou au délai
  ouvRepos=false; const t0=performance.now(), n0=V3.nImg; V3.nImg0=V3.nImg;
  return new Promise(ok=>{ const tic=()=>{
    const prete=V3.on?V3.nImg>n0&&!!V3.hist:!!hist&&!sceneDirty&&!ptEnCours(), d=performance.now()-t0;
    if(prete&&ombEnVol()&&d<OUV_PLEIN) return setTimeout(tic,40);   // la variante complète finit derrière l'ouverture : pas de gel une fois dans le monde
    if(prete||d>OUV_ATTENTE){ ouvMesure={ms:Math.round(d),image:prete,ombrage:V3.on?(V3.omb?(V3.omb===OMB.e.socle?"socle":"complet"):"aucun"):"rayons"};
      etapeGL("ouverture : fondu après "+(d/1000).toFixed(1)+" s"+(prete?"":" (délai, sans image)")); return ok(ouvMesure); }
    setTimeout(tic,40); }; tic(); });
}
/* L'ouverture : « Quel monde veux-tu filmer ? » ; rejeu d'une préparation enregistrée, ou vraie chaîne du constructeur. */
function lancerOuverture(){
  if(ouverture&&ouverture.ouvert()) return;
  if(meneur&&!meneurLibre) quitterHistoire(false);
  setFrozen(false); voixP.taire(); voixInter(true);                         // la démo se joue avec la voix
  const voulue=id=>FICHES.find(f=>f.id===id);
  ouverture=OUVERTURE.creerOuverture({ rejeux:OUVERTURES, fiches:FICHES, C:CONSTRUCTEUR, recettes:Object.keys(MAT_LIB.recettes), mention:mentionRejeu,
    ficheDe:r=>voulue(r.fiche)||voulue(r.ficheSecours)||null,
    appliquer:f=>{ if(f!==ouvCoulisse){ const i=FICHES.indexOf(f); if(i>=0) ficheIdx=i; applyFiche(CONSTRUCTEUR.resoudreFiche(f)); } ouvCoulisse=null; arriveeJeton++; },   // l'arrivée attend la fin du fondu
    pret:()=>pretOuverture(), etat:etatPrep,
    dicteeDispo:capacite("dictation").then(d=>!!d), dicter:el=>{ if(!dict) return; dictEl=el; ecouter(); }, arreterDictee:()=>{ if(dict&&listening) dict.stop().catch(()=>{}); },
    surDebut:(t,rejeu)=>{ if(!rejeu) ouvRepos=false; },          // rejeu : le moteur reste au repos (il compile) jusqu'au fondu
    surFin:o=>{ ouvRepos=false; if(o.constructeur){ creerMonde(o.texte); return; } const k=++arriveeJeton; setTimeout(()=>tourHorizon(k),1200); } });
  ouverture.ouvrir(); ouvRepos=true;
  const r0=OUVERTURES.find(r=>r.suggestion), f0=r0&&(voulue(r0.fiche)||voulue(r0.ficheSecours));   // en coulisse : la fiche de la suggestion
  if(f0){ const i=FICHES.indexOf(f0); if(i>=0) ficheIdx=i; applyFiche(CONSTRUCTEUR.resoudreFiche(f0)); arriveeJeton++; ouvCoulisse=f0; }
}
setInterval(()=>{ if(ouverture&&ouverture.ouvert()) ouverture.dictee(listening); },300);
if(DEMO&&!CFG.histoire) lancerOuverture();
window.balade.ouverture=()=>{ lancerOuverture(); return ouverture; };
window.balade.ouvertureMesure=()=>ouvMesure;                    // tools/ouverture.mjs : attente entre la fin du rejeu et le fondu
window.balade.arrivee=()=>({ errance, file:queue.map(a=>a.type), pensee:$("pensee").textContent });
