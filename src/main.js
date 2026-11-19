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
if(!gl) fail("Ce navigateur ne propose pas WebGL2, nécessaire pour le rendu.\nEssaie avec une version récente de Chrome, Safari ou Firefox.");
if(!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float"))
  fail("Ce GPU ne sait pas dessiner dans une texture flottante, nécessaire pour accumuler la lumière.");

function sh(type,src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) fail("Erreur de compilation du shader :\n"+gl.getShaderInfoLog(s)); return s; }
function prog(fs,vs=VS){ const p=gl.createProgram(); gl.attachShader(p,sh(gl.VERTEX_SHADER,vs)); gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) fail("Erreur de liaison du shader :\n"+gl.getProgramInfoLog(p));
  const u={}; const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){ const a=gl.getActiveUniform(p,i); u[a.name.replace("[0]","")]=gl.getUniformLocation(p,a.name); }
  return {p,u}; }
const P_PT=prog(FS_PT), P_DOWN=prog(FS_DOWN), P_BLUR=prog(FS_BLUR), P_CAM=prog(FS_CAM);
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
const S={ can:[7,19], houp:[0,1.5,2.6,1], loin:[0,3,2,0], loinCol:[.2,.2,.21], loinBas:[.05,.07,.05], surf:[0,1,2,0], surfT:[3,4,5,6], surfP:[.45,.5], objN:0, kit:0, sunDir:[0,1,0], sun:[7,5.6,4.2], sky:[1,1,1], fog:.011, torch:0, kitP:[.62,1,1,1], eye:1.36, nuit:false };
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
  S.torch=(a.lampe!==undefined?a.lampe:S.nuit)?26:0;
  S.fog=a.brume!==undefined?a.brume:.011;
  if(S.kit===0) S.kitP[3]=a.saison==="ete"?0:1;
  sceneDirty=true;
}
function applyFiche(f){
  fiche=f; setSeed(f.graine||4821);
  S.kit=f.kit==="dunes"?1:0;
  const fo=f.foret||{};
  S.kitP=S.kit===1 ? [-1,(f.dunes&&f.dunes.rochers)||0,0,1]
                   : [fo.densite!==undefined?(.2+.6*fo.densite)*Math.min(1,fo.densite*5):.62, fo.rochers!==undefined?fo.rochers:1, fo.feuillage!==undefined?fo.feuillage:1, 1];
  const cone=fo.houppier==="cone";                               // conifères : un cône de feuillage par arbre au lieu de la voûte commune
  S.can=cone?[clampN(fo.houppier_bas,.3,8,1.6),19]:[7,19];
  S.houp=[cone?1:0,S.can[0],clampN(fo.houppier_rayon,.8,3.2,3),clampN(fo.perches,0,1,cone?.25:1)];
  const lo=isObj(f.lointain)?f.lointain:null, lh=lo?clampN(lo.hauteur,0,40,0):0;   // horizon : montagnes ou collines
  S.loin=[Math.tan(lh*Math.PI/180),.7+2.3*clampN(lo&&lo.decoupe,0,1,.5),lo&&lo.neige>0?1-clampN(lo.neige,0,1,0):2,lh>0?1:0];
  S.loinCol=couleur(lo&&lo.couleur||"#7b7a80"); S.loinBas=couleur(lo&&lo.couleur_bas||"#3d4a3a");
  S.eye=(f.camera&&f.camera.hauteur)||1.36;
  buildMats(f); buildShapes(f);
  applyAmbiance(f.ambiance||{});
  if(f.ambiance&&f.ambiance.saison==="hiver") S.kitP[2]*=.15;
  cam.z=0; cam.x=S.kit===0?pathX(0):0; cam.yaw=S.kit===0?pathYaw(0):1.15; cam.pitch=-.03; look.yaw=0; look.pitch=0; queue.length=0; tempsFaits.length=0;
  cacheObj.clear(); (f.objets||[]).forEach(o=>{ if(o&&o.visible===false) cacheObj.add(o.id); }); buildShapes(f);
}

