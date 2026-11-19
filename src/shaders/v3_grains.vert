#version 300 es
// Moteur v3 (essai) : le semeur. Un sommet = un grain. À partir de son numéro (gl_VertexID) et de la graine de l'image,
// chaque grain choisit où il se pose dans le monde : sur un tronc, une branche, une perche, un bloc de grès, une feuille,
// un objet de la fiche. Mêmes grilles, mêmes tirages et mêmes formules que le lanceur de rayons (monde.glsl).
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
#include "monde.glsl"
#include "v3_commun.glsl"
uniform uint  uFrame;        // graine de l'image : les grains sont re-tirés à chaque image
uniform int   uVue;          // 0 caméra (tampon G), 1 soleil (carte d'ombres)
uniform ivec4 uPart;         // fin des tranches : arbres, perches, blocs, feuilles ; puis objets jusqu'à uTotal
uniform int   uTotal;
uniform vec4  uAz;           // cap du regard, demi-ouverture du cap au loin, distance mini, ln(dmax / dmin)
uniform float uAzPres;       // demi-ouverture du cap tout près (tout le tour quand on regarde ses pieds)
float demiCap(float d){ return mix(uAz.y,uAzPres,clamp(2.5/d,0.,1.)); }
uniform vec3  uZone;         // vue du soleil : centre (xz) et rayon du disque semé (uniformément : la carte a des texels égaux)
uniform vec4  uNb;           // grains des tranches : arbres, perches, blocs, feuilles
uniform float uK;            // recouvrement visé (côté du grain = uK × l'écart moyen entre grains)
uniform float uMaxPt;
uniform vec2  uFeuil;        // feuilles : profondeur de tranche au plus, pixels de l'écran
uniform vec3  uSoleilC;      // carte d'ombres : centre, base (droite, haut, vers le soleil), demi-largeur et profondeur
uniform mat3  uSoleilM;
uniform vec4  uSoleilE;      // demi-largeur, demi-hauteur, demi-profondeur, taille d'un texel (m)
uniform vec3  uSd;           // direction du soleil de cette image
uniform int   uTrait;        // vue du soleil : 1 = les perches sont semées en traits (deux sommets par grain, gl.LINES)
uniform sampler2D uSemis;    // objets de la fiche : lignes 0-7 (poids cumulé, grains), lignes 8+ (aire cumulée dans l'objet, aire)

uint hu(uint x){ x=x*747796405u+2891336453u; x=((x>>((x>>28u)+4u))^x)*277803737u; return (x>>22u)^x; }

struct Grain { vec3 P; vec3 N; vec3 q; float code; mat2 rot; float s; };   // s : côté du grain, en mètres
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
vec3 versVue(vec3 P){ return uVue==0?uCamPos-P:uSd; }       // direction du spectateur (caméra ou soleil)

/* ---- arbres (sdTreeA) : tronc et trois branches */
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
  float u=rnd()*(aT+aB.x+aB.y+aB.z);
  float s=cote(aT+aB.x+aB.y+aB.z,parM2(pied,uNb.x)*CA*CA);
  vec3 lp, nl;                                               // repère de la cellule (f.x, y, f.y)
  if(u<aT){
    float y=mix(-.3,A.H,rnd()), yc=clamp(y,-1.,A.H);
    vec2 ax=A.o+A.lean*yc; float r=rayonA(A,y);
    vec2 to=uVue==0?vl.xz-(ax-A.o):vl.xz;
    float ph=atan(to.y,to.x)+angleVu(s,r); s=min(s,2.*r);
    vec2 e=vec2(cos(ph),sin(ph));
    lp=vec3(ax.x+r*e.x,y,ax.y+r*e.y); nl=vec3(e.x,0.,e.y);
  } else {
    u-=aT; int k=u<aB.x?0:u<aB.x+aB.y?1:2;
    vec3 a0,a1; float rb; brancheA(A,k,a0,a1,rb);
    float t=rnd(); vec3 cc=mix(a0,a1,t); float rr=mix(rb,rb*.35,t);
    vec3 ax=normalize(a1-a0), e1=normalize(cross(ax,abs(ax.y)>.95?vec3(1.,0.,0.):vec3(0.,1.,0.))), e2=cross(ax,e1);
    vec3 to=uVue==0?vl-(cc-vec3(A.o.x,1.5,A.o.y)):vl; to-=ax*dot(to,ax);
    float ph=atan(dot(to,e2),dot(to,e1))+angleVu(s,rr); s=min(s,2.*rr);
    nl=cos(ph)*e1+sin(ph)*e2; lp=cc+rr*nl;
  }
  vec2 w=(c+lp.xz)*RA;
  g.P=vec3(w.x,terrainH(w)+lp.y,w.y);
  vec2 nw=nl.xz*RA; g.N=normalize(vec3(nw.x,nl.y,nw.y));
  float yc=clamp(lp.y,-1.,A.H); vec2 dq=lp.xz-(A.o+A.lean*yc);
  g.q=vec3(dq.x,lp.y,dq.y); g.code=1.+.5*A.h.w; g.rot=RA;
  g.s=s;
  return true;
}

