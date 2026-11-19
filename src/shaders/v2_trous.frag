#version 300 es
// Moteur v2 : remplissage des trous par dilatation (signalé : c'est un artifice). Un pixel sans point prend la moyenne
// de ses voisins valides les plus lointains (un trou de désocclusion montre le fond, pas l'objet de devant).
// uMarque = 1 : les trous restants sont peints en magenta pour les voir.
precision highp float; precision highp sampler2D;
uniform sampler2D uTex; uniform int uRayon; uniform int uMarque;
out vec4 o;
void main(){
  ivec2 ip=ivec2(gl_FragCoord.xy), m=textureSize(uTex,0)-1;
  vec4 c=texelFetch(uTex,ip,0);
  if(c.a>=0.){ o=c; return; }
  float far=0.;
  for(int j=-3;j<=3;j++) for(int i=-3;i<=3;i++){
    if(abs(i)>uRayon||abs(j)>uRayon) continue;
    vec4 s=texelFetch(uTex,clamp(ip+ivec2(i,j),ivec2(0),m),0); far=max(far,s.a);
  }
  vec3 acc=vec3(0.); float ws=0.;
  if(far>0.) for(int j=-3;j<=3;j++) for(int i=-3;i<=3;i++){
    if(abs(i)>uRayon||abs(j)>uRayon) continue;
    vec4 s=texelFetch(uTex,clamp(ip+ivec2(i,j),ivec2(0),m),0);
    if(s.a>=.7*far){ acc+=s.rgb; ws+=1.; }
  }
  o=ws>0.?vec4(acc/ws,far):(uMarque==1?vec4(4.,0.,4.,1.):vec4(0.,0.,0.,-1.));
}
