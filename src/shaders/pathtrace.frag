#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uPrev;
uniform vec2  uRes;
uniform float uTick;
uniform vec3  uCamPos;
uniform mat3  uCam;
uniform float uFish;
uniform float uFog;
uniform vec3  uSeed;
uniform int   uQ;
uniform vec3  uSunDir;
uniform vec3  uSun;        // éclairement du soleil (ou de la lune)
uniform vec3  uSky;        // teinte et niveau du ciel
uniform float uTorch;      // lampe du téléphone, 0 = éteinte
uniform int   uKit;        // 0 forêt, 1 dunes
uniform vec4  uKitP;       // seuil d'arbres, rochers, feuillage, saison (0 été, 1 automne)
uniform vec3  uPrevPos;    // reprojection temporelle : pose de l'image précédente
uniform mat3  uPrevCam;
uniform float uAlpha;      // part d'image neuve dans le mélange
uniform int   uReproj;     // 1 = l'historique est relu à travers l'ancienne pose
uniform float uJit;        // anticrénelage par décalage sous-pixel (0 en mouvement)
uniform int   uMode;       // 1 = sonde de collision
uniform vec3  uProbe;
out vec4 outCol;

const float YC0=7.0, YC1=19.0;      // tranche de la canopée
const float CS=0.30;                // cellule de feuille
const float CBR=1.5;                // cellule de branche
const float SIG=0.16;               // extinction de la canopée
const float LEAFP=0.62;
#define SUN uSun
float gT;                    // distance du premier impact, gardée pour la reprojection

/* ---- aléa */
uint rs;
float rnd(){ rs=rs*747796405u+2891336453u; uint w=((rs>>((rs>>28u)+4u))^rs)*277803737u; w=(w>>22u)^w; return float(w>>8u)*(1.0/16777216.0); }

float h21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2  h22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec4  h42(vec2 p){ vec4 p4=fract(vec4(p.xyxy)*vec4(.1031,.1030,.0973,.1099)); p4+=dot(p4,p4.wzxy+33.33); return fract((p4.xxyz+p4.yzzw)*p4.zywx); }
float h31(vec3 p){ p=fract(p*.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
vec3  h33(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }

float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float vnoise3(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.3,9.1); a*=.5; } return s; }
float fbm3(vec3 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vnoise3(p); p=p*2.03+vec3(17.3,9.1,5.7); a*=.5; } return s; }
vec3 voro(vec2 x){ vec2 n=floor(x),f=fract(x); float d1=8.,d2=8.,hid=0.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(float(i),float(j)); vec2 o=h22(n+g); vec2 r=g+o-f; float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; hid=h21(n+g+.5); } else if(d<d2){ d2=d; } }
  return vec3(sqrt(d1),hid,sqrt(d2)-sqrt(d1)); }

/* ---- terrain et sentier */
float pathX(float z){ return 3.2*sin(z*.047+uSeed.z)+1.6*sin(z*.113+1.7+uSeed.z*2.); }
float terrainH(vec2 p){
  if(uKit==1){                                               // dunes : crêtes vives, creux arrondis
    float a=p.x*.045+.9*sin(p.y*.021+uSeed.z)+.5*sin(p.y*.05+1.3);
    return 3.2*(1.-abs(sin(a)))*(.62+.38*sin(p.y*.03+2.+uSeed.z))+.5*sin(p.x*.11+p.y*.08);
  }
  float h=1.5*sin(p.x*.041+.6+uSeed.z)*cos(p.y*.035+1.1)+.65*sin(p.x*.097+p.y*.071+2.)+.22*sin(p.x*.29-p.y*.21+uSeed.z*3.);
  h-=.10*smoothstep(1.8,.4,abs(p.x-pathX(p.y)));
  return h;
}

/* ---- arbres, perches, blocs de grès : une grille par famille, un objet par cellule */
const float CA=6.0, CB=3.3, CC=8.5;
const mat2 RA=mat2(.8776,.4794,-.4794,.8776);
const mat2 RB=mat2(.6216,-.7833,.7833,.6216);

/* ---- objets décrits par la fiche : rien n'est prédéfini, tout est composé de formes de base.
   uShapes, 4 texels par ligne. Lignes 0 à 7, un objet : (centre xyz, rayon englobant) (première forme, nombre, rayon dégagé, visible).
   Lignes 8 et plus, une forme : (position xyz, type) (demi-tailles xyz, cap) (couleur rgb, matière) (fusion, arrondi, penche x, penche z). */
uniform sampler2D uShapes;
uniform int uObjN;
bool cleared(vec2 w){                                        // ni arbre ni rocher à l'emplacement d'un objet qui le demande
  for(int i=0;i<8;i++){ if(i>=uObjN) break;
    vec4 o1=texelFetch(uShapes,ivec2(1,i),0);
    if(o1.z>0. && o1.w>.5 && distance(w,texelFetch(uShapes,ivec2(0,i),0).xz)<o1.z) return true; }
  return false;
}
float sdCapT(vec3 p, vec3 a, vec3 b, float ra, float rb){ vec3 pa=p-a,ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h)-mix(ra,rb,h); }

