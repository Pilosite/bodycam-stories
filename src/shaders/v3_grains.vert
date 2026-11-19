#version 300 es
// Moteur v3 (essai) : le semeur. Un sommet = un grain. À partir de son numéro (gl_VertexID) et de la graine de l'image,
// chaque grain choisit où il se pose dans le monde : sur un tronc, une branche, une perche, un bloc de grès, une feuille,
// un objet de la fiche, un élément d'une couche de semis (immeuble, voiture, tombe…). Mêmes grilles, mêmes tirages et mêmes formules que le lanceur de rayons (monde.glsl).
// Aucun tampon de sommets, aucune étape ne parcourt la scène : chaque grain fait un travail borné.
//
// Répartition (vue de la caméra) : un grain d'objet posé au sol tire un cap dans le champ et une distance en progression
// géométrique (ln d uniforme). La densité au sol décroît en 1/d², comme la taille apparente des objets : chaque objet
// reçoit à peu près le même nombre de grains par pixel d'écran, de près comme de loin. Le côté du grain est réglé pour
// couvrir l'objet environ uK² fois. Vu du soleil (carte d'ombres), la répartition est uniforme sur un disque qui couvre
// la carte, décalé vers le soleil (les ombres tombent loin de leur arbre quand le soleil est bas).
// Les feuilles tirent une direction de l'écran et une distance dans la tranche de canopée, et prennent la feuille de la
// cellule où elles tombent (voir semeF).
precision highp float; precision highp int; precision highp sampler2D;
#ifndef FORMES
#define FORMES 0             // deux variantes du même semeur (src/main.js) : 0 arbres, perches, blocs, feuilles ; 1 formes (objets, semis).
#endif                       // En rendu logiciel, le code présent coûte même s'il ne s'exécute pas : la forêt garde le semeur d'avant.
#include "monde.glsl"
#include "v3_commun.glsl"
uniform uint  uFrame;        // graine de l'image : les grains sont re-tirés à chaque image
uniform int   uVue;          // 0 caméra (tampon G), 1 soleil (carte d'ombres)
uniform ivec4 uPart;         // fin des tranches : arbres, perches, blocs, feuilles
uniform int   uPartO;        // fin de la tranche des objets de la fiche
uniform ivec4 uPartS;        // fin des tranches des couches de semis (4 au plus) ; uTotal = la dernière
uniform vec4  uNbS;          // grains des couches de semis
uniform vec4  uSemR;         // rayon horizontal d'un élément de chaque couche (m) : le cap semé s'élargit d'autant
uniform float uKf;           // recouvrement visé sur les formes (objets, semis) : les grains y sont découpés, ils peuvent être plus grands
uniform int   uTotal;
uniform vec4  uAz;           // cap du regard, demi-ouverture du cap au loin, distance mini, ln(dmax / dmin)
uniform float uAzPres;       // demi-ouverture du cap tout près (tout le tour quand on regarde ses pieds)
float demiCap(float d){ return mix(uAz.y,uAzPres,clamp(2.5/d,0.,1.)); }
uniform vec3  uZone;         // vue du soleil : centre (xz) et rayon du disque semé (uniformément : la carte a des texels égaux)
uniform vec4  uNb;           // grains des tranches : arbres, perches, blocs, feuilles
uniform float uK;            // recouvrement visé (côté du grain = uK × l'écart moyen entre grains)
uniform float uMaxPt;
uniform vec4  uAncre;        // feuilles en marche : ancre du tirage dans le monde (x, z), 1 = actif, cap du secteur
uniform vec2  uFeuil;        // feuilles : profondeur de tranche au plus, pixels de l'écran
uniform vec3  uSoleilC;      // carte d'ombres : centre, base (droite, haut, vers le soleil), demi-largeur et profondeur
uniform mat3  uSoleilM;
uniform vec4  uSoleilE;      // demi-largeur, demi-hauteur, demi-profondeur, taille d'un texel (m)
uniform vec3  uSd;           // direction du soleil de cette image
uniform int   uTrait;        // vue du soleil : 1 = les perches sont semées en traits (deux sommets par grain, gl.LINES)
uniform sampler2D uSemis;    // objets de la fiche : lignes 0-7 (poids cumulé, grains), lignes 8+ (aire cumulée dans l'objet, aire) ;
                             // couches de semis : ligne de tête (aire de l'élément), lignes des formes (aire cumulée dans l'élément, aire)

uint hu(uint x){ x=x*747796405u+2891336453u; x=((x>>((x>>28u)+4u))^x)*277803737u; return (x>>22u)^x; }

