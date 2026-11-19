// Matières en recettes, partagées par le lanceur de rayons et le semeur (moteur v3). Inséré par le build (#include),
// après monde.glsl. Un seul appel à recette() par shader : chaque appel est déplié par le compilateur.
/* ---- matières : une recette par surface, lue dans une texture de données.
   Aucune matière n'est écrite ici : sol, sentier, grès, écorces sont des recettes de src/matieres.json ou de la fiche.
   Une recette s'évalue une fois par impact, dans cet ordre : couleur, nuance, taches sous le motif, motif,
   variation, grain, taches, relief, mousse, salissure. Disposition des texels : voir packRecette dans src/main.js. */
uniform sampler2D uMats;
uniform float uNuit;         // 0 le jour, 1 la nuit : part des fenêtres allumées qui éclairent
vec3 gQo; float gYo; vec3 gFormCol;   // décalage des motifs propre à chaque élément ; passage de la coordonnée locale à la hauteur au-dessus de la base ; couleur de la forme touchée, pour une recette « couleur de la forme »
uniform ivec4 uSurf;         // recettes du sol, du trajet, des rochers
uniform ivec4 uSurfT;        // écorces : arbres (a, b), perches (a, b)
uniform vec4  uSurfP;        // part de l'écorce a, arbres et perches ; variété des troncs (fiche : foret.variete, 0 à 1)
vec3 gTon;                   // teinte propre à l'arbre touché (1 hors des troncs)
/* Variété des troncs : chaque arbre ou perche décale les motifs de son écorce (sinon tous les troncs d'une même recette
   portent les mêmes fissures aux mêmes hauteurs) et prend sa teinte, plus claire ou plus sombre, plus chaude ou plus froide.
   par : l'aléa de l'arbre (info.w). Sans variété (0, défaut) : rien ne change. */