float sdTreeA(vec3 p, float th, out vec4 info){
  vec2 q=RA*p.xz; vec2 id=floor(q/CA); vec2 f=q-(id+.5)*CA;
  float dOut=.5*CA-max(abs(f.x),abs(f.y))+.3+(uMode==1?50.:0.);
  info=vec4(0.);
  vec4 h=h42(id+uSeed.xy);
  if(h.x>uKitP.x) return dOut;
  vec2 o=(h.yz-.5)*3.8;
  vec2 w=((id+.5)*CA+o)*RA;
  if(abs(w.x-pathX(w.y))<1.5 || cleared(w)) return dOut;
  float y=p.y-th;
  float H=11.+6.*h.w;
  float r0=.16+.17*fract(h.w*7.31);
  vec2 lean=(h42(id+31.7).xy-.5)*.035;
  float yc=clamp(y,-1.,H);
  vec2 dq=f-(o+lean*yc);
  float r=r0*(1.-.5*clamp(y/H,0.,1.))+r0*.45*exp(-max(y,0.)*2.5);
  float dh=length(dq)-r;
  float dv=y-H;
  float d=(dv>0.)?length(vec2(max(dh,0.),dv)):dh;
  if(y>.38*H-1.5 && dh<3.4){
    float ac=atan(-o.y,-o.x);
    vec3 lp=vec3(f.x,y,f.y);
    for(int k=0;k<3;k++){
      float fk=float(k);
      float hb=H*(.42+.17*fk);
      float a=ac+(fract(h.w*13.7+fk*.37)-.5)*2.8+fk*.5;
      float reach=1.0+.5*fract(h.x*91.+fk*.71);
      float rise=2.2+1.5*fract(h.y*57.+fk*.53);
      vec2 b0=o+lean*hb;
      vec3 a0=vec3(b0.x,hb,b0.y);
      vec3 a1=a0+vec3(cos(a)*reach,rise,sin(a)*reach);
      float rb=r0*.34*(1.-.12*fk);
      d=min(d,sdCapT(lp,a0,a1,rb,rb*.35));
    }
  }
  info=vec4(dq.x,y,dq.y,h.w);
  return min(d*.9,dOut);
}

float sdTreeB(vec3 p, float th, out vec4 info){
  vec2 q=RB*p.xz+17.3; vec2 id=floor(q/CB); vec2 f=q-(id+.5)*CB;
  float dOut=.5*CB-max(abs(f.x),abs(f.y))+.22+(uMode==1?50.:0.);
  info=vec4(0.);
  vec4 h=h42(id+uSeed.xy+71.);
  if(h.x>uKitP.x*.8) return dOut;
  vec2 o=(h.yz-.5)*1.9;
  vec2 w=((id+.5)*CB+o-17.3)*RB;
  if(abs(w.x-pathX(w.y))<1.15 || cleared(w)) return dOut;
  float y=p.y-th;
  float H=6.+5.*h.w;
  float r0=.035+.07*fract(h.w*5.3);
  vec2 lean=(h42(id+3.1).xy-.5)*.06;
  float yc=clamp(y,-1.,H);
  vec2 ax=o+lean*yc+.06*sin(yc*.6+h.w*20.)*vec2(cos(h.x*40.),sin(h.x*40.));
  vec2 dq=f-ax;
  float r=r0*(1.-.6*clamp(y/H,0.,1.))+r0*.3*exp(-max(y,0.)*4.);
  float dh=length(dq)-r;
  float dv=y-H;
  float d=(dv>0.)?length(vec2(max(dh,0.),dv)):dh;
  info=vec4(dq.x,y,dq.y,h.w);
  return min(d*.85,dOut);
}

float sdRock(vec3 p, float th, out vec4 info){
  vec2 q=p.xz; vec2 id=floor(q/CC); vec2 f=q-(id+.5)*CC;
  float dOut=.5*CC-max(abs(f.x),abs(f.y))+.3+(uMode==1?50.:0.);
  info=vec4(0.);
  vec4 h=h42(id+uSeed.xy+13.);
  float mask=vnoise(id*.37+uSeed.xy);
  if(h.x>(smoothstep(.32,.68,mask)*.9+.08)*uKitP.y) return dOut;
  float R=.7+1.6*h.w*h.w;
  vec2 o=(h.yz-.5)*2.*(.5*CC-.3-1.25*R);
  vec2 w=(id+.5)*CC+o;
  if(abs(w.x-pathX(w.y))<R*1.1+.5 || cleared(w)) return dOut;
  vec3 lp=vec3(f.x-o.x,p.y-th-R*.22,f.y-o.y);
  float a=h.x*50.; float ca=cos(a),sa=sin(a);
  lp.xz=mat2(ca,sa,-sa,ca)*lp.xz;
  vec3 rad=R*vec3(1.+.25*fract(h.y*9.),.62+.3*fract(h.z*7.),.8+.3*fract(h.w*11.));
  float d=(length(lp/rad)-1.)*min(rad.x,min(rad.y,rad.z));
  d+=.10*R*sin(lp.x*2.3/R+h.x*9.)*sin(lp.y*2.9/R+h.y*7.)*sin(lp.z*2.1/R+h.z*5.);
  d+=.035*R*sin(lp.x*6.1/R)*sin(lp.y*7.3/R+1.)*sin(lp.z*5.7/R+2.);
  info=vec4(lp,R);
  return min(d*.72,dOut);
}