struct Grain { vec3 P; vec3 N; vec3 q; float code; mat2 rot; float s;   // s : côté du grain, en mètres
  int row; bool sem; ElemS e; float ech; };                  // forme touchée (-1 : aucune), élément de semis, mètres du repère de la forme par mètre
// Sur un cylindre de rayon r, le côté du grain ne dépasse pas le diamètre et le grain reste dans la silhouette :
// un tronc fin n'est pas épaissi, il est seulement moins couvert à chaque image (l'accumulation en fait un trait fin).
float cote(float aire, float n){ return uK*sqrt(aire/max(n,1e-6)); }
float angleVu(float s, float r){ return asin((2.*rnd()-1.)*clamp(1.-s/(2.*r),0.,1.)); }

vec2 tireSol(out float dh){                                  // un point du sol, selon la vue
  if(uVue==0){ dh=uAz.z*exp(rnd()*uAz.w); float c=uAz.x+(2.*rnd()-1.)*demiCap(dh); return uCamPos.xz+dh*vec2(sin(c),cos(c)); }
  float c=6.2831853*rnd(); dh=uZone.z*sqrt(rnd()); return uZone.xy+dh*vec2(sin(c),cos(c));
}
float parM2(vec2 c, float N){                                // grains attendus par m² de sol au point c
  if(uVue==0){ float d=max(distance(c,uCamPos.xz),uAz.z); return N/(d*d*2.*demiCap(d)*uAz.w); }
  return N/(3.1415927*uZone.z*uZone.z);
}
/* Un élément de semis peut être grand (un immeuble) : vu de près, son centre sort du cap alors que sa façade est dans
   l'image. Le cap est élargi de l'angle sous lequel on voit son rayon R ; la densité attendue en tient compte. */
float demiCapR(float d, float R){ return min(3.1415927,demiCap(d)+atan(R/max(d,.1))); }
vec2 tireSolR(float R){
  if(uVue==0){ float dh=uAz.z*exp(rnd()*uAz.w); float c=uAz.x+(2.*rnd()-1.)*demiCapR(dh,R); return uCamPos.xz+dh*vec2(sin(c),cos(c)); }
  float c=6.2831853*rnd(), dh=uZone.z*sqrt(rnd()); return uZone.xy+dh*vec2(sin(c),cos(c));
}
float parM2R(vec2 c, float N, float R){
  if(uVue==0){ float d=max(distance(c,uCamPos.xz),uAz.z); return N/(d*d*2.*demiCapR(d,R)*uAz.w); }
  return N/(3.1415927*uZone.z*uZone.z);
}
vec3 versVue(vec3 P){ return uVue==0?uCamPos-P:uSd; }       // direction du spectateur (caméra ou soleil)

