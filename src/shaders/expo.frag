#version 300 es
// Exposition automatique tenue sur la puce graphique : une cible d'un seul texel, mise à jour à chaque passe de halo.
// Aucune lecture vers le processeur : sur Mali-G77, relire le halo en flottants coûtait 40 ms toutes les 180 ms.
precision highp float; precision highp sampler2D;
uniform sampler2D uBloom;    // l'image réduite (avant flou)
uniform sampler2D uPrev;     // l'exposition précédente
uniform float uRate;         // part du chemin faite vers la cible à cette passe (inertie du capteur)
uniform float uMax;          // plafond du gain (la nuit, le noir reste noir)
out vec4 o;
void main(){
  float s=0., ws=0.;
  for(int j=0;j<8;j++) for(int i=0;i<8;i++){                 // moyenne logarithmique, pondérée au centre
    vec2 uv=(vec2(float(i),float(j))+.5)/8.;
    float L=dot(textureLod(uBloom,uv,0.).rgb,vec3(.2126,.7152,.0722));
    if(!(L>=0.)) L=0.;                                       // une valeur invalide ne doit jamais rendre l'écran noir
    vec2 d=uv-.5; float w=1.-1.6*dot(d,d);
    s+=w*log(min(L,8.)+.004); ws+=w;
  }
  float cible=clamp(.25/exp(s/ws),.25,uMax);
  float prev=texelFetch(uPrev,ivec2(0),0).r;
  float e=(prev>0. && prev<100.)?mix(prev,cible,uRate):cible;
  o=vec4(e,cible,0.,1.);
}
