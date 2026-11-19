#version 300 es
// Moteur v3 (essai) : le sol, un maillage polaire centré sur la caméra qui suit terrainH. Anneaux de plus en plus
// espacés (pas logarithmique) : dense près de la caméra, sans trou. Aucun tampon de sommets : gl_VertexID suffit.
precision highp float; precision highp int; precision highp sampler2D;
#include "monde.glsl"
#include "v3_commun.glsl"
uniform vec4 uSolP;          // rayon du premier anneau, pas logarithmique, nombre d'anneaux, nombre de secteurs
void main(){
  int S=int(uSolP.w), quad=gl_VertexID/6, c=gl_VertexID-quad*6;
  int ring=quad/S, seg=quad-ring*S;
  int ox=(c==1||c==3||c==4)?1:0, oy=(c==2||c==4||c==5)?1:0;
  float r=(ring+ox==0)?0.:uSolP.x*exp(float(ring+ox-1)*uSolP.y);   // le premier anneau ferme le disque sous la caméra
  float cap=atan(uCam[2].x,uCam[2].z);
  float ph=cap+(float(seg+oy)/float(S)-.5)*6.2831853;
  vec2 xz=uCamPos.xz+r*vec2(sin(ph),cos(ph));
  vec3 P=vec3(xz.x,terrainH(xz),xz.y);
  float e=.04;
  vec3 N=normalize(vec3(terrainH(xz-vec2(e,0.))-terrainH(xz+vec2(e,0.)),2.*e,terrainH(xz-vec2(0.,e))-terrainH(xz+vec2(0.,e))));
  sansGrain();
  vec4 pos; float dist, ang;
  projette(P,2.3,pos,dist,ang);                              // au-delà, le sommet part derrière le plan lointain
  gl_Position=pos;
  vQ=P; vN=N; vCode=0.; vDist=dist;
}