#if !FORMES
/* ---- arbres (sdTreeA) : tronc, trois branches, et pour les conifères le cœur de feuillage (le même cône que sdTreeA) */
bool semeA(out Grain g){
  float dh; vec2 xz=tireSol(dh);
  vec2 id=floor((RA*xz)/CA);
  ArbreA A; if(!arbreA(id,A)) return false;
  vec2 c=(id+.5)*CA;
  vec2 pied=(c+A.o)*RA; float th0=terrainH(pied);
  vec3 vv=versVue(vec3(pied.x,th0+1.5,pied.y));
  vec2 vc=RA*vv.xz; vec3 vl=vec3(vc.x,vv.y,vc.y);            // direction du spectateur, repère de la cellule
  float aT=2.*A.r0*.85*(A.H+.3);
  vec4 aB=vec4(0.);
  for(int k=0;k<3;k++){ vec3 a0,a1; float rb; brancheA(A,k,a0,a1,rb); aB[k]=2.*rb*.67*length(a1-a0); }
  float Rm=0., y0=uHoup.y, Hc=A.H+1.2-uHoup.y;               // cœur de feuillage (conifères) : rayon au pied, hauteur
  if(uHoup.x>.5){ Rm=min(uHoup.z*(.8+.4*A.h.w),3.3-max(abs(A.o.x),abs(A.o.y)))*.74; aB.w=2.*.36*Rm*Hc; }
  float u=rnd()*(aT+aB.x+aB.y+aB.z+aB.w);
  float s=cote(aT+aB.x+aB.y+aB.z+aB.w,parM2(pied,uNb.x)*CA*CA);
  vec3 lp, nl; float coeur=0.;                               // repère de la cellule (f.x, y, f.y)
  bool pres=uVue==0 && procheA(id);                         // tronc et cœur dessinés en boîte (v3_proches) : seules les branches restent en grains
  if(pres && (u<aT || u>=aT+aB.x+aB.y+aB.z)) return false;
  if(u<aT){
    float y=mix(-.3,A.H,rnd()), yc=clamp(y,-1.,A.H);
    vec2 ax=A.o+A.lean*yc; float r=rayonA(A,y);
    vec2 to=uVue==0?vl.xz-(ax-A.o):vl.xz;
    float ph=atan(to.y,to.x)+angleVu(s,r); s=min(s,2.*r);
    vec2 e=vec2(cos(ph),sin(ph));
    lp=vec3(ax.x+r*e.x,y,ax.y+r*e.y); nl=vec3(e.x,0.,e.y);
  } else if(u<aT+aB.x+aB.y+aB.z){
    u-=aT; int k=u<aB.x?0:u<aB.x+aB.y?1:2;
    vec3 a0,a1; float rb; brancheA(A,k,a0,a1,rb);
    float t=rnd(); vec3 cc=mix(a0,a1,t); float rr=mix(rb,rb*.35,t);
    vec3 ax=normalize(a1-a0), e1=normalize(cross(ax,abs(ax.y)>.95?vec3(1.,0.,0.):vec3(0.,1.,0.))), e2=cross(ax,e1);
    vec3 to=uVue==0?vl-(cc-vec3(A.o.x,1.5,A.o.y)):vl; to-=ax*dot(to,ax);
    float ph=atan(dot(to,e2),dot(to,e1))+angleVu(s,rr); s=min(s,2.*rr);
    nl=cos(ph)*e1+sin(ph)*e2; lp=cc+rr*nl;
  } else {                                                   // cœur : hauteur tirée selon le rayon (plus large en bas)
    const float cc=.92; float t=(1.-sqrt(max(1.-2.*cc*rnd()*(1.-.5*cc),0.)))/cc, y=y0+t*Hc;
    float R=Rm*(1.-cc*t)*(.8+.2*sin(y*4.2+A.h.w*30.));
    vec2 to=uVue==0?vl.xz:vl.xz;
    float ph=atan(to.y,to.x)+angleVu(s,R); s=min(s,R);
    vec2 e=vec2(cos(ph),sin(ph));
    lp=vec3(A.o.x+R*e.x,y,A.o.y+R*e.y); nl=normalize(vec3(e.x,Rm*cc/Hc,e.y)); coeur=1.;
  }
  vec2 w=(c+lp.xz)*RA;
  g.P=vec3(w.x,terrainH(w)+lp.y,w.y);
  vec2 nw=nl.xz*RA; g.N=normalize(vec3(nw.x,nl.y,nw.y));
  float yc=clamp(lp.y,-1.,A.H); vec2 dq=lp.xz-(A.o+A.lean*yc);
  g.q=vec3(dq.x,lp.y,dq.y); g.code=1.+.5*(A.h.w*.999+coeur); g.rot=RA;   // paramètre ≥ 1 : cœur de feuillage
  g.s=s;
  return true;
}

/* ---- perches (sdTreeB) */
bool semeB(out Grain g){
  float dh; vec2 xz=tireSol(dh);
  vec2 id=floor((RB*xz+17.3)/CB);
  PercheB B; if(!percheB(id,B) || (uVue==0 && procheP(id))) return false;
  vec2 c=(id+.5)*CB;
  vec2 pied=(c+B.o-17.3)*RB;
  vec3 vv=versVue(vec3(pied.x,terrainH(pied)+1.5,pied.y));
  vec2 vc=RB*vv.xz;
  float y=mix(-.3,B.H,rnd()), yc=clamp(y,-1.,B.H);
  vec2 ax=axeB(B,yc); float r=rayonB(B,y);
  vec2 to=uVue==0?vc-(ax-B.o):vc;
  float sB=cote(2.*B.r0*.8*(B.H+.3),parM2(pied,uNb.y)*CB*CB);
  float ph=atan(to.y,to.x)+angleVu(sB,r);
  vec2 e=vec2(cos(ph),sin(ph));
  vec2 f=ax+r*e;
  vec2 w=(c+f-17.3)*RB;
  g.P=vec3(w.x,terrainH(w)+y,w.y);
  vec2 nw=e*RB; g.N=vec3(nw.x,0.,nw.y);
  g.q=vec3(r*e.x,y,r*e.y); g.code=2.+.5*B.h.w; g.rot=RB;
  g.s=min(sB,2.*r);
  return true;
}