vec3 troncVar(float par){
  vec3 h=h33(vec3(par*91.7,par*37.3,2.9)), v=vec3(uSurfP.z);
  gTon=(1.+v*(h.z-.5)*.55)*(1.+v*(h.y-.5)*vec3(.16,0.,-.16));
  return vec3(h.x*53.,0.,h.y*41.)*step(.001,uSurfP.z);
}
const vec3 HUMIDE=vec3(.563,.102,-.819);                    // côté humide, celui où la mousse monte
vec4 rT(int r, int i){ return texelFetch(uMats,ivec2(i,r),0); }
float rN(vec3 q, vec3 s, float o, bool fb, bool sol){       // bruit d'une recette : sur le plan du sol ou dans le volume
  if(sol){ vec2 x=q.xz*s.xz+o; return fb?fbm(x):vnoise(x); }
  vec3 x=q*s+o; return fb?fbm3(x):vnoise3(x);
}
float tacheM(int r, int k, vec3 q, float hs, bool sol){     // masque de la tache k ; hs = hauteur au-dessus du sol
  vec4 b=rT(r,18+k*4), c=rT(r,19+k*4), d=rT(r,20+k*4);
  float N=dot(b.xyz,b.xyz)>0.?rN(q,b.xyz,d.z,b.w>.5,sol):0.;
  if(d.x!=0.) N+=d.x*smoothstep(c.z,c.w,hs);
  return smoothstep(c.x,c.y,N);
}
vec3 palette(int r, float h){
  for(int i=0;i<5;i++){ vec4 p=rT(r,12+i); if(h<p.w || i==4) return p.rgb; }
  return vec3(0.);
}
vec2 motifUV(vec3 q, vec3 n, bool sol){ if(sol || abs(n.y)>.7) return q.xz; return abs(n.x)>abs(n.z)?q.zy:q.xy; }
float planches(vec2 uv, float e, vec4 P, out vec2 id){       // 1 sur la planche, 0 dans le joint ; P.w : planches couchées (bardage)
  if(P.w>.5) uv=uv.yx;
  float u=uv.x*e, i=floor(u), L=max(P.y,.2);
  float v=uv.y/L+h21(vec2(i,7.)), j=floor(v);
  id=vec2(i,j);
  return smoothstep(0.,P.x,min(fract(u),1.-fract(u)))*smoothstep(0.,P.x/(e*L),min(fract(v),1.-fract(v)));
}
float paves(vec2 uv, vec2 e, vec4 P, out vec2 id){           // 1 au sommet du pavé, 0 dans le joint ; e : échelle en largeur et en hauteur (briques)
  vec2 x=uv*e; x.x+=P.y*floor(x.y); id=floor(x);
  vec2 f=fract(x)-.5+(h22(id)-.5)*.08;
  float m=min(.5-abs(f.x),.5-abs(f.y));
  return smoothstep(0.,P.x,m)*(1.-P.w*dot(f,f));
}
float fenetres(vec2 uv, vec4 P, vec4 Q, out vec2 id, out float cadre){   // 1 sur la vitre, 0 sur le mur ; uv : (le long de la façade, hauteur au-dessus de la base)
  // P : largeur, hauteur, pas, étage ; Q : allège, cadre, rez-de-chaussée (0 = comme les étages), part allumée
  float W=P.x, Hh=P.y, al=Q.x, y=uv.y, fl;
  if(Q.z>0. && y<Q.z){ fl=-1.; W=P.z*.8; Hh=Q.z-.6; al=.3; }   // rez-de-chaussée : vitrine ou porte large
  else { y-=Q.z; fl=floor(y/P.w); y-=fl*P.w; }
  float u=uv.x/P.z+.5, uf=(fract(u)-.5)*P.z;
  id=vec2(floor(u),fl);
  float m=max(abs(uf)-.5*W,abs(y-al-.5*Hh)-.5*Hh);          // < 0 dans l'embrasure
  float g=smoothstep(-Q.y+.012,-Q.y-.012,m);
  if(W>.9) g*=smoothstep(.3*Q.y,.3*Q.y+.012,abs(uf));         // meneau
  cadre=smoothstep(.012,-.012,m)-g;
  return g;
}
/* Feuilles superposées (motif feuilles, champ forme > 0) : une feuille par cellule, tournée au hasard, de longueur taille
   (en cellules), de largeur forme × longueur, plus large vers la base, lobée pour une part (lobes) ; parmi les feuilles
   des neuf cellules voisines qui couvrent le point, celle du dessus l'emporte. Rend (aléa de la feuille, distance au bord,
   1 si une feuille couvre) ; tl : pente en travers de la feuille (bords relevés). */
