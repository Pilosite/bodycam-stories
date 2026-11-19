#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uTex; uniform vec2 uDstRes; out vec4 o;
void main(){ vec2 uv=gl_FragCoord.xy/uDstRes; vec2 st=.25/uDstRes; vec3 s=vec3(0.);
  for(int j=0;j<4;j++) for(int i=0;i<4;i++) s+=min(texture(uTex,uv+(vec2(float(i),float(j))-1.5)*st).rgb,vec3(60.));
  o=vec4(s/16.,1.); }
