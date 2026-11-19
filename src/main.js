"use strict";
/* =====================================================================
   bodycam-proc : monde procédural (aucun asset), path tracing progressif
   en WebGL2 avec reprojection temporelle, puis simulation d'un capteur
   de caméra-piéton à l'affichage. Voir docs/ pour les principes.
   ===================================================================== */

const VS = __SHADER_VS__;
const FS_PT = __SHADER_FS_PT__;
const FS_DOWN = __SHADER_FS_DOWN__;
const FS_BLUR = __SHADER_FS_BLUR__;
const FS_CAM = __SHADER_FS_CAM__;
const VS_V2PTS = __SHADER_VS_V2PTS__, FS_V2PTS = __SHADER_FS_V2PTS__, FS_V2CIEL = __SHADER_FS_V2CIEL__, FS_V2TROUS = __SHADER_FS_V2TROUS__;
const VS_V3GRAINS = __SHADER_VS_V3GRAINS__, VS_V3SOL = __SHADER_VS_V3SOL__, FS_V3GBUF = __SHADER_FS_V3GBUF__, FS_V3OMBRE = __SHADER_FS_V3OMBRE__, FS_V3OMBRAGE = __SHADER_FS_V3OMBRAGE__;
const FICHES = __SCENES__;                      // fiches de lieu embarquées (scenes/*.json)

const $ = id => document.getElementById(id);
const canvas = $("view");
const CFG = window.__CFG || {};                 // réglages de test injectés par tools/shot.mjs
function fail(msg){ const e=$("err"); e.style.display="flex"; e.textContent=msg; throw new Error(msg); }

/* ------------------------------------------------------------------ WebGL */
const gl = canvas.getContext("webgl2",{antialias:false,alpha:false,depth:false,stencil:false,powerPreference:"high-performance"});
canvas.addEventListener("webglcontextlost",e=>{ e.preventDefault(); const el=$("err"); el.style.display="flex"; el.textContent="Contexte WebGL perdu : le shader est trop lourd pour ce GPU."; });
if(!gl) fail("Ce navigateur ne propose pas WebGL2, nécessaire pour le rendu.\nEssaie avec une version récente de Chrome, Safari ou Firefox.");
if(!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float"))
  fail("Ce GPU ne sait pas dessiner dans une texture flottante, nécessaire pour accumuler la lumière.");

function sh(type,src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) fail("Erreur de compilation du shader :\n"+gl.getShaderInfoLog(s)); return s; }
function lancer(fs,vs=VS){ const p=gl.createProgram(), v=gl.createShader(gl.VERTEX_SHADER), f=gl.createShader(gl.FRAGMENT_SHADER);   // compile sans attendre le résultat
  gl.shaderSource(v,vs); gl.compileShader(v); gl.shaderSource(f,fs); gl.compileShader(f);
  gl.attachShader(p,v); gl.attachShader(p,f); gl.linkProgram(p); return {p,v,f}; }
function finir(x){
  if(!gl.getProgramParameter(x.p,gl.LINK_STATUS)){
    for(const s of [x.v,x.f]) if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) fail("Erreur de compilation du shader :\n"+gl.getShaderInfoLog(s));
    fail("Erreur de liaison du shader :\n"+gl.getProgramInfoLog(x.p)); }
  const p=x.p, u={}; const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){ const a=gl.getActiveUniform(p,i); u[a.name.replace("[0]","")]=gl.getUniformLocation(p,a.name); }
  return {p,u}; }
const prog=(fs,vs=VS)=>finir(lancer(fs,vs));
/* Variantes fixes du même shader, choisies par #define. En rendu logiciel, le code présent coûte à chaque pas de rayon même
   quand il ne s'exécute pas : la forêt garde un programme sans semis, un monde nu un programme sans arbres. Chaque variante se
   compile une fois (en tâche de fond si le navigateur le permet), à la première fiche qui la demande : jamais de code généré par monde.
   Variante 0 : forêt et dunes (le shader d'origine). 1 : avec semis. 2 : monde nu (sans arbres ni canopée). 3 : monde nu avec semis. */
const variante=v=>v?FS_PT.replace("\n","\n#define SEMIS "+(v&1)+"\n#define NU "+(v>>1)+"\n"):FS_PT;
const P_PT=prog(FS_PT), P_DOWN=prog(FS_DOWN), P_BLUR=prog(FS_BLUR), P_CAM=prog(FS_CAM);
const parallele=!!gl.getExtension("KHR_parallel_shader_compile");
const progs=[P_PT,null,null,null], lances=[];
function progMonde(){                                           // le programme qui sait dessiner le monde courant
  const v=(S.semN?1:0)+(S.kit===2?2:0);
  if(!progs[v]){ progs[v]=finir(lances[v]||lancer(variante(v))); lances[v]=null; }
  return progs[v];
}
if(parallele) setTimeout(()=>{ if(!progs[3]&&!lances[3]) lances[3]=lancer(variante(3)); },4000);   // la plus probable pour un monde décrit
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
const dummy=target(1,1,ACC_FMT,gl.NEAREST), probeT=target(4,1,ACC_FMT,gl.NEAREST);
function draw(){ gl.drawArrays(gl.TRIANGLES,0,3); }
function bindTex(unit,t,loc){ gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,t); gl.uniform1i(loc,unit); }

/* ------------------------------------------------------------------ scène : ce que la fiche de lieu pilote */
const S={ can:[7,19], houp:[0,1.5,2.6,1], loin:[0,3,2,0], loinCol:[.2,.2,.21], loinBas:[.05,.07,.05], surf:[0,1,2,0], surfT:[3,4,5,6], surfP:[.45,.5], objN:0, kit:0,
  rel:[1,1,0,0], traj:[1,.85,.3,.5], creux:[.10,1.8,.4,0], terK:[.88,0], yTop:23, pente:.22, semN:0, semTop:[0,0,0,0], objTop:0, solAlb:[.24,.15,.07], lum:0, sunDir:[0,1,0], sun:[7,5.6,4.2], sky:[1,1,1], fog:.011, torch:0, kitP:[.62,1,1,1], eye:1.36, nuit:false };
let fiche=null, ficheIdx=0, seedN=4821, seed=[0,0,0], sceneDirty=true;
function setSeed(n){ seedN=n; seed=[(n*12.9898)%89,(n*78.233)%83,(n*.618034)%6.2832]; }
function applyAmbiance(a){
  const so=a.soleil||{azimut:-33,hauteur:21};
  S.nuit=so.hauteur<-1;
  const el=S.nuit?38:Math.max(2,so.hauteur), az=so.azimut*Math.PI/180, e=el*Math.PI/180;
  S.sunDir=[Math.sin(az)*Math.cos(e),Math.sin(e),Math.cos(az)*Math.cos(e)];
  if(S.nuit){ S.sun=[.020,.027,.042]; S.sky=[.005,.007,.012]; }       // clair de lune
  else {
    const k=Math.min(1,el/38), I=7*Math.min(1,.35+el/14);              // soleil bas : plus faible et plus chaud
    S.sun=[I,I*(.62+.33*k),I*(.30+.55*k)]; S.sky=[1,1,1];
    if(a.meteo==="voile"){ S.sun=S.sun.map(v=>v*.22); S.sky=[.92,.86,.78]; }
  }
  S.lum=S.nuit?1:so.hauteur<8?.35*(8-Math.max(0,so.hauteur))/8:0;   // fenêtres allumées : la nuit, un peu au crépuscule
  S.torch=(a.lampe!==undefined?a.lampe:S.nuit)?26:0;
  S.fog=a.brume!==undefined?a.brume:.011;
  if(S.kit===0) S.kitP[3]=a.saison==="ete"?0:1;
  sceneDirty=true;
  if(fiche) v3Fiche();                                          // une lampe allumée en cours d'histoire : le v3 laisse la place
}
/* Kit : "foret" et "dunes" ont encore leurs arbres, rochers et canopée en dur ; "nu" n'a rien de prédéfini.
   Une fiche sans kit qui fournit ses semis est un monde nu. */
const kitDe=f=>f.kit==="dunes"?1:f.kit==="nu"||(f.kit===undefined&&Array.isArray(f.semis)&&f.semis.length)?2:0;
/* Relief et trajet : la fiche règle les formules de terrainH et pathX. Sans réglage, la forêt d'origine à l'identique. */
function reglerRelief(f){
  S.rel=[1,1,0,0]; S.traj=[1,.85,.3,.5]; S.creux=[.10,1.8,.4,0]; S.terK=[.88,0]; S.pente=.22;
  if(S.kit===1) return;                                          // dunes : relief encore en dur
  const re=isObj(f.relief)?f.relief:null, tr=isObj(f.trajet)?f.trajet:null;
  if(!re&&!tr&&S.kit===0) return;
  const amp=clampN(re&&re.amplitude,0,12,S.kit===2?.8:1.5), ech=clampN(re&&re.echelle,20,600,150), pente=clampN(re&&re.pente,-.35,.35,0);
  const larg=clampN(tr&&tr.largeur,.6,30,1.7), hw=larg/2, net=!!(tr&&tr.bord==="net"), creux=clampN(tr&&tr.creux,0,.4,.10);
  const niv=re&&re.niveler!==undefined?!!re.niveler:S.kit===2&&larg>=3;
  S.rel=[amp/1.5,150/ech,pente,niv?hw+2:0];
  S.traj=[clampN(tr&&tr.sinuosite,0,2,1),hw,net?.03:.3,net?0:.5];
  S.creux=[creux,hw+(net?.18:.95),net?hw:Math.max(0,hw-.45),0];
  const g=S.rel[0]*S.rel[1]*.22+Math.abs(pente); S.pente=g;     // pente la plus forte du relief, en gros
  S.terK=[.88/Math.sqrt(1+g*g),0];
  const cg=1.5*creux/Math.max(.05,S.creux[1]-S.creux[2]);       // bord de trottoir : pas réduit seulement là
  if(cg>.5) S.terK[1]=S.terK[0]/Math.sqrt(1+cg*cg);
}
function applyFiche(f){
  fiche=f; setSeed(f.graine||4821);
  S.kit=kitDe(f);
  const fo=f.foret||{};
  S.kitP=S.kit===1 ? [-1,(f.dunes&&f.dunes.rochers)||0,0,1] : S.kit===2 ? [-1,0,0,1]
                   : [fo.densite!==undefined?(.2+.6*fo.densite)*Math.min(1,fo.densite*5):.62, fo.rochers!==undefined?fo.rochers:1, fo.feuillage!==undefined?fo.feuillage:1, 1];
  reglerRelief(f);
  const cone=fo.houppier==="cone";                               // conifères : un cône de feuillage par arbre au lieu de la voûte commune
  S.can=cone?[clampN(fo.houppier_bas,.3,8,1.6),19]:[7,19];
  S.houp=[cone?1:0,S.can[0],clampN(fo.houppier_rayon,.8,3.2,3),clampN(fo.perches,0,1,cone?.25:1)];
  const lo=isObj(f.lointain)?f.lointain:null, lh=lo?clampN(lo.hauteur,0,40,0):0;   // horizon : montagnes ou collines
  S.loin=[Math.tan(lh*Math.PI/180),.7+2.3*clampN(lo&&lo.decoupe,0,1,.5),lo&&lo.neige>0?1-clampN(lo.neige,0,1,0):2,lh>0?1:0];
  S.loinCol=couleur(lo&&lo.couleur||"#7b7a80"); S.loinBas=couleur(lo&&lo.couleur_bas||"#3d4a3a");
  S.eau=lo&&lo.eau?[...couleur(typeof lo.eau==="string"?lo.eau:"#2c4652"),1]:[0,0,0,0];   // mer, baie ou lac sous l'horizon
  S.eye=(f.camera&&f.camera.hauteur)||1.36;
  buildMats(f); buildShapes(f);
  applyAmbiance(f.ambiance||{});
  if(f.ambiance&&f.ambiance.saison==="hiver") S.kitP[2]*=.15;
  cam.z=0; cam.x=S.kit!==1?pathX(0):0; cam.yaw=S.kit!==1?pathYaw(0):1.15; cam.pitch=-.03; look.yaw=0; look.pitch=0; queue.length=0; tempsFaits.length=0;
  cacheObj.clear(); (f.objets||[]).forEach(o=>{ if(o&&o.visible===false) cacheObj.add(o.id); }); buildShapes(f);
  v3Fiche();
}

