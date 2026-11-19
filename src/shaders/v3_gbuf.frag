#version 300 es
// Moteur v3 (essai) : écriture du tampon G. Un grain couvre quelques pixels : ses coordonnées de recette varient
// d'un pixel à l'autre le long de la surface (vDx, vDy), pour que la matière ne soit pas peinte en carrés.
precision highp float;
in vec3 vQ; in vec3 vN; flat in float vCode; in float vDist; in vec3 vDx; in vec3 vDy; in vec2 vDd; in float vSz;
uniform int uPts;            // 1 = grains (points), 0 = maillage du sol
layout(location=0) out vec4 g0;   // coordonnées de recette (ou couleur d'une feuille), élément
layout(location=1) out vec4 g1;   // normale, distance
void main(){
  vec3 q=vQ; float d=vDist;
  if(uPts==1){ vec2 o=(gl_PointCoord-.5)*vSz; o.y=-o.y; q+=vDx*o.x+vDy*o.y; d+=dot(vDd,o); }
  g0=vec4(q,vCode); g1=vec4(normalize(vN),d);
}