float sdBox(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.); }
float sdEll(vec3 p, vec3 r){ return (length(p/r)-1.)*min(r.x,min(r.y,r.z)); }
float smin(float a, float b, float k){ float h=clamp(.5+.5*(b-a)/k,0.,1.); return mix(b,a,h)-k*h*(1.-h); }
float sdPrim(vec3 q, float ty, vec3 s){
  if(ty<.5) return sdBox(q,s);                                                   // boîte
  if(ty<1.5) return sdEll(q,s);                                                  // boule ou ellipsoïde
  if(ty<2.5){ vec2 d=vec2(length(q.xz)-s.x,abs(q.y)-s.y); return min(max(d.x,d.y),0.)+length(max(d,0.)); }   // cylindre debout
  if(ty<3.5){ float r=s.x*clamp(.5-q.y/(2.*s.y),0.,1.); return max(length(q.xz)-r,abs(q.y)-s.y)*.7; }      // cône, pointe en haut
  if(ty<4.5){ q.y-=clamp(q.y,-s.y,s.y); return length(q)-s.x; }                  // capsule debout
  vec2 nn=normalize(vec2(2.*s.y,s.z));                                           // toit à deux pentes, faîtage le long de x
  return max(abs(q.x)-s.x,max(abs(q.z)*nn.x+q.y*nn.y-(nn.x*s.z-nn.y*s.y),-q.y-s.y));
}
vec3 primLocal(vec3 p, int row){
  vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), e=texelFetch(uShapes,ivec2(3,row),0);
  vec3 q=p-a.xyz; float c=cos(b.w), s=sin(b.w);
  q.xz=vec2(c*q.x-s*q.z,s*q.x+c*q.z);
  if(e.w!=0.){ c=cos(e.w); s=sin(e.w); q.xy=vec2(c*q.x+s*q.y,-s*q.x+c*q.y); }
  if(e.z!=0.){ c=cos(e.z); s=sin(e.z); q.yz=vec2(c*q.y+s*q.z,-s*q.y+c*q.z); }
  return q;
}
float sdProps(vec3 p, out vec4 info){
  float d=1e5; info=vec4(0.);
  for(int i=0;i<8;i++){
    if(i>=uObjN) break;
    vec4 o0=texelFetch(uShapes,ivec2(0,i),0), o1=texelFetch(uShapes,ivec2(1,i),0);
    if(o1.w<.5) continue;
    float bound=length(p-o0.xyz)-o0.w;
    if(bound>.8){ d=min(d,bound); continue; }
    float od=1e5; float best=1e5; float brow=0.;
    int st=int(o1.x), cn=int(o1.y);
    for(int j=0;j<24;j++){
      if(j>=cn) break;
      int row=st+j;
      vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), e=texelFetch(uShapes,ivec2(3,row),0);
      float dd=sdPrim(primLocal(p,row),a.w,b.xyz)-e.y;
      if(dd<best){ best=dd; brow=float(row); }
      od=e.x>0.?smin(od,dd,e.x):min(od,dd);
    }
    od*=.8;
    if(od<d){ d=od; info=vec4(0.,0.,0.,brow); }
  }
  return d;
}
float map(vec3 p){
  float th=terrainH(p.xz);
  float y=p.y-th;
  float d=y*.88;
  vec4 nf;
  if(uKit==0){
    if(y<19.) d=min(d,sdTreeA(p,th,nf)); else d=min(d,y-17.8);
    if(y<12.) d=min(d,sdTreeB(p,th,nf)); else d=min(d,y-11.3);
  }
  if(uKitP.y>0.){ if(y<4.5) d=min(d,sdRock(p,th,nf)); else d=min(d,y-3.9); }
  if(uObjN>0) d=min(d,sdProps(p,nf));
  return d;
}
int objId(vec3 p, out vec4 info){
  float th=terrainH(p.xz); float d=(p.y-th)*.88; int id=0; info=vec4(0.,0.,0.,th); vec4 nf;
  float d1;
  if(uKit==0){
    d1=sdTreeA(p,th,nf); if(d1<d){ d=d1; id=1; info=nf; }
    d1=sdTreeB(p,th,nf); if(d1<d){ d=d1; id=2; info=nf; }
  }
  if(uKitP.y>0.){ d1=sdRock(p,th,nf); if(d1<d){ d=d1; id=3; info=nf; } }
  if(uObjN>0){ d1=sdProps(p,nf); if(d1<d){ d=d1; id=4; info=nf; } }
  return id;
}
vec3 calcN(vec3 p, float t){ vec2 e=vec2(1.,-1.)*(.0006*t+.0008);
  return normalize(e.xyy*map(p+e.xyy)+e.yyx*map(p+e.yyx)+e.yxy*map(p+e.yxy)+e.xxx*map(p+e.xxx)); }

float march(vec3 ro, vec3 rd, float tmax, int steps){
  float t=.02;
  for(int i=0;i<130;i++){
    if(i>=steps) break;
    vec3 p=ro+rd*t;
    if(rd.y>0. && p.y>23.) return -1.;
    float d=map(p);
    if(d<.0012*t+.0008) return t;
    t+=d;
    if(t>tmax) return -1.;
  }
  return t;
}
float shadow(vec3 ro, vec3 rd, float tmax, int steps){
  float t=.03;
  for(int i=0;i<56;i++){
    if(i>=steps) break;
    vec3 p=ro+rd*t;
    if(rd.y>0. && p.y>23.) break;
    float d=map(p);
    if(d<.002*t+.001) return 0.;
    t+=max(d,.03);
    if(t>tmax) break;
  }
  return 1.;
}

