#version 300 es
// Moteur v2, projection : chaque texel d'un panoramique tourné devient un point du monde, projeté avec le même
// fisheye équidistant que la caméra (pathtrace.frag). Aucun tampon de sommets : gl_VertexID désigne le texel.
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uPano;     // couleur éclairée + distance au point de tournage (alpha)
uniform vec3  uPanoPos;      // position de tournage
uniform vec3  uCamPos;
uniform mat3  uCam;
uniform vec2  uRes;
uniform float uFish;
uniform float uBias;         // décalage de profondeur : à égalité, le panoramique le plus proche gagne
uniform float uScale;        // marge sur la taille des points
uniform float uMaxPt;
out vec3 vCol;
out float vDist;
void main(){
  ivec2 ps=textureSize(uPano,0);
  ivec2 ip=ivec2(gl_VertexID%ps.x,gl_VertexID/ps.x);
  vec4 s=texelFetch(uPano,ip,0);
  gl_Position=vec4(2.,2.,2.,1.); gl_PointSize=1.; vCol=vec3(0.); vDist=0.;   // par défaut : hors champ
  if(s.a>5e3 || s.a<=0.) return;                             // ciel et lointain : passe plein écran
  vec2 e=(vec2(ip)+.5)/vec2(ps);
  float lon=(e.x*2.-1.)*3.14159265, lat=(e.y-.5)*3.14159265;
  vec3 P=uPanoPos+vec3(sin(lon)*cos(lat),sin(lat),cos(lon)*cos(lat))*s.a;
  vec3 d=P-uCamPos; float dist=length(d);
  if(dist<.05) return;
  vec3 dl=(d/dist)*uCam;
  float ang=acos(clamp(dl.z,-1.,1.));
  if(ang>1.45) return;                                       // derrière ou hors du champ (125° sur le grand côté)
  float sxy=length(dl.xy);
  vec2 puv=(sxy>1e-6?dl.xy/sxy:vec2(0.))*(ang/uFish);
  // taille : un texel couvre pi/H radians vu du tournage, soit s.a*pi/H mètres ; vu d'ici, divisé par dist,
  // en pixels selon l'échelle du fisheye (allongée en tangentiel par ang/sin(ang))
  float px=s.a*(3.14159265/float(ps.y))/dist*(uRes.y/uFish)*max(1.,ang/max(sin(ang),.05))*uScale;
  gl_PointSize=clamp(px,1.,uMaxPt);
  gl_Position=vec4(puv*2.*uRes.y/uRes,clamp(dist*(1.+uBias)/400.,0.,1.)*2.-1.,1.);
  vCol=s.rgb; vDist=dist;
}
