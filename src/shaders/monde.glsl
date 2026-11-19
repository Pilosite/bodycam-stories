// Le monde, partagé par le lanceur de rayons (pathtrace.frag) et le semeur (moteur v3, v3_*.vert / v3_ombrage.frag).
// Inséré par le build (#include) : chaque fichier qui l'inclut déclare d'abord sa version et ses précisions.
// Ici : aléa, relief, familles d'objets en grilles (un objet par cellule), objets de la fiche, canopée, ciel, lointain.
// Les paramètres d'un objet (arbreA, percheB, blocGres) sont calculés en un seul endroit : le lanceur de rayons
// s'en sert pour sa distance, le semeur pour poser ses grains au même endroit.
uniform vec2  uRes;
uniform vec3  uCamPos;
uniform mat3  uCam;
uniform float uFish;
uniform float uFog;
uniform vec3  uSeed;
uniform vec3  uSunDir;
uniform vec3  uSun;        // éclairement du soleil (ou de la lune)
uniform vec3  uSky;        // teinte et niveau du ciel
uniform float uTorch;      // lampe du téléphone, 0 = éteinte
uniform int   uKit;        // 0 forêt, 1 dunes
uniform vec4  uKitP;       // seuil d'arbres, rochers, feuillage, saison (0 été, 1 automne)
uniform int   uMode;       // 1 = sonde de collision, 2 = tournage panoramique (moteur v2)
uniform vec2  uCan;        // tranche du feuillage : bas, haut
uniform vec4  uHoup;       // houppier : forme (0 voûte commune, 1 cône par arbre), bas du cône, rayon au pied, part de perches
#define YC0 uCan.x
#define YC1 uCan.y
const float CS=0.30;                // cellule de feuille
const float CBR=1.5;                // cellule de branche
const float SIG=0.16;               // extinction de la canopée
const float LEAFP=0.62;
#define SUN uSun

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

/* Paramètres d'un objet de cellule. Ne dépendent que de la cellule (et de la fiche) : le lanceur de rayons les lit pour
   sa distance, le semeur pour poser ses grains. Rendent false quand la cellule est vide. */
struct ArbreA { vec4 h; vec2 o; float H; float r0; vec2 lean; };
bool arbreA(vec2 id, out ArbreA A){
  A.h=h42(id+uSeed.xy);
  if(A.h.x>uKitP.x) return false;
  A.o=(A.h.yz-.5)*3.8;
  vec2 w=((id+.5)*CA+A.o)*RA;
  if(abs(w.x-pathX(w.y))<1.5 || cleared(w)) return false;
  A.H=11.+6.*A.h.w;
  A.r0=.16+.17*fract(A.h.w*7.31);
  A.lean=(h42(id+31.7).xy-.5)*.035;
  return true;
}
float rayonA(ArbreA A, float y){ return A.r0*(1.-.5*clamp(y/A.H,0.,1.))+A.r0*.45*exp(-max(y,0.)*2.5); }
void brancheA(ArbreA A, int k, out vec3 a0, out vec3 a1, out float rb){   // branche k (0 à 2), dans le repère de la cellule
  vec2 o=A.o; vec4 h=A.h; float H=A.H;
  float ac=atan(-o.y,-o.x);
  float fk=float(k);
  float hb=H*(.42+.17*fk);
  float a=ac+(fract(h.w*13.7+fk*.37)-.5)*2.8+fk*.5;
  float reach=1.0+.5*fract(h.x*91.+fk*.71);
  float rise=2.2+1.5*fract(h.y*57.+fk*.53);
  vec2 b0=o+A.lean*hb;
  a0=vec3(b0.x,hb,b0.y);
  a1=a0+vec3(cos(a)*reach,rise,sin(a)*reach);
  rb=A.r0*.34*(1.-.12*fk);
}
float sdTreeA(vec3 p, float th, out vec4 info){
  vec2 q=RA*p.xz; vec2 id=floor(q/CA); vec2 f=q-(id+.5)*CA;
  float dOut=.5*CA-max(abs(f.x),abs(f.y))+.3+(uMode==1?50.:0.);
  info=vec4(0.);
  ArbreA A;
  if(!arbreA(id,A)) return dOut;
  vec4 h=A.h; vec2 o=A.o; float H=A.H;
  float y=p.y-th;
  float yc=clamp(y,-1.,H);
  vec2 dq=f-(o+A.lean*yc);
  float r=rayonA(A,y);
  float dh=length(dq)-r;
  float dv=y-H;
  float d=(dv>0.)?length(vec2(max(dh,0.),dv)):dh;
  if(y>.38*H-1.5 && dh<3.4){
    vec3 lp=vec3(f.x,y,f.y);
    for(int k=0;k<3;k++){
      vec3 a0, a1; float rb; brancheA(A,k,a0,a1,rb);
      d=min(d,sdCapT(lp,a0,a1,rb,rb*.35));
    }
  }
  float fol=0.;
  if(uHoup.x>.5){                                            // conifère : un cœur de feuillage plein, visible et ombrant à toute distance ; les rameaux détaillés flottent autour
    float tt=(y-uHoup.y)/(H+1.2-uHoup.y);
    if(tt>-.15 && tt<1.15){
      float Rc=min(uHoup.z*(.8+.4*h.w),3.3-max(abs(o.x),abs(o.y)))*(1.-.92*clamp(tt,0.,1.))*(.8+.2*sin(y*4.2+h.w*30.))*.74;
      float dc=max(length(f-o)-Rc,max(uHoup.y-y,y-(H+1.2)))*.55;
      if(dc<d){ d=dc; fol=2.; }
    }
  }
  info=vec4(dq.x,y,dq.y,h.w+fol);
  return min(d*.9,dOut);
}

