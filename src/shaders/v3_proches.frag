#version 300 es
// Moteur v3 : les éléments proches (voir v3_proches.vert). Chaque pixel de la boîte englobante suit son rayon (même
// fisheye que l'ombrage) et cherche la forme exacte par la distance du lanceur de rayons (sdPrim et le repère de
// l'élément, blocForme pour un bloc de grès, sdTreeA et sdTreeB pour un tronc ou une perche) : 20 pas au plus, puis la normale par quatre évaluations, dans la même
// boucle (un seul appel déplié). Sortie au format du tampon G des grains : l'ombrage ne fait pas de différence.
precision highp float; precision highp int; precision highp sampler2D;
/* PF : une famille d'éléments par programme (1 formes : objets et semis ; 2 blocs de grès ; 3 troncs et perches ; 0 toutes,
   comme avant). La page dessine chaque tranche d'emplacements avec le programme de sa famille (v3_proches.vert, même ordre) :
   sur Direct3D, trois petits programmes se compilent bien plus vite qu'un gros. */
#ifndef PF
#define PF 0
#endif
#ifndef PATE
#define PATE 0
#endif
#include "monde.glsl"
uniform vec2 uJitPx;
#if PATE
/* Objets mous (variante PATE, voir v3_proches.vert). Vocabulaire des formes, des données (docs/fiche-de-lieu.md) :
   - lisse > 0 : la forme est MOLLE et se fond dans les formes molles de l'objet (union adoucie de ce rayon, m) : deux boules
     posées l'une sur l'autre se soudent en bourrelet, une masse qu'on sépare s'étire en étranglement avant de rompre ;
   - lisse = 0 : la forme est DURE (bois, pierre, tissu) : pas de fondu, mais là où elle entre dans la matière molle, la
     matière remonte autour d'elle en petit bourrelet ;
   - creux (lisse < 0 dans uShapes) : la forme creuse la matière molle (empreinte d'une paume, d'un pouce), bord adouci ;
   - bosse (partie fractionnaire de la matière, 0 à 0,4) : bosses molles à l'échelle de la forme, dans son repère (elles
     tournent avec elle quand on la roule).
   Une seule boucle sur les formes de l'objet, un seul appel de sdPrim : borné par le nombre de formes de l'objet (24 au plus),
   évalué seulement dans la boîte de l'objet. */
float smaxP(float a, float b, float k){ return -smin(-a,-b,k); }
float bosseP(vec3 q){ return sin(q.x*1.9+1.3*sin(q.z*1.6))*sin(q.y*2.2+1.1+.8*sin(q.x*1.2))*sin(q.z*2.0+.7*sin(q.y*1.7)); }
float sdMou(vec3 p, int st, int cn, bool mou, out float brow){
  float so=1e5, ha=1e5, cr=1e5, kS=0., kC=0., bs=1e5, bh=1e5, rs=float(st), rh=float(st);
  for(int j=0;j<24+uZ;j++){
    if(j>=cn) break;
    int row=st+j;
    vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), e=texelFetch(uShapes,ivec2(3,row),0);
    vec3 q=primLocal(p,row);
    float dd=sdPrim(q,a.w,b.xyz)-max(e.y,0.);
    float bo=mou?fract(texelFetch(uShapes,ivec2(2,row),0).w):0.;
    if(bo>.001){ float sz=max(min(b.x,min(b.y,b.z)),.004); dd+=bo*sz*bosseP(q*(2.2/sz)+float(row)*1.7); }
    if(e.x>0.){ so=smin(so,dd,e.x); kS=max(kS,e.x); if(dd<bs){ bs=dd; rs=float(row); } }
    else if(e.x<0.){ cr=min(cr,dd); kC=max(kC,-e.x); }
    else { ha=min(ha,dd); if(dd<bh){ bh=dd; rh=float(row); } }
  }
  if(ha<1e4 && so<1e4) so=smin(so,max(ha-.8*kS,so-.4*kS),.5*kS);   // bourrelet de matière autour de ce qui y est planté
  if(cr<1e4) so=smaxP(so,-cr,kC);                                    // empreintes
  brow=ha<so?rh:rs;
  return min(so,ha);
}
#endif         // même décalage sous-pixel que l'ombrage
flat in ivec4 vK; flat in vec2 vId; flat in vec2 vPrx; in vec3 vW;
layout(location=0) out vec4 g0;
layout(location=1) out vec4 g1;
void main(){
  if(vK.x<0) discard;
  vec2 uv=(gl_FragCoord.xy+uJitPx-.5*uRes)/uRes.y;
  float rr=length(uv), ang=rr*uFish;
  vec3 rd=normalize(uCam*vec3(uv/max(rr,1e-5)*sin(ang),cos(ang)));
  int row=vK.y; ElemS e; Bloc B; float sc=1.;
  vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), ee=texelFetch(uShapes,ivec2(3,row),0);
