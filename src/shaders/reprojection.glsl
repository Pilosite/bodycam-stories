// Accumulation temporelle et reprojection, partagées par le lanceur de rayons et le semeur (moteur v3).
// Inséré par le build (#include), après monde.glsl (uFish).
uniform sampler2D uPrev;
uniform vec3  uPrevPos;    // reprojection temporelle : pose de l'image précédente
uniform mat3  uPrevCam;
uniform float uAlpha;      // part d'image neuve dans le mélange
uniform int   uReproj;     // 1 = l'historique est relu à travers l'ancienne pose
// Où le point du monde P se trouvait-il dans l'image précédente ? Rend vrai et la couleur relue si l'historique y montre
// le même objet (sinon : désocclusion, ou hors de l'image).
bool histoireReproj(vec3 P, out vec3 hist){
  hist=vec3(0.);
  vec3 d=P-uPrevPos; float dist=length(d);
  vec3 dl=(d/dist)*uPrevCam;
  float sxy=length(dl.xy);
  vec2 puv=(sxy>1e-6?dl.xy/sxy:vec2(0.))*(acos(clamp(dl.z,-1.,1.))/uFish);
  vec2 ps=vec2(textureSize(uPrev,0));
  vec2 pp=puv*ps.y+.5*ps-.5;
  if(pp.x>0. && pp.y>0. && pp.x<ps.x-1. && pp.y<ps.y-1.){
    ivec2 b=ivec2(floor(pp)); vec2 f=pp-vec2(b); float ws=0.; vec3 acc=vec3(0.);
    for(int k=0;k<4;k++){
      ivec2 o=ivec2(k&1,k>>1); vec4 sm=texelFetch(uPrev,b+o,0);
      float w=(o.x==1?f.x:1.-f.x)*(o.y==1?f.y:1.-f.y);
      w*=step(abs(sm.a-dist),.08*dist+.06);              // rejette l'historique d'un autre objet (désocclusion)
      acc+=sm.rgb*w; ws+=w;
    }
    if(ws>.08){ hist=acc/ws; return true; }
  }
  return false;
}
// col : couleur neuve du pixel ip ; P : point du monde qu'il montre ; al : part d'image neuve. Rend le mélange avec l'historique.
vec3 melangeHistoireA(vec3 col, vec3 P, ivec2 ip, float al){
  vec3 hist=vec3(0.); float a=1.;
  if(al<1.){
    if(uReproj==0){ hist=texelFetch(uPrev,ip,0).rgb; a=al; }
    else if(histoireReproj(P,hist)) a=al;
  }
  return mix(hist,col,a);
}
vec3 melangeHistoire(vec3 col, vec3 P, ivec2 ip){ return melangeHistoireA(col,P,ip,uAlpha); }