/* Vue du soleil : une perche ne fait souvent qu'un ou deux texels de large. Un grain carré l'épaissit ou la troue ;
   un trait d'un texel suit son axe. La perche est couverte environ deux fois et demie par des traits tirés au hasard. */
bool semeBTrait(int bout, out vec3 P){
  float dh; vec2 xz=tireSol(dh);
  vec2 id=floor((RB*xz+17.3)/CB);
  PercheB B; if(!percheB(id,B)) return false;
  vec2 c=(id+.5)*CB, pied=(c+B.o-17.3)*RB;
  float m=parM2(pied,uNb.y)*CB*CB;
  float L=(B.H+.3)*clamp(2.5/max(m,1e-3),.2,1.);
  float y0=mix(-.3,B.H-L,rnd()), y=bout==0?y0:y0+L;
  vec2 w=(c+axeB(B,clamp(y,-1.,B.H))-17.3)*RB;
  P=vec3(w.x,terrainH(w)+y,w.y);
  return true;
}

/* ---- blocs de grès (sdRock) : grain posé sur l'ellipsoïde, puis ramené sur la forme bosselée (deux pas de Newton) */
float formeBloc(vec3 P, vec2 id, Bloc B){ return blocForme(blocLocal(P,terrainH(P.xz),id,B),B); }
vec3 gradBloc(vec3 P, vec2 id, Bloc B){
  const float e=.01; const vec2 k=vec2(1.,-1.);
  return (k.xyy*formeBloc(P+k.xyy*e,id,B)+k.yyx*formeBloc(P+k.yyx*e,id,B)+k.yxy*formeBloc(P+k.yxy*e,id,B)+k.xxx*formeBloc(P+k.xxx*e,id,B))/(4.*e);
}
bool semeR(out Grain g){
  float dh; vec2 xz=tireSol(dh);
  vec2 id=floor(xz/CC);
  Bloc B; if(!blocGres(id,B) || (uVue==0 && procheB(id))) return false;
  vec2 cw=(id+.5)*CC+B.o;
  float ca=cos(B.a), sa=sin(B.a); mat2 M=mat2(ca,sa,-sa,ca);
  vec3 vv=versVue(vec3(cw.x,terrainH(cw)+B.R*.22,cw.y));
  vec2 vc=M*vv.xz; vec3 vl=vec3(vc.x,vv.y,vc.y);
  float z=2.*rnd()-1., a=6.2831853*rnd(), s=sqrt(max(1.-z*z,0.));
  vec3 u=vec3(s*cos(a),z,s*sin(a));
  if(dot(u/B.rad,vl)<0.) u=-u;
  vec3 lp=B.rad*u;
  vec2 w=cw+lp.xz*M;
  vec3 P=vec3(w.x,terrainH(w)+B.R*.22+lp.y,w.y);
  vec3 gr=vec3(0.,1.,0.);
  for(int i=0;i<2;i++){ gr=gradBloc(P,id,B); P-=gr*formeBloc(P,id,B)/max(dot(gr,gr),1e-4); }
  g.P=P; g.N=normalize(gr);
  g.q=blocLocal(P,terrainH(P.xz),id,B); g.code=3.; g.rot=M;
  g.s=cote(3.1416*max(B.rad.x,B.rad.z)*B.rad.y,parM2(cw,uNb.z)*CC*CC);
  return true;
}

#else
/* ---- formes de base (objets et éléments de semis) : un point tiré uniformément selon l'aire, sur la partie de la forme
   tournée vers le spectateur (V : sa position si pos, sa direction sinon), dans le repère de la forme (primLocal). Même
   géométrie que sdPrim. Rend false si rien n'est tourné vers lui. Une forme fondue dans ses voisines (« lisse ») est semée
   sans la fusion. */
