#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uTex; uniform sampler2D uBloom;
uniform vec2 uSrcRes; uniform vec2 uOutRes;
uniform float uExp; uniform float uTime; uniform vec3 uShake; uniform float uSoft; uniform float uGain;
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
  c*=uExp;
  float l=dot(c,vec3(.2126,.7152,.0722)); const float W=5.5;
  float l2=l*(1.+l/(W*W))/(1.+l);
  vec3 cl=c*l2/max(l,1e-5);
  vec3 cc=c*(1.+c/(W*W))/(1.+c);
  return mix(cc,cl,.5);
}
void main(){
  vec2 uv=gl_FragCoord.xy/uOutRes; float asp=uOutRes.x/uOutRes.y;
  vec2 q=uv-.5; q.x*=asp; float cr=cos(uShake.z), sr=sin(uShake.z); q=mat2(cr,sr,-sr,cr)*q; q.x/=asp; q=q*.955+uShake.xy;
  vec2 qa=q*vec2(asp,1.); float r2=dot(qa,qa);
  vec3 hdr=vec3(smp(.5+q*(1.+.0032*r2)).r,smp(.5+q).g,smp(.5+q*(1.-.0032*r2)).b);
  if(uSoft>0.){ vec2 sp=uSoft/uSrcRes;
    hdr=(hdr+smp(.5+q+sp*vec2(1.,.6))+smp(.5+q+sp*vec2(-.6,1.))+smp(.5+q+sp*vec2(-1.,-.6))+smp(.5+q+sp*vec2(.6,-1.)))*.2; }
  vec3 bl=textureLod(uBloom,.5+q,0.).rgb;
  vec2 px=1.2/uSrcRes;
  vec3 nb=(smp(.5+q+vec2(px.x,0.))+smp(.5+q-vec2(px.x,0.))+smp(.5+q+vec2(0.,px.y))+smp(.5+q-vec2(0.,px.y)))*.25;
  vec3 c=tone(mix(hdr,bl,.11)), cn=tone(mix(nb,bl,.11));
  c+=(c-cn)*.70*(1.-min(uSoft,1.));
  c=max(c,0.);
  float l=dot(c,vec3(.299,.587,.114)); c=mix(vec3(l),c,.94);
  c=pow(max(c,0.),vec3(1./2.2));
  c=mix(c,c*c*(3.-2.*c),.30);
  float v=r2/(.25*(asp*asp+1.)); c*=1.-.46*v*v*v;
  float lg=clamp(dot(c,vec3(.333)),0.,1.);
  float tt=floor(uTime*24.);
  float g=h12(gl_FragCoord.xy+vec2(tt*37.1,tt*17.7))-.5;
  c+=g*mix(.060,.020,lg)*uGain;
  vec2 cq=floor(gl_FragCoord.xy/3.);
  vec3 cn3=vec3(h12(cq+tt*3.1),h12(cq+tt*5.3+11.),h12(cq+tt*7.7+23.))-.5;
  c+=cn3*.022*(1.-lg)*uGain;
  vec2 bq=floor(gl_FragCoord.xy/vec2(16.));                // macroblocs de compression vidéo
  c+=(vec3(h12(bq+tt*1.7),h12(bq+tt*2.9+5.),h12(bq+tt*4.1+9.))-.5)*.012;
  c=c*.985+.012;
  o=vec4(c,1.);
}