/* ---- perches (sdTreeB) */
bool semeB(out Grain g){
  float dh; vec2 xz=tireSol(dh);
  vec2 id=floor((RB*xz+17.3)/CB);
  PercheB B; if(!percheB(id,B)) return false;
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
  Bloc B; if(!blocGres(id,B)) return false;
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

/* ---- objets de la fiche (sdProps) : objet tiré selon son poids (calculé par la page), forme selon son aire,
   grain posé sur la boîte englobante de la forme puis ramené sur elle (trois pas de Newton sur sdPrim).
   Les fusions douces (« lisse ») ne sont pas suivies. */
vec3 primMonde(vec3 q, int row, bool dir){                    // inverse de primLocal
  vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), e=texelFetch(uShapes,ivec2(3,row),0);
  float c, s;
  if(e.z!=0.){ c=cos(e.z); s=sin(e.z); q.yz=vec2(c*q.y-s*q.z,s*q.y+c*q.z); }
  if(e.w!=0.){ c=cos(e.w); s=sin(e.w); q.xy=vec2(c*q.x-s*q.y,s*q.x+c*q.y); }
  c=cos(b.w); s=sin(b.w); q.xz=vec2(c*q.x+s*q.z,-s*q.x+c*q.z);
  return dir?q:q+a.xyz;
}
bool semeP(out Grain g){
  float u=rnd(); int oi=-1; float nO=0.;
  for(int i=0;i<8;i++){ if(i>=uObjN) break; vec4 s=texelFetch(uSemis,ivec2(0,i),0); if(u<=s.x && s.y>0.){ oi=i; nO=s.y; break; } }
  if(oi<0) return false;
  vec4 o1=texelFetch(uShapes,ivec2(1,oi),0);
  int st=int(o1.x), cn=int(o1.y), row=st; float v=rnd(), aire=1.;
  for(int j=0;j<24;j++){ if(j>=cn) break; vec4 s=texelFetch(uSemis,ivec2(0,st+j),0); row=st+j; aire=s.y; if(v<=s.x) break; }
  vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), e=texelFetch(uShapes,ivec2(3,row),0);
  float z=2.*rnd()-1., ag=6.2831853*rnd(), s=sqrt(max(1.-z*z,0.));
  vec3 d=vec3(s*cos(ag),z,s*sin(ag));
  vec3 vw=versVue(a.xyz);
  vec3 q=d*(b.xyz+e.y);
  const vec2 k=vec2(1.,-1.); const float ee=.005;
  vec3 gr=d;
  for(int pass=0;pass<2;pass++){
    vec3 bb=b.xyz+e.y, ad=max(abs(d),vec3(1e-4));
    q=d*min(bb.x/ad.x,min(bb.y/ad.y,bb.z/ad.z));             // départ sur la boîte englobante (coins compris), puis Newton sur la forme
    for(int i=0;i<3;i++){
      gr=(k.xyy*sdPrim(q+k.xyy*ee,a.w,b.xyz)+k.yyx*sdPrim(q+k.yyx*ee,a.w,b.xyz)+k.yxy*sdPrim(q+k.yxy*ee,a.w,b.xyz)+k.xxx*sdPrim(q+k.xxx*ee,a.w,b.xyz))/(4.*ee);
      q-=gr*(sdPrim(q,a.w,b.xyz)-e.y)/max(dot(gr,gr),1e-4);
    }
    if(dot(primMonde(gr,row,true),vw)>=0.) break;
    d=-d;                                                    // face cachée : on retente de l'autre côté
  }
  g.P=primMonde(q,row,false); g.N=normalize(primMonde(gr,row,true));
  g.q=g.P; g.code=4.+.5*(float(row)/128.); g.rot=mat2(1.);
  g.s=cote(aire*.5,nO*aire);    // nO : grains attendus par m² de surface de l'objet ; ils tombent tous sur la moitié tournée vers la vue
  return true;
}

