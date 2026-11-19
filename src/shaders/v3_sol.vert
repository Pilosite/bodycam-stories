#version 300 es
// Moteur v3 (essai) : le sol, un maillage polaire centré sur la caméra qui suit terrainH. Anneaux de plus en plus
// espacés (pas logarithmique) : dense près de la caméra, sans trou. Aucun tampon de sommets : gl_VertexID suffit.
// Deux façons de le dessiner (src/main.js, v3Image) :
//  - uSolIdx = 1 (par défaut) : sommets partagés, lus par un tampon d'indices. Le sommet n° gl_VertexID est le point
//    (secteur, anneau) d'une grille rangée secteur par secteur ; chaque point n'est calculé qu'une ou deux fois au lieu
//    de six. Les secteurs ne couvrent que le cap utile (uSolP.z : demi-ouverture), pas le tour complet.
//  - uSolIdx = 0 (option v3solPlein) : l'ancienne façon, six sommets par quadrilatère, sur tout le tour.
precision highp float; precision highp int; precision highp sampler2D;
#include "monde.glsl"
#include "v3_commun.glsl"
uniform vec4 uSolP;          // rayon du premier anneau, pas logarithmique, demi-ouverture du cap couvert, nombre de secteurs
uniform int  uSolIdx;
uniform int  uSolR;          // nombre d'anneaux (grille indexée)
void main(){
  int S=int(uSolP.w), ring, seg;
  if(uSolIdx==1){ seg=gl_VertexID/(uSolR+1); ring=gl_VertexID-seg*(uSolR+1); }
  else {
    int quad=gl_VertexID/6, c=gl_VertexID-quad*6;
    int rq=quad/S, sq=quad-rq*S;
    ring=rq+((c==1||c==3||c==4)?1:0); seg=sq+((c==2||c==4||c==5)?1:0);
  }
  float r=(ring==0)?0.:uSolP.x*exp(float(ring-1)*uSolP.y);   // le premier anneau ferme le disque sous la caméra
  float cap=atan(uCam[2].x,uCam[2].z);
  float ph=cap+(float(seg)/float(S)-.5)*2.*uSolP.z;
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