bool surfForme(float ty, vec3 s, float ar, vec3 V, bool pos, out vec3 q, out vec3 n){
  q=vec3(0.); n=vec3(0.,1.,0.);
  if(ty<.5){                                                 // boîte : une des faces vues, tirée selon son aire
    vec3 b=s+ar, sg;
    for(int i=0;i<3;i++) sg[i]=pos?(abs(V[i])>b[i]?sign(V[i]):0.):sign(V[i]);
    vec3 A=vec3(b.y*b.z,b.x*b.z,b.x*b.y)*abs(sg);
    float tot=A.x+A.y+A.z; if(tot<=0.) return false;
    float u=rnd()*tot; int ax=u<A.x?0:u<A.x+A.y?1:2;
    q=(vec3(rnd(),rnd(),rnd())*2.-1.)*b; q[ax]=sg[ax]*b[ax]; n=vec3(0.); n[ax]=sg[ax];
    return true;
  }
  if(ty<1.5){                                                // ellipsoïde
    vec3 r=s+ar; float z=2.*rnd()-1., a=6.2831853*rnd(), c=sqrt(max(1.-z*z,0.)); vec3 d=vec3(c*cos(a),z,c*sin(a));
    q=d*r; n=normalize(d/r); if(dot(n,pos?V-q:V)<0.){ q=-q; n=-n; }
    return true;
  }
  if(ty<4.5){                                                // cylindre, cône, capsule : flanc vu, fonds ou bouts
    float r=s.x+ar, h=s.y+(ty<2.5?ar:0.);
    float dv=length(V.xz), arc=pos?(dv>r?acos(clamp(r/dv,0.,1.)):0.):1.5707963;   // demi-arc du flanc vu
    float L=sqrt(r*r+4.*h*h);
    float aF=ty<2.5?4.*arc*r*h:ty<3.5?arc*r*L:4.*arc*r*h;
    float haut=pos?step(h,V.y):step(0.,V.y), bas=pos?step(V.y,-h):step(V.y,0.);
    float aH=ty<2.5?3.1415927*r*r*haut:0., aB=ty<3.5?3.1415927*r*r*bas:0., aS=ty>3.5?6.2831853*r*r:0.;
    float tot=aF+aH+aB+aS; if(tot<=0.) return false;
    float u=rnd()*tot;
    if(u<aF){
      float ph=atan(V.z,V.x)+(2.*rnd()-1.)*arc, y, rr=r;
      if(ty>2.5 && ty<3.5){ float w=1.-sqrt(1.-rnd()); y=-h+2.*h*w; rr=r*(1.-w); n=normalize(vec3(cos(ph)*2.*h,r,sin(ph)*2.*h)); }
      else { y=(2.*rnd()-1.)*h; n=vec3(cos(ph),0.,sin(ph)); }
      q=vec3(rr*cos(ph),y,rr*sin(ph));
    } else if(u<aF+aH+aB){
      float sg=u<aF+aH?1.:-1., a=6.2831853*rnd(), rr=r*sqrt(rnd());
      q=vec3(rr*cos(a),sg*h,rr*sin(a)); n=vec3(0.,sg,0.);
    } else {                                                 // bouts de la capsule : demi-sphères
      float z=2.*rnd()-1., a=6.2831853*rnd(), c=sqrt(max(1.-z*z,0.)); n=vec3(c*cos(a),z,c*sin(a));
      vec3 o=vec3(0.,n.y>0.?h:-h,0.);
      if(dot(n,pos?V-o-n*r:V)<0.){ n=-n; o=-o; }
      q=o+n*r;
    }
    return true;
  }
  // toit à deux pentes, faîtage le long de x : deux pans, deux pignons, le dessous
  float l=sqrt(s.z*s.z+4.*s.y*s.y);
  float A[5]; vec3 N[5]; vec3 O[5];
  N[0]=vec3(0.,s.z,2.*s.y)/l; O[0]=vec3(0.,-s.y,s.z); N[1]=vec3(0.,s.z,-2.*s.y)/l; O[1]=vec3(0.,-s.y,-s.z);
  N[2]=vec3(1.,0.,0.); O[2]=vec3(s.x,0.,0.); N[3]=vec3(-1.,0.,0.); O[3]=vec3(-s.x,0.,0.); N[4]=vec3(0.,-1.,0.); O[4]=vec3(0.,-s.y,0.);
  float tot=0.;
  for(int i=0;i<5;i++){ float ai=i<2?2.*s.x*l:i<4?2.*s.y*s.z:4.*s.x*s.z; A[i]=dot(N[i],pos?V-O[i]:V)>0.?ai:0.; tot+=A[i]; }
  if(tot<=0.) return false;
  float u=rnd()*tot; int f=4;
  for(int i=0;i<5;i++){ if(u<A[i]){ f=i; break; } u-=A[i]; }
  float a=rnd(), b=rnd();
  if(f<2){ float sg=f==0?1.:-1.; q=vec3((2.*a-1.)*s.x,-s.y+2.*s.y*b,sg*s.z*(1.-b)); }
  else if(f<4){ if(a+b>1.){ a=1.-a; b=1.-b; } vec2 t=vec2(-s.z,-s.y)+a*vec2(2.*s.z,0.)+b*vec2(s.z,2.*s.y); q=vec3(f==2?s.x:-s.x,t.y,t.x); }
  else q=vec3((2.*a-1.)*s.x,-s.y,(2.*b-1.)*s.z);
  n=N[f];
  return true;
}