/* ---- canopée : densité, transmittance, feuilles et branches discrètes */
float canopyDens(vec3 c){
  float hp=smoothstep(YC0,YC0+2.5,c.y)*smoothstep(YC1,YC1-4.,c.y);
  if(hp<=0.) return 0.;
  float n=vnoise3(c*vec3(.21,.26,.21)+uSeed)*.7+.3*vnoise3(c*.63+7.);
  float gap=mix(.72,1.,smoothstep(.5,5.,abs(c.x-pathX(c.z))));
  return smoothstep(.50,.63,n)*hp*gap*uKitP.z;
}
float canopyT(vec3 ro, vec3 rd){
  if(uKitP.z<=0. || uKit!=0) return 1.;
  float ry=abs(rd.y)<1e-4?1e-4:rd.y;
  float ta=(YC0-ro.y)/ry, tb=(YC1-ro.y)/ry;
  float t0=max(min(ta,tb),0.), t1=max(ta,tb);
  if(t1<=t0) return 1.;
  t1=min(t1,t0+60.);
  float ds=(t1-t0)/6.; float od=0.; float j=rnd();
  for(int i=0;i<6;i++) od+=canopyDens(ro+rd*(t0+(float(i)+j)*ds));
  return exp(-od*ds*SIG);
}
vec3 leafCol(vec3 c, float h){
  float sp=vnoise3(c*.09+uSeed+40.);
  if(sp<.42) return mix(vec3(.030,.062,.018),vec3(.055,.095,.028),h);
  vec3 ete=mix(vec3(.035,.085,.018),vec3(.075,.15,.03),h);
  vec3 aut=sp<.70?mix(vec3(.30,.15,.035),vec3(.46,.30,.06),h):mix(vec3(.50,.36,.05),vec3(.36,.38,.07),h);
  return mix(ete,aut,uKitP.w);
}
float capIntersect(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float ra){
  vec3 ba=pb-pa, oa=ro-pa;
  float baba=dot(ba,ba), bard=dot(ba,rd), baoa=dot(ba,oa), rdoa=dot(rd,oa), oaoa=dot(oa,oa);
  float a=baba-bard*bard, b=baba*rdoa-baoa*bard, c=baba*oaoa-baoa*baoa-ra*ra*baba;
  float h=b*b-a*c;
  if(h>=0. && a>1e-6){
    float t=(-b-sqrt(h))/a; float y=baoa+t*bard;
    if(y>0. && y<baba) return t;
    vec3 oc=(y<=0.)?oa:ro-pb; b=dot(rd,oc); c=dot(oc,oc)-ra*ra; h=b*b-c;
    if(h>0.) return -b-sqrt(h);
  }
  return -1.;
}

int foliage(vec3 ro, vec3 rd, float tmax, out float tHit, out vec3 nHit, out vec3 aHit){
  tHit=tmax; nHit=vec3(0.,1.,0.); aHit=vec3(0.); int kind=0;
  vec3 r=rd; r+=step(abs(r),vec3(1e-5))*1e-5;
  float ta=(YC0-ro.y)/r.y, tb=(YC1-ro.y)/r.y;
  float t0=max(min(ta,tb),0.), t1=min(max(ta,tb),tmax);
  if(t1<=t0 || uKitP.z<=0. || uKit!=0) return 0;
  vec3 inv=1./r; vec3 sg=sign(r); vec3 sp=max(sg,0.);

  { // branches : grille grossière
    vec3 cell=floor((ro+r*(t0+1e-3))/CBR);
    vec3 tM=((cell+sp)*CBR-ro)*inv; vec3 tD=abs(inv)*CBR; float tc=t0;
    int NB=uQ==0?16:26;
    for(int i=0;i<26;i++){
      if(i>=NB) break;
      vec3 hc=h33(cell+uSeed+3.3);
      float dn=canopyDens((cell+.5)*CBR);
      if(hc.x<dn*.6){
        vec3 a=(cell+.1+.8*h33(cell+11.))*CBR, b=(cell+.1+.8*h33(cell+23.))*CBR;
        float ra=.010+.03*hc.z*hc.z;
        float tt=capIntersect(ro,r,a,b,ra);
        if(tt>0. && tt<tHit){ tHit=tt; kind=2; vec3 p=ro+r*tt; vec3 ba=b-a; float hh=clamp(dot(p-a,ba)/dot(ba,ba),0.,1.);
          nHit=normalize(p-a-ba*hh); aHit=vec3(.085,.07,.055); }
      }
      if(tM.x<tM.y){ if(tM.x<tM.z){ tc=tM.x; tM.x+=tD.x; cell.x+=sg.x; } else { tc=tM.z; tM.z+=tD.z; cell.z+=sg.z; } }
      else { if(tM.y<tM.z){ tc=tM.y; tM.y+=tD.y; cell.y+=sg.y; } else { tc=tM.z; tM.z+=tD.z; cell.z+=sg.z; } }
      if(tc>min(t1,tHit)) break;
    }
  }
  t1=min(t1,tHit);

  // feuilles : grille fine près de la caméra
  vec3 cell=floor((ro+r*(t0+1e-3))/CS);
  vec3 tM=((cell+sp)*CS-ro)*inv; vec3 tD=abs(inv)*CS; float tc=t0; float dens=0.; bool done=false;
  int NL=uQ==0?44:72;
  for(int i=0;i<72;i++){
    if(i>=NL) break;
    if((i&3)==0) dens=canopyDens((cell+.5)*CS);
    if(dens>.002){
      vec3 hc=h33(cell+uSeed);
      if(hc.x<dens*LEAFP){
        vec3 r2=h33(cell+19.19);
        vec3 c=(cell+.3+.4*r2)*CS;
        vec3 n=normalize(r2.zxy*2.-1.+vec3(0.,.6,0.));
        float dn=dot(r,n);
        if(abs(dn)>1e-3){
          float tt=dot(c-ro,n)/dn;
          if(tt>t0 && tt<t1){
            vec3 q=ro+r*tt-c;
            vec3 u=normalize(cross(n,vec3(.31,.11,.9)+hc)); vec3 v=cross(n,u);
            float la=.05+.05*hc.y;
            float x=dot(q,u)/la, y=dot(q,v)/(la*.55);
            if(x*x+y*y<1.){ tHit=tt; nHit=n; aHit=leafCol(c,hc.z); return 1; }
          }
        }
      }
    }
    if(tM.x<tM.y){ if(tM.x<tM.z){ tc=tM.x; tM.x+=tD.x; cell.x+=sg.x; } else { tc=tM.z; tM.z+=tD.z; cell.z+=sg.z; } }
    else { if(tM.y<tM.z){ tc=tM.y; tM.y+=tD.y; cell.y+=sg.y; } else { tc=tM.z; tM.z+=tD.z; cell.z+=sg.z; } }
    if(tc>t1){ done=true; break; }
  }
  if(done) return kind;

  // au loin : les feuilles deviennent un milieu statistique
  int NS=uQ==0?10:18;
  float ds=max((t1-tc)/float(NS),.9);
  float tt=tc+rnd()*ds;
  for(int i=0;i<18;i++){
    if(i>=NS || tt>t1) break;
    vec3 q=ro+r*tt;
    float d=canopyDens(q);
    if(rnd()<1.-exp(-d*SIG*ds)){
      tHit=tt; nHit=normalize(vec3(rnd(),rnd(),rnd())*2.-1.+vec3(0.,.3,0.)); aHit=leafCol(q,rnd()); return 1;
    }
    tt+=ds;
  }
  return kind;
}