#if (PF==0 || PF==1) && !PATE
  if(vK.x==1){ semisTete(vK.z,float(vK.w),e); if(!semisElem(vK.z,vId,e)) discard; sc=.85*e.s*min(1.,e.sy)*e.sh; }
#endif
#if PF==0 || PF==2
  if(vK.x==2){ if(!blocGres(vId,B)) discard; }
#endif
  float t0=length(vW-uCamPos), t=vPrx.x>.5?.02:max(.02,t0-.05), tmax=t0+vPrx.y, d=1.;
  bool touche=false; vec4 gv=vec4(0.); const vec2 k=vec2(1.,-1.);
  int nn=0; float brow=float(row);
  for(int i=0;i<24+uZ;i++){                                    // jusqu'à 20 pas de marche, puis 4 évaluations pour la normale
    if(nn>=4) break;
    vec3 o=touche?(nn==0?k.xyy:nn==1?k.yyx:nn==2?k.yxy:k.xxx)*(.0005*t+.0005):vec3(0.);
    vec3 p=uCamPos+rd*t+o;
    float dd=1.;
#if PATE
    if(vK.x==0 || vK.x==5){ float br; dd=sdMou(p,row,vK.x==5?vK.z:1,vK.x==5,br)*(vK.x==5?.7:.8); if(!touche) brow=br; }   // un seul appel de sdMou
#elif PF==0 || PF==1
    if(vK.x<=1) dd=(sdPrim(primLocal(vK.x==0?p:semisLocal(p,e),row),a.w,b.xyz)-ee.y)*(vK.x==0?.8:sc);   // un seul appel de sdPrim
#endif
#if PF==0 || PF==2
    if(vK.x==2) dd=blocForme(blocLocal(p,terrainH(p.xz),vId,B),B)*.72;
#endif
#if PF==0 || PF==3
    if(vK.x>=3){ vec4 inf; dd=vK.x==3?sdTreeA(p,terrainH(p.xz),inf):sdTreeB(p,terrainH(p.xz),inf); }
#endif
    if(touche){ gv[nn]=dd; nn++; }
    else if(dd<.0006*t+.0004 || (i>=19 && dd<.01*t+.004)) touche=true;   // au dernier pas, tout près de la surface (rayon rasant) : touché, pas de trou
    else { t+=dd; if(t>tmax || i>=19) break; }
  }
  if(!touche || nn<4) discard;
  vec3 p=uCamPos+rd*t;
  vec3 n=normalize(k.xyy*gv.x+k.yyx*gv.y+k.yxy*gv.z+k.xxx*gv.w);
  vec3 q=p; float code=0.;
#if PATE
  code=4.+.5*(brow/128.);                                     // la forme la plus proche : sa couleur et sa matière
#elif PF==0 || PF==1
  if(vK.x==0) code=4.+.5*(float(row)/128.);
  else if(vK.x==1){ q=semisLocal(p,e); code=6.+(float(vK.z*6+row-SEM0-vK.z*SEML-4)+.5)/48.; }   // comme semeS : repère de l'élément, couche et forme
#endif
#if PF==0 || PF==2
  if(vK.x==2){ q=blocLocal(p,terrainH(p.xz),vId,B); code=3.; }
#endif
#if PF==0 || PF==3
  if(vK.x>=3){ vec4 inf; if(vK.x==3){ sdTreeA(p,terrainH(p.xz),inf); code=1.+.5*(fract(inf.w)*.999+(inf.w>1.5?1.:0.)); }   // mêmes codes que les grains (v3_grains.vert)
    else { sdTreeB(p,terrainH(p.xz),inf); code=2.+.5*inf.w; } q=inf.xyz; }
#endif
  gl_FragDepth=clamp(t/400.,0.,1.);
  g0=vec4(q,code); g1=vec4(n,t);
}
