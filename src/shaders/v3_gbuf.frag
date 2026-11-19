#version 300 es
// Moteur v3 : écriture du tampon G. Un grain couvre quelques pixels : ses coordonnées de recette varient d'un pixel à
// l'autre le long de la surface (vDx, vDy), pour que la matière ne soit pas peinte en carrés, et sa profondeur aussi
// (gl_FragDepth) : un grand grain posé sur un mur vu de biais reste à sa place d'un bord à l'autre. Un grain posé sur une
// forme (objet, élément de semis) est découpé : chaque pixel retrouve son point dans le repère de la forme (vL…) et le
// fragment est jeté s'il sort de la forme (sdPrim, la distance du lanceur de rayons).
precision highp float; precision highp int; precision highp sampler2D;
#include "monde.glsl"
in vec3 vQ; in vec3 vN; flat in float vCode; in float vDist; in vec3 vDx; in vec3 vDy; in vec2 vDd; in float vSz;
in vec3 vL; in vec3 vLx; in vec3 vLy; in vec4 vB; in vec2 vT;
uniform int uPts;            // 1 = grains (points), 0 = maillage du sol
layout(location=0) out vec4 g0;   // coordonnées de recette (ou couleur d'une feuille), élément
layout(location=1) out vec4 g1;   // normale, distance
void main(){
  vec3 q=vQ; float d=vDist;
  if(uPts==1){ vec2 pc=gl_PointCoord-.5; if(vSz>2.5 && vT.x<0. && dot(pc,pc)>.25) discard;   // grain rond : plus de confettis carrés aux silhouettes
    vec2 o=pc*vSz; o.y=-o.y; q+=vDx*o.x+vDy*o.y; d+=dot(vDd,o);
    if(vT.x>=0. && sdPrim(vL+vLx*o.x+vLy*o.y,vT.x,vB.xyz)-vB.w>vT.y) discard;
    gl_FragDepth=clamp(d/400.,0.,1.); }                      // même profondeur linéaire que projette() (DMAX)
  else gl_FragDepth=gl_FragCoord.z;
  g0=vec4(q,vCode); g1=vec4(normalize(vN),d);
}