/* ---- ciel et brume */
vec3 skyBase(vec3 rd){
  float y=max(rd.y,0.);
  vec3 c=mix(vec3(.62,.72,.86),vec3(.16,.34,.78),pow(y,.45))*2.2*uSky;
  float s=max(dot(rd,uSunDir),0.);
  c+=uSun*vec3(.143,.129,.109)*(.9*pow(s,6.)+3.*pow(s,48.));
  return c;
}
vec3 skyCol(vec3 rd){
  float s=max(dot(rd,uSunDir),0.);
  return skyBase(rd)+uSun*vec3(6.4,7.2,8.7)*smoothstep(.9996,.99985,s);
}
vec3 fogCol(vec3 rd){ float s=max(dot(rd,uSunDir),0.); return mix(vec3(.27,.31,.34)*uSky,uSun*vec3(.171,.164,.156),pow(s,5.)*.8); }

/* ---- matières */
void matGround(vec3 p, vec3 n, out vec3 alb, out vec3 nn, out float spec){
  if(uKit==1){                                               // sable : rides de vent, grain, zones tassées
    float w=fbm(p.xz*.25+uSeed.xy);
    vec2 dir=normalize(vec2(1.,.35+.5*(w-.5)));
    float ph=dot(p.xz,dir)*26.+6.*fbm(p.xz*1.3);
    float rip=sin(ph)*smoothstep(.25,.6,w+.2*n.y);
    alb=vec3(.60,.44,.27)*(.86+.2*fbm(p.xz*2.))*(.93+.14*vnoise(p.xz*160.));
    alb=mix(alb,vec3(.52,.36,.21),.3*smoothstep(.3,.8,rip));
    nn=normalize(n+vec3(dir.x,0.,dir.y)*cos(ph)*.22*smoothstep(.25,.6,w+.2*n.y)+vec3(vnoise(p.xz*120.)-.5,0.,vnoise(p.xz*120.+7.)-.5)*.12);
    spec=.10; return;
  }
  float dP=abs(p.x-pathX(p.z));
  float nz=fbm(p.xz*.8+3.);
  float pathW=smoothstep(1.15,.55,dP+.5*(nz-.5));
  vec2 wp=p.xz+.12*vec2(vnoise(p.xz*7.)-.5,vnoise(p.xz*7.+31.)-.5);
  vec3 v=voro(wp*15.);
  float hs=v.y;
  vec3 leaf=hs<.30?vec3(.17,.085,.04):hs<.55?vec3(.33,.17,.06):hs<.75?vec3(.44,.27,.09):hs<.90?vec3(.27,.21,.13):vec3(.07,.05,.035);
  leaf*=.75+.5*h21(vec2(hs*91.,3.));
  leaf*=mix(.45,1.,smoothstep(0.,.10,v.z))*(.8+.4*vnoise(p.xz*60.));
  float damp=smoothstep(.35,.7,fbm(p.xz*.35+11.));
  leaf*=mix(1.,.6,damp);
  float moss=smoothstep(.60,.72,fbm(p.xz*.42+20.+uSeed.xy));
  vec3 mossC=vec3(.038,.064,.016)*(.6+.8*vnoise(p.xz*45.));
  vec3 g=mix(leaf,mossC,moss*(1.-.8*step(.5,fract(hs*5.1))));
  vec3 sand=vec3(.50,.44,.34)*(.75+.35*fbm(p.xz*3.));
  sand*=mix(1.,.62,smoothstep(.45,.75,fbm(p.xz*.6+5.)));
  sand*=.9+.2*vnoise(p.xz*90.);
  float onLeaf=step(.55+.35*(1.-nz),fract(hs*7.3))*smoothstep(.36,.28,v.x);
  vec3 pc=mix(sand,leaf,onLeaf*.92);
  alb=mix(g,pc,pathW);
  vec2 tl=h22(vec2(hs*37.,hs*91.))-.5;
  float amt=mix(.62,.10+.5*onLeaf,pathW)*(1.-moss*.6);
  nn=normalize(n+vec3(tl.x,0.,tl.y)*amt+vec3(vnoise(p.xz*30.)-.5,0.,vnoise(p.xz*30.+9.)-.5)*.25);
  spec=mix(.22,.04,pathW)*(1.-moss);
}
float rockBump(vec3 q){ return fbm3(q*4.3+5.)*.6+vnoise3(q*18.)*.25; }
void matRock(vec3 p, vec3 n, vec4 info, float th, out vec3 alb, out vec3 nn, out float spec){
  vec3 q=info.xyz;
  float f1=fbm3(q*1.1), f2=fbm3(q*4.3+5.);
  vec3 base=vec3(.36,.345,.31)*(.7+.6*f1);
  base=mix(base,vec3(.42,.36,.27),.35*smoothstep(.4,.7,f2));
  base*=.85+.3*vnoise3(q*60.);
  base*=mix(1.,.62,smoothstep(.55,.8,vnoise3(vec3(q.x*3.,q.y*.5,q.z*3.)+3.)));
  float li=smoothstep(.66,.72,vnoise3(q*7.+11.)); base=mix(base,vec3(.50,.52,.44),li*.7);
  float ld=smoothstep(.70,.76,vnoise3(q*5.+31.)); base=mix(base,vec3(.06,.06,.055),ld*.6);
  float m=smoothstep(.25,.8,n.y+.7*(f2-.5))*smoothstep(.38,.6,fbm3(q*.8+3.));
  m=max(m,smoothstep(.3,.9,dot(n,normalize(vec3(.5,.2,-.8))))*smoothstep(.5,.65,f1)*.8);
  vec3 mossC=vec3(.07,.13,.025)*(.55+.9*vnoise3(q*50.));
  if(uKit!=0){ m=0.; base=mix(base,vec3(.50,.38,.25),.5); }   // hors forêt : pas de mousse, roche patinée par le sable
  alb=mix(base,mossC,m*.9);
  alb*=mix(.5,1.,smoothstep(0.,.45,p.y-th));
  float e=.012; float b0=rockBump(q);
  vec3 gr=vec3(rockBump(q+vec3(e,0.,0.)),rockBump(q+vec3(0.,e,0.)),rockBump(q+vec3(0.,0.,e)))-b0;
  nn=normalize(n-gr/e*.03*(1.-m*.5));
  spec=.04;
}
float barkPat(vec3 q, int ty, out vec3 alb){
  if(ty==0){
    float a=vnoise3(q*vec3(26.,2.6,26.)); float r1=1.-abs(a*2.-1.);
    float b=vnoise3(q*vec3(60.,7.,60.)+4.); float r2=1.-abs(b*2.-1.);
    float hh=clamp(1.-smoothstep(.7,.97,r1)*.9-.25*smoothstep(.8,.97,r2),0.,1.);
    alb=mix(vec3(.03,.026,.022),vec3(.17,.15,.13),hh)*(.75+.5*vnoise3(q*vec3(6.,1.,6.)));
    return hh;
  }
  if(ty==1){
    float a=vnoise3(q*vec3(14.,3.,14.)+2.); float r1=1.-abs(a*2.-1.);
    float crack=smoothstep(.78,.96,r1);
    float up=smoothstep(5.,8.5,q.y);
    vec3 pl=mix(vec3(.19,.15,.13),vec3(.30,.19,.13),vnoise3(q*vec3(9.,2.,9.)));
    pl=mix(pl,vec3(.50,.25,.10),up);
    alb=pl*mix(1.,.2,crack)*(.8+.4*vnoise3(q*50.));
    return 1.-crack;
  }
  if(ty==2){
    alb=vec3(.64,.62,.57)*(.85+.3*vnoise3(q*vec3(20.,3.,20.)));
    float l=smoothstep(.72,.8,vnoise3(q*vec3(12.,55.,12.)));
    alb=mix(alb,vec3(.10,.09,.08),l*.7);
    float bp=smoothstep(.60,.70,vnoise3(q*vec3(7.,1.4,7.)+2.)+.35*smoothstep(1.4,0.,q.y));
    alb=mix(alb,vec3(.035,.032,.03),bp);
    return 1.-bp*.8-l*.2;
  }
  float a=vnoise3(q*vec3(30.,2.,30.));
  alb=vec3(.16,.145,.12)*(.6+.8*a);
  alb=mix(alb,vec3(.10,.13,.05),.5*smoothstep(.4,.7,vnoise3(q*vec3(4.,.7,4.)+5.)));
  return a;
}
void matBark(vec3 n, vec4 info, int id, out vec3 alb, out vec3 nn, out float spec){
  vec3 q=info.xyz;
  int ty=(id==1)?(fract(info.w*3.7)<.45?1:0):(fract(info.w*9.1)<.5?2:3);
  float h0=barkPat(q,ty,alb);
  float e=.004; vec3 tmp;
  vec3 gr=vec3(barkPat(q+vec3(e,0.,0.),ty,tmp),barkPat(q+vec3(0.,e,0.),ty,tmp),barkPat(q+vec3(0.,0.,e),ty,tmp))-h0;
  if(id==1) gr.xz=gr.xz*RA; else gr.xz=gr.xz*RB;
  nn=normalize(n-gr/e*(ty==2?.004:.012));
  float g=smoothstep(-.2,.7,dot(n,normalize(vec3(.6,0.,-.8))))*smoothstep(3.2,.3,q.y)*smoothstep(.35,.6,vnoise3(q*vec3(6.,2.,6.)+9.));
  alb=mix(alb,vec3(.085,.125,.035),g*.75);
  spec=.06;
}