/* ---- objets de la fiche (sdProps) : objet tiré selon son poids (calculé par la page), forme selon son aire, point tiré
   sur la partie de la forme tournée vers la vue (surfForme). */
vec3 versForme(Grain g, vec3 P){ return primLocal(g.sem?semisLocal(P,g.e):P,g.row); }   // monde -> repère de la forme du grain
bool semeP(out Grain g){
  float u=rnd(); int oi=-1; float nO=0.;
  for(int i=0;i<8;i++){ if(i>=uObjN) break; vec4 s=texelFetch(uSemis,ivec2(0,i),0); if(u<=s.x && s.y>0.){ oi=i; nO=s.y; break; } }
  if(oi<0) return false;
  vec4 o1=texelFetch(uShapes,ivec2(1,oi),0);
  int st=int(o1.x), cn=int(o1.y), row=st; float v=rnd(), aire=1.;
  bool pris=false;
  for(int j=0;j<24;j++){ if(j>=cn) break; vec4 s=texelFetch(uSemis,ivec2(0,st+j),0); if(!pris){ row=st+j; aire=s.y; pris=v<=s.x; } }
  vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), e=texelFetch(uShapes,ivec2(3,row),0);
  vec3 V=uVue==0?primLocal(uCamPos,row):primLocal(a.xyz+uSd,row);
  vec3 lq, ln;
  if(!surfForme(a.w,b.xyz,e.y,V,uVue==0,lq,ln)) return false;
  g.P=primMonde(lq,row,false); g.N=normalize(primMonde(ln,row,true));
  g.q=g.P; g.code=4.+.5*(float(row)/128.); g.rot=mat2(1.);
  g.row=row; g.sem=false; g.ech=1.;
  g.s=uKf*sqrt(aire*.5/max(nO*aire,1e-6));   // nO : grains attendus par m² de surface de l'objet ; ils tombent tous sur la moitié tournée vers la vue
  return true;
}

/* ---- éléments des couches de semis (sdSemis) : le grain tire un point du sol (cap élargi du rayon de l'élément), prend
   l'élément de la cellule avec les tirages de semisElem, une forme selon son aire, un point sur la partie de la forme
   tournée vers la vue, et le ramène dans le monde (semisMonde). Le tampon G garde le point du monde : la passe de matière
   retrouve l'élément par sdSemis, comme le lanceur de rayons. */
bool semeS(int k, out Grain g){
  float Rk=k==0?uSemR.x:k==1?uSemR.y:k==2?uSemR.z:uSemR.w, Nk=k==0?uNbS.x:k==1?uNbS.y:k==2?uNbS.z:uNbS.w;
  vec2 xz=tireSolR(Rk);
  ElemS e; vec2 id, f;
  if(semisGrille(xz,k,e,id,f)>=0.) return false;
  if(!semisElem(k,id,e) || (uVue==0 && procheS(k,id,e))) return false;
  int r0=SEM0+k*SEML, cn=int(e.K.z), row=-1; float v=rnd();
  for(int j=0;j<6;j++){ float c=texelFetch(uSemis,ivec2(0,r0+4+j),0).x; if(row<0 && j<cn && (v<=c || j==cn-1)) row=r0+4+j; }   // sans sortie de boucle (compilateurs D3D)
  vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), ee=texelFetch(uShapes,ivec2(3,row),0);
  vec3 C=semisMonde(vec3(0.),e);
  vec3 V=uVue==0?primLocal(semisLocal(uCamPos,e),row):primLocal(a.xyz+normalize(semisLocal(C+uSd,e)-semisLocal(C,e)),row);
  vec3 lq, ln;
  if(!surfForme(a.w,b.xyz,ee.y,V,uVue==0,lq,ln)) return false;
  g.P=semisMonde(primMonde(lq,row,false),e);
  vec3 t1=normalize(cross(ln,abs(ln.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.))), t2=cross(ln,t1);
  const float ep=.02;                                        // normale : la transformation (échelle, pente, rangée courbe) n'est pas une rotation
  g.N=normalize(cross(semisMonde(primMonde(lq+t1*ep,row,false),e)-g.P,semisMonde(primMonde(lq+t2*ep,row,false),e)-g.P));
  g.q=g.P; g.code=6.+.125*float(k); g.rot=mat2(1.);
  g.row=row; g.sem=true; g.e=e; g.ech=1./(e.s*sqrt(e.sy));
  float nE=parM2R(C.xz,Nk,Rk)*e.A.x*e.A.y;       // grains attendus sur cet élément à chaque image
  float aE=texelFetch(uSemis,ivec2(0,r0),0).x*e.s*e.s*mix(1.,e.sy,.7);
  g.s=uKf*sqrt(aE*.5/max(nE,1e-6));
  return true;
}