/* Objets : la fiche les décrit en formes de base, on les range dans une texture de données lue par le shader. */
const FORMES={boite:0,boule:1,cylindre:2,cone:3,capsule:4,toit:5};
const MATIERES={mat:0,bois:1,pierre:2,metal:3,verre:4,pelage:5,tissu:5,tuile:6,lumineux:7};
const SEM0=72, SEM_L=10, SH_ROWS=SEM0+4*SEM_L, shapesData=new Float32Array(4*4*SH_ROWS), cacheObj=new Set();
const shapesT=gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D,shapesT); gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,4,SH_ROWS);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
function couleur(c){                                           // "#rrggbb" ou [r,v,b] entre 0 et 1, converti en linéaire
  let v=[.4,.4,.4];
  if(typeof c==="string"&&/^#[0-9a-f]{6}$/i.test(c)) v=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255);
  else if(Array.isArray(c)&&c.length>=3) v=c.slice(0,3).map(x=>clampN(x,0,1,.4));
  return v.map(x=>Math.pow(x,2.2));
}
function buildShapes(f){
  shapesData.fill(0); S.objN=0; S.objTop=0; let row=8;
  for(const o of (Array.isArray(f.objets)?f.objets:[]).slice(0,8)){
    const formes=(Array.isArray(o.formes)?o.formes:[]).filter(x=>x&&FORMES[x.f]!==undefined).slice(0,24);
    if(!formes.length || row+formes.length>SH_ROWS) continue;
    const dv=clampN(o.devant,2,90,12), ct=clampN(o.cote,-20,20,3), ech=clampN(o.echelle,.1,5,1);
    let x,z,yaw;
    if(S.kit!==1){ z=dv; x=pathX(z)+ct; yaw=Math.atan2(pathX(z-4)-x,-4); }          // par défaut, la face avant regarde celui qui arrive
    else { const a=1.15; x=Math.sin(a)*dv+Math.cos(a)*ct; z=Math.cos(a)*dv-Math.sin(a)*ct; yaw=a+Math.PI; }
    if(o.cap!==undefined) yaw+=clampN(o.cap,-360,360,0)*Math.PI/180;
    const y=terrainH(x,z), c=Math.cos(yaw), sn=Math.sin(yaw), i=S.objN; let rad=.1;
    formes.forEach((fo,k)=>{
      const p=(Array.isArray(fo.p)?fo.p:[0,0,0]).map(v=>clampN(v,-30,30,0)*ech);
      const t=(Array.isArray(fo.taille)?fo.taille:[1,1,1]).map(v=>clampN(v,.01,40,1)*ech*.5);
      const pe=Array.isArray(fo.penche)?fo.penche:[0,0], col=couleur(fo.couleur), r=(row+k)*16;
      ancrer(fo.f,p,t,pe,2);
      shapesData.set([x+c*p[0]+sn*p[2], y+p[1], z-sn*p[0]+c*p[2], FORMES[fo.f],
                      t[0],t[1],t[2], yaw+clampN(fo.cap,-360,360,0)*Math.PI/180,
                      col[0],col[1],col[2], matIdx.has(fo.matiere)?16+matIdx.get(fo.matiere):MATIERES[fo.matiere]!==undefined?MATIERES[fo.matiere]:0,
                      clampN(fo.lisse,0,.5,0)*ech, clampN(fo.arrondi,0,.3,0)*ech, clampN(pe[0],-90,90,0)*Math.PI/180, clampN(pe[1],-90,90,0)*Math.PI/180], r);
      rad=Math.max(rad,Math.hypot(p[0],p[1],p[2])+Math.hypot(t[0],t[1],t[2]));
    });
    shapesData.set([x,y,z,rad, row,formes.length, clampN(o.degage,0,12,0), (o.visible===false||cacheObj.has(o.id))?0:1], i*16);
    row+=formes.length; S.objN++;
    S.objTop=Math.max(S.objTop,y+rad-S.rel[2]*z);
  }
  packSemis(f);
  const terr=2.4*S.rel[0]+1;                                     // au-dessus : plus rien, le rayon qui monte s'arrête
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
      shapesData.set([p[0],p[1],p[2],FORMES[fo.f], t[0],t[1],t[2],fc,
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
    put(10,[N(mo.couverture,0,1,1),N(mo.couverture_bruit,0,1,0),N(mo.taille,.05,1,1),0]); }
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
  S.surfP=[clampN(ar.part,0,1,.45),clampN(pe.part,0,1,.5)];
  for(const o of [...(Array.isArray(f.objets)?f.objets:[]),...(Array.isArray(f.semis)?f.semis:[])]) for(const fo of (o&&Array.isArray(o.formes))?o.formes:[])   // formes qui nomment une recette
    if(fo&&typeof fo.matiere==="string"&&isObj(lib[fo.matiere])) use(fo.matiere);
  const rs=resoudre(sf.sol,lib)||resoudre(d.sol,lib);            // couleur du sol vue par la lumière indirecte
  S.solAlb=kitDe(f)===0?[.24,.15,.07]:couleur(rs&&rs.couleur||"#555555").map(v=>v*.9);
  gl.bindTexture(gl.TEXTURE_2D,matT); gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,RT_W,RT_MAX,gl.RGBA,gl.FLOAT,matData);
  sceneDirty=true;
}
function validerRecettes(m){                                    // la fiche ne garde que des recettes de taille raisonnable
  if(!isObj(m)) return undefined; const out={};
  for(const [k,v] of Object.entries(m).slice(0,12)) if(isObj(v)&&/^[a-z0-9_-]{1,30}$/.test(k)&&JSON.stringify(v).length<4000) out[k]=JSON.parse(JSON.stringify(v));
  return Object.keys(out).length?out:undefined;
}

/* Mêmes formules que dans pathtrace.frag : à modifier des deux côtés. */
const sstep=(a,b,x)=>{ const t=Math.min(1,Math.max(0,(x-a)/(b-a))); return t*t*(3-2*t); };
const pathX=z=>S.traj[0]*(3.2*Math.sin(z*.047+seed[2])+1.6*Math.sin(z*.113+1.7+seed[2]*2));
const pathYaw=z=>Math.atan2(pathX(z+3)-pathX(z-3),6);
function ondul(x,z){ const qx=x*S.rel[1], qz=z*S.rel[1];
  return S.rel[0]*(1.5*Math.sin(qx*.041+.6+seed[2])*Math.cos(qz*.035+1.1)+.65*Math.sin(qx*.097+qz*.071+2)+.22*Math.sin(qx*.29-qz*.21+seed[2]*3)); }
function terrainH(x,z){
  if(S.kit===1){ const a=x*.045+.9*Math.sin(z*.021+seed[2])+.5*Math.sin(z*.05+1.3);
    return 3.2*(1-Math.abs(Math.sin(a)))*(.62+.38*Math.sin(z*.03+2+seed[2]))+.5*Math.sin(x*.11+z*.08); }
  const px=pathX(z), ax=Math.abs(x-px);
  let h=ondul(S.rel[3]>0?x+(px-x)*sstep(S.rel[3]+5,S.rel[3],ax):x,z);   // une rue reste de niveau en travers : l'ondulation y est lue sur l'axe
  h+=S.rel[2]*z;
  return h-S.creux[0]*sstep(S.creux[1],S.creux[2],ax);
}

/* ------------------------------------------------------------------ porteur de la caméra */
const cam={ x:0, z:0, yaw:0, pitch:-.03 };         // le corps du porteur : seul le récit le déplace
const look={ yaw:0, pitch:0 };                   // le regard du joueur, libre autour de la caméra
const queue=[];                                  // actions en attente : tourner, marcher, regarder, attendre
let frozen=false, hold=false, walkDist=0, walking=false;
function pose(){
  const bob=walking?.022*Math.sin(walkDist*8.4):0;
  const yw=cam.yaw+look.yaw, pt=Math.max(-1.2,Math.min(1.35,cam.pitch+look.pitch));
  const cy=Math.cos(yw),sy=Math.sin(yw),cp=Math.cos(pt),sp=Math.sin(pt);
  const f=[sy*cp,sp,cy*cp], r=[cy,0,-sy], u=[f[1]*r[2]-f[2]*r[1],f[2]*r[0]-f[0]*r[2],f[0]*r[1]-f[1]*r[0]];
  return { pos:[cam.x,terrainH(cam.x,cam.z)+S.eye+bob,cam.z], mat:new Float32Array([r[0],r[1],r[2],u[0],u[1],u[2],f[0],f[1],f[2]]) };
}
function samePose(a,b){ if(!a||!b) return false;
  for(let i=0;i<3;i++) if(Math.abs(a.pos[i]-b.pos[i])>1e-5) return false;
  for(let i=0;i<9;i++) if(Math.abs(a.mat[i]-b.mat[i])>1e-6) return false;
  return true; }

function common(w,h,p){
  const P=progMonde(), u=P.u; gl.useProgram(P.p);
  gl.uniform2f(u.uRes,w,h); gl.uniform1f(u.uTick,(tick++)%60000);
  gl.uniform3fv(u.uCamPos,p.pos); gl.uniformMatrix3fv(u.uCam,false,p.mat);
  gl.uniform1f(u.uFish,1.09/(.5*Math.max(1,w/h)));            // 125° sur le grand côté
  gl.uniform1f(u.uFog,S.fog); gl.uniform3fv(u.uSeed,seed); gl.uniform3fv(u.uSunDir,S.sunDir);
  gl.uniform3fv(u.uSun,S.sun); gl.uniform3fv(u.uSky,S.sky); gl.uniform1f(u.uTorch,S.torch);
  bindTex(3,shapesT,u.uShapes); gl.uniform1i(u.uObjN,S.objN);
  gl.uniform2fv(u.uCan,S.can); gl.uniform4fv(u.uHoup,S.houp);
  gl.uniform4fv(u.uLoin,S.loin); gl.uniform4fv(u.uEau,S.eau||[0,0,0,0]); gl.uniform3fv(u.uLoinCol,S.loinCol); gl.uniform3fv(u.uLoinBas,S.loinBas);
  bindTex(4,matT,u.uMats); gl.uniform4iv(u.uSurf,S.surf); gl.uniform4iv(u.uSurfT,S.surfT); gl.uniform2fv(u.uSurfP,S.surfP);
  gl.uniform1i(u.uKit,S.kit); gl.uniform4fv(u.uKitP,S.kitP); gl.uniform1i(u.uMode,0);
  gl.uniform4fv(u.uRel,S.rel); gl.uniform4fv(u.uTraj,S.traj); gl.uniform4fv(u.uCreux,S.creux); gl.uniform2fv(u.uTerK,S.terK); gl.uniform1f(u.uYTop,S.yTop);
  gl.uniform1i(u.uSemN,S.semN); gl.uniform4fv(u.uSemTop,S.semTop); gl.uniform3fv(u.uSolAlb,S.solAlb); gl.uniform1f(u.uNuit,S.lum);
  return u;
}
const pb=new Float32Array(16);
function probe(x,y,z){                                         // distance au décor, lue sur le GPU
  const u=common(4,1,lastPose||pose()); gl.uniform1i(u.uMode,1); gl.uniform3f(u.uProbe,x,y,z);
  gl.uniform1f(u.uAlpha,1); bindTex(0,dummy.t,u.uPrev);
  gl.bindFramebuffer(gl.FRAMEBUFFER,probeT.f); gl.viewport(0,0,4,1); draw();
  gl.readPixels(0,0,4,1,gl.RGBA,gl.FLOAT,pb);
  return [pb[0],pb[4],pb[8]];
}
function moveBy(dist){
  let nx=cam.x+Math.sin(cam.yaw)*dist, nz=cam.z+Math.cos(cam.yaw)*dist;
  // La sonde de collision lit un pixel sur la puce graphique, ce qui la force à tout finir : 16 ms par image mesurés sur Mali-G77.
  // On ne sonde donc qu'une fois tous les 120 ms (16 cm de marche), un demi-mètre devant ; près d'un obstacle, à chaque image.
  const R=.42, now=performance.now();
  if(now-sonde.t>120 || sonde.d<R+.25){ const a=.5*Math.sign(dist||1); sonde.t=now;
    const sx=nx+Math.sin(cam.yaw)*(sonde.d<R+.25?0:a), sz=nz+Math.cos(cam.yaw)*(sonde.d<R+.25?0:a);
    [sonde.d,sonde.dx,sonde.dz]=probe(sx,terrainH(sx,sz)+.75,sz); sonde.loin=!(sonde.d<R+.25); }
  const d=sonde.loin?Math.max(sonde.d,R):sonde.d, dx=sonde.dx, dz=sonde.dz;
  if(d<R){ let gx=(dx-d)/.05, gz=(dz-d)/.05; const l=Math.hypot(gx,gz)||1; nx+=gx/l*(R-d); nz+=gz/l*(R-d); }
  cam.x=nx; cam.z=nz; walkDist+=Math.abs(dist);
}
let idle=0, stuck=0;
const sonde={t:-1e9,d:9,dx:9,dz:9,loin:true};
let patience=10;                                               // secondes d'immobilité avant qu'elle reparte d'elle-même, en histoire
function pasHistoire(){                                        // quatre mètres le long du sentier, puis elle s'arrête : le rythme laisse la place au joueur
  const want=S.kit!==1?pathYaw(cam.z+Math.cos(cam.yaw)*6)+(Math.cos(cam.yaw)<0?Math.PI:0):cam.yaw;
  let d=want-cam.yaw; d=Math.atan2(Math.sin(d),Math.cos(d));
  queue.push({type:"tourner",rest:d},{type:"marcher",rest:4});
}
function flaner(){                                            // sans consigne, il se promène : c'est le récit par défaut
  const want=S.kit!==1 ? pathYaw(cam.z+Math.cos(cam.yaw)*6)+(Math.cos(cam.yaw)<0?Math.PI:0)+(Math.random()-.5)*.5
                       : cam.yaw+(Math.random()-.5)*1.2;
  let d=want-cam.yaw; d=Math.atan2(Math.sin(d),Math.cos(d));
  queue.push({type:"tourner",rest:d},{type:"marcher",rest:6+Math.random()*9},{type:"attendre",rest:1.5+Math.random()*3});
  if(Math.random()<.4) queue.push({type:"regarder",pitch:(Math.random()-.35)*.5},{type:"attendre",rest:2},{type:"regarder",pitch:-.03});
}
function simulate(dt){
  walking=false; if(frozen||hold) return;
  let v=0;
  if(!queue.length){ idle+=dt;
    if(meneur){ if(idle>patience && !CFG.nowalk){ idle=0; patience=7; pasHistoire(); } }   // en histoire : petits pas, et elle attend la voix après chaque temps
    else if(idle>2.5 && !CFG.auto && !CFG.nowalk){ idle=0; flaner(); } } else idle=0;
  const a=queue[0];
  if(a){
    if(a.type==="tourner"){ const d=Math.sign(a.rest)*Math.min(Math.abs(a.rest),1.5*dt); cam.yaw+=d; a.rest-=d; if(Math.abs(a.rest)<1e-3) queue.shift(); }
    else if(a.type==="marcher"){ v=Math.sign(a.rest)*1.35; a.rest-=v*dt; if(a.rest*Math.sign(v)<=0) queue.shift(); }
    else if(a.type==="regarder"){ const d=a.pitch-cam.pitch; cam.pitch+=Math.sign(d)*Math.min(Math.abs(d),1.1*dt); if(Math.abs(d)<.012) queue.shift(); }
    else { a.rest-=dt; if(a.rest<=0) queue.shift(); }
  }
  if(v!==0){
    const x0=cam.x, z0=cam.z; moveBy(v*dt); walking=true;
    if(!gyro.on){ look.yaw*=Math.exp(-dt/2.5); look.pitch*=Math.exp(-dt/2.5); }           // en marche, le regard revient vers l'avant
    stuck=Math.hypot(cam.x-x0,cam.z-z0)<Math.abs(v*dt)*.3?stuck+dt:0;
    if(stuck>.6){ stuck=0; queue.shift(); queue.unshift({type:"tourner",rest:(Math.random()<.5?-1:1)*.9}); }   // bloqué : il contourne
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
const QUAL={ full:CFG.full!==undefined?!!CFG.full:!coarse };
try{ const q=localStorage.getItem("bodycam-qualite"); if(q&&CFG.full===undefined) QUAL.full=q==="1"; }catch(_){}
const MAXS=CFG.maxSpp||400;
function pairAt(i){ if(!pairs[i]){ const w=Math.max(2,Math.round(W*LEVELS[i])), h=Math.max(2,Math.round(H*LEVELS[i]));
  pairs[i]={a:target(w,h,ACC_FMT,gl.NEAREST),b:target(w,h,ACC_FMT,gl.NEAREST)}; } return pairs[i]; }
function resize(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const cw=Math.max(2,Math.round(canvas.clientWidth*dpr)), ch=Math.max(2,Math.round(canvas.clientHeight*dpr));
  canvas.width=cw; canvas.height=ch;
  const maxPx=CFG.maxPx||(QUAL.full?2000000:coarse?250000:440000);   // mode complet : jusqu'à la pleine résolution de l'écran
  const s=Math.min(1,Math.sqrt(maxPx/(cw*ch)));
  W=CFG.w||Math.max(2,Math.round(cw*s)); H=CFG.h||Math.max(2,Math.round(ch*s));
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
let blBuf=null;
function postFX(src){
  gl.useProgram(P_DOWN.p); bindTex(0,src.t,P_DOWN.u.uTex); gl.uniform2f(P_DOWN.u.uDstRes,bl1.w,bl1.h);
  gl.bindFramebuffer(gl.FRAMEBUFFER,bl1.f); gl.viewport(0,0,bl1.w,bl1.h); draw();
  const now=performance.now();
  if(now-lastExpRead>180){                                    // exposition auto : moyenne logarithmique, pondérée au centre
    lastExpRead=now;
    if(!blBuf||blBuf.length!==bl1.w*bl1.h*4) blBuf=new Float32Array(bl1.w*bl1.h*4);
    gl.readPixels(0,0,bl1.w,bl1.h,gl.RGBA,gl.FLOAT,blBuf);
    let s=0,ws=0,any=false;
    for(let y=0;y<bl1.h;y++) for(let x=0;x<bl1.w;x++){ const i=(y*bl1.w+x)*4;
      const L=.2126*blBuf[i]+.7152*blBuf[i+1]+.0722*blBuf[i+2]; if(L>0) any=true;
      const dx=x/bl1.w-.5, dy=y/bl1.h-.5, w=1-1.6*(dx*dx+dy*dy);
      s+=w*Math.log(Math.min(L,8)+.004); ws+=w; }
    if(any) expTarget=Math.min(S.nuit?9:14,Math.max(.25,.25/Math.exp(s/ws)));   // la nuit, le gain plafonne : le noir reste noir
  }
  gl.useProgram(P_BLUR.p);
  bindTex(0,bl1.t,P_BLUR.u.uTex); gl.uniform2f(P_BLUR.u.uDir,1/bl1.w,0); gl.bindFramebuffer(gl.FRAMEBUFFER,bl2.f); draw();
  bindTex(0,bl2.t,P_BLUR.u.uTex); gl.uniform2f(P_BLUR.u.uDir,0,1/bl1.h); gl.bindFramebuffer(gl.FRAMEBUFFER,bl1.f); draw();
}
const still=matchMedia("(prefers-reduced-motion:reduce)").matches || !!CFG.still;
let walkAmt=0;
function display(src,t){
  const u=P_CAM.u; gl.useProgram(P_CAM.p);
  bindTex(0,src.t,u.uTex); bindTex(1,bl1.t,u.uBloom);
  gl.uniform2f(u.uSrcRes,src.w,src.h); gl.uniform2f(u.uOutRes,canvas.width,canvas.height);
  gl.uniform1f(u.uExp,exposure); gl.uniform1f(u.uTime,still?0:t); gl.uniform1f(u.uSoft,0);
  gl.uniform1f(u.uGain,Math.min(2.2,1+.28*Math.max(0,Math.log2(exposure))));   // gain élevé = davantage de bruit capteur
  if(still) gl.uniform3f(u.uShake,0,0,0);                     // sinon : dérive de la main et balancement de la marche
  else gl.uniform3f(u.uShake,
    .0030*(Math.sin(t*1.31)+.6*Math.sin(t*2.9+1)+.25*Math.sin(t*7.1))+.005*walkAmt*Math.sin(walkDist*4.2),
    .0036*(Math.sin(t*1.07+2)+.5*Math.sin(t*3.3)+.25*Math.sin(t*6.3+4)),
    .0040*(Math.sin(t*.83+2)+.5*Math.sin(t*2.3))+.010*walkAmt*Math.sin(walkDist*4.2+1));
  gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,canvas.width,canvas.height); draw();
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
   0,65 par défaut : réglé à l'œil sur ref/), v3voir (mise au point : 1 ombre, 2 albédo, 3 normale, 5 carte d'ombres). */
const V3={ on:!!CFG.v3, grains:CFG.grains||(QUAL.full?2500000:700000), ombre:CFG.grainsOmbre||0, k:CFG.v3k||1.8, carte:CFG.v3carte||(QUAL.full?2048:1024),
  alpha:CFG.v3alpha||.18, max:CFG.v3max||64, detail:!!CFG.v3detail, gp:null, gb:null, sm:null, A:null, B:null, hist:null, histPose:null,
  n:0, frame:0, ms:0, msMoy:0, nImg:0, passes:{}, parts:null, semisT:null, semis:new Float32Array(4*72), maxPt:64,
  sol:{r0:.3, anneaux:96, secteurs:192, dmax:420} };
function v3Init(){
  if(V3.gp) return;
  V3.gp={ grains:prog(FS_V3GBUF,VS_V3GRAINS), sol:prog(FS_V3GBUF,VS_V3SOL), ombre:prog(FS_V3OMBRE,VS_V3GRAINS), ombrage:prog(FS_V3OMBRAGE) };
  V3.maxPt=Math.min(64,gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]||1);
  V3.semisT=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,V3.semisT); gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,1,72);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
}
function v3Cibles(){                                          // tampon G (2 textures + profondeur), carte d'ombres, accumulation
  if(!V3.gb||V3.gb.w!==W||V3.gb.h!==H){
    v3Libere(true);
    const tex=()=>{ const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t); gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,W,H);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST); return t; };
    const g={w:W,h:H,t0:tex(),t1:tex(),rb:gl.createRenderbuffer(),f:gl.createFramebuffer()};
    gl.bindRenderbuffer(gl.RENDERBUFFER,g.rb); gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,W,H);
    gl.bindFramebuffer(gl.FRAMEBUFFER,g.f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,g.t0,0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,g.t1,0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,g.rb);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) fail("Moteur v3 : tampon G incomplet.");
    V3.gb=g; V3.A=target(W,H,ACC_FMT,gl.NEAREST); V3.B=target(W,H,ACC_FMT,gl.NEAREST); V3.hist=null; V3.n=0;
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
  if(!seulementEcran&&V3.sm){ gl.deleteTexture(V3.sm.t); gl.deleteFramebuffer(V3.sm.f); V3.sm=null; }
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
  const [x,y,z]=s;
  if(ty===1){ const p=1.6; return 4*Math.PI*Math.pow((Math.pow(x*y,p)+Math.pow(x*z,p)+Math.pow(y*z,p))/3,1/p); }
  if(ty===2) return 2*Math.PI*x*2*y+2*Math.PI*x*x;
  if(ty===3) return Math.PI*x*(x+Math.hypot(x,2*y));
  if(ty===4) return 2*Math.PI*x*2*y+4*Math.PI*x*x;
  return 8*(x*y+y*z+x*z);
}
/* Objets de la fiche : poids de chaque objet (vu de la caméra : taille apparente ; vu du soleil : taille), aire de chaque
   forme. Rangés dans une petite texture lue par les grains. */
