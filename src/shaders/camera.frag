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
/* Éblouissement (la page le pilote) : x = 0..1, le soleil au centre du regard — voile blanc chaud, halo et reflets amplifiés,
   contraste effondré, paupières plissées en amande, léger flou ; y = persistance rétinienne (tache sombre verdâtre au centre,
   image plus sombre le temps que l'exposition rattrape). (0, 0) : rien ne change. */
uniform vec2 uEbl;
/* Bougé (qualité mobile, en mouvement) : uFlou = part du bougé (0 à l'arrêt, 1 en marche ou en rotation, fondu entre les deux).
   Le déplacement de chaque pixel pendant l'image est calculé ici, comme la reprojection : point du monde (distance lue dans
   l'alpha de l'accumulation) revu depuis la pose de l'image précédente (uPosA, uCamA) ; uCamC, uPosC : pose de l'image montrée.
   Les quatre lectures qui servent à la netteté se placent alors le long de ce déplacement (et un peu en travers) et adoucissent
   au lieu d'accentuer : un flou de bougé directionnel, sans lecture de plus. À l'arrêt (uFlou = 0) : rien ne change. */
uniform float uFlou; uniform float uFishC; uniform mat3 uCamC; uniform vec3 uPosC; uniform mat3 uCamA; uniform vec3 uPosA;
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
/* Valeur invalide ou démesurée (débordement d'un tampon demi-flottant, NaN d'un pilote) : jamais de teinte au hasard.
   +inf devient très clair, NaN devient noir (les comparaisons avec NaN sont fausses). */
