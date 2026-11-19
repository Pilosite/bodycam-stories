#version 300 es
// Moteur v3 : carte d'ombres. Les grains semés vus du soleil n'écrivent que leur profondeur. Un grain posé sur une forme
// (objet, élément de semis) est découpé comme dans le tampon G et suit le plan de sa face : un mur ne projette pas d'ombre
// plus large que lui, et sa profondeur reste juste d'un bord à l'autre du grain.
precision highp float; precision highp int; precision highp sampler2D;
#include "monde.glsl"
in float vDist; in vec2 vDd; in float vSz; in vec3 vL; in vec3 vLx; in vec3 vLy; in vec4 vB; in vec2 vT;
void main(){
  if(vT.x>=0.){
    vec2 o=(gl_PointCoord-.5)*vSz; o.y=-o.y;
    if(sdPrim(vL+vLx*o.x+vLy*o.y,vT.x,vB.xyz)-vB.w>vT.y) discard;
    gl_FragDepth=clamp(vDist+dot(vDd,o),0.,1.);
  } else gl_FragDepth=gl_FragCoord.z;
}