#endif
#if !FORMES
/* ---- feuilles (vue de la caméra seulement : la canopée ombre par sa transmittance statistique, canopyT).
   Le grain tire une direction de l'écran et une distance dans la tranche de canopée, puis prend la feuille de la cellule
   de 30 cm où il tombe : mêmes cellules, mêmes tirages que les feuilles du lanceur de rayons (foliage). Une feuille proche
   est touchée à presque chaque image et dessinée à sa taille ; une feuille lointaine l'est rarement, et elle est alors
   agrandie (jusqu'à 1,8 fois, 5 pixels au plus) pour compenser en partie. */
bool semeF(out vec4 pos, out float taille){
  vec3 O=uCamPos, rd;
  if(uAncre.z>.5){                                           // en marche : tirage accroché au monde. Les mêmes grains retombent sur les mêmes
    O=vec3(uAncre.x,uCamPos.y,uAncre.y);                     // feuilles d'une image à l'autre, au lieu d'un feuillage qui grésille.
    float az=uAncre.w+(rnd()-.5)*3.9, se=rnd()*.98, ce=sqrt(1.-se*se);
    rd=vec3(sin(az)*ce,se,cos(az)*ce);
  } else {
    vec2 uv=(vec2(rnd(),rnd())-.5)*vec2(uRes.x/uRes.y,1.);
    float rr=length(uv), ang=rr*uFish;
    rd=normalize(uCam*vec3(uv/max(rr,1e-5)*sin(ang),cos(ang)));
  }
  float ry=abs(rd.y)<1e-4?1e-4:rd.y;
  float ta=(YC0-O.y)/ry, tb=(YC1-O.y)/ry;
  float t0=max(min(ta,tb),0.), t1=min(min(max(ta,tb),150.),t0+uFeuil.x);
  if(t1<=t0) return false;
  t0=max(t0,2.);
  if(t1<=t0) return false;
  float lr=log(t1/t0), t;                                    // distance en progression géométrique : les feuilles proches d'abord
  vec3 cell, hc; bool ok=false;
  for(int k=0;k<3;k++){                                      // trois essais : la plupart des cellules sont vides
    t=t0*exp(rnd()*lr);
    cell=floor((O+rd*t)/CS);
    hc=h33(cell+uSeed);
    if(hc.x<canopyDens((cell+.5)*CS)*LEAFP){ ok=true; break; }
  }
  if(!ok) return false;
  vec3 r2=h33(cell+19.19);
  vec3 c=(cell+.3+.4*r2)*CS;
  float la=(.05+.05*hc.y)*(uHoup.x>.5?3.2:1.);
  float dist, a2;
  if(!projette(c,1.62,pos,dist,a2)) return false;
  float ppr=uRes.y/uFish;
  float e=3.*uNb.w*pow(CS*ppr/t,2.)/uFeuil.y*CS/(t*lr);         // grains attendus dans cette cellule à chaque image (environ)
  float p=1.-exp(-e);
  // agrandissement borné : au-delà, une feuille rare deviendrait un carré visible en marche ; le feuillage lointain
  // est alors un peu plus clair que celui du lanceur de rayons (non corrigé)
  taille=min(1.5*la/dist*ppr*min(1./sqrt(max(p,1e-4)),1.8),5.);
  vQ=leafCol(c,hc.z); vN=normalize(r2.zxy*2.-1.+vec3(0.,.6,0.)); vCode=5.; vDist=dist;
  return true;
}

