#version 300 es
// La sonde de collision du moteur v3 : la distance au décor (map(), la même que celle du lanceur de rayons, monde.glsl)
// en quelques points, rien d'autre. Un petit programme, sans matières ni lumière : il se compile là où le lanceur de
// rayons ne se compile pas. Compilé avec les semis (SEMIS) : une seule variante pour tous les mondes. Pixel 0 : distance
// au point uProbe ; pixels 1 et 2 : 5 cm plus loin en x et en z (pente de la distance, pour glisser le long d'un obstacle).
precision highp float; precision highp int; precision highp sampler2D;
#define SEMIS 1
#include "monde.glsl"
uniform vec3 uProbe;
out vec4 outCol;
void main(){
  int ix=int(gl_FragCoord.x);
  vec3 q=uProbe+(ix==1?vec3(.05,0.,0.):ix==2?vec3(0.,0.,.05):vec3(0.));
  outCol=vec4(map(q),0.,0.,1.);
}