function v3Semis(nb,vue,p){
  const d=V3.semis; d.fill(0);
  const ws=[], ai=[]; let tot=0;
  for(let i=0;i<S.objN;i++){ const o=i*16, row=shapesData[o+4], cn=shapesData[o+5], vis=shapesData[o+7]>.5, rad=shapesData[o+3];
    let a=0; for(let j=0;j<cn;j++){ const r=(row+j)*16; a+=aireForme(shapesData[r+3],[shapesData[r+4],shapesData[r+5],shapesData[r+6]]); }
    const dd=Math.max(1,Math.hypot(shapesData[o]-p.pos[0],shapesData[o+1]-p.pos[1],shapesData[o+2]-p.pos[2])-rad*.5);
    const w=vis?(vue===0?rad*rad/(dd*dd):rad*rad):0; ws.push(w); ai.push(a||1); tot+=w; }
  let cum=0;
  for(let i=0;i<S.objN;i++){ cum+=ws[i]; d[i*4]=tot>0?cum/tot:0; d[i*4+1]=tot>0?nb*(ws[i]/tot)/ai[i]:0;
    const o=i*16, row=shapesData[o+4], cn=shapesData[o+5]; let c=0;
    for(let j=0;j<cn;j++){ const r=(row+j)*16, a=aireForme(shapesData[r+3],[shapesData[r+4],shapesData[r+5],shapesData[r+6]]); c+=a;
      d[(row+j)*4]=c/ai[i]; d[(row+j)*4+1]=a; } }
  if(tot<=0) for(let i=0;i<S.objN;i++) d[i*4]=0;
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,V3.semisT); gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,1,72,gl.RGBA,gl.FLOAT,d);
  return tot>0;
}
/* Partage du budget entre les familles, au prorata de la surface apparente qu'elles demandent (aire de l'objet / aire de
   sa cellule) : le recouvrement de l'écran reste le même pour toutes. Les grains tombés dans une cellule vide sont perdus :
   un monde plus dense en perd moins, il ne coûte pas plus. */
