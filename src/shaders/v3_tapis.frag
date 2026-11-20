#version 300 es
// Moteur v3 : le tapis du sol. La matière du sol (recette du sol, trajet par-dessus, mousse, relief) ne dépend que du point
// du monde : on la cuit une fois dans des textures ancrées au monde autour de la caméra, au lieu de la recalculer à chaque
// pixel de chaque image. Plusieurs niveaux (couches d'un tableau de textures), le texel doublant d'un niveau au suivant,
// comme un « clipmap » : fin près des pieds, grossier au loin. Chaque niveau est un tore : un texel du monde d'indice I
// est rangé en I mod N. Quand la caméra avance, seules les bandes qui entrent dans la fenêtre sont cuites (src/main.js,
// v3Tapis), par tranches bornées : l'affichage ne se fige jamais. Même choix de recettes que v3_ombrage.frag et render().
// Sortie : t0 = racine de l'albédo (rgb), brillance ; t1 = inclinaison du relief (x, z) codée sur [-2, 2], émission,
// transmittance de la canopée vers le soleil (moyenne de 4 tirages : au sol, elle ne dépend que du point).
precision highp float; precision highp int; precision highp sampler2D;
#include "monde.glsl"
#include "recette.glsl"
uniform ivec2 uTapO;         // origine de la fenêtre du niveau (indice de texel du monde, x et z)
uniform float uTapS;         // côté d'un texel du niveau, en mètres
uniform int   uTapN;         // texels par côté
layout(location=0) out vec4 t0;
layout(location=1) out vec4 t1;
void main(){
  ivec2 st=ivec2(gl_FragCoord.xy);
  ivec2 I=uTapO+((st-uTapO)%uTapN+uTapN)%uTapN;               // l'indice du monde rangé dans ce texel
  vec2 xz=(vec2(I)+.5)*uTapS;
  vec3 q=vec3(xz.x,terrainH(xz),xz.y);
  float e=.04;                                               // même normale que le maillage du sol (v3_sol.vert)
  vec3 gn=normalize(vec3(terrainH(xz-vec2(e,0.))-terrainH(xz+vec2(e,0.)),2.*e,terrainH(xz-vec2(0.,e))-terrainH(xz+vec2(0.,e))));
  int r0=uSurf.x, r1=-1, nr=1; float w=0.;
  if(uSurf.y!=uSurf.x){ w=smoothstep(uTraj.y+uTraj.z,uTraj.y-uTraj.z,abs(q.x-pathX(q.z))+(uTraj.w>0.?uTraj.w*(fbm(q.xz*.8+3.)-.5):0.)); r1=uSurf.y;
    if(w>=1.) r0=r1; else if(w>0.) nr=2; }
  vec3 A=vec3(0.), T=vec3(0.); float SP=0., EM=0.;
  for(int k=0;k<2+uZ;k++){                                     // un seul appel à recette()
    if(k>=nr) break;
    vec3 a, tt; float sp, em; recette(k==0?r0:r1,q,gn,0.,mat2(1.),a,tt,sp,em);
    float wk=nr==1?1.:(k==0?1.-w:w);
    A+=a*wk; T+=tt*wk; SP+=sp*wk; EM+=em*wk;
  }
  t0=vec4(sqrt(clamp(A,0.,1.)),clamp(SP,0.,1.));
  rs=uint(I.x*7919+I.y*104729)^0x9e3779b9u; rnd();
  vec3 po=q+gn*.01; float Ts=0.;
  for(int i=0;i<4+uZ;i++) Ts+=canopyT(po,uSunDir);              // même transmittance que lumiere() (v3_ombrage.frag), sans son bruit
  t1=vec4(clamp(T.xz*.25+.5,0.,1.),clamp(EM,0.,1.),Ts*.25);
}