vec3 feuillesSup(vec2 x, float el, float lob, float L0, float cov, out vec2 tl){
  vec2 n=floor(x), f=fract(x); float best=-1., hc=0., ed=0.; tl=vec2(0.);
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 g=vec2(float(i),float(j)), c=n+g; float hid=h21(c+.5);
    if(fract(hid*5.31)>cov) continue;
    vec2 rr=f-g-h22(c); float a=hid*43.7; vec2 cs=vec2(cos(a),sin(a));
    vec2 l=vec2(dot(rr,cs),dot(rr,vec2(-cs.y,cs.x)));
    float L=L0*(.7+.6*fract(hid*13.7)), u=l.x/L;
    float w=L*el*max(1.-u*u,0.)*(1.+.35*u);
    if(fract(hid*3.7)<lob) w*=.68+.5*abs(sin(u*9.4+hid*6.));
    float z=fract(hid*7.3), m=w-abs(l.y);
    if(m>0. && abs(u)<1. && z>best){ best=z; hc=hid; ed=min(m,(1.-abs(u))*L); tl=vec2(-cs.y,cs.x)*clamp(l.y/max(w,1e-3),-1.,1.); }
  }
  return vec3(hc,ed,best>=0.?1.:0.);
}
float fissH(int r, vec3 q, bool sol){                        // 1 sur l'écorce, 0 au fond des fissures
  vec4 e=rT(r,7), p0=rT(r,9), p1=rT(r,10), e2=rT(r,11);
  float a=rN(q,e.xyz,e.w,false,sol);
  float h=1.-smoothstep(p0.x,p0.y,1.-abs(a*2.-1.))*p0.z;
  if(p1.z>0.){ float b=rN(q,e2.xyz,e2.w,false,sol); h-=p1.z*smoothstep(p1.x,p1.y,1.-abs(b*2.-1.)); }
  return clamp(h,0.,1.);
}
float recetteH(int r, vec3 q, vec3 n, float hs, bool sol){   // hauteur du relief : motif, creux des taches, bosses
  vec4 mo=rT(r,6); float H=0.;
  if(mo.w!=0.){
    int ty=int(mo.x+.5); float mh=1.; vec2 id;
    if(ty==3) mh=fissH(r,q,sol);
    else if(ty==4) mh=planches(motifUV(q,n,sol),rT(r,7).x,rT(r,9),id);
    else if(ty==5) mh=paves(motifUV(q,n,sol),sol?rT(r,7).xz:rT(r,7).xy,rT(r,9),id);
    else if(ty==6) for(int i=0;i<(ty==6&&abs(n.y)<.5?1:0);i++){ vec2 uv=motifUV(q-gQo,n,false); uv.y=q.y+gYo; float fr; mh=1.-fenetres(uv,rT(r,9),rT(r,10),id,fr); }
    for(int k=0;k<4;k++){ float cr=rT(r,20+k*4).y; if(cr!=0.) mh-=cr*tacheM(r,k,q,hs,sol); }
    H+=mo.w*mh;
  }
  for(int k=0;k<2;k++){ vec4 a=rT(r,41+k*2); if(a.w!=0.){ vec4 b=rT(r,42+k*2); H+=a.w*rN(q,a.xyz,b.y,b.x>.5,sol); } }
  return H;
}
void recette(int r, vec3 q, vec3 n, float hs, mat2 rot, out vec3 alb, out vec3 tilt, out float spec, out float em){
  vec4 c0=rT(r,0), nup=rT(r,5), mo=rT(r,6), rel=rT(r,39);
  bool sol=mod(c0.w,2.)<.5;
  alb=c0.w>1.5?gFormCol:c0.rgb; tilt=vec3(0.); spec=nup.w; em=0.;
  vec4 nc=rT(r,3);                                           // nuance : une seconde couleur par plages
  if(nc.w>0.){ vec4 ns=rT(r,4); alb=mix(alb,nc.rgb,nc.w*smoothstep(nup.x,nup.y,rN(q,ns.xyz,nup.z,ns.w>.5,sol))); }
  for(int k=0;k<4;k++){ vec4 t0=rT(r,17+k*4); float pl=rT(r,20+k*4).w; if(t0.w>0. && pl>.5 && pl<1.5) alb=mix(alb,t0.rgb,t0.w*tacheM(r,k,q,hs,sol)); }
  int ty=int(mo.x+.5); float cover=1., mm=1.;   // mm : où le motif est posé (pour les taches sur le motif)
  if(ty==1){                                                 // feuilles : cellules de Voronoï, une feuille par cellule
    vec4 e=rT(r,7), p0=rT(r,9), p1=rT(r,10);
    vec2 wp=q.xz+p0.x*vec2(vnoise(q.xz*7.)-.5,vnoise(q.xz*7.+31.)-.5);
    float cov=p1.x; if(p1.y>0.) cov+=p1.y*fbm(q.xz*.8+3.);
    float hc, on; vec3 lc;
    if(p1.w>0.){                                             // feuilles superposées : de vraies feuilles qui se recouvrent
      vec2 tc; vec3 fs=feuillesSup(wp*e.x,p1.w,rT(r,11).x,p1.z,cov,tc); hc=fs.x; on=fs.z;
      lc=palette(r,hc)*(1.-.5*p0.y+p0.y*h21(vec2(hc*91.,3.)))*mix(1.-p0.z,1.,smoothstep(0.,.07,fs.y));
      tilt+=vec3(tc.x,0.,tc.y)*.45*mo.z*on;                  // feuille creusée : les bords se relèvent
    } else {                                                 // cellules de Voronoï jointives (litière d'origine)
      vec3 v=voro(wp*e.x); hc=v.y;
      lc=palette(r,hc)*(1.-.5*p0.y+p0.y*h21(vec2(hc*91.,3.)));
      lc*=mix(1.-p0.z,1.,smoothstep(0.,.10,v.z));
      on=step(1.-cov,fract(hc*7.3));
      if(p1.z<.7) on*=smoothstep(p1.z+.04,p1.z-.04,v.x);
    }
    alb=mix(alb,lc,on*mo.y); mm=on;
    vec2 tl=h22(vec2(hc*37.,hc*91.))-.5;
    tilt+=vec3(tl.x,0.,tl.y)*(rel.z+mo.z*on);
    cover=1.-p0.w*step(.5,fract(hc*5.1));                    // une part des feuilles couvre la mousse
  } else if(ty==2){                                          // rides de vent
    vec4 e=rT(r,7), p0=rT(r,9), p1=rT(r,10);
    float w=fbm(q.xz*p0.y+uSeed.xy);
    vec2 dir=normalize(vec2(1.,.35+.5*(w-.5)));
    if(p1.x!=0.){ float c=cos(p1.x), s=sin(p1.x); dir=mat2(c,s,-s,c)*dir; }
    float ph=dot(q.xz,dir)*e.x+p0.x*fbm(q.xz*1.3);
    float mk=smoothstep(p0.z,p0.w,w+.2*n.y);
    alb=mix(alb,rT(r,8).rgb,mo.y*smoothstep(.3,.8,sin(ph)*mk));
    tilt+=vec3(dir.x,0.,dir.y)*cos(ph)*mo.z*mk;
  } else if(ty==3){                                          // fissures
    float h=fissH(r,q,sol); float as=rT(r,9).w;
    alb=mix(alb,as>0.?alb*(1.-as):rT(r,8).rgb,(1.-h)*mo.y);
  } else if(ty==4 || ty==5){                                 // planches, pavés : éléments répétés et joints
    vec4 e=rT(r,7), P=rT(r,9); vec2 id;
    float s=ty==4?planches(motifUV(q,n,sol),e.x,P,id):paves(motifUV(q,n,sol),sol?e.xz:e.xy,P,id);
    if(rT(r,12).w>0.) alb=palette(r,h21(id+.5));
    alb*=1.-.5*P.z+P.z*h21(id+3.7);
    alb=mix(alb,rT(r,8).rgb,mo.y*(1.-smoothstep(.0,.6,s)));
  } else if(ty==6){                                          // fenêtres : grille d'étages sur les faces verticales
    for(int i=0;i<(ty==6&&abs(n.y)<.5?1:0);i++){
      vec2 uv=motifUV(q-gQo,n,false); uv.y=q.y+gYo; vec2 id; float fr;
      vec4 Q=rT(r,10);
      float g=fenetres(uv,rT(r,9),Q,id,fr)*mo.y;
      float lit=step(h21(id+gQo.xz*.37+3.1),Q.w)*uNuit;
      vec3 vit=mix(rT(r,8).rgb*(.6+.8*h21(id+gQo.xz)),rT(r,12).rgb*(.5+.5*h21(id*1.7+gQo.xz)),lit);
      alb=mix(alb,rT(r,11).rgb,fr*mo.y); alb=mix(alb,vit,g);
      spec=mix(spec,.6*(1.-lit),g); em=g*lit; mm=g;
    }
  } else if(ty==7){                                          // marquage au sol, mesuré depuis l'axe du trajet
    for(int i=0;i<(ty==7?1:0);i++){
    vec4 P=rT(r,9), Q=rT(r,10);                              // P : largeur du trait, tiret, intervalle, écart des lignes de bord ; Q : axe (0, 1 simple, 2 double), période des passages piétons
    float dx=q.x-pathX(q.z), lw=.5*P.x, m=0.;
    float dash=P.y>0.?step(fract(q.z/(P.y+P.z)),P.y/(P.y+P.z)):1.;
    if(Q.x>1.5) m=smoothstep(lw+.01,lw-.01,abs(abs(dx)-lw*2.5));
    else if(Q.x>.5) m=smoothstep(lw+.01,lw-.01,abs(dx))*dash;
    if(P.w>0.) m=max(m,smoothstep(lw+.01,lw-.01,abs(abs(dx)-P.w)));
    if(Q.y>0.) m=max(m,step(fract(q.z/Q.y)*Q.y,3.)*step(.5,fract(dx*1.6))*step(abs(dx),P.w>0.?P.w-.3:3.5));
    m*=1.-.7*smoothstep(.45,.75,fbm(q.xz*vec2(1.2,.5)+7.));   // usure
    alb=mix(alb,rT(r,8).rgb,m*mo.y); mm=m;
    }
  }
  vec4 va=rT(r,1); if(va.w>0.) alb*=1.-.5*va.w+va.w*rN(q,va.xyz,0.,true,sol);
  vec4 gr=rT(r,2); if(gr.w>0.) alb*=1.-.5*gr.w+gr.w*rN(q,gr.xyz,0.,false,sol);
  for(int k=0;k<4;k++){ vec4 t0=rT(r,17+k*4); float pl=rT(r,20+k*4).w; if(t0.w>0. && (pl<.5 || pl>1.5)) alb=mix(alb,t0.rgb,t0.w*tacheM(r,k,q,hs,sol)*(pl>1.5?mm:1.)); }
  if(rel.w>0.){                                              // grain du relief : petites facettes
    float s=rT(r,40).x;
    tilt+=sol?vec3(vnoise(q.xz*s)-.5,0.,vnoise(q.xz*s+9.)-.5)*rel.w
             :(vec3(vnoise3(q*s),vnoise3(q*s+9.),vnoise3(q*s+17.))-.5)*rel.w;
  }
  if(mo.w!=0. || rT(r,41).w!=0. || rT(r,43).w!=0.){         // relief en hauteur : pente par différences finies
    const float e=.004; vec4 hv=vec4(0.);
    for(int i=0;i<4;i++){                                    // un seul appel dans la boucle : le compilateur n'en déplie pas quatre copies
      vec3 o=i==1?vec3(e,0.,0.):i==2?vec3(0.,e,0.):i==3?vec3(0.,0.,e):vec3(0.);
      hv[i]=(sol && i==2)?hv.x:recetteH(r,q+o,n,hs,sol);
    }
    vec3 g=(hv.yzw-hv.x)/e;
    g.xz=g.xz*rot;
    tilt-=g;
  }
  vec4 m0=rT(r,33);
  if(m0.w>0.){                                               // mousse ou lichen : par plaques, selon l'orientation et la hauteur
    vec4 m1=rT(r,34), m2=rT(r,35), m3=rT(r,36), m4=rT(r,37), m5=rT(r,38);
    float N=sol?(m1.w>.5?fbm(q.xz*m1.xz+m2.z+uSeed.xy):vnoise(q.xz*m1.xz+m2.z+uSeed.xy)):rN(q,m1.xyz,m2.z,m1.w>.5,false);
    float m=smoothstep(m2.x,m2.y,N);
    bool dOn=m3.x!=m3.y, cOn=m4.x!=m4.y;
    float Np=m5.z>0.?rN(q,vec3(m5.z),m5.w,true,sol):N;      // bruit qui décale la limite de pente
    if(dOn || cOn) m*=max(dOn?smoothstep(m3.x,m3.y,n.y+m3.z*(Np-.5)):0.,cOn?m4.z*smoothstep(m4.x,m4.y,dot(n,HUMIDE)):0.);
    if(m5.x!=m5.y) m*=smoothstep(m5.x,m5.y,hs);
    vec3 mc=m0.rgb; if(m2.w>0.) mc*=1.-.5*m2.w+m2.w*rN(q,vec3(m3.w),0.,false,sol);
    alb=mix(alb,mc,m*cover*m0.w);                            // les feuilles posées dessus cachent la mousse...
    tilt*=1.-m4.w*m; spec*=1.-m;                             // ...mais le sol reste humide et plat dessous
  }
  if(!sol && rel.x>0.) alb*=mix(1.-rel.x,1.,smoothstep(0.,rel.y,hs));   // salissure : le pied s'assombrit
}

