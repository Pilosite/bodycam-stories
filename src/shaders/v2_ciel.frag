#version 300 es
// Moteur v2 : fond de l'image projetée. Le ciel (et le lointain noyé de brume) est relu dans le panoramique le plus proche,
// dans la direction du pixel ; partout ailleurs on marque un trou (alpha < 0) que les points viendront couvrir, ou pas.
precision highp float; precision highp sampler2D;
uniform sampler2D uPano; uniform vec2 uRes; uniform float uFish; uniform mat3 uCam;
out vec4 o;
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  float rr=length(uv), ang=rr*uFish;
  vec3 rd=normalize(uCam*vec3(uv/max(rr,1e-5)*sin(ang),cos(ang)));
  vec2 ps=vec2(textureSize(uPano,0));
  vec2 e=vec2(atan(rd.x,rd.z)/6.2831853+.5,asin(clamp(rd.y,-1.,1.))/3.14159265+.5);
  vec4 s=texelFetch(uPano,ivec2(min(e*ps,ps-1.)),0);
  o=s.a>5e3?vec4(s.rgb,1e4):vec4(0.,0.,0.,-1.);
}