/* Objets : la fiche les décrit en formes de base, on les range dans une texture de données lue par le shader. */
const FORMES={boite:0,boule:1,cylindre:2,cone:3,capsule:4,toit:5};
const MATIERES={mat:0,bois:1,pierre:2,metal:3,verre:4,pelage:5,tissu:5,tuile:6,lumineux:7};
const SH_ROWS=72, shapesData=new Float32Array(4*4*SH_ROWS), cacheObj=new Set();
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
  shapesData.fill(0); S.objN=0; let row=8;
  for(const o of (Array.isArray(f.objets)?f.objets:[]).slice(0,8)){
    const formes=(Array.isArray(o.formes)?o.formes:[]).filter(x=>x&&FORMES[x.f]!==undefined).slice(0,24);
    if(!formes.length || row+formes.length>SH_ROWS) continue;
    const dv=clampN(o.devant,2,90,12), ct=clampN(o.cote,-20,20,3), ech=clampN(o.echelle,.1,5,1);
    let x,z,yaw;
    if(S.kit===0){ z=dv; x=pathX(z)+ct; yaw=Math.atan2(pathX(z-4)-x,-4); }          // par défaut, la face avant regarde celui qui arrive
    else { const a=1.15; x=Math.sin(a)*dv+Math.cos(a)*ct; z=Math.cos(a)*dv-Math.sin(a)*ct; yaw=a+Math.PI; }
    if(o.cap!==undefined) yaw+=clampN(o.cap,-360,360,0)*Math.PI/180;
    const y=terrainH(x,z), c=Math.cos(yaw), sn=Math.sin(yaw), i=S.objN; let rad=.1;
    formes.forEach((fo,k)=>{
      const p=(Array.isArray(fo.p)?fo.p:[0,0,0]).map(v=>clampN(v,-30,30,0)*ech);
      const t=(Array.isArray(fo.taille)?fo.taille:[1,1,1]).map(v=>clampN(v,.01,40,1)*ech*.5);
      const pe=Array.isArray(fo.penche)?fo.penche:[0,0], col=couleur(fo.couleur), r=(row+k)*16;
      shapesData.set([x+c*p[0]+sn*p[2], y+p[1], z-sn*p[0]+c*p[2], FORMES[fo.f],
                      t[0],t[1],t[2], yaw+clampN(fo.cap,-360,360,0)*Math.PI/180,
                      col[0],col[1],col[2], matIdx.has(fo.matiere)?16+matIdx.get(fo.matiere):MATIERES[fo.matiere]!==undefined?MATIERES[fo.matiere]:0,
                      clampN(fo.lisse,0,.5,0)*ech, clampN(fo.arrondi,0,.3,0)*ech, clampN(pe[0],-90,90,0)*Math.PI/180, clampN(pe[1],-90,90,0)*Math.PI/180], r);
      rad=Math.max(rad,Math.hypot(p[0],p[1],p[2])+Math.hypot(t[0],t[1],t[2]));
    });
    shapesData.set([x,y,z,rad, row,formes.length, clampN(o.degage,0,12,0), (o.visible===false||cacheObj.has(o.id))?0:1], i*16);
    row+=formes.length; S.objN++;
  }
  gl.bindTexture(gl.TEXTURE_2D,shapesT); gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,4,SH_ROWS,gl.RGBA,gl.FLOAT,shapesData);
  sceneDirty=true;
}

/* Matières : des recettes, pas du code. La bibliothèque (src/matieres.json) et la fiche (champ "matieres") les décrivent ;
   on les range dans une texture de données lue par pathtrace.frag (fonction recette), une ligne par recette.
   Texels d'une ligne : 0 couleur, espace | 1 variation | 2 grain | 3-5 nuance et brillance | 6-11 motif | 12-16 palette
   | 17-32 quatre taches | 33-38 mousse | 39-40 salissure et relief | 41-44 deux bosses. */