function v3Partage(N,vue,p){
  const tr=S.kit===0&&S.kitP[0]>0, pe=tr&&S.houp[3]>0, bl=S.kitP[1]>0;
  const w=[tr?6.8/36:0, pe?.95/10.9:0, bl?3.4/72.25:0];
  const fF=vue===0&&S.kit===0&&S.kitP[2]>0?.28:0;
  const ob=S.objN>0&&v3Semis(1,vue,p), fP=ob?(vue===0?.12:.1):0;
  const sw=w[0]+w[1]+w[2], solide=N*(1-fF-fP);
  const nA=sw>0?Math.round(solide*w[0]/sw):0, nB=sw>0?Math.round(solide*w[1]/sw):0, nR=sw>0?Math.round(solide*w[2]/sw):0;
  const nF=Math.round(N*fF), nP=ob?Math.round(N*fP):0;
  if(ob) v3Semis(nP,vue,p);
  if(vue===1){ const traits=Math.round(nB*.35);               // vue du soleil : les perches en traits (voir semeBTrait)
    return {nA,nB:0,nR,nF,nP,traits,part:[nA,nA,nA+nR,nA+nR+nF],total:nA+nR+nF+nP}; }
  return {nA,nB,nR,nF,nP,traits:0,part:[nA,nA+nB,nA+nB+nR,nA+nB+nR+nF],total:nA+nB+nR+nF+nP};
}
function v3Monde(u,w,h,p){                                    // uniformes de monde.glsl (mêmes valeurs que common())
  gl.uniform2f(u.uRes||null,w,h); gl.uniform3fv(u.uCamPos||null,p.pos); gl.uniformMatrix3fv(u.uCam||null,false,p.mat);
  gl.uniform1f(u.uFish||null,1.09/(.5*Math.max(1,w/h))); gl.uniform1f(u.uFog||null,S.fog); gl.uniform3fv(u.uSeed||null,seed);
  gl.uniform3fv(u.uSunDir||null,S.sunDir); gl.uniform3fv(u.uSun||null,S.sun); gl.uniform3fv(u.uSky||null,S.sky); gl.uniform1f(u.uTorch||null,S.torch);
  gl.uniform1i(u.uKit||null,S.kit); gl.uniform4fv(u.uKitP||null,S.kitP); gl.uniform1i(u.uMode||null,0);
  gl.uniform2fv(u.uCan||null,S.can); gl.uniform4fv(u.uHoup||null,S.houp);
  gl.uniform4fv(u.uLoin||null,S.loin); gl.uniform3fv(u.uLoinCol||null,S.loinCol); gl.uniform3fv(u.uLoinBas||null,S.loinBas);
  if(u.uShapes) bindTex(3,shapesT,u.uShapes); gl.uniform1i(u.uObjN||null,S.objN);
  if(u.uMats){ bindTex(4,matT,u.uMats); gl.uniform4iv(u.uSurf,S.surf); gl.uniform4iv(u.uSurfT,S.surfT); gl.uniform2fv(u.uSurfP,S.surfP); }
  gl.uniform4fv(u.uRel||null,S.rel); gl.uniform4fv(u.uTraj||null,S.traj); gl.uniform4fv(u.uCreux||null,S.creux);   // relief et trajet de la fiche
  gl.uniform1i(u.uSemN||null,0); gl.uniform1f(u.uNuit||null,S.lum);              // le semeur ne sème pas encore les couches de semis
}
const px3=new Float32Array(4);
/* Attendre la fin du calcul graphique d'UNE cible : sur une puce à tuiles (Mali), lire un pixel ne force que la cible lue.
   Lire une autre cible (comme le faisait la première version) ne mesure rien : le vrai travail se cachait jusqu'à l'affichage. */