int matProp(vec3 p, vec3 n, vec4 info, bool sem, out vec3 alb, out vec3 nn, out float spec, out float emis, out vec3 qr, out vec3 nl, out mat2 rot){   // rend une recette, ou -1
  int row=int(info.w); float hv=fract(info.w)/.9;           // forme touchée, aléa de l'élément de semis
  vec3 q=primLocal(sem?info.xyz:p,row);
  vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), cm=texelFetch(uShapes,ivec2(2,row),0);
  { vec4 hd=vec4(0.);                                        // normale dans le repère de la forme : c'est elle qui oriente les motifs
    for(int i=0;i<4;i++){ vec3 o=i==1?vec3(.01,0.,0.):i==2?vec3(0.,.01,0.):i==3?vec3(0.,0.,.01):vec3(0.); hd[i]=sdPrim(q+o,a.w,b.xyz); }
    nl=normalize(hd.yzw-hd.x+1e-6); }
  float an=abs(nl.y)<.9&&abs(n.y)<.9?atan(n.z,n.x)-atan(nl.z,nl.x):0.;
  rot=mat2(cos(an),-sin(an),sin(an),cos(an));               // repère de la forme -> monde, pour le relief des recettes
  alb=formeCol(row,hv); nn=n; spec=.05; emis=0.;
  if(sem){                                                   // élément de semis : motifs en mètres, propres à l'élément, teinte variée
    float te=texelFetch(uShapes,ivec2(3,SEM0+((row-SEM0)/SEML)*SEML),0).w;
    alb*=max(vec3(0.),1.+te*(h33(vec3(hv*91.7,hv*37.3,5.1))-.5)*1.6);
    q*=vec3(gInst.y,gInst.y*gInst.z,gInst.y);
    gQo=vec3(hv*61.3,0.,hv*17.9); gYo=info.y*gInst.y*gInst.z-q.y;
  } else { gQo=vec3(0.); gYo=p.y-terrainH(p.xz)-q.y; }
  q+=gQo; gFormCol=alb;
  float m=cm.a;
  qr=q;
  if(m>15.5) return int(m-16.);                              // la forme nomme une recette de la fiche
  vec3 r=abs(q)/max(b.xyz,vec3(1e-3));
  float u=r.z>r.x?q.x:q.z;                                   // coordonnée le long de la face touchée
  if(m<.5){ alb*=.9+.2*vnoise3(q*14.); }                                            // mat, peint, crépi
  else if(m<1.5){ alb*=(.62+.7*h21(vec2(floor(u*7.),3.)))*(.8+.4*vnoise(vec2(u*40.,q.y*3.)))*mix(.3,1.,smoothstep(0.,.07,fract(u*7.))); }   // bois en planches
  else if(m<2.5){ alb*=(.65+.7*fbm3(q*2.3))*(.85+.3*vnoise3(q*50.)); if(uKit==0) alb=mix(alb,vec3(.07,.12,.03),.6*smoothstep(.4,.9,n.y)*smoothstep(.45,.6,fbm3(q*1.1+3.))); }   // pierre
  else if(m<3.5){ alb*=.85+.3*vnoise3(q*6.); spec=.5; }                              // métal
  else if(m<4.5){ alb*=.12; spec=.8; }                                               // verre
  else if(m<5.5){ alb*=.7+.6*vnoise3(q*110.); }                                      // pelage, tissu
  else if(m<6.5){ alb*=(.7+.6*vnoise(vec2(q.x*3.,q.z*14.)))*mix(.55,1.,smoothstep(0.,.08,fract(abs(q.z)*4.))); spec=.08; }   // tuile, ardoise
  else { emis=1.; }                                                                  // lumineux
  return -1;
}
