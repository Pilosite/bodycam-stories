#version 300 es
// Moteur v3 : les éléments proches (voir v3_proches.vert). Chaque pixel de la boîte englobante suit son rayon (même
// fisheye que l'ombrage) et cherche la forme exacte par la distance du lanceur de rayons (sdPrim et le repère de
// l'élément, ou blocForme pour un bloc de grès) : 20 pas au plus, puis la normale par quatre évaluations, dans la même
// boucle (un seul appel déplié). Sortie au format du tampon G des grains : l'ombrage ne fait pas de différence.
precision highp float; precision highp int; precision highp sampler2D;
#include "monde.glsl"
uniform vec2 uJitPx;         // même décalage sous-pixel que l'ombrage
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
  if(vK.x==1){ semisTete(vK.z,float(vK.w),e); if(!semisElem(vK.z,vId,e)) discard; sc=.85*e.s*min(1.,e.sy)*e.sh; }
  else if(vK.x==2){ if(!blocGres(vId,B)) discard; }
  float t0=length(vW-uCamPos), t=vPrx.x>.5?.02:max(.02,t0-.05), tmax=t0+vPrx.y, d=1.;
  bool touche=false; vec4 gv=vec4(0.); const vec2 k=vec2(1.,-1.);
  int nn=0;
  for(int i=0;i<24;i++){                                     // jusqu'à 20 pas de marche, puis 4 évaluations pour la normale
    if(nn>=4) break;
    vec3 o=touche?(nn==0?k.xyy:nn==1?k.yyx:nn==2?k.yxy:k.xxx)*(.0005*t+.0005):vec3(0.);
    vec3 p=uCamPos+rd*t+o;
    float dd;
    if(vK.x==0) dd=(sdPrim(primLocal(p,row),a.w,b.xyz)-ee.y)*.8;
    else if(vK.x==1) dd=(sdPrim(primLocal(semisLocal(p,e),row),a.w,b.xyz)-ee.y)*sc;
    else dd=blocForme(blocLocal(p,terrainH(p.xz),vId,B),B)*.72;
    if(touche){ gv[nn]=dd; nn++; }
    else if(dd<.0006*t+.0004) touche=true;
    else { t+=dd; if(t>tmax || i>=19) break; }
  }
  if(!touche || nn<4) discard;
  vec3 p=uCamPos+rd*t;
  vec3 n=normalize(k.xyy*gv.x+k.yyx*gv.y+k.yxy*gv.z+k.xxx*gv.w);
  vec3 q=p; float code;
  if(vK.x==0) code=4.+.5*(float(row)/128.);
  else if(vK.x==1) code=6.+.125*float(vK.z);
  else { q=blocLocal(p,terrainH(p.xz),vId,B); code=3.; }
  gl_FragDepth=clamp(t/400.,0.,1.);
  g0=vec4(q,code); g1=vec4(n,t);
}