/* ---- feuilles (vue de la caméra seulement : la canopée ombre par sa transmittance statistique, canopyT).
   Le grain tire une direction de l'écran et une distance dans la tranche de canopée, puis prend la feuille de la cellule
   de 30 cm où il tombe : mêmes cellules, mêmes tirages que les feuilles du lanceur de rayons (foliage). Une feuille proche
   est touchée à presque chaque image et dessinée à sa taille ; une feuille lointaine l'est rarement, et elle est alors
   agrandie (jusqu'à 1,8 fois, 5 pixels au plus) pour compenser en partie. */
bool semeF(out vec4 pos, out float taille){
  vec2 uv=(vec2(rnd(),rnd())-.5)*vec2(uRes.x/uRes.y,1.);
  float rr=length(uv), ang=rr*uFish;
  vec3 rd=normalize(uCam*vec3(uv/max(rr,1e-5)*sin(ang),cos(ang)));
  float ry=abs(rd.y)<1e-4?1e-4:rd.y;
  float ta=(YC0-uCamPos.y)/ry, tb=(YC1-uCamPos.y)/ry;
  float t0=max(min(ta,tb),0.), t1=min(min(max(ta,tb),150.),t0+uFeuil.x);
  if(t1<=t0) return false;
  t0=max(t0,2.);
  if(t1<=t0) return false;
  float lr=log(t1/t0), t;                                    // distance en progression géométrique : les feuilles proches d'abord
  vec3 cell, hc; bool ok=false;
  for(int k=0;k<3;k++){                                      // trois essais : la plupart des cellules sont vides
    t=t0*exp(rnd()*lr);
    cell=floor((uCamPos+rd*t)/CS);
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

void main(){
  rs=hu(uint(gl_VertexID)^hu(uFrame)); rnd();
  gl_Position=vec4(0.,0.,2.,1.); gl_PointSize=1.;
  sansGrain();
  int i=gl_VertexID;
  if(uTrait==1){                                             // perches vues du soleil, en traits
    rs=hu(uint(i>>1)^hu(uFrame)); rnd();
    vec3 P; if(!semeBTrait(i&1,P)) return;
    vec3 l=(P-uSoleilC)*uSoleilM;
    gl_Position=vec4(l.xy/uSoleilE.xy,clamp(-l.z/uSoleilE.z,-1.,1.),1.);
    return;
  }
  if(i>=uTotal) return;
  if(i>=uPart.z && i<uPart.w){
    vec4 pos; float t;
    if(uVue!=0 || !semeF(pos,t)) return;
    if(t<1.){ if(rnd()>t*t) return; t=1.; }
    gl_Position=pos; gl_PointSize=min(t,uMaxPt); vSz=gl_PointSize;
    return;
  }
  Grain g; bool ok;
  if(i<uPart.x) ok=semeA(g);
  else if(i<uPart.y) ok=semeB(g);
  else if(i<uPart.z) ok=semeR(g);
  else ok=semeP(g);
  if(!ok) return;
  float s=g.s;
  if(uVue==1){                                               // carte d'ombres : projection orthographique
    vec3 l=(g.P-uSoleilC)*uSoleilM;
    float t=s/uSoleilE.w;
    if(t<1.){ if(rnd()>t*t) return; t=1.; }
    gl_Position=vec4(l.xy/uSoleilE.xy,clamp(-l.z/uSoleilE.z,-1.,1.),1.);
    gl_PointSize=min(t,uMaxPt);
    return;
  }
  vec4 pos; float dist, ang;
  if(!projette(g.P,1.62,pos,dist,ang)) return;
  vec3 dv=(g.P-uCamPos)/dist;
  if(dot(g.N,dv)>.2) return;                                 // face tournée vers l'arrière
  float ppr=uRes.y/uFish;                                    // pixels par radian
  float t=s/dist*ppr*max(1.,ang/max(sin(ang),.05));
  if(t<1.){ if(rnd()>t*t) return; t=1.; }
  t=min(t,uMaxPt);
  gl_Position=pos; gl_PointSize=t;
  // variation des coordonnées de recette d'un pixel à l'autre du grain : déplacement dans le plan tangent, ramené le long du regard
  float den=dot(dv,g.N); den=sign(den)*max(abs(den),.25); if(den==0.) den=-.25;
  float m=dist/ppr;
  vec3 ex=uCam[0]*m, ey=uCam[1]*m;
  ex-=dv*dot(ex,g.N)/den; ey-=dv*dot(ey,g.N)/den;
  vec2 rx=g.rot*ex.xz, ry=g.rot*ey.xz;
  vQ=g.q; vN=g.N; vCode=g.code; vDist=dist; vSz=t;
  vDx=vec3(rx.x,ex.y,rx.y); vDy=vec3(ry.x,ey.y,ry.y); vDd=vec2(dot(ex,dv),dot(ey,dv));
}
