#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uTex; uniform vec2 uDir; out vec4 o;
void main(){ vec2 uv=gl_FragCoord.xy/vec2(textureSize(uTex,0)); vec3 s=vec3(0.); float ws=0.;
  for(int i=-5;i<=5;i++){ float w=exp(-float(i*i)/9.); s+=w*textureLod(uTex,uv+uDir*float(i)*1.4,0.).rgb; ws+=w; }
  o=vec4(s/ws,1.); }