void matProp(vec3 p, vec3 n, vec4 info, out vec3 alb, out vec3 nn, out float spec, out float emis){
  int row=int(info.w);
  vec3 q=primLocal(p,row);
  vec4 b=texelFetch(uShapes,ivec2(1,row),0), cm=texelFetch(uShapes,ivec2(2,row),0);
  alb=cm.rgb; nn=n; spec=.05; emis=0.;
  float m=cm.a;
  vec3 r=abs(q)/max(b.xyz,vec3(1e-3));
  float u=r.z>r.x?q.x:q.z;                                   // coordonnée le long de la face touchée
  if(m<.5){ alb*=.9+.2*vnoise3(q*14.); }                                            // mat, peint, crépi
  else if(m<1.5){ alb*=(.62+.7*h21(vec2(floor(u*7.),3.)))*(.8+.4*vnoise(vec2(u*40.,q.y*3.)))*mix(.3,1.,smoothstep(0.,.07,fract(u*7.))); }   // bois en planches
  else if(m<2.5){ alb*=(.65+.7*fbm3(q*2.3))*(.85+.3*vnoise3(q*50.)); if(uKit==0) alb=mix(alb,vec3(.07,.12,.03),.6*smoothstep(.4,.9,n.y)*smoothstep(.45,.6,fbm3(q*1.1+3.))); }   // pierre
  else if(m<3.5){ alb*=.85+.3*vnoise3(q*6.); spec=.5; }                              // métal
  else if(m<4.5){ alb*=.12; spec=.8; }                                               // verre
  else if(m<5.5){ alb*=.7+.6*vnoise3(q*110.); }                                      // pelage, tissu
  else if(m<6.5){ alb*=(.7+.6*vnoise(vec2(q.x*3.,q.z*14.)))*mix(.55,1.,smoothstep(0.,.08,fract(abs(q.z)*4.))); spec=.08; }   // tuile, ardoise
  else { emis=1.; }                                                                  // lumineux
}