#endif
void main(){
  rs=hu(uint(gl_VertexID)^hu(uFrame)); rnd();
  gl_Position=vec4(0.,0.,2.,1.); gl_PointSize=1.;
  sansGrain();
  int i=gl_VertexID;
#if !FORMES
  if(uTrait==1){                                             // perches vues du soleil, en traits
    rs=hu(uint(i>>1)^hu(uFrame)); rnd();
    vec3 P; if(!semeBTrait(i&1,P)) return;
    vec3 l=(P-uSoleilC)*uSoleilM;
    gl_Position=vec4(l.xy/uSoleilE.xy,clamp(-l.z/uSoleilE.z,-1.,1.),1.);
    return;
  }
#endif
  if(i>=uTotal) return;
  Grain g; bool ok; g.row=-1; g.sem=false; g.ech=1.;
#if FORMES
  if(i<uPartO) ok=semeP(g);
  else ok=semeS(i<uPartS.x?0:i<uPartS.y?1:i<uPartS.z?2:3,g);
#else
  if(i>=uPart.z && i<uPart.w){
    vec4 pos; float t;
    if(uVue!=0) return;
    if(uAncre.z>.5){ rs=hu(uint(gl_VertexID)*2654435761u+97u); rnd(); }   // graine fixe : le tirage ne dépend plus de l'image
    if(!semeF(pos,t)) return;
    if(t<1.){ if(rnd()>t*t) return; t=1.; }
    gl_Position=pos; gl_PointSize=min(t,uMaxPt); vSz=gl_PointSize;
    return;
  }
  if(i<uPart.x) ok=semeA(g);
  else if(i<uPart.y) ok=semeB(g);
  else ok=semeR(g);
#endif
  float s=g.s;
  bool forme=FORMES==1;
  vec3 dv, ex, ey; float t, m, dist=0.;
  if(uVue==1){                                               // carte d'ombres : projection orthographique
    vec3 l=(g.P-uSoleilC)*uSoleilM;
    t=s/uSoleilE.w;
    if(t<1.){ if(rnd()>t*t) return; t=1.; }
    gl_Position=vec4(l.xy/uSoleilE.xy,clamp(-l.z/uSoleilE.z,-1.,1.),1.);
    gl_PointSize=min(t,uMaxPt);
    if(!forme) return;
    dv=-uSd; m=uSoleilE.w; ex=uSoleilM[0]*m; ey=uSoleilM[1]*m;
    vDist=clamp(-l.z/uSoleilE.z,-1.,1.)*.5+.5;
  } else {
    vec4 pos; float ang;
    if(!projette(g.P,1.62,pos,dist,ang)) return;
    dv=(g.P-uCamPos)/dist;
    if(dot(g.N,dv)>(forme?0.:.2)) return;                    // face tournée vers l'arrière
    float ppr=uRes.y/uFish;                                  // pixels par radian
    t=s/dist*ppr*max(1.,ang/max(sin(ang),.05));
    if(t<1.){ if(rnd()>t*t) return; t=1.; }
    t=min(t,uMaxPt);
    gl_Position=pos; gl_PointSize=t;
    m=dist/ppr; ex=uCam[0]*m; ey=uCam[1]*m;
  }
  // variation des coordonnées d'un pixel à l'autre du grain : déplacement dans le plan tangent, ramené le long du regard.
  // Sur une forme, le plan tangent est exact jusqu'au bord (où le fragment est découpé) : on le suit même en incidence rasante.
  float den=dot(dv,g.N); den=sign(den)*max(abs(den),forme?.02:.25); if(den==0.) den=-.25;
  ex-=dv*dot(ex,g.N)/den; ey-=dv*dot(ey,g.N)/den;
  vSz=gl_PointSize;
#if FORMES
  {
    vec4 b=texelFetch(uShapes,ivec2(1,g.row),0), e=texelFetch(uShapes,ivec2(3,g.row),0); float ty=texelFetch(uShapes,ivec2(0,g.row),0).w;
    vL=versForme(g,g.P); vLx=versForme(g,g.P+ex)-vL; vLy=versForme(g,g.P+ey)-vL;
    vB=vec4(b.xyz,e.y);
    float pl=m*g.ech;                                        // un pixel (ou un texel), en mètres du repère de la forme
    vT=vec2(ty,(ty<.5||ty>4.5)?.7*pl:.7*pl+.3*s*g.ech);       // faces planes : découpe au pixel ; formes courbes : un peu de marge
  }
#endif
  if(uVue==1){ vDd=-vec2(dot(ex,uSd),dot(ey,uSd))/(2.*uSoleilE.z); return; }   // profondeur vue du soleil, par texel
  vec2 rx=g.rot*ex.xz, ry=g.rot*ey.xz;
  vQ=g.q; vN=g.N; vCode=g.code; vDist=dist;
  vDx=vec3(rx.x,ex.y,rx.y); vDy=vec3(ry.x,ey.y,ry.y); vDd=vec2(dot(ex,dv),dot(ey,dv));
}