struct PercheB { vec4 h; vec2 o; float H; float r0; vec2 lean; };
bool percheB(vec2 id, out PercheB B){
  B.h=h42(id+uSeed.xy+71.);
  if(B.h.x>uKitP.x*.8*uHoup.w) return false;
  B.o=(B.h.yz-.5)*1.9;
  vec2 w=((id+.5)*CB+B.o-17.3)*RB;
  if(abs(w.x-pathX(w.y))<1.15 || cleared(w)) return false;
  B.H=6.+5.*B.h.w;
  B.r0=.035+.07*fract(B.h.w*5.3);
  B.lean=(h42(id+3.1).xy-.5)*.06;
  return true;
}
vec2 axeB(PercheB B, float yc){ return B.o+B.lean*yc+.06*sin(yc*.6+B.h.w*20.)*vec2(cos(B.h.x*40.),sin(B.h.x*40.)); }
float rayonB(PercheB B, float y){ return B.r0*(1.-.6*clamp(y/B.H,0.,1.))+B.r0*.3*exp(-max(y,0.)*4.); }
float sdTreeB(vec3 p, float th, out vec4 info){
  vec2 q=RB*p.xz+17.3; vec2 id=floor(q/CB); vec2 f=q-(id+.5)*CB;
  float dOut=.5*CB-max(abs(f.x),abs(f.y))+.22+(uMode==1?50.:0.);
  info=vec4(0.);
  PercheB B;
  if(!percheB(id,B)) return dOut;
  float y=p.y-th;
  float H=B.H;
  float yc=clamp(y,-1.,H);
  vec2 dq=f-axeB(B,yc);
  float r=rayonB(B,y);
  float dh=length(dq)-r;
  float dv=y-H;
  float d=(dv>0.)?length(vec2(max(dh,0.),dv)):dh;
  info=vec4(dq.x,y,dq.y,B.h.w);
  return min(d*.85,dOut);
}