const u8s=new Uint8Array(4);
function v3Sync(t){
  if(t===null){ gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,u8s); return; }
  gl.bindFramebuffer(gl.FRAMEBUFFER,(t||dummy).f); gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,px3);
}
function v3Image(p){
  v3Init(); v3Cibles();
  const G=V3.gp, f=++V3.frame, bouge=V3.n===0, t0=performance.now(); let tp=t0;
  const chrono=(nom,cible)=>{ if(!V3.detail) return; if(cible) v3Sync(cible); const t=performance.now(); V3.passes[nom]=(V3.passes[nom]||0)*.8+(t-tp)*.2; tp=t; };
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
  const Ns=V3.ombre||Math.round(V3.grains*.6);
  let u=G.ombre.u; gl.useProgram(G.ombre.p); v3Monde(u,W,H,p);
  const ps=v3Partage(Ns,1,p);
  gl.uniform1ui(u.uFrame,f*2+1); gl.uniform1i(u.uVue,1); gl.uniform4iv(u.uPart,ps.part); gl.uniform1i(u.uTotal,ps.total);
  gl.uniform4f(u.uAz,az.cap,az.demi,dmin,L); gl.uniform3fv(u.uZone,zone); gl.uniform4f(u.uNb,ps.nA,ps.nB,ps.nR,ps.nF);
  gl.uniform1f(u.uK,V3.k); gl.uniform1f(u.uMaxPt,V3.maxPt); gl.uniform2f(u.uFeuil||null,70,W*H);
  gl.uniform3fv(u.uSoleilC,C); gl.uniformMatrix3fv(u.uSoleilM,false,soleilM); gl.uniform4fv(u.uSoleilE,soleilE); gl.uniform3fv(u.uSd,sd);
  gl.uniform2f(u.uJit||null,0,0); bindTex(5,V3.semisT,u.uSemis);
  gl.bindFramebuffer(gl.FRAMEBUFFER,V3.sm.f); gl.viewport(0,0,V3.sm.w,V3.sm.h);
  gl.clearBufferfv(gl.DEPTH,0,[1]); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
  gl.uniform1i(u.uTrait,0);
  if(ps.total>0) gl.drawArrays(gl.POINTS,0,ps.total);
  if(ps.traits>0){ gl.uniform1i(u.uTrait,1); gl.uniform4f(u.uNb,ps.nA,ps.traits,ps.nR,ps.nF); gl.drawArrays(gl.LINES,0,2*ps.traits); }
  chrono("ombre");                                            // carte de profondeur : illisible, son coût retombe sur la passe qui la consulte
  // (2) tampon G : le sol, puis les grains
  const g=V3.gb; gl.bindFramebuffer(gl.FRAMEBUFFER,g.f); gl.viewport(0,0,W,H);
  gl.clearBufferfv(gl.COLOR,0,[0,0,0,-1]); gl.clearBufferfv(gl.COLOR,1,[0,1,0,1e4]); gl.clearBufferfv(gl.DEPTH,0,[1]);
  const jc=[jit[0]*2/W,jit[1]*2/H], so=V3.sol, nSol=so.anneaux*so.secteurs*6;
  u=G.sol.u; gl.useProgram(G.sol.p); v3Monde(u,W,H,p); gl.uniform2fv(u.uJit,jc);
  gl.uniform4f(u.uSolP,so.r0,Math.log(so.dmax/so.r0)/so.anneaux,so.anneaux,so.secteurs); gl.uniform1i(u.uPts,0);
  gl.drawArrays(gl.TRIANGLES,0,nSol);
  const pc=v3Partage(V3.grains,0,p); V3.parts=pc;
  u=G.grains.u; gl.useProgram(G.grains.p); v3Monde(u,W,H,p);
  gl.uniform1ui(u.uFrame,f*2); gl.uniform1i(u.uVue,0); gl.uniform4iv(u.uPart,pc.part); gl.uniform1i(u.uTotal,pc.total);
  gl.uniform4f(u.uAz,az.cap,az.demi,dmin,L); gl.uniform1f(u.uAzPres,az.pres); gl.uniform3fv(u.uZone,zone); gl.uniform4f(u.uNb,pc.nA,pc.nB,pc.nR,pc.nF);
  gl.uniform1f(u.uK,V3.k); gl.uniform1f(u.uMaxPt,V3.maxPt); gl.uniform2f(u.uFeuil,70,W*H);
  gl.uniform3fv(u.uSoleilC,C); gl.uniformMatrix3fv(u.uSoleilM,false,soleilM); gl.uniform4fv(u.uSoleilE,soleilE); gl.uniform3fv(u.uSd,sd);
  gl.uniform2fv(u.uJit,jc); gl.uniform1i(u.uPts,1); gl.uniform1i(u.uTrait,0); bindTex(5,V3.semisT,u.uSemis);
  { const cap=Math.atan2(fwd[0],fwd[1]), q=Math.PI/4;       // ancre des feuilles : la position arrondie à 4 m, le cap arrondi à 45°
    gl.uniform4f(u.uAncre||null,Math.round(p.pos[0]/4)*4,Math.round(p.pos[2]/4)*4,bouge&&!CFG.v3libre?1:0,Math.round(cap/q)*q); }
  if(pc.total>0) gl.drawArrays(gl.POINTS,0,pc.total);
  gl.disable(gl.DEPTH_TEST);
  chrono("tamponG",g);
  // (3) matière, lumière, ciel, accumulation
  const dst=V3.hist===V3.A?V3.B:V3.A;
  u=G.ombrage.u; gl.useProgram(G.ombrage.p); v3Monde(u,W,H,p);
  bindTex(0,g.t0,u.uG0); bindTex(1,g.t1,u.uG1); bindTex(2,V3.sm.t,u.uOmbre); bindTex(6,(V3.hist||dummy).t,u.uPrev);
  gl.uniform1ui(u.uFrame,f); gl.uniform2fv(u.uJitPx,jit);
  gl.uniform3fv(u.uSoleilC,C); gl.uniformMatrix3fv(u.uSoleilM,false,soleilM); gl.uniform4fv(u.uSoleilE,soleilE); gl.uniform3fv(u.uSd,sd);
  const occ=S.kit===0?(S.kitP[0]>0?S.kitP[0]/36*.5:0)+(S.houp[3]>0?S.kitP[0]*.8*S.houp[3]/10.9*.14:0):0;   // troncs par mètre : densité × diamètre
  gl.uniform1f(u.uOccT,occ); gl.uniform1i(u.uVoir,CFG.v3voir|0); gl.uniform1f(u.uPcf,CFG.v3pcf!==undefined?CFG.v3pcf:1); gl.uniform1f(u.uAmb,CFG.v3amb||.65);   // flou de lecture de la carte, en texels
  const alpha=!V3.hist?1:bouge?V3.alpha:1/(V3.n+1);
  gl.uniform1f(u.uAlpha,alpha); gl.uniform1i(u.uReproj,bouge?1:0);
  if(V3.hist){ gl.uniform3fv(u.uPrevPos,V3.histPose.pos); gl.uniformMatrix3fv(u.uPrevCam,false,V3.histPose.mat); }
  gl.bindFramebuffer(gl.FRAMEBUFFER,dst.f); gl.viewport(0,0,W,H); draw();
  chrono("ombrage",dst);
  v3Sync();                                                   // force la fin du calcul : le temps mesuré est le vrai temps GPU
  V3.ms=performance.now()-t0; V3.msMoy=V3.nImg?V3.msMoy*.8+V3.ms*.2:V3.ms; V3.nImg++;
  V3.hist=dst; V3.histPose=p; V3.n++;
}
function v3Frame(p,dt){
  if(sceneDirty||!V3.hist||!samePose(p,V3.histPose)){ V3.n=0; sceneDirty=false; }
  else if(V3.n>=V3.max) return;                               // image posée : on ne recalcule plus
  v3Image(p); frames++;
  if(bench&&walking) bench.push({dt:dt*1000,ms:V3.ms,lvl:-1,grains:V3.parts?V3.parts.total:0,t:performance.now()});
  postFX(V3.hist);
}
function qualite(full){                                        // bascule mobile / complète : tout se réalloue à la nouvelle taille
  QUAL.full=!!full; try{ localStorage.setItem("bodycam-qualite",full?"1":"0"); }catch(_){}
  if(!CFG.grains) V3.grains=full?2500000:700000;
  if(!CFG.v3carte) V3.carte=full?2048:1024;
  v3Libere(false); resize(); sceneDirty=true;
  $("qualite").textContent="Qualité : "+(full?"complète":"mobile"); $("qualite").setAttribute("aria-pressed",String(!!full));
}
function v3Basculer(on){
  if(on&&v3Refus()) on=false;                                  // fiche que le semeur ne sait pas rendre : on reste sur le lanceur de rayons
  if(on&&V2.on) v2Basculer(false);
  V3.on=on; V3.repli=false; v3Bouton();
  if(on){ v3Init(); V3.hist=null; V3.n=0; } else { hist=null; v3Libere(false); }
}
/* Ce que le semeur ne sait pas encore rendre (liste tenue dans docs/moteur-v3.md). Rend la raison, ou "" si la fiche est rendue. */
function v3Refus(){
  if(S.semN>0) return "semis";
  if(S.kit===1) return "dunes";
  if(S.kit===2) return "monde nu";
  const eg=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-6);
  if(!eg(S.rel,[1,1,0,0])||!eg(S.traj,[1,.85,.3,.5])||!eg(S.creux,[.10,1.8,.4,0])) return "relief ou trajet réglé";
  if(S.nuit||S.torch>0) return "nuit, lampe";
  if(S.houp[0]>.5) return "conifères en cône";
  if(S.eau&&S.eau[3]>0) return "eau à l'horizon";
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
let lastT=0, vide=null, bench=null, prof=null, profTexte="", lastMotionMs=0; const startT=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(.1,(now-lastT)/1000), dtBrut=now-lastT; lastT=now;
  if(vide){ vide.push(dtBrut); return; }                         // mesure de la cadence que la page obtient sans rien calculer
  // Profil (bouton Mesurer) : chaque étape est suivie d'une lecture qui attend la fin du calcul graphique, pour savoir où part le temps.
  const pf=prof?{dt:dtBrut}:null; let pt=performance.now(); const etape=(k,cible)=>{ if(!pf) return; if(cible!==undefined) v3Sync(cible); const t=performance.now(); pf[k]=t-pt; pt=t; };
  simulate(dt); etape("sim");
  walkAmt+=((walking?1:0)-walkAmt)*(1-Math.exp(-dt/.2));
  const p=pose(); lastPose=p;
  const v2pret=V2.on&&!sceneDirty&&V2.panos.some(o=>o.t);         // tant qu'aucun panoramique n'est tourné, on garde l'image du moteur actuel : jamais d'écran noir
  if(V2.on&&!v2pret){ if(sceneDirty) v2Vider(); v2Tourner(V2.budget); }
  if(v2pret) v2Frame(p,dt);
  else if(V3.on) v3Frame(p,dt);
  else if(!hist || sceneDirty || !samePose(p,histPose)){ motionFrame(p); postFX(hist); if(bench&&walking) bench.push({dt:dt*1000,ms:lastMotionMs,lvl:mLevel}); }
  else if(n<MAXS){
    const t0=performance.now(); let done=false;
    do{ done=staticRows(p); } while(!done && performance.now()-t0<20);
    if(done && (n<14||n%4===0)) postFX(hist);
  }
  etape("rendu",v2pret?V2.out||hist:V3.on?V3.hist||hist:hist);
  exposure+=(expTarget-exposure)*(1-Math.exp(-dt/.45));
  display(v2pret?V2.out||hist:V3.on?V3.hist||dummy:hist,(now-startT)/1000);
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
  $("stat").textContent=V3.on?"V3 · "+Math.round((V3.parts?V3.parts.total:V3.grains)/1000)+" K GRAINS · "+Math.round(V3.msMoy)+" MS":V2.on?"V2 · "+V2.panos.filter(o=>o.n>=V2.passes).length+" PANOS"+(V2.cur?" · TOURNAGE "+Math.round(100*(V2.cur.n+V2.row/V2.ph)/V2.passes)+" %":"")
    :frozen?"FIGÉ · "+n+" PASSES":walking?"EN MARCHE":n>=MAXS?"NET":n+" PASSES";
  window.__state={n:CFG.auto?frames:V2.on?v2Prets():V3.on?V3.n:n,
    v3:V3.on?{ms:+V3.ms.toFixed(1),msMoy:+V3.msMoy.toFixed(1),images:V3.nImg,grains:V3.parts,grainsOmbre:V3.ombre||Math.round(V3.grains*.6),passes:Object.fromEntries(Object.entries(V3.passes).map(([k,v])=>[k,+v.toFixed(1)]))}:undefined,
    v2:V2.on?{msProj:+V2.msProj.toFixed(1),msProjMoy:+V2.msProjAvg.toFixed(1),points:V2.pts,dessines:V2.dessines,faits:V2.faits.slice(),msParLigne:+V2.msPerRow.toFixed(2)}:undefined,W,H,mLevel,msMotion:+msMotion.toFixed(1),msImage:+lastMotionMs.toFixed(1),msPerRow,exposure,x:cam.x,z:cam.z,file:queue.length,kit:S.kit,titre:fiche.titre,nuit:S.nuit,fog:S.fog,kitP:S.kitP.slice()};
}

/* ------------------------------------------------------------------ commandes directes */
$("lieu").onclick=()=>{ ficheIdx=(ficheIdx+1)%FICHES.length; applyFiche(FICHES[ficheIdx]); say(fiche.titre||"",true); };
let dragId=null, px=0, py=0;
canvas.addEventListener("pointerdown",e=>{ dragId=e.pointerId; px=e.clientX; py=e.clientY; canvas.setPointerCapture(e.pointerId); canvas.classList.add("drag"); });
canvas.addEventListener("pointermove",e=>{ if(e.pointerId!==dragId) return;
  const k=3.4/Math.min(canvas.clientWidth,canvas.clientHeight);   // un glissé sur la largeur de l'écran = un demi-tour
  if(gyro.on) gyro.off-=(e.clientX-px)*k;                 // téléphone-caméra : le glisser ne fait que recaler le cap
  else { look.yaw-=(e.clientX-px)*k; look.pitch=Math.max(-1.3,Math.min(1.4,look.pitch+(e.clientY-py)*k)); }
  px=e.clientX; py=e.clientY; $("hint").classList.add("off"); });