const MAT_LIB=__MATIERES__;
const RT_W=48, RT_MAX=24, matData=new Float32Array(RT_W*RT_MAX*4);
const matT=gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D,matT); gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,RT_W,RT_MAX);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
const MOTIFS={aucun:0,feuilles:1,rides:2,fissures:3,planches:4,paves:5};
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
  put(0,[...couleur(r.couleur),r.espace==="volume"?1:0]);
  const va=Ob(r.variation), gr=Ob(r.grain), nu=Ob(r.nuance), mo=Ob(r.motif), re=Ob(r.relief), sa=Ob(r.salissure);
  put(1,[...ech(va.echelle,1),N(va.force,0,1.5,0)]);
  put(2,[...ech(gr.echelle,1),N(gr.force,0,1.5,0)]);
  if(r.nuance){ put(3,[...couleur(nu.couleur),N(nu.force,0,1,.5)]); put(4,[...ech(nu.echelle,1),nu.fbm?1:0]); }
  const ns=seuils(nu.seuils,.4,.7); put(5,[ns[0],ns[1],N(nu.decalage,-100,100,5),N(r.brillance,0,1,.05)]);
  const ty=MOTIFS[mo.type]||0;
  put(6,[ty,N(mo.opacite,0,1,1),N(mo.inclinaison,0,1,.5),N(re.motif,0,.05,0)]);
  put(7,[...ech(mo.echelle,ty===1?15:ty===2?26:ty===4?7:ty===5?5:[20,3,20]),N(mo.decalage,-100,100,0)]);
  if(mo.couleur!==undefined) put(8,[...couleur(mo.couleur),0]);
  if(ty===1){ put(9,[N(mo.deformation,0,.5,.12),N(mo.eclat,0,1.5,.5),N(mo.bord,0,1,.55),N(mo.recouvre,0,1,.8)]);
    put(10,[N(mo.couverture,0,1,1),N(mo.couverture_bruit,0,1,0),N(mo.taille,.05,1,1),0]); }
  if(ty===2){ const mk=Ob(mo.masque), ms=seuils(mk.seuils,.25,.6);
    put(9,[N(mo.deformation,0,20,6),N(mk.echelle,0,5,.25),ms[0],ms[1]]); put(10,[N(mo.cap,-180,180,0)*Math.PI/180,0,0,0]); }
  if(ty===3){ const s=seuils(mo.seuils,.7,.97), fi=Ob(mo.fines), s2=seuils(fi.seuils,.8,.97);
    put(9,[s[0],s[1],N(mo.profondeur,0,1,.9),N(mo.assombrit,0,1,0)]);
    put(10,[s2[0],s2[1],mo.fines?N(fi.profondeur,0,1,.25):0,0]); put(11,[...ech(fi.echelle,[60,7,60]),N(fi.decalage,-100,100,4)]); }
  if(ty===4) put(9,[N(mo.joint,.005,.45,.08),N(mo.longueur,.2,20,2.4),N(mo.eclat,0,1.5,.5),0]);
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
  const lib=recettesDe(f), kit=f.kit==="dunes"?"dunes":"foret", sf=Object.assign({},MAT_LIB.surfaces[kit]);
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
  for(const o of Array.isArray(f.objets)?f.objets:[]) for(const fo of (o&&Array.isArray(o.formes))?o.formes:[])   // formes qui nomment une recette
    if(fo&&typeof fo.matiere==="string"&&isObj(lib[fo.matiere])) use(fo.matiere);
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
const pathX=z=>3.2*Math.sin(z*.047+seed[2])+1.6*Math.sin(z*.113+1.7+seed[2]*2);
const pathYaw=z=>Math.atan2(pathX(z+3)-pathX(z-3),6);
function terrainH(x,z){
  if(S.kit===1){ const a=x*.045+.9*Math.sin(z*.021+seed[2])+.5*Math.sin(z*.05+1.3);
    return 3.2*(1-Math.abs(Math.sin(a)))*(.62+.38*Math.sin(z*.03+2+seed[2]))+.5*Math.sin(x*.11+z*.08); }
  const h=1.5*Math.sin(x*.041+.6+seed[2])*Math.cos(z*.035+1.1)+.65*Math.sin(x*.097+z*.071+2)+.22*Math.sin(x*.29-z*.21+seed[2]*3);
  return h-.10*sstep(1.8,.4,Math.abs(x-pathX(z)));
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
  const u=P_PT.u; gl.useProgram(P_PT.p);
  gl.uniform2f(u.uRes,w,h); gl.uniform1f(u.uTick,(tick++)%60000);
  gl.uniform3fv(u.uCamPos,p.pos); gl.uniformMatrix3fv(u.uCam,false,p.mat);
  gl.uniform1f(u.uFish,1.09/(.5*Math.max(1,w/h)));            // 125° sur le grand côté
  gl.uniform1f(u.uFog,S.fog); gl.uniform3fv(u.uSeed,seed); gl.uniform3fv(u.uSunDir,S.sunDir);
  gl.uniform3fv(u.uSun,S.sun); gl.uniform3fv(u.uSky,S.sky); gl.uniform1f(u.uTorch,S.torch);
  bindTex(3,shapesT,u.uShapes); gl.uniform1i(u.uObjN,S.objN);
  gl.uniform2fv(u.uCan,S.can); gl.uniform4fv(u.uHoup,S.houp);
  gl.uniform4fv(u.uLoin,S.loin); gl.uniform3fv(u.uLoinCol,S.loinCol); gl.uniform3fv(u.uLoinBas,S.loinBas);
  bindTex(4,matT,u.uMats); gl.uniform4iv(u.uSurf,S.surf); gl.uniform4iv(u.uSurfT,S.surfT); gl.uniform2fv(u.uSurfP,S.surfP);
  gl.uniform1i(u.uKit,S.kit); gl.uniform4fv(u.uKitP,S.kitP); gl.uniform1i(u.uMode,0);
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
  const R=.42, [d,dx,dz]=probe(nx,terrainH(nx,nz)+.75,nz);
  if(d<R){ let gx=(dx-d)/.05, gz=(dz-d)/.05; const l=Math.hypot(gx,gz)||1; nx+=gx/l*(R-d); nz+=gz/l*(R-d); }
  cam.x=nx; cam.z=nz; walkDist+=Math.abs(dist);
}
let idle=0, stuck=0;
function flaner(){                                            // sans consigne, il se promène : c'est le récit par défaut
  const want=S.kit===0 ? pathYaw(cam.z+Math.cos(cam.yaw)*6)+(Math.cos(cam.yaw)<0?Math.PI:0)+(Math.random()-.5)*.5
                       : cam.yaw+(Math.random()-.5)*1.2;
  let d=want-cam.yaw; d=Math.atan2(Math.sin(d),Math.cos(d));
  queue.push({type:"tourner",rest:d},{type:"marcher",rest:6+Math.random()*9},{type:"attendre",rest:1.5+Math.random()*3});
  if(Math.random()<.4) queue.push({type:"regarder",pitch:(Math.random()-.35)*.5},{type:"attendre",rest:2},{type:"regarder",pitch:-.03});
}
function simulate(dt){
  walking=false; if(frozen||hold) return;
  let v=0;
  if(!queue.length){ idle+=dt; if(idle>2.5 && !CFG.auto && !CFG.nowalk){ idle=0; flaner(); } } else idle=0;
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
const MAXS=CFG.maxSpp||400;
function pairAt(i){ if(!pairs[i]){ const w=Math.max(2,Math.round(W*LEVELS[i])), h=Math.max(2,Math.round(H*LEVELS[i]));
  pairs[i]={a:target(w,h,ACC_FMT,gl.NEAREST),b:target(w,h,ACC_FMT,gl.NEAREST)}; } return pairs[i]; }
function resize(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const cw=Math.max(2,Math.round(canvas.clientWidth*dpr)), ch=Math.max(2,Math.round(canvas.clientHeight*dpr));
  canvas.width=cw; canvas.height=ch;
  const maxPx=CFG.maxPx||(coarse?250000:440000);
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
const V3={ on:!!CFG.v3, grains:CFG.grains||300000, ombre:CFG.grainsOmbre||0, k:CFG.v3k||1.8, carte:CFG.v3carte||1024,
  alpha:CFG.v3alpha||.25, max:CFG.v3max||64, detail:!!CFG.v3detail, gp:null, gb:null, sm:null, A:null, B:null, hist:null, histPose:null,
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
}
const px3=new Float32Array(4);
function v3Sync(){ gl.bindFramebuffer(gl.FRAMEBUFFER,dummy.f); gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,px3); }
function v3Image(p){
  v3Init(); v3Cibles();
  const G=V3.gp, f=++V3.frame, bouge=V3.n===0, t0=performance.now(); let tp=t0;
  const chrono=nom=>{ if(!V3.detail) return; v3Sync(); const t=performance.now(); V3.passes[nom]=(V3.passes[nom]||0)*.8+(t-tp)*.2; tp=t; };
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
  chrono("ombre");
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
  if(pc.total>0) gl.drawArrays(gl.POINTS,0,pc.total);
  gl.disable(gl.DEPTH_TEST);
  chrono("tamponG");
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
  chrono("ombrage");
  v3Sync();                                                   // force la fin du calcul : le temps mesuré est le vrai temps GPU
  V3.ms=performance.now()-t0; V3.msMoy=V3.nImg?V3.msMoy*.8+V3.ms*.2:V3.ms; V3.nImg++;
  V3.hist=dst; V3.histPose=p; V3.n++;
}
function v3Frame(p,dt){
  if(sceneDirty||!V3.hist||!samePose(p,V3.histPose)){ V3.n=0; sceneDirty=false; }
  else if(V3.n>=V3.max) return;                               // image posée : on ne recalcule plus
  v3Image(p); frames++;
  if(bench&&walking) bench.push({dt:dt*1000,ms:V3.ms,lvl:-1,grains:V3.parts?V3.parts.total:0});
  postFX(V3.hist);
}
function v3Basculer(on){
  if(on&&V2.on) v2Basculer(false);
  V3.on=on; $("v3").setAttribute("aria-pressed",String(on)); $("v3").textContent=on?"Moteur v3 · oui":"Moteur v3";
  if(on){ v3Init(); V3.hist=null; V3.n=0; } else { hist=null; v3Libere(false); }
}
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normz=a=>{ const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; };

/* ------------------------------------------------------------------ boucle */
let lastT=0, bench=null, lastMotionMs=0; const startT=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(.1,(now-lastT)/1000); lastT=now;
  simulate(dt);
  walkAmt+=((walking?1:0)-walkAmt)*(1-Math.exp(-dt/.2));
  const p=pose(); lastPose=p;
  if(V2.on) v2Frame(p,dt);
  else if(V3.on) v3Frame(p,dt);
  else if(!hist || sceneDirty || !samePose(p,histPose)){ motionFrame(p); postFX(hist); if(bench&&walking) bench.push({dt:dt*1000,ms:lastMotionMs,lvl:mLevel}); }
  else if(n<MAXS){
    const t0=performance.now(); let done=false;
    do{ done=staticRows(p); } while(!done && performance.now()-t0<20);
    if(done && (n<14||n%4===0)) postFX(hist);
  }
  exposure+=(expTarget-exposure)*(1-Math.exp(-dt/.45));
  display(V2.on?V2.out||V2.tgt||dummy:V3.on?V3.hist||dummy:hist,(now-startT)/1000);
  hud(now);
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
    v2:V2.on?{msProj:+V2.msProj.toFixed(1),msProjMoy:+V2.msProjAvg.toFixed(1),points:V2.pts,dessines:V2.dessines,faits:V2.faits.slice(),msParLigne:+V2.msPerRow.toFixed(2)}:undefined,W,H,mLevel,msMotion:+msMotion.toFixed(1),msPerRow,exposure,x:cam.x,z:cam.z,file:queue.length,kit:S.kit,titre:fiche.titre,nuit:S.nuit,fog:S.fog,kitP:S.kitP.slice()};
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
    sur_le_sentier:S.kit===0?Math.abs(cam.x-pathX(cam.z))<1.3:null,
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
function validerFiche(f){                                     // ne garde que ce que le moteur sait lire, dans ses plages
  const kit=f.kit==="dunes"?"dunes":"foret", a=f.ambiance||{}, so=a.soleil||{};
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
  else out.dunes={rochers:clampN(f.dunes&&f.dunes.rochers,0,1.5,0)};
  const num3=(v,d)=>Array.isArray(v)?[0,1,2].map(i=>clampN(v[i],-40,40,d)):[d,d,d];
  const obj=(Array.isArray(f.objets)?f.objets:[]).slice(0,8).map((o,i)=>o&&Array.isArray(o.formes)?{
    id:String(o.id||"objet"+i).slice(0,30), nom:String(o.nom||"").slice(0,60), devant:clampN(o.devant,2,90,12), cote:clampN(o.cote,-20,20,3),
    cap:o.cap===undefined?undefined:clampN(o.cap,-360,360,0), echelle:clampN(o.echelle,.1,5,1), degage:clampN(o.degage,0,12,0), visible:o.visible!==false,
    formes:o.formes.filter(x=>x&&FORMES[x.f]!==undefined).slice(0,24).map(x=>({f:x.f,p:num3(x.p,0),taille:num3(x.taille,1),cap:clampN(x.cap,-360,360,0),
      penche:Array.isArray(x.penche)?[clampN(x.penche[0],-90,90,0),clampN(x.penche[1],-90,90,0)]:[0,0],
      couleur:x.couleur, matiere:MATIERES[x.matiere]!==undefined||(typeof x.matiere==="string"&&/^[a-z0-9_-]{1,30}$/.test(x.matiere))?x.matiere:"mat", lisse:clampN(x.lisse,0,.5,0), arrondi:clampN(x.arrondi,0,.3,0)}))}:null).filter(o=>o&&o.formes.length);
  if(obj.length) out.objets=obj;
  if(isObj(f.lointain)&&clampN(f.lointain.hauteur,0,40,0)>0){ const l=f.lointain; out.lointain={hauteur:clampN(l.hauteur,0,40,0),decoupe:clampN(l.decoupe,0,1,.5),neige:clampN(l.neige,0,1,0)};
    for(const k of ["couleur","couleur_bas"]) if(typeof l[k]==="string"&&/^#[0-9a-f]{6}$/i.test(l[k])) out.lointain[k]=l[k]; }
  const mats=validerRecettes(f.matieres); if(mats) out.matieres=mats;
  if(isObj(f.surfaces)){ const s={}, fs=f.surfaces, nom=v=>typeof v==="string"?v.slice(0,30):undefined;
    for(const k of ["sol","trajet","rochers"]) if(nom(fs[k])) s[k]=nom(fs[k]);
    for(const k of ["arbres","perches"]) if(isObj(fs[k])) s[k]={a:nom(fs[k].a),b:nom(fs[k].b),part:clampN(fs[k].part,0,1,.5)};
    out.surfaces=s; }
  const h=f.histoire;
  if(h&&typeof h==="object"&&h.pitch) out.histoire={ pitch:String(h.pitch).slice(0,400),
    temps:(Array.isArray(h.temps)?h.temps:[]).slice(0,4).filter(t=>t&&t.id).map(t=>({id:String(t.id).slice(0,30),quand:String(t.quand||"").slice(0,160),
      ce_qui_se_passe:String(t.ce_qui_se_passe||"").slice(0,200),scene:t.scene&&typeof t.scene==="object"?t.scene:undefined})) };
  return out;
}
function mondeLexique(texte){                                 // secours sans IA
  const t=texte.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
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
  f.note="Sans Claude, je ne lis que des mots-clés : désert, nuit, matin, soir, brume, saison, dense, rochers. Les objets demandent Claude.";
  return f;
}
async function creerMonde(texte){
  say("Je fabrique ce monde…");
  let f=null;
  if(sampler){
    const consigne=`Tu écris la fiche de lieu d'un moteur de rendu qui filme un monde généré par code, en vue caméra-piéton. Le joueur décrit le monde qu'il veut. Tu ne décris jamais de géométrie : tu choisis un kit, tu le règles, tu poses l'ambiance.
Réponds uniquement par un objet JSON :
{"titre": "court, évocateur", "inspiration": "le lieu de référence en une phrase", "graine": entier de 1 à 99999,
 "kit": "foret" ou "dunes",
 "foret": {"densite": 0..1, "rochers": 0..1.5, "feuillage": 0..1.5, "houppier": "voute"|"cone", "perches": 0..1},
 "dunes": {"rochers": 0..1.5},
 "ambiance": {"saison": "ete"|"automne"|"hiver", "meteo": "clair"|"voile", "soleil": {"azimut": -180..180, "hauteur": -10..70}, "lampe": true|false, "brume": 0..0.06},
 "objets": [{"id": "mot", "nom": "ce que c'est", "devant": 2..90, "cote": -20..20, "degage": 0..12, "visible": true,
   "formes": [{"f": "boite"|"boule"|"cylindre"|"cone"|"capsule"|"toit", "p": [x, y, z], "taille": [largeur, hauteur, profondeur], "cap": degrés, "penche": [avant, côté], "couleur": "#rrggbb", "matiere": "mat"|"bois"|"pierre"|"metal"|"verre"|"pelage"|"tissu"|"tuile"|"lumineux", "lisse": 0..0.5, "arrondi": 0..0.3}]}],
 "histoire": {"pitch": "facultatif : ce qui arrive au porteur de la caméra, deux phrases", "temps": [{"id": "mot", "quand": "condition", "ce_qui_se_passe": "…", "scene": {"brume": 0..0.06, "lampe": true|false, "soleil": {"azimut": 0, "hauteur": 0}}}]},
 "lointain": {"hauteur": 0..40, "decoupe": 0..1, "neige": 0..1, "couleur": "#rrggbb", "couleur_bas": "#rrggbb"},
 "matieres": {"nom": {"base": "recette existante", "couleur": "#rrggbb", ...}}, "surfaces": {"sol": "nom", "trajet": "nom", "rochers": "nom"},
 "note": "une phrase, seulement si une partie de la demande ne peut pas être montrée"}
Repères : une hauteur de soleil négative donne la nuit, et la lampe du téléphone s'allume. Soleil rasant entre 4 et 15. Brume : 0.003 air sec, 0.011 matin, 0.03 épais. La forêt est tempérée (pins, chênes, bouleaux, blocs de grès, sentier de sable). Les dunes sont un désert de sable.
Objets : rien n'est prédéfini, tu construis tout ce que la demande contient (bâtiments, animaux, véhicules, mobilier, personnages, ruines…) en assemblant des formes. Huit objets au plus, 24 formes par objet, 64 formes en tout : va à l'essentiel de la silhouette, c'est filmé de loin par une mauvaise caméra.
Repère d'un objet : mètres réels, y = 0 au sol, x vers la droite, +z = sa face avant, tournée vers celui qui arrive. "p" est le centre de la forme, "taille" ses dimensions entières (boule : diamètres ; cylindre, cône, capsule : [diamètre, hauteur, diamètre], debout ; toit : [longueur du faîtage, hauteur, largeur], à poser au-dessus des murs). "penche" incline une forme en degrés. "lisse" fond la forme dans les voisines (corps d'animal : 0.03 à 0.08). "lumineux" éclaire (fenêtre allumée, feu, écran). Portes et fenêtres : boîtes minces posées 2 cm devant le mur.
Placement : "devant" est la distance le long du trajet depuis le départ, "cote" l'écart latéral (négatif à gauche ; moins de 1,5 = sur le sentier). Un bâtiment se pose 10 à 20 m devant, à 5 m de côté ou plus, avec "degage" égal à sa demi-largeur plus 2 pour écarter les arbres. Les temps de l'histoire peuvent faire apparaître ou disparaître des objets : "scene": {"montrer": ["id"], "cacher": ["id"]}, avec "visible": false au départ.
Arbres : "houppier": "voute" donne des feuillus et des pins au feuillage haut et commun (forêt de plaine) ; "cone" donne des conifères au feuillage en cône jusqu'en bas, vert sombre toute l'année (sapins, épicéas : montagne, nord, forêt noire), avec "feuillage" autour de 1. "perches" règle la part de jeunes troncs fins (0 = aucun).
Lointain (facultatif) : ce qu'on voit à l'horizon, au-dessus des arbres. "hauteur" est l'angle des plus hauts sommets en degrés (collines 3 à 6, montagne 8 à 15, haute montagne vue de la vallée 18 à 30), "decoupe" la finesse des crêtes (collines rondes 0.2, aiguilles 0.9), "neige" la part enneigée du massif (0 aucune, 0.5 la moitié haute), "couleur" la roche, "couleur_bas" les contreforts (forêt sombre, lande, roche). Pour qu'on le voie, garde la forêt clairsemée ("densite" et "feuillage" bas). Sols prêts pour la montagne : "herbe", "neige".
Matières (facultatif) : chaque surface pointe vers une recette. Recettes prêtes : ${Object.keys(MAT_LIB.recettes).join(", ")}. Pour en faire une, pars d'une "base" et change ce qui diffère : "couleur", "nuance" {couleur, force}, "taches" [{couleur, force, echelle, seuils}], "mousse" {force} (0 = aucune), "salissure" {force, hauteur}, "brillance", "motif" {type: feuilles|rides|fissures|planches|paves, echelle, couleur}. Une forme d'objet peut nommer une recette dans "matiere" (ex. "planches", "paves", "crepi"). Garde la crédibilité : des couleurs ternes et sales plutôt que franches.
Pour le décor il n'existe que les kits forêt et dunes : si la demande veut un autre sol ou un autre paysage (ville, mer, intérieur), choisis l'ambiance la plus proche, construis le reste en objets, garde l'idée dans "inspiration" et "histoire", et dis-le franchement dans "note".
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
  const f=bench.slice(Math.min(10,bench.length>>2)); bench=null; queue.length=0; hold=true;
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
  const pa=Object.assign({},V3.passes); V3.detail=det; hold=false;
  const dt=med(f.map(x=>x.dt)), ms=med(f.map(x=>x.ms)), gr=V3.parts||{};
  const dbg=gl.getExtension("WEBGL_debug_renderer_info"), gpu=dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):"inconnu";
  const k=v=>Math.round((v||0)/1000)+" k";
  out.textContent=[
    "MESURE · MOTEUR V3 · "+(fiche.titre||fiche.id),
    "",
    "Écran            "+canvas.width+" × "+canvas.height+" (×"+(window.devicePixelRatio||1).toFixed(2)+")",
    "Puce graphique   "+gpu,
    "",
    "EN MARCHE ("+f.length+" images)",
    "Images/seconde   "+(dt?fx(1000/dt):"non mesuré"),
    "Calcul par image "+fx(ms,1)+" ms",
    "Résolution       "+W+" × "+H,
    "",
    "BUDGET DE GRAINS",
    "Caméra           "+k(gr.total)+" (arbres "+k(gr.nA)+", perches "+k(gr.nB)+", blocs "+k(gr.nR)+", feuilles "+k(gr.nF)+", objets "+k(gr.nP)+")",
    "Soleil           "+k(V3.ombre||V3.grains*.6)+", carte "+V3.carte+" × "+V3.carte,
    "Sol              "+V3.sol.anneaux*V3.sol.secteurs*2+" triangles",
    "",
    "PAR PASSE (à l'arrêt, synchronisé)",
    "Carte d'ombres   "+fx(pa.ombre,1)+" ms",
    "Tampon G         "+fx(pa.tamponG,1)+" ms",
    "Matière, lumière "+fx(pa.ombrage,1)+" ms",
  ].join("\n");
  $("mesure-copier").disabled=false;
}
$("mesurer").onclick=()=>{ mesurer().catch(e=>{ hold=false; bench=null; $("mesure-txt").textContent="La mesure a échoué : "+(e&&e.message||e); }); };
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
    const x=S.kit===0?pathX(dv)+ct:Math.sin(a)*dv+Math.cos(a)*ct, z=S.kit===0?dv:Math.cos(a)*dv-Math.sin(a)*ct;
    const dx=x-cam.x, dz=z-cam.z, m=Math.hypot(dx,dz), dir=Math.atan2(dx,dz);
    const visible=!(o.visible===false||cacheObj.has(o.id)), lum=(o.formes||[]).some(f=>f&&f.matiere==="lumineux");
    const portee=lum?90:S.nuit?(S.torch>0?12:4):30;
    out.push({id:o.id, nom:o.nom||o.id, m:+m.toFixed(1), angle:Math.round(rel(dir-cam.yaw)), visible, vu:visible&&m<=portee&&Math.abs(rel(dir-yw))<=50});
  }
  return out;
}
function percevoirMeneur(){ const p=perception(), x0=S.kit===0?pathX(0):0;
  p.avance_m=+cam.z.toFixed(1); p.depart_m=+Math.hypot(cam.x-x0,cam.z).toFixed(1); p.objets=objetsPercus(); return p; }
function executer(o){                                         // les ordres du meneur, traduits pour le moteur
  if(o.type==="pensee") say(o.texte);
  else if(o.type==="scene") patchScene(o.scene);
  else if(o.type==="actions"){ if(o.vider) queue.length=0; enqueue(o.actions); }
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
  for(const id of ["monde","lieu","mesurer","histoire"]) if($(id)) $(id).hidden=on;
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
  histoireId=h.id; hold=false; setFrozen(false); interfaceHistoire(true);
  meneurT=performance.now(); clearInterval(meneurTimer); meneurTimer=setInterval(ticMeneur,500); ticMeneur();
  return meneur.partie();
}
function quitterHistoire(garderLieu){
  if(!meneur) return; meneur=null; clearInterval(meneurTimer); hold=false; interfaceHistoire(false); dbgEl.textContent="";
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
  etat:()=>({ fiche:fiche.id, graine:seedN, x:cam.x, z:cam.z, yaw:cam.yaw, pitch:cam.pitch, passes:n, file:queue.length }),
};

/* ------------------------------------------------------------------ démarrage */
if(CFG.nohud) document.querySelectorAll(".hud").forEach(e=>e.style.display="none");
if(typeof CFG.scene==="number") ficheIdx=CFG.scene;
applyFiche(typeof CFG.scene==="object"&&CFG.scene?CFG.scene:FICHES[ficheIdx]);
if(CFG.histoire) jouerHistoire(CFG.histoire===true?undefined:CFG.histoire);   // la page démarre sur l'histoire
if(CFG.seed){ setSeed(CFG.seed); cam.x=S.kit===0?pathX(0):0; }
if(CFG.z!==undefined){ cam.z=CFG.z; if(S.kit===0){ cam.x=pathX(cam.z); cam.yaw=pathYaw(cam.z); } }
if(CFG.yaw!==undefined) cam.yaw+=CFG.yaw;
if(CFG.pitch!==undefined) cam.pitch=CFG.pitch;
if(CFG.auto) enqueue(CFG.auto);
if(CFG.lookYaw) look.yaw=CFG.lookYaw;
if(V2.on){ v2Basculer(true); window.__v2=V2; }                // accès de test (tools/v2essai.mjs)
$("v2").onclick=()=>v2Basculer(!V2.on);
if(V3.on){ v3Basculer(true); window.__v3=V3; window.__v3lire=(x,y)=>{ const b=new Float32Array(4); gl.bindFramebuffer(gl.FRAMEBUFFER,V3.hist.f); gl.readPixels(x,y,1,1,gl.RGBA,gl.FLOAT,b); return Array.from(b); }; }               // accès de test (tools/v3essai.mjs)
$("v3").onclick=()=>v3Basculer(!V3.on);
if(CFG.say) setTimeout(()=>entendre(CFG.say),400);
if(CFG.world) setTimeout(()=>creerMonde(CFG.world),400);
resize();
requestAnimationFrame(frame);