struct Bloc { vec4 h; float R; vec2 o; vec3 rad; float a; };
bool blocGres(vec2 id, out Bloc B){
  B.h=h42(id+uSeed.xy+13.);
  float mask=vnoise(id*.37+uSeed.xy);
  if(B.h.x>(smoothstep(.32,.68,mask)*.9+.08)*uKitP.y) return false;
  float R=.7+1.6*B.h.w*B.h.w;
  B.R=R;
  B.o=(B.h.yz-.5)*2.*(.5*CC-.3-1.25*R);
  vec2 w=(id+.5)*CC+B.o;
  if(abs(w.x-pathX(w.y))<R*1.1+.5 || cleared(w)) return false;
  B.a=B.h.x*50.;
  vec4 h=B.h;
  B.rad=R*vec3(1.+.25*fract(h.y*9.),.62+.3*fract(h.z*7.),.8+.3*fract(h.w*11.));
  return true;
}
vec3 blocLocal(vec3 p, float th, vec2 id, Bloc B){          // repère du bloc : centré, tourné
  vec2 f=p.xz-(id+.5)*CC;
  vec3 lp=vec3(f.x-B.o.x,p.y-th-B.R*.22,f.y-B.o.y);
  float ca=cos(B.a),sa=sin(B.a);
  lp.xz=mat2(ca,sa,-sa,ca)*lp.xz;
  return lp;
}
float blocForme(vec3 lp, Bloc B){                            // ellipsoïde bosselé, en mètres (avant la marge du pas)
  vec4 h=B.h; float R=B.R; vec3 rad=B.rad;
  float d=(length(lp/rad)-1.)*min(rad.x,min(rad.y,rad.z));
  d+=.10*R*sin(lp.x*2.3/R+h.x*9.)*sin(lp.y*2.9/R+h.y*7.)*sin(lp.z*2.1/R+h.z*5.);
  d+=.035*R*sin(lp.x*6.1/R)*sin(lp.y*7.3/R+1.)*sin(lp.z*5.7/R+2.);
  return d;
}
float sdRock(vec3 p, float th, out vec4 info){
  vec2 q=p.xz; vec2 id=floor(q/CC); vec2 f=q-(id+.5)*CC;
  float dOut=.5*CC-max(abs(f.x),abs(f.y))+.3+(uMode==1?50.:0.);
  info=vec4(0.);
  Bloc B;
  if(!blocGres(id,B)) return dOut;
  vec3 lp=blocLocal(p,th,id,B);
  float d=blocForme(lp,B);
  info=vec4(lp,B.R);
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

/* ---- canopée : densité, transmittance, feuilles et branches discrètes */
float coneDens(vec3 c){                                      // conifères : un cône de feuillage par arbre, étagé, du pied à la cime
  vec2 q=RA*c.xz; vec2 id=floor(q/CA); vec2 f=q-(id+.5)*CA;
  vec4 h=h42(id+uSeed.xy);
  if(h.x>uKitP.x) return 0.;
  vec2 o=(h.yz-.5)*3.8;
  vec2 w=((id+.5)*CA+o)*RA;
  if(abs(w.x-pathX(w.y))<1.5) return 0.;
  float y=c.y-terrainH(w), H=11.+6.*h.w;
  float t=(y-uHoup.y)/(H+1.2-uHoup.y);
  if(t<0. || t>1.) return 0.;
  float R=min(uHoup.z*(.8+.4*h.w),3.3-max(abs(o.x),abs(o.y)))*(1.-.92*t)*(.8+.2*sin(y*4.2+h.w*30.));   // l'arbre reste dans sa cellule
  float r=length(f-o);
  float trou=vnoise3(c*vec3(1.7,2.6,1.7)+h.w*9.);
  return smoothstep(R,R*.7,r)*smoothstep(.12,.4,trou)*4.*uKitP.z;
}
float canopyDens(vec3 c){
  if(uHoup.x>.5) return coneDens(c);
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
  if(uHoup.x>.5) return mix(vec3(.010,.030,.014),vec3(.034,.075,.030),h)*(.7+.6*vnoise3(c*.4+uSeed));   // aiguilles : vert sombre toute l'année
  float sp=vnoise3(c*.09+uSeed+40.);
  if(sp<.42) return mix(vec3(.030,.062,.018),vec3(.055,.095,.028),h);
  vec3 ete=mix(vec3(.035,.085,.018),vec3(.075,.15,.03),h);
  vec3 aut=sp<.70?mix(vec3(.30,.15,.035),vec3(.46,.30,.06),h):mix(vec3(.50,.36,.05),vec3(.36,.38,.07),h);
  return mix(ete,aut,uKitP.w);
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
/* ---- lointain : la ligne d'horizon (montagnes, collines), calculée par direction et non tracée.
   Deux plans : un massif au fond, des contreforts devant. Neige au-dessus d'une altitude, lumière du soleil, voile de l'air. */
uniform vec4 uLoin;          // hauteur du massif (tangente de l'angle), découpe des crêtes, altitude de la neige (0 à 1, au-delà : aucune), présence
uniform vec3 uLoinCol;       // roche
uniform vec3 uLoinBas;       // contreforts
float loinCrete(float az, float k){                         // profil des crêtes autour de l'horizon, sans couture
  vec2 c=vec2(cos(az),sin(az))*uLoin.y; float s=0., a=.55, f=1.;
  for(int i=0;i<5;i++){ float n=vnoise(c*f+uSeed.xy*3.+k*17.+float(i)*5.3); s+=a*(i<1?n:1.-abs(2.*n-1.)); a*=.42; f*=2.; }
  return s;
}
vec3 lointain(vec3 rd, vec3 c){
  float az=atan(rd.x,rd.z), el=rd.y/max(length(rd.xz),1e-4);
  if(el>uLoin.x*1.25) return c;
  vec3 air=skyBase(normalize(vec3(rd.x,.02,rd.z)));
  float sa=atan(uSunDir.x,uSunDir.z);
  for(int k=0;k<2;k++){
    float fk=float(k), H=uLoin.x*(k==0?1.:.34);
    float cr=H*(.42+1.15*loinCrete(az,fk));
    float d=(loinCrete(az+.03,fk)-loinCrete(az-.03,fk))*14.;                       // pente de la crête : versant au soleil ou à l'ombre
    float lit=clamp(.45+.9*d*sin(sa-az)+.35*cos(sa-az),.03,1.);
    float alt=el/max(uLoin.x,1e-4);
    float plis=.6*vnoise(vec2(az*uLoin.y*9.+alt*7.+fk*9.,alt*9.-az*5.))+.4*vnoise(vec2(az*uLoin.y*30.-alt*16.,alt*26.+fk*3.));                            // couloirs et arêtes dans la face
    vec3 alb=k==0?uLoinCol*(.7+.6*plis):uLoinBas*(.75+.5*plis);
    if(k==0) alb=mix(alb,vec3(.86,.88,.92),smoothstep(uLoin.z-.05,uLoin.z+.05,alt+.5*(plis-.5)+.25*(cr/H-.7)));   // la neige tient sur les hauts, la roche perce dans les faces
    vec3 col=alb*(uSun*lit*(.30+.15*plis)+vec3(.42,.52,.72)*uSky*.42);
    col=mix(col,air,(k==0?.30:.14)*(1.-.5*smoothstep(0.,.8,alt)));   // le voile de l'air s'accroche au pied, les sommets en sortent
    c=mix(c,col,smoothstep(cr+.004,cr-.004,el));
  }
  return c;
}
vec3 fogCol(vec3 rd){ float s=max(dot(rd,uSunDir),0.); return mix(vec3(.27,.31,.34)*uSky,uSun*vec3(.171,.164,.156),pow(s,5.)*.8); }

/* ---- éclairage */
vec3 sunSample(){ float a=6.2832*rnd(), r=sqrt(rnd())*.011; vec3 t=normalize(cross(uSunDir,vec3(0.,1.,0.))), b=cross(uSunDir,t);
  return normalize(uSunDir+(t*cos(a)+b*sin(a))*r); }
vec3 cosDir(vec3 n){ float a=6.2832*rnd(), u=rnd()*2.-1.; float s=sqrt(max(1.-u*u,0.)); return normalize(n+vec3(s*cos(a),s*sin(a),u)*.999); }

#define CANOPY_GLOW (vec3(.50,.36,.12)*(dot(uSun,vec3(.06))+.2*uSky.g))

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