const endDrag=e=>{ if(e.pointerId===dragId){ dragId=null; canvas.classList.remove("drag"); } };
canvas.addEventListener("pointerup",endDrag); canvas.addEventListener("pointercancel",endDrag);
addEventListener("keydown",e=>{ if(e.target.tagName==="INPUT") return;
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
function say(text,bref){ const el=$("pensee"); el.textContent=text; el.classList.toggle("on",!!text);
  clearTimeout(sayTimer); if(text) sayTimer=setTimeout(()=>el.classList.remove("on"),bref?3500:9000); }
function perception(){
  const ahead=[1.5,3,5].map(d=>{ const x=cam.x+Math.sin(cam.yaw)*d, z=cam.z+Math.cos(cam.yaw)*d; return probe(x,terrainH(x,z)+.75,z)[0]; });
  return { lieu:fiche.titre, inspiration:fiche.inspiration, kit:fiche.kit,
    position:{x:+cam.x.toFixed(1),z:+cam.z.toFixed(1)}, cap_degres:Math.round(((cam.yaw*180/Math.PI)%360+360)%360),
    sur_le_sentier:S.kit!==1?Math.abs(cam.x-pathX(cam.z))<1.3:null,
    obstacle_devant_m:ahead[0]<.5?1.5:ahead[1]<.5?3:ahead[2]<.5?5:null,
    lumiere:S.nuit?"nuit":"jour", lampe:S.torch>0, brume:S.fog };
}
const clampN=(v,a,b,d)=>{ v=Number(v); return Number.isFinite(v)?Math.min(b,Math.max(a,v)):d; };
function enqueue(actions){
  for(const a of (Array.isArray(actions)?actions:[]).slice(0,6)){
    if(!a||typeof a!=="object") continue;
    if(a.type==="tourner") queue.push({type:"tourner",rest:clampN(a.degres,-180,180,0)*Math.PI/180});
    else if(a.type==="marcher") queue.push({type:"marcher",rest:clampN(a.metres,-10,30,0)});
    else if(a.type==="regarder") queue.push({type:"regarder",pitch:clampN(a.degres,-60,75,0)*Math.PI/180});
    else if(a.type==="attendre") queue.push({type:"attendre",rest:clampN(a.secondes,0,5,1)});
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
  patchScene(rep.scene); enqueue(rep.actions); say(pensee);
}

/* ------------------------------------------------------------------ décrire un monde
   Le joueur décrit un lieu, à la voix ou au clavier. Claude écrit une fiche de lieu ; le moteur la borne et la fabrique.
   Sans Claude, quelques mots-clés suffisent à composer une fiche. */
const HEX=/^#[0-9a-f]{6}$/i, NOM=/^[a-z0-9_-]{1,30}$/;
function validerForme(x){                                     // une forme d'objet ou d'élément de semis, bornée
  const num3=(v,d)=>Array.isArray(v)?[0,1,2].map(i=>clampN(v[i],-40,40,d)):[d,d,d];
  return {f:x.f,p:num3(x.p,0),taille:num3(x.taille,1),cap:clampN(x.cap,-360,360,0),
    penche:Array.isArray(x.penche)?[clampN(x.penche[0],-90,90,0),clampN(x.penche[1],-90,90,0)]:[0,0],
    couleur:x.couleur==="palette"||(typeof x.couleur==="string"&&HEX.test(x.couleur))?x.couleur:"#777777",
    matiere:MATIERES[x.matiere]!==undefined||(typeof x.matiere==="string"&&NOM.test(x.matiere))?x.matiere:"mat", lisse:clampN(x.lisse,0,.5,0), arrondi:clampN(x.arrondi,0,.3,0)};
}
function validerSemis(L){                                     // couches de semis : 4 au plus, 6 formes par élément, tout borné
  return (Array.isArray(L)?L:[]).filter(isObj).slice(0,4).map((c,i)=>{
    const formes=(Array.isArray(c.formes)?c.formes:[]).filter(x=>x&&FORMES[x.f]!==undefined).slice(0,6).map(validerForme);
    if(!formes.length) return null;
    const tr=isObj(c.trajet)?c.trajet:{}, cel=Array.isArray(c.cellule)?c.cellule:[c.cellule,c.cellule], pair=(v,a,b,d)=>Array.isArray(v)?[clampN(v[0],a,b,d),clampN(v[1],a,b,d)]:[d,d];
    const o={ id:String(c.id||"semis"+i).slice(0,30), nom:String(c.nom||"").slice(0,60),
      cellule:[clampN(cel[0],1.5,30,6),clampN(cel[1]!==undefined?cel[1]:cel[0],1.5,30,6)], rotation:clampN(c.rotation,-180,180,0),
      densite:clampN(c.densite,0,1,.6), groupes:clampN(c.groupes,0,1,0), groupes_echelle:clampN(c.groupes_echelle,5,400,40),
      trajet:{ rangee:tr.rangee===true, cote:["gauche","droite"].includes(tr.cote)?tr.cote:"deux" },
      oriente:ORIENTS[c.oriente]!==undefined?c.oriente:undefined, cap:clampN(c.cap,-360,360,0), tourne:clampN(c.tourne,0,360,0),
      echelle:pair(c.echelle,.2,4,1), hauteur:pair(c.hauteur,.3,3,1), penche:clampN(c.penche,0,25,0), teinte:clampN(c.teinte,0,1,0), desordre:clampN(c.desordre,0,1,1),
      pose:c.pose==="pente"?"pente":undefined, formes };
    if(tr.min!==undefined) o.trajet.min=clampN(tr.min,0,200,0);
    if(tr.max!==undefined) o.trajet.max=clampN(tr.max,0,400,400);
    const pal=(Array.isArray(c.palette)?c.palette:[]).filter(x=>typeof x==="string"&&HEX.test(x)).slice(0,8); if(pal.length) o.palette=pal;
    return o;
  }).filter(Boolean);
}
function validerFiche(f){                                     // ne garde que ce que le moteur sait lire, dans ses plages
  const kit=f.kit==="dunes"?"dunes":f.kit==="foret"?"foret":f.kit==="nu"||Array.isArray(f.semis)?"nu":"foret", a=f.ambiance||{}, so=a.soleil||{};
  const out={ version:0, id:"monde-"+Date.now(), titre:String(f.titre||"Monde sans nom").slice(0,80), inspiration:String(f.inspiration||"").slice(0,200),
    graine:Math.round(clampN(f.graine,1,99999,1000+Math.floor(Math.random()*9000))), kit,
    ambiance:{ saison:["ete","automne","hiver"].includes(a.saison)?a.saison:"automne", meteo:a.meteo==="voile"?"voile":"clair",
      soleil:{azimut:clampN(so.azimut,-180,180,-33),hauteur:clampN(so.hauteur,-10,70,21)}, brume:clampN(a.brume,0,.06,.011) },
    camera:{ profil:"bodycam-poitrine", hauteur:clampN(f.camera&&f.camera.hauteur,.9,1.9,1.36), champ:125 },
    note:String(f.note||"").slice(0,180) };
  if(typeof a.lampe==="boolean") out.ambiance.lampe=a.lampe;
  if(kit==="foret"){ const fo=f.foret||{}; out.foret={densite:clampN(fo.densite,0,1,.7),rochers:clampN(fo.rochers,0,1.5,1),feuillage:clampN(fo.feuillage,0,1.5,1)};
    if(fo.houppier==="cone"){ out.foret.houppier="cone"; out.foret.houppier_bas=clampN(fo.houppier_bas,.3,8,1.6); out.foret.houppier_rayon=clampN(fo.houppier_rayon,.8,3.2,2.5); }
    if(fo.perches!==undefined) out.foret.perches=clampN(fo.perches,0,1,1); }
  else if(kit==="dunes") out.dunes={rochers:clampN(f.dunes&&f.dunes.rochers,0,1.5,0)};
  if(kit!=="dunes"){                                          // relief et trajet réglables (forêt et monde nu)
    const re=isObj(f.relief)?f.relief:null, tr=isObj(f.trajet)?f.trajet:null;
    if(re){ out.relief={amplitude:clampN(re.amplitude,0,12,kit==="nu"?.8:1.5),echelle:clampN(re.echelle,20,600,150),pente:clampN(re.pente,-.35,.35,0)};
      if(typeof re.niveler==="boolean") out.relief.niveler=re.niveler; }
    if(tr) out.trajet={sinuosite:clampN(tr.sinuosite,0,2,1),largeur:clampN(tr.largeur,.6,30,1.7),creux:clampN(tr.creux,0,.4,.1),bord:tr.bord==="net"?"net":"irregulier"};
  }
  const sem=validerSemis(f.semis); if(sem.length) out.semis=sem;
  const obj=(Array.isArray(f.objets)?f.objets:[]).slice(0,8).map((o,i)=>o&&Array.isArray(o.formes)?{
    id:String(o.id||"objet"+i).slice(0,30), nom:String(o.nom||"").slice(0,60), devant:clampN(o.devant,2,90,12), cote:clampN(o.cote,-20,20,3),
    cap:o.cap===undefined?undefined:clampN(o.cap,-360,360,0), echelle:clampN(o.echelle,.1,5,1), degage:clampN(o.degage,0,12,0), visible:o.visible!==false,
    formes:o.formes.filter(x=>x&&FORMES[x.f]!==undefined).slice(0,24).map(validerForme)}:null).filter(o=>o&&o.formes.length);
  if(obj.length) out.objets=obj;
  if(isObj(f.lointain)&&clampN(f.lointain.hauteur,0,40,0)>0){ const l=f.lointain; out.lointain={hauteur:clampN(l.hauteur,0,40,0),decoupe:clampN(l.decoupe,0,1,.5),neige:clampN(l.neige,0,1,0)};
    for(const k of ["couleur","couleur_bas"]) if(typeof l[k]==="string"&&HEX.test(l[k])) out.lointain[k]=l[k];
    if(l.eau===true||(typeof l.eau==="string"&&HEX.test(l.eau))) out.lointain.eau=l.eau; }
  const mats=validerRecettes(f.matieres); if(mats) out.matieres=mats;
  if(isObj(f.surfaces)){ const s={}, fs=f.surfaces, nom=v=>typeof v==="string"&&NOM.test(v)?v:undefined;
    for(const k of ["sol","trajet","rochers"]) if(nom(fs[k])) s[k]=nom(fs[k]);
    for(const k of ["arbres","perches"]) if(isObj(fs[k])) s[k]={a:nom(fs[k].a),b:nom(fs[k].b),part:clampN(fs[k].part,0,1,.5)};
    out.surfaces=s; }
  const h=f.histoire;
  if(h&&typeof h==="object"&&h.pitch) out.histoire={ pitch:String(h.pitch).slice(0,400),
    temps:(Array.isArray(h.temps)?h.temps:[]).slice(0,4).filter(t=>t&&t.id).map(t=>({id:String(t.id).slice(0,30),quand:String(t.quand||"").slice(0,160),
      ce_qui_se_passe:String(t.ce_qui_se_passe||"").slice(0,200),scene:t.scene&&typeof t.scene==="object"?t.scene:undefined})) };
  return out;
}
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
  const bati=/\bville|\brue|avenue|boulevard|quartier|immeuble|centre-ville|san francisco|new york|\bvillage|hameau|bourg|cimetiere/.test(t);
  if(bati) return mondeBati(texte,t);
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
  f.note="Sans Claude, je ne lis que des mots-clés : désert, nuit, matin, soir, brume, saison, dense, rochers, ville, rue, village, cimetière. Les objets demandent Claude.";
  return f;
}
function mondeBati(texte,t){                                  // ville, rue, village, cimetière : un monde nu composé de semis
  const nuit=/nuit|minuit|nocturne|obscur/.test(t), soir=/soir|couch|crepuscule|apres-midi/.test(t);
  const f={ titre:texte.charAt(0).toUpperCase()+texte.slice(1,70), inspiration:texte, kit:"nu",
    ambiance:{ saison:/hiver|neige/.test(t)?"hiver":"ete", meteo:/gris|couvert|pluie|brume|brouillard/.test(t)?"voile":"clair",
      soleil:nuit?{azimut:120,hauteur:-10}:soir?{azimut:-110,hauteur:9}:{azimut:-40,hauteur:30}, brume:/brouillard|brume/.test(t)?.03:.008 },
    matieres:{ "lex-facade":LEX.facade }, semis:[] };
  const pente=/colline|pente|san francisco|montee|butte/.test(t);
  if(/cimetiere/.test(t)){
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
async function creerMonde(texte){
  say("Je fabrique ce monde…");
  let f=null;
  if(sampler){
    const consigne=`Tu écris la fiche de lieu d'un moteur de rendu qui filme un monde généré par code, en vue caméra-piéton (téléphone fatigué, crédibilité avant beauté). Le joueur décrit le lieu qu'il veut. Le moteur ne connaît aucun type de lieu : tu COMPOSES le lieu avec un vocabulaire générique (relief, trajet, sols, semis d'éléments répétés, objets uniques, horizon, lumière).
Réponds uniquement par un objet JSON :
{"titre": "court", "inspiration": "le lieu de référence en une phrase", "graine": 1..99999,
 "kit": "nu" (tout vient de la fiche ; à choisir pour tout ce qui n'est pas une forêt tempérée ou un désert) | "foret" (pins, chênes, grès, canopée en dur) | "dunes",
 "foret": {"densite": 0..1, "rochers": 0..1.5, "feuillage": 0..1.5, "houppier": "voute"|"cone", "perches": 0..1}, "dunes": {"rochers": 0..1.5},
 "relief": {"amplitude": 0..12 m (0 plat, 1 forêt, 3 à 6 collines), "echelle": 20..600 m (longueur d'onde), "pente": -0.35..0.35 (le long du trajet ; 0.28 = rue de San Francisco), "niveler": true (le trajet reste de niveau en travers)},
 "trajet": {"sinuosite": 0..2 (0 rue droite, 1 sentier), "largeur": 0.6..30 m, "creux": 0..0.4 m (0.15 = trottoir), "bord": "net"|"irregulier"},
 "surfaces": {"sol": "recette", "trajet": "recette"},
 "matieres": {"nom": {"base": "recette existante", "couleur": "#rrggbb" ou "forme", ...}},
 "semis": [ ... jusqu'à 4 couches ... ],
 "objets": [{"id", "nom", "devant": 2..90, "cote": -20..20, "cap", "degage": 0..12, "visible": true, "formes": [ ... 24 au plus ... ]}],
 "lointain": {"hauteur": 0..40 degrés, "decoupe": 0..1, "neige": 0..1, "couleur", "couleur_bas", "eau": "#rrggbb" (mer, baie ou lac sous l'horizon)},
 "ambiance": {"saison": "ete"|"automne"|"hiver", "meteo": "clair"|"voile", "soleil": {"azimut": -180..180, "hauteur": -10..70}, "lampe": true|false, "brume": 0..0.06},
 "histoire": {"pitch": "deux phrases", "temps": [{"id", "quand", "ce_qui_se_passe", "scene": {"brume", "lampe", "soleil", "montrer": ["id"], "cacher": ["id"]}}]},
 "note": "une phrase, seulement si une partie de la demande ne peut pas être montrée"}
FORMES (objets et semis) : {"f": "boite"|"boule"|"cylindre"|"cone"|"capsule"|"toit", "p": [x, y, z] centre en mètres, "taille": [largeur, hauteur, profondeur] (cylindre, cône, capsule : [diamètre, hauteur, diamètre], debout ; toit : [longueur du faîtage, hauteur, largeur]), "cap": degrés, "penche": [autour de x, autour de z] (roue : [90, 0]), "couleur": "#rrggbb" ou "palette", "matiere": "mat"|"bois"|"pierre"|"metal"|"verre"|"tissu"|"tuile"|"lumineux" ou un nom de recette, "lisse": 0..0.5, "arrondi": 0..0.3}. Repère : y = 0 au sol (une boîte posée au sol descend d'elle-même sous terre sur une pente), +z = face avant. Portes, fenêtres isolées : boîtes minces 2 cm devant le mur.
SEMIS : une couche répète un ÉLÉMENT (6 formes au plus) sur une grille, un élément par cellule ; c'est ainsi qu'on fait une rue d'immeubles, des voitures garées, des réverbères, des tombes, des arbres, des buissons, des poteaux.
 {"id", "nom", "cellule": [a, b] en mètres (1.5..30), "densite": 0..1, "groupes": 0..1 (regroupe en îlots), "groupes_echelle": m,
  "trajet": {"rangee": true, "min": m, "max": m, "cote": "deux"|"gauche"|"droite"}, "rotation": degrés (grille libre),
  "oriente": "trajet"|"aleatoire"|"fixe", "cap": degrés, "tourne": degrés d'aléa, "echelle": [min, max], "hauteur": [min, max] (étire en hauteur), "penche": 0..25, "teinte": 0..1, "desordre": 0..1, "pose": "pente" (l'élément suit le sol : voitures),
  "palette": ["#rrggbb", ... 8 au plus] (chaque élément tire une couleur ; une forme y puise avec "couleur": "palette"), "formes": [ ... ]}
 Rangée ("rangee": true) : la grille suit le trajet ; "cellule" = [longueur le long du trajet, profondeur] ; la rangée commence à "min" mètres de l'axe et l'élément fait face au trajet : son +z regarde le trajet, son x court le long du trajet, son centre est au milieu de la cellule. Pour des immeubles mitoyens : longueur de cellule = largeur de façade, le moteur laisse 16 cm entre deux. Sans "rangee" : grille libre (forêt, buissons, tombes), "min"/"max" = écart permis à l'axe (par défaut, hors du trajet).
 L'élément doit tenir dans sa cellule (marge 8 cm) : sinon le moteur le réduit. Mets-le donc à l'échelle de la cellule.
SOLS ET MATIÈRES : recettes prêtes : ${Object.keys(MAT_LIB.recettes).join(", ")}. "chaussee" = asphalte avec axe en tirets ; "facade" = enduit percé de fenêtres sur tous les étages. Une recette se dérive avec "base" et change ce qui diffère : "couleur" ("forme" = prend la couleur de la forme, utile avec une palette), "nuance", "taches", "mousse" {force}, "salissure" {force, hauteur}, "brillance", "motif" :
 {"type": "fenetres", "largeur", "hauteur", "pas" (entre deux fenêtres), "etage", "allege", "cadre", "rdc" (hauteur d'un rez-de-chaussée à vitrines, 0 = aucun), "allumees": 0..1 (la nuit), "couleur" (vitre), "cadre_couleur", "lumiere"},
 {"type": "marquage", "axe": "simple"|"double"|"aucun", "largeur", "tiret", "intervalle", "bords" (écart des lignes de rive), "passages" (période des passages piétons, m), "couleur"},
 {"type": "planches", "couchees": true (bardage)}, {"type": "paves", "echelle": [x, y, z] (briques : [4.4, 13, 4.4])}, "feuilles", "rides", "fissures".
COMPOSER : une ville = relief + rue droite large ("largeur" 8 à 12, "creux" 0.15, "bord" "net", sol "dalles" pour les trottoirs, trajet "chaussee") + une rangée d'immeubles mitoyens face à la rue (façades en recette "fenetres", palette de couleurs) + une rangée de mobilier (réverbères, arbres d'alignement) + une rangée de voitures garées le long du trottoir + "lointain". Un village = rue étroite un peu sinueuse, maisons basses à toits, pavés. Un cimetière = grille libre de tombes, allée de gravier. Une forêt d'une autre essence = kit nu + semis d'arbres (tronc cylindre, houppier boule ou cône). Vise juste les mesures réelles (étage 3 m, voiture 4.4 × 1.8 m, réverbère 5 à 8 m).
Repères : soleil négatif = nuit (lampe du téléphone allumée), rasant entre 4 et 15 ; brume 0.003 air sec, 0.011 matin, 0.03 épais. "lumineux" éclaire faiblement (fenêtre, lanterne) ; il n'existe pas encore de vraie source de lumière ponctuelle. Couleurs ternes et salies plutôt que franches.
Le joueur dit : ${JSON.stringify(texte)}`;
    try{ f=await sampler.json(consigne,{modelTier:"default",cache:false}); }
    catch(e){ if(e&&e.code==="not_granted") sampler=null; }
  }
  if(!f||typeof f!=="object") f=mondeLexique(texte);
  f=validerFiche(f);
  FICHES.push(f); ficheIdx=FICHES.length-1; applyFiche(f);
  try{ localStorage.setItem("bodycam-mondes",JSON.stringify(FICHES.filter(x=>String(x.id).startsWith("monde-")).slice(-6))); }catch(_){}
  say(f.note?f.titre+". "+f.note:f.titre);
  return f;
}
try{ for(const f of JSON.parse(localStorage.getItem("bodycam-mondes")||"[]")) FICHES.push(validerFiche(f)); }catch(_){}

/* ------------------------------------------------------------------ panneau de parole : au clavier ou à la voix */
let mode="parler", dict=null, listening=false, dictBase="";
if(window.claude && window.claude.use) window.claude.use("dictation").then(d=>{ if(!d) return; dict=d; $("mic").hidden=false;
  d.onPartial(({text})=>{ $("msg").value=(dictBase+" "+text).trim(); });
  d.onFinal(({text})=>{ dictBase=(dictBase+" "+text).trim(); $("msg").value=dictBase; });
  d.onState(({state})=>{ listening=state==="listening"; $("mic").setAttribute("aria-pressed",String(listening)); $("mic").textContent=listening?"J'écoute":"Micro"; });
}).catch(()=>{});
function ecouter(){                                           // appelé directement depuis un clic, sans rien attendre avant
  if(!dict||listening) return;
  dictBase=$("msg").value.trim();
  dict.start().catch(e=>{ if(e&&e.code==="not_granted"){ dict=null; $("mic").hidden=true; } });
}
$("mic").onclick=()=>{ if(listening) dict.stop().catch(()=>{}); else ecouter(); };
function setFrozen(v,m){
  if(!v && listening && dict) dict.stop().catch(()=>{});
  frozen=v; mode=v?(m||"parler"):"parler"; $("dire").hidden=!v;
  $("parler").textContent=v&&mode==="parler"?"Reprendre":"Lui parler";
  $("monde").textContent=v&&mode==="monde"?"Annuler":"Décrire un monde";
  $("msg").placeholder=mode==="monde"?"Décris le monde que tu veux…":"Dis-lui quoi faire…";
  $("envoi").textContent=mode==="monde"?"Générer":"Dire";
  if(v){ $("msg").value=""; $("hint").classList.add("off"); if(!dict) setTimeout(()=>$("msg").focus(),50); }
}
$("parler").onclick=()=>{ const on=!(frozen&&mode==="parler"); setFrozen(on,"parler"); if(on) ecouter(); };
$("monde").onclick=()=>{ const on=!(frozen&&mode==="monde"); setFrozen(on,"monde"); if(on) ecouter(); };
$("dire").addEventListener("submit",async e=>{ e.preventDefault();
  if(listening && dict){ try{ await dict.stop(); }catch(_){} }
  const t=$("msg").value.trim(); if(!t) return;
  const m=mode; $("msg").value=""; $("msg").blur(); $("envoi").disabled=true;
  try{ if(m==="monde") await creerMonde(t); else await entendre(t); } finally { $("envoi").disabled=false; setFrozen(false); } });

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
/* Moteur v3 : en marche, chaque image sème le budget de grains entier ; à l'arrêt, on chronomètre aussi chaque passe. */
async function mesurerV3(f,wait,med){
  const out=$("mesure-txt"), fx=(v,d=1)=>v==null?"non mesuré":v.toFixed(d).replace(".",",");
  out.textContent="Marche mesurée. Détail des passes à l'arrêt…";
  const det=V3.detail; V3.detail=true; V3.passes={}; V3.n=0; V3.max=Math.max(V3.max,1);
  const k0=V3.nImg; while(V3.nImg<k0+12) { V3.n=0; await wait(60); }
  const pa=Object.assign({},V3.passes);
  const g0=V3.grains, essais=[];                              // le coût réel d'une image selon le budget de grains
  for(const g of [150000,300000,700000,1500000]){
    out.textContent="Coût réel avec "+Math.round(g/1000)+" k grains…";
    V3.grains=g; V3.passes={}; const k1=V3.nImg, t9=performance.now(); while(V3.nImg<k1+10 && performance.now()-t9<6000){ V3.n=0; await wait(40); }
    essais.push(Math.round(g/1000)+" k : "+fx((V3.passes.tamponG||0)+(V3.passes.ombrage||0),0)+" ms");
  }
  V3.grains=g0; V3.n=0; V3.detail=det; hold=false;
  const ms=med(f.map(x=>x.ms)), gr=V3.parts||{};
  const ips=f.length>1?(f.length-1)/((f[f.length-1].t-f[0].t)/1000):null;   // horloge réelle : dt est plafonné à 100 ms dans la boucle
  const dbg=gl.getExtension("WEBGL_debug_renderer_info"), gpu=dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):"inconnu";
  const k=v=>Math.round((v||0)/1000)+" k";
  out.textContent=[
    "MESURE · MOTEUR V3 · "+(fiche.titre||fiche.id),
    "",
    "Écran            "+canvas.width+" × "+canvas.height+" (×"+(window.devicePixelRatio||1).toFixed(2)+")",
    "Puce graphique   "+gpu,
    "",
    "EN MARCHE ("+f.length+" images)",
    "Images/seconde   "+(ips?fx(ips):"non mesuré"),
    "Résolution       "+W+" × "+H,
    "",
    "BUDGET DE GRAINS",
    "Caméra           "+k(gr.total)+" (arbres "+k(gr.nA)+", perches "+k(gr.nB)+", blocs "+k(gr.nR)+", feuilles "+k(gr.nF)+", objets "+k(gr.nP)+")",
    "Soleil           "+k(V3.ombre||V3.grains*.6)+", carte "+V3.sm.w+" × "+V3.sm.h,
    "Sol              "+V3.sol.anneaux*V3.sol.secteurs*2+" triangles",
    "",
    "PAR PASSE (à l'arrêt, attente réelle de la puce)",
    "Semis des grains "+fx(pa.tamponG,1)+" ms",
    "Ombres, matière, lumière "+fx(pa.ombrage,1)+" ms",
    "",
    "COÛT RÉEL D'UNE IMAGE SELON LE BUDGET",
    essais.join(" · "),
  ].join("\n");
  $("mesure-copier").disabled=false;
}
$("mesurer").onclick=()=>{ mesurer().then(()=>{ $("mesure-txt").textContent+="\n"+profTexte; }).catch(e=>{ hold=false; bench=null; $("mesure-txt").textContent="La mesure a échoué : "+(e&&e.message||e); }); };
$("mesure-fermer").onclick=()=>{ $("mesure").hidden=true; };
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
  for(const o of (Array.isArray(fiche.objets)?fiche.objets:[]).slice(0,8)){
    if(!o||!o.id) continue;
    const dv=clampN(o.devant,2,90,12), ct=clampN(o.cote,-20,20,3), a=1.15;           // même placement que buildShapes
    const x=S.kit!==1?pathX(dv)+ct:Math.sin(a)*dv+Math.cos(a)*ct, z=S.kit!==1?dv:Math.cos(a)*dv-Math.sin(a)*ct;
    const dx=x-cam.x, dz=z-cam.z, m=Math.hypot(dx,dz), dir=Math.atan2(dx,dz);
    const visible=!(o.visible===false||cacheObj.has(o.id)), lum=(o.formes||[]).some(f=>f&&f.matiere==="lumineux");
    const portee=lum?90:S.nuit?(S.torch>0?12:4):30;
    out.push({id:o.id, nom:o.nom||o.id, m:+m.toFixed(1), angle:Math.round(rel(dir-cam.yaw)), visible, vu:visible&&m<=portee&&Math.abs(rel(dir-yw))<=50});
  }
  return out;
}
const PATIENCE_APRES_TEMPS=45;                                 // secondes d'attente après un temps de la trame, si le joueur ne dit rien
function percevoirMeneur(){ const p=perception(), x0=S.kit!==1?pathX(0):0;
  p.avance_m=+cam.z.toFixed(1); p.depart_m=+Math.hypot(cam.x-x0,cam.z).toFixed(1); p.objets=objetsPercus(); return p; }
function executer(o){                                         // les ordres du meneur, traduits pour le moteur
  if(o.type==="pensee") say(o.texte);
  else if(o.type==="scene") patchScene(o.scene);
  else if(o.type==="actions"){ if(o.vider){ queue.length=0; patience=PATIENCE_APRES_TEMPS; } enqueue(o.actions); }   // un temps vient d'arriver : elle s'arrête et attend la voix
  else if(o.type==="pulse") $("parler").classList.toggle("pulse",!!o.on);
  else if(o.type==="figer"){ if(!frozen) setFrozen(true,"parler"); }
  else if(o.type==="arret"){ hold=true; queue.length=0; }
  else if(o.type==="fin"){ $("fin-titre").textContent=o.titre; $("fin-texte").textContent=o.replique||""; $("fin").hidden=false; setFrozen(false); }
}
function ticMeneur(){
  if(!meneur) return;
  const now=performance.now(), dt=Math.min(5,(now-meneurT)/1000); meneurT=now;
  meneur.tic(dt,percevoirMeneur(),{gel:frozen});
  if(dbgOn) dbgEl.textContent=meneur.debug();
  if(meneur.fini()) clearInterval(meneurTimer);
}
function meneurEntendre(texte){ say("…"); return meneur.voix(texte); }
function interfaceHistoire(on){
  for(const id of ["monde","lieu","mesurer","histoire","v3"]) if($(id)) $(id).hidden=on;
  if($("journal")) $("journal").hidden=!on&&!dernierJournal;
  $("hint").textContent=on?"Glisse pour regarder · « Lui parler » pour lui dire quelque chose":"Glisse pour regarder autour de lui";
  $("hint").classList.remove("off"); $("parler").classList.remove("pulse"); $("fin").hidden=true;
}
function jouerHistoire(id){
  const h=HIST.find(x=>x.id===id)||(id===undefined||id===true?HIST.find(x=>MENEUR.ficheDe(x)):null);
  if(!h){ console.warn("Histoire inconnue :",id,"— disponibles :",HIST.map(x=>x.id)); return null; }
  const v=MENEUR.validerHistoire(h,{fiches:FICHES});
  if(!v.ok){ console.warn("Histoire invalide :",v.erreurs); return null; }
  quitterHistoire(true);
  applyFiche(MENEUR.ficheDe(h,FICHES)||fiche);
  meneur=MENEUR.creerMeneur({ histoire:h, graine:CFG.graine||((Date.now()%1e9)+1), secours:t=>{ const r=lexique(t); r.compris=!/pas compris/.test(r.pensee); return r; },
    demander:(c,opt)=>sampler?sampler.json(c,opt).catch(e=>{ if(e&&e.code==="not_granted") sampler=null; throw e; }):Promise.reject(new Error("sans Claude")),
    emettre:executer });
  histoireId=h.id; hold=false; patience=10; setFrozen(false); interfaceHistoire(true);
  meneurT=performance.now(); clearInterval(meneurTimer); meneurTimer=setInterval(ticMeneur,500); ticMeneur();
  return meneur.partie();
}
function quitterHistoire(garderLieu){
  if(!meneur) return; journal(); meneur=null; clearInterval(meneurTimer); hold=false; interfaceHistoire(false); dbgEl.textContent="";
  if(!garderLieu) applyFiche(FICHES[ficheIdx]);
}
/* Pour l'auteur : une ligne discrète avec le verdict du sas et le temps en cours. CFG.debug, ou trois touches rapides
   sur le chrono REC (réglage gardé dans le navigateur) : utile dans l'artefact sur téléphone, sans console. */
let dbgOn=!!CFG.debug; try{ if(localStorage.getItem("bodycam-debug")==="1") dbgOn=true; }catch(_){}
const dbgEl=document.body.appendChild(document.createElement("div")); dbgEl.id="debug-meneur"; dbgEl.setAttribute("aria-hidden","true"); dbgEl.hidden=!dbgOn;
{ const chip=document.querySelector(".hud.top .chip"); let n=0,t=0; chip.style.pointerEvents="auto";
  chip.addEventListener("pointerdown",()=>{ const now=performance.now(); n=now-t<450?n+1:1; t=now; if(n<3) return; n=0;
    dbgOn=!dbgOn; dbgEl.hidden=!dbgOn; dbgEl.textContent=meneur&&dbgOn?meneur.debug():""; try{ localStorage.setItem("bodycam-debug",dbgOn?"1":"0"); }catch(_){} }); }
if(HIST.some(x=>MENEUR.ficheDe(x))){ const b=document.createElement("button"); b.type="button"; b.id="histoire"; b.textContent="Jouer l'histoire";
  $("monde").before(b); b.onclick=()=>jouerHistoire(); }
/* Journal de partie : ce que le joueur peut copier et envoyer. Chaque tour : ce qu'il a dit, le verdict du sas,
   la pensée, les actions, le délai de Claude ou le secours ; plus les temps et la fin. Lisible sans outil. */
let dernierJournal="";
function journal(){
  if(!meneur) return dernierJournal;
  const t=meneur.trace(), L=[], f=v=>Number(v).toFixed(1).replace(".",",");
  const dbg=gl.getExtension("WEBGL_debug_renderer_info");
  L.push("JOURNAL · "+t.histoire+" · graine "+t.graine+" · "+(sampler?"avec Claude":"SANS Claude (secours)")+" · "+(dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):"")+" · "+new Date().toISOString().slice(0,16));
  const items=[];
  for(const a of t.appels||[]){
    const dit=(String(a.consigne||"").match(/La voix dit : (".*")\s*$/)||[])[1], r=a.reponse;
    let l="["+f(a.min)+" min] "+a.type.toUpperCase()+(dit?" · joueur : "+dit:"")+" · "+a.statut+(a.ms?" en "+f(a.ms/1000)+" s":"");
    if(r&&typeof r==="object"){
      if(r.sas) l+="\n    sas : "+[r.sas.verdict,r.sas.regle,r.sas.motif].filter(Boolean).join(" · ");
      l+="\n    "+(r.attitude?"("+r.attitude+") ":"")+"« "+String(r.pensee||"").slice(0,400)+" »";
      const ac=(r.actions||[]).map(x=>x.type+" "+(x.degres??x.metres??x.secondes??"")).join(", "); if(ac) l+="\n    actions : "+ac;
      for(const k of ["temps","fin","scene","faits","question","resume"]) if(r[k]!==undefined&&r[k]!==null&&r[k]!=="") l+="\n    "+k+" : "+(typeof r[k]==="string"?r[k]:JSON.stringify(r[k])).slice(0,300);
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

/* ------------------------------------------------------------------ API : ce qu'un metteur en scène (IA ou script) peut piloter */
window.balade={
  fiches:()=>FICHES.map(f=>f.id),
  lieu(i){ ficheIdx=((i%FICHES.length)+FICHES.length)%FICHES.length; applyFiche(FICHES[ficheIdx]); },
  fiche(f){ applyFiche(f); },
  ambiance(a){ patchScene(a); },
  agir(actions){ enqueue(actions); },
  dire(texte){ return entendre(texte); },
  monde(texte){ return creerMonde(texte); },
  figer(v){ setFrozen(!!v); },
  percevoir:()=>meneur?percevoirMeneur():perception(),
  histoires:()=>HIST.map(h=>h.id),
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
if(CFG.pitch!==undefined) cam.pitch=CFG.pitch;
if(CFG.auto) enqueue(CFG.auto);
if(CFG.lookYaw) look.yaw=CFG.lookYaw;
if(V2.on){ v2Basculer(true); window.__v2=V2; }                // accès de test (tools/v2essai.mjs)
$("v2").onclick=()=>v2Basculer(!V2.on);
if(V3.on){ v3Basculer(true); window.__v3=V3; window.__v3lire=(x,y)=>{ const b=new Float32Array(4); gl.bindFramebuffer(gl.FRAMEBUFFER,V3.hist.f); gl.readPixels(x,y,1,1,gl.RGBA,gl.FLOAT,b); return Array.from(b); }; }               // accès de test (tools/v3essai.mjs)
$("qualite").onclick=()=>qualite(!QUAL.full); $("qualite").textContent="Qualité : "+(QUAL.full?"complète":"mobile"); $("qualite").setAttribute("aria-pressed",String(QUAL.full));
$("v3").onclick=()=>v3Basculer(!V3.on);
if(CFG.say) setTimeout(()=>entendre(CFG.say),400);
if(CFG.world) setTimeout(()=>creerMonde(CFG.world),400);
resize();
requestAnimationFrame(frame);
