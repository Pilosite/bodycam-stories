#version 300 es
// Moteur v3 : écriture du tampon G. Un grain couvre quelques pixels : ses coordonnées de recette varient d'un pixel à
// l'autre le long de la surface (vDx, vDy), pour que la matière ne soit pas peinte en carrés.
// Variante FORMES (grains posés sur une forme : objets, éléments de semis) : la profondeur suit aussi le plan du grain
// (gl_FragDepth), un grand grain sur un mur vu de biais reste à sa place d'un bord à l'autre ; et le grain est découpé :
// chaque pixel retrouve son point dans le repère de la forme (vL…) et le fragment est jeté s'il sort de la forme (sdPrim,
// la distance du lanceur de rayons). La variante 0 (arbres, sol) reste celle d'avant : pas d'écriture de profondeur.
precision highp float; precision highp int; precision highp sampler2D;
#ifndef FORMES
#define FORMES 0
#endif
#if FORMES
#include "monde.glsl"
#endif
in vec3 vQ; in vec3 vN; flat in float vCode; in float vDist; in vec3 vDx; in vec3 vDy; in vec2 vDd; in float vSz;
in vec3 vL; in vec3 vLx; in vec3 vLy; in vec4 vB; in vec2 vT; in float vOk;
uniform int uPts;            // 1 = grains (points), 0 = maillage du sol
layout(location=0) out vec4 g0;   // coordonnées de recette (ou couleur d'une feuille), élément
layout(location=1) out vec4 g1;   // normale, distance
void main(){
  vec3 q=vQ; float d=vDist;
#if FORMES
  vec2 o=(gl_PointCoord-.5)*vSz; o.y=-o.y; q+=vDx*o.x+vDy*o.y; d+=dot(vDd,o);
  if(sdPrim(vL+vLx*o.x+vLy*o.y,vT.x,vB.xyz)-vB.w>vT.y) discard;
  gl_FragDepth=clamp(d/400.,0.,1.);                          // même profondeur linéaire que projette() (DMAX)
#else
  if(uPts==1){ vec2 pc=gl_PointCoord-.5;
    if(vCode==5. && vDy.z>.5){ vec2 r=mat2(vDy.x,vDy.y,-vDy.y,vDy.x)*pc; if(vSz>2.5 && dot(r*vec2(1.,1.8),r*vec2(1.,1.8))>.25) discard; }   // feuille d'un houppier : allongée, tournée (vDy)
    else { if(vSz>2.5 && dot(pc,pc)>.25) discard;           // grain rond : plus de confettis carrés aux silhouettes
    vec2 o=pc*vSz; o.y=-o.y; q+=vDx*o.x+vDy*o.y; d+=dot(vDd,o); } }
  else if(vOk<.9999) discard;                                // triangle du sol dont un sommet ne se projette pas (v3_sol.vert)
#endif
  g0=vec4(q,vCode); g1=vec4(normalize(vN),d);
}