/* ---- éclairage */
vec3 sunSample(){ float a=6.2832*rnd(), r=sqrt(rnd())*.011; vec3 t=normalize(cross(uSunDir,vec3(0.,1.,0.))), b=cross(uSunDir,t);
  return normalize(uSunDir+(t*cos(a)+b*sin(a))*r); }
vec3 cosDir(vec3 n){ float a=6.2832*rnd(), u=rnd()*2.-1.; float s=sqrt(max(1.-u*u,0.)); return normalize(n+vec3(s*cos(a),s*sin(a),u)*.999); }

#define CANOPY_GLOW (vec3(.50,.36,.12)*(dot(uSun,vec3(.06))+.2*uSky.g))

vec3 Li(vec3 ro, vec3 rd){
  float t=march(ro,rd,45.,uQ==0?30:44);
  if(t<0.){
    if(rd.y<.02) return vec3(.20,.22,.22)*uSky;
    float T=canopyT(ro,rd);
    return min(skyBase(rd),vec3(6.))*T+CANOPY_GLOW*(1.-T);
  }
  vec3 p=ro+rd*t; vec4 info; int id=objId(p,info);
  vec3 n=calcN(p,t);
  vec3 alb=id==0?vec3(.24,.15,.07):id==3?vec3(.34,.33,.29):id==4?texelFetch(uShapes,ivec2(2,int(info.w)),0).rgb*(texelFetch(uShapes,ivec2(2,int(info.w)),0).a>6.5?9.:1.):vec3(.11,.095,.08);
  vec3 c=alb*vec3(.20,.21,.20)*uSky;
  float ndl=max(dot(n,uSunDir),0.);
  if(ndl>0.){ vec3 po=p+n*.02; float vis=shadow(po,uSunDir,50.,30); if(vis>0.) c+=alb*SUN*ndl*vis*canopyT(po,uSunDir); }
  return c;
}

vec3 lightSurf(vec3 p, vec3 gn, vec3 n, vec3 alb, float spec, vec3 rd){
  vec3 sd=sunSample();
  float ndl=max(dot(n,sd),0.);
  vec3 col=vec3(0.);
  vec3 po=p+gn*(.004+.0015*length(p-uCamPos));
  if(ndl>0. && dot(gn,sd)>0.){
    float vis=shadow(po,sd,70.,uQ==0?26:56);
    if(vis>0.){
      vis*=canopyT(po,sd);
      vec3 h=normalize(sd-rd);
      col+=SUN*vis*ndl*(alb+spec*2.*pow(max(dot(n,h),0.),28.));
    }
  }
  if(uTorch>0.){
    vec3 L=uCamPos+uCam*vec3(.10,-.12,0.)-p; float d2=dot(L,L); float dl=sqrt(d2); L/=dl;
    float nl=max(dot(n,L),0.);
    float cs=dot(-L,uCam[2]);
    float cone=smoothstep(.50,.90,cs)*(.30+.70*smoothstep(.90,.985,cs));
    if(nl>0. && cone>0.){
      float vis=shadow(po,L,dl-.05,uQ==0?16:28);
      col+=alb*vec3(1.,.97,.90)*uTorch*cone*nl*vis/(d2+.3);
    }
  }
  vec3 wi=cosDir(n); if(dot(wi,gn)<0.) wi=reflect(wi,gn);
  col+=alb*Li(po,wi);
  return col;
}