vec3 sain(vec3 x){ return vec3(x.r>=6e4?6e4:x.r>=0.?x.r:0.,x.g>=6e4?6e4:x.g>=0.?x.g:0.,x.b>=6e4?6e4:x.b>=0.?x.b:0.); }
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
  vec4 c0=uLin==1?textureLod(uTex,.5+q,0.):vec4(smp(.5+q),0.);   // alpha : distance du point montré (pour le bougé)
  vec3 hdr=vec3(smp(.5+q*(1.+.0032*r2)).r,c0.g,smp(.5+q*(1.-.0032*r2)).b);
  if(uSoft>0.){ vec2 sp=uSoft/uSrcRes;
    hdr=(hdr+smp(.5+q+sp*vec2(1.,.6))+smp(.5+q+sp*vec2(-.6,1.))+smp(.5+q+sp*vec2(-1.,-.6))+smp(.5+q+sp*vec2(.6,-1.)))*.2; }
  vec3 bl=textureLod(uBloom,.5+q,0.).rgb;
  vec2 px=1.2/uSrcRes;
  vec2 tA=vec2(px.x,0.), tB=vec2(0.,px.y);
  if(uFlou>0.){                                                // bougé : déplacement du pixel depuis l'image précédente, en pixels source
    vec2 sp=(.5+q)*uSrcRes, uv=(sp-.5*uSrcRes)/uSrcRes.y; float rr=length(uv), ang=rr*uFishC;
    float t=uLin==1?c0.a:texelFetch(uTex,ivec2(clamp(sp,vec2(0.),uSrcRes-1.)),0).a;
    vec3 P=uPosC+uCamC*vec3(uv/max(rr,1e-5)*sin(ang),cos(ang))*min(max(t,.05),1e4);
    vec3 d=normalize(P-uPosA)*uCamA; float s2=length(d.xy);
    vec2 pa=(s2>1e-6?d.xy/s2:vec2(0.))*(acos(clamp(d.z,-1.,1.))/uFishC)*uSrcRes.y+.5*uSrcRes;
    vec2 m=(sp-pa)*.35; float lm=length(m);                    // obturateur : un tiers d'image
    if(lm>8.) m*=8./lm;
    m=lm>.65?m:(lm>1e-3?m/lm:vec2(1.,0.))*.65;                   // au moins un pixel : les arêtes des grains ne restent pas en marches d'escalier
    vec2 np=vec2(-m.y,m.x)/max(length(m),1e-4);
    tA=mix(tA,m/uSrcRes,uFlou); tB=mix(tB,(m*.35+np*.6)/uSrcRes,uFlou);
  }
  vec3 nb=(smp(.5+q+tA)+smp(.5+q-tA)+smp(.5+q+tB)+smp(.5+q-tB))*.25;
  if(uFlare>0.){
    vec3 v=(textureLod(uBloom,.5+q*.55+vec2(.17,.1),0.).rgb+textureLod(uBloom,.5+q*.55-vec2(.17,.1),0.).rgb
           +textureLod(uBloom,.5+q*.55+vec2(-.1,.17),0.).rgb)*(1./3.);
    float sv=max(dot(v,vec3(.3333))*EX-.35,0.)/EX;                // voile : seulement quand une forte source est dans le champ
    vec3 add=v*sv/max(dot(v,vec3(.3333)),1e-4)*.10;
    vec2 u1=.5-q*1.6, u2=.5-q*.72;                             // fantômes : de l'autre côté du centre, plus près (u1) ou plus loin (u2)
    float d1=smoothstep(.5,.3,max(abs(u1.x-.5),abs(u1.y-.5))), d2=smoothstep(.5,.3,max(abs(u2.x-.5),abs(u2.y-.5)));   // sans bord franc quand la source quitte l'image
    vec3 g1=d1*max(textureLod(uBloom,u1,0.).rgb*EX-1.6,0.)/EX, g2=d2*max(textureLod(uBloom,u2,0.).rgb*EX-1.6,0.)/EX;
    add+=g1*vec3(.55,.75,.45)*.11+g2*vec3(.75,.45,.9)*.05;
    add*=1.+4.*uEbl.x;
    hdr+=add*uFlare; nb+=add*uFlare;
  }
  hdr=sain(hdr); nb=sain(nb); bl=sain(bl);
  vec3 c=tone(mix(hdr,bl,.11)), cn=tone(mix(nb,bl,.11));
  c+=(c-cn)*(mix(uGrainPx>1.?.45:.70,-.5,uFlou)*(1.-min(uSoft,1.))-.9*uEbl.x);   // en mouvement : adoucit (bougé) au lieu d'accentuer          // grand écran : la netteté d'un téléphone en 1080p, sans liseré noir
  c=max(c,0.);
  /* Écrêtage du capteur : un photosite saturé ne garde pas sa teinte, tout ce qui dépasse le blanc part vers le blanc (un
     soleil brûlé est blanc, à peine chaud au bord). Borné à 1 avant la courbe en S : au-delà, c*c*(3-2c) devient négatif
     et éteignait les canaux les plus forts (soleil bleu vif sur le PC, où l'exposition montait davantage). */
  float pk=max(c.r,max(c.g,c.b));
  c=mix(min(c,vec3(1.)),vec3(1.),smoothstep(1.,3.,pk)*.9);
  float l=dot(c,vec3(.299,.587,.114)); c=mix(vec3(l),c,.94);
  c=pow(clamp(c,0.,1.),vec3(1./2.2));
  c=mix(c,c*c*(3.-2.*c),.30);
  float v=r2/(.25*(asp*asp+1.));
  if(uEbl.x>0.||uEbl.y>0.){
    float e=uEbl.x;
    c+=tone(bl)*e*(1.2+2.*e)*vec3(1.,.9,.74);                       // halo de l'optique, amplifié (déjà lu)
    c=mix(c,vec3(1.,.95,.85),e*e*(.5+.4*(1.-v)));                   // voile blanc chaud
    c=mix(c,vec3(dot(c,vec3(.333)))*.7+.3,.35*e);                   // le contraste s'effondre
    float sq=smoothstep(.3,1.,e), ax=abs(q.x)*2., ouv=mix(1.25,.34,sq)*(1.-.55*ax*ax);
    c*=1.-.93*sq*smoothstep(ouv,ouv+.28,abs(q.y)*2.);               // paupières : une amande qui se resserre en haut et en bas
    float tc=uEbl.y*exp(-dot(qa,qa)*20.);                           // persistance rétinienne
    c=mix(c,c*vec3(.22,.4,.3)+vec3(0.,.025,.012),tc*.85);
    c*=1.-.3*uEbl.y*(1.-e);                                         // l'exposition rattrape
  }
  c*=1.-.46*v*v*v;
  float lg=clamp(dot(c,vec3(.333)),0.,1.);
  float tt=floor(uTime*24.);
  vec2 gp=floor(gl_FragCoord.xy/max(uGrainPx,1.));
  float g=h12(gp+vec2(tt*37.1,tt*17.7))-.5;
  c+=g*mix(.060,.020,lg)*GAIN;
  vec2 cq=floor(gl_FragCoord.xy/(3.*max(uGrainPx,1.)));
  vec3 cn3=vec3(h12(cq+tt*3.1),h12(cq+tt*5.3+11.),h12(cq+tt*7.7+23.))-.5;
  c+=cn3*.022*(1.-lg)*GAIN;
  vec2 bq=floor(gl_FragCoord.xy/vec2(16.*max(uGrainPx,1.)));                // macroblocs de compression vidéo
  c+=(vec3(h12(bq+tt*1.7),h12(bq+tt*2.9+5.),h12(bq+tt*4.1+9.))-.5)*(.012+.010*uFlou);   // plus marqués en mouvement, comme un codec à court de débit
  c=c*.985+.012;
  o=vec4(c,1.);
}
