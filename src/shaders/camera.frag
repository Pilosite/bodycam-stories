#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uTex; uniform sampler2D uBloom;
uniform vec2 uSrcRes; uniform vec2 uOutRes;
uniform float uExp; uniform float uTime; uniform vec3 uShake; uniform float uSoft; uniform float uGain;
uniform sampler2D uExpoT; uniform int uExpoGpu;   // exposition tenue sur la puce (expo.frag), lue ici sans passer par le processeur
float EX, GAIN;
/* Grand écran (qualité complète) : uFlare > 0 ajoute ce que fait une optique de téléphone face à une source vive — voile
   (la lumière diffusée dans l'objectif lève les noirs autour du soleil) et deux reflets fantômes symétriques par rapport au
   centre — à partir du halo déjà calculé (5 lectures). uGrainPx : taille du grain en pixels de l'écran, pour qu'un écran de
   1280 × 800 garde le grain d'une vidéo et non un bruit de pixels fin. 0 et 1 en qualité mobile : rien ne change. */
uniform float uFlare; uniform float uGrainPx;
uniform int uLin;            // 1 = source filtrable (RGBA16F, LINEAR) : une lecture filtrée par la puce au lieu de quatre texelFetch
out vec4 o;
float h12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec3 smp(vec2 uv){
  if(uLin==1) return textureLod(uTex,uv,0.).rgb;
  vec2 p=uv*uSrcRes-.5; vec2 i=floor(p), f=p-i; ivec2 m=ivec2(uSrcRes)-1;
  ivec2 a=clamp(ivec2(i),ivec2(0),m), b=clamp(ivec2(i)+1,ivec2(0),m);
  return mix(mix(texelFetch(uTex,a,0).rgb,texelFetch(uTex,ivec2(b.x,a.y),0).rgb,f.x),
             mix(texelFetch(uTex,ivec2(a.x,b.y),0).rgb,texelFetch(uTex,b,0).rgb,f.x),f.y);
}
vec3 tone(vec3 c){
  c*=EX;
  float l=dot(c,vec3(.2126,.7152,.0722)); const float W=5.5;
  float l2=l*(1.+l/(W*W))/(1.+l);
  vec3 cl=c*l2/max(l,1e-5);
  vec3 cc=c*(1.+c/(W*W))/(1.+c);
  return mix(cc,cl,.5);
}
void main(){
  EX=uExpoGpu==1?texelFetch(uExpoT,ivec2(0),0).r:uExp; if(!(EX>0.)) EX=1.2;
  GAIN=uExpoGpu==1?min(2.2,1.+.28*max(0.,log2(EX))):uGain;   // gain élevé = davantage de bruit capteur
  vec2 uv=gl_FragCoord.xy/uOutRes; float asp=uOutRes.x/uOutRes.y;
  vec2 q=uv-.5; q.x*=asp; float cr=cos(uShake.z), sr=sin(uShake.z); q=mat2(cr,sr,-sr,cr)*q; q.x/=asp; q=q*.955+uShake.xy;
  vec2 qa=q*vec2(asp,1.); float r2=dot(qa,qa);
  vec3 hdr=vec3(smp(.5+q*(1.+.0032*r2)).r,smp(.5+q).g,smp(.5+q*(1.-.0032*r2)).b);
  if(uSoft>0.){ vec2 sp=uSoft/uSrcRes;
    hdr=(hdr+smp(.5+q+sp*vec2(1.,.6))+smp(.5+q+sp*vec2(-.6,1.))+smp(.5+q+sp*vec2(-1.,-.6))+smp(.5+q+sp*vec2(.6,-1.)))*.2; }
  vec3 bl=textureLod(uBloom,.5+q,0.).rgb;
  vec2 px=1.2/uSrcRes;
  vec3 nb=(smp(.5+q+vec2(px.x,0.))+smp(.5+q-vec2(px.x,0.))+smp(.5+q+vec2(0.,px.y))+smp(.5+q-vec2(0.,px.y)))*.25;
  if(uFlare>0.){
    vec3 v=(textureLod(uBloom,.5+q*.55+vec2(.17,.1),0.).rgb+textureLod(uBloom,.5+q*.55-vec2(.17,.1),0.).rgb
           +textureLod(uBloom,.5+q*.55+vec2(-.1,.17),0.).rgb)*(1./3.);
    float sv=max(dot(v,vec3(.3333))*EX-.35,0.)/EX;                // voile : seulement quand une forte source est dans le champ
    vec3 add=v*sv/max(dot(v,vec3(.3333)),1e-4)*.10;
    vec2 u1=.5-q*1.6, u2=.5-q*.72;                             // fantômes : de l'autre côté du centre, plus près (u1) ou plus loin (u2)
    float d1=smoothstep(.5,.3,max(abs(u1.x-.5),abs(u1.y-.5))), d2=smoothstep(.5,.3,max(abs(u2.x-.5),abs(u2.y-.5)));   // sans bord franc quand la source quitte l'image
    vec3 g1=d1*max(textureLod(uBloom,u1,0.).rgb*EX-1.6,0.)/EX, g2=d2*max(textureLod(uBloom,u2,0.).rgb*EX-1.6,0.)/EX;
    add+=g1*vec3(.55,.75,.45)*.11+g2*vec3(.75,.45,.9)*.05;
    hdr+=add*uFlare; nb+=add*uFlare;
  }
  vec3 c=tone(mix(hdr,bl,.11)), cn=tone(mix(nb,bl,.11));
  c+=(c-cn)*(uGrainPx>1.?.45:.70)*(1.-min(uSoft,1.));          // grand écran : la netteté d'un téléphone en 1080p, sans liseré noir
  c=max(c,0.);
  float l=dot(c,vec3(.299,.587,.114)); c=mix(vec3(l),c,.94);
  c=pow(max(c,0.),vec3(1./2.2));
  c=mix(c,c*c*(3.-2.*c),.30);
  float v=r2/(.25*(asp*asp+1.)); c*=1.-.46*v*v*v;
  float lg=clamp(dot(c,vec3(.333)),0.,1.);
  float tt=floor(uTime*24.);
  vec2 gp=floor(gl_FragCoord.xy/max(uGrainPx,1.));
  float g=h12(gp+vec2(tt*37.1,tt*17.7))-.5;
  c+=g*mix(.060,.020,lg)*GAIN;
  vec2 cq=floor(gl_FragCoord.xy/(3.*max(uGrainPx,1.)));
  vec3 cn3=vec3(h12(cq+tt*3.1),h12(cq+tt*5.3+11.),h12(cq+tt*7.7+23.))-.5;
  c+=cn3*.022*(1.-lg)*GAIN;
  vec2 bq=floor(gl_FragCoord.xy/vec2(16.*max(uGrainPx,1.)));                // macroblocs de compression vidéo
  c+=(vec3(h12(bq+tt*1.7),h12(bq+tt*2.9+5.),h12(bq+tt*4.1+9.))-.5)*.012;
  c=c*.985+.012;
  o=vec4(c,1.);
}
