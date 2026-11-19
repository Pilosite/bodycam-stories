#version 300 es
// Sonde de collision du moteur v3 (option v3sonde, pas compilée par défaut) : la distance au décor (map(), la même que celle du lanceur de rayons, monde.glsl)
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
  float v=clamp((map(q)+1.)/9.,0.,1.)*255.;                  // même codage que la sonde du lanceur de rayons : -1 à 8 m sur 16 bits, cible RGBA8
  outCol=vec4(floor(v)/255.,fract(v),0.,1.);
}