vec3 shadeLeaf(vec3 p, vec3 n, vec3 alb, vec3 rd){
  if(dot(n,rd)>0.) n=-n;
  vec3 sd=sunSample();
  float T=canopyT(p+sd*.3,sd);
  float ndl=dot(n,sd);
  vec3 col=SUN*T*(ndl>0.?alb*ndl:alb*vec3(1.25,1.15,.6)*(-ndl)*.55);
  vec3 h=normalize(sd-rd);
  col+=SUN*T*max(ndl,0.)*.3*pow(max(dot(n,h),0.),40.);
  float hg=clamp((p.y-YC0)/(YC1-YC0),0.,1.);
  vec3 ambUp=vec3(.45,.55,.70)*mix(.25,1.3,hg*hg)*uSky;
  vec3 ambDn=vec3(.13,.11,.07)*uSky;
  if(uTorch>0.){
    vec3 L=uCamPos-p; float d2=dot(L,L); L/=sqrt(d2);
    float cs=dot(-L,uCam[2]);
    col+=alb*uTorch*smoothstep(.50,.90,cs)*(.30+.70*smoothstep(.90,.985,cs))*(.25+.75*abs(dot(n,L)))/(d2+.3);
  }
  col+=alb*mix(ambDn,ambUp,n.y*.5+.5);
  col+=alb*vec3(1.2,1.1,.6)*ambUp*.35*max(-n.y,0.);
  return col;
}

vec3 render(vec3 ro, vec3 rd){
  float tS=march(ro,rd,150.,uQ==0?90:130);
  float tmax=tS<0.?400.:tS;
  float tl; vec3 ln; vec3 la;
  int kind=foliage(ro,rd,tmax,tl,ln,la);
  vec3 col; float t;
  if(kind==1){
    t=tl; col=shadeLeaf(ro+rd*t,ln,la,rd);
  } else if(kind==2){
    t=tl; if(dot(ln,rd)>0.) ln=-ln; col=lightSurf(ro+rd*t,ln,ln,la,.05,rd);
  } else if(tS<0.){
    gT=1e4;
    vec3 c=rd.y>0.?skyCol(rd):fogCol(rd);
    if(uTorch>0.) c+=vec3(1.,.97,.90)*uTorch*uFog*smoothstep(.72,.97,dot(rd,uCam[2]))*.07;
    return c;
  } else {
    t=tS; vec3 p=ro+rd*t;
    vec4 info; int id=objId(p,info);
    vec3 gn=calcN(p,t);
    vec3 alb; vec3 n; float spec; float emis=0.;
    if(id==0) matGround(p,gn,alb,n,spec);
    else if(id==3) matRock(p,gn,info,terrainH(p.xz),alb,n,spec);
    else if(id==4) matProp(p,gn,info,alb,n,spec,emis);
    else matBark(gn,info,id,alb,n,spec);
    col=lightSurf(p,gn,n,alb,spec,rd)+alb*emis*8.;
  }
  gT=t;
  col=mix(fogCol(rd),col,exp(-t*uFog));
  if(uTorch>0.) col+=vec3(1.,.97,.90)*uTorch*uFog*smoothstep(.72,.97,dot(rd,uCam[2]))*.045*(1.667-1./max(t,.6));
  return col;
}

void main(){
  if(uMode==1){                                              // sonde : distance au décor en 3 points voisins
    int ix=int(gl_FragCoord.x);
    vec3 q=uProbe+(ix==1?vec3(.05,0.,0.):ix==2?vec3(0.,0.,.05):vec3(0.));
    outCol=vec4(map(q),0.,0.,1.); return;
  }
  ivec2 ip=ivec2(gl_FragCoord.xy);
  rs=uint(ip.x)*1973u+uint(ip.y)*9277u+uint(uTick)*26699u+1u; rnd(); rnd();
  vec2 px=gl_FragCoord.xy+(vec2(rnd(),rnd())-.5)*uJit;
  vec2 uv=(px-.5*uRes)/uRes.y;
  float rr=length(uv), ang=rr*uFish;                       // projection fisheye équidistante
  vec3 rd=normalize(uCam*vec3(uv/max(rr,1e-5)*sin(ang),cos(ang)));
  gT=1e4;
  vec3 col=render(uCamPos,rd);
  col=min(max(col,vec3(0.)),vec3(60.));
  if(col.x!=col.x||col.y!=col.y||col.z!=col.z) col=vec3(0.);

  vec3 hist=vec3(0.); float a=1.;
  if(uAlpha<1.){
    if(uReproj==0){ hist=texelFetch(uPrev,ip,0).rgb; a=uAlpha; }
    else {                                                   // où ce point du monde se trouvait-il dans l'image précédente ?
      vec3 d=uCamPos+rd*gT-uPrevPos; float dist=length(d);
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
          w*=step(abs(sm.a-dist),.08*dist+.06);              // rejette l'historique d'un autre objet (désoccultation)
          acc+=sm.rgb*w; ws+=w;
        }
        if(ws>.08){ hist=acc/ws; a=uAlpha; }
      }
    }
  }
  outCol=vec4(mix(hist,col,a),gT);
}
