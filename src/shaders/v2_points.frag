#version 300 es
precision highp float;
in vec3 vCol; in float vDist;
out vec4 o;
void main(){ o=vec4(vCol,vDist); }                           // même format que l'accumulation : couleur + distance
