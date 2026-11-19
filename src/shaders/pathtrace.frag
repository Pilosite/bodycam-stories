#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#ifndef SEMIS
#define SEMIS 0              // variantes fixes compilées par src/main.js (progMonde) : avec ou sans semis, avec ou sans arbres. Jamais de code généré par monde.
#endif
#ifndef NU
#define NU 0                 // monde nu : ni arbres, ni rochers, ni canopée dans le code
#endif

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
uniform int   uKit;        // 0 forêt, 1 dunes, 2 nu (rien de prédéfini : tout vient de la fiche)
uniform vec4  uKitP;       // seuil d'arbres, rochers, feuillage, saison (0 été, 1 automne)
uniform vec3  uPrevPos;    // reprojection temporelle : pose de l'image précédente
uniform mat3  uPrevCam;
uniform float uAlpha;      // part d'image neuve dans le mélange
uniform int   uReproj;     // 1 = l'historique est relu à travers l'ancienne pose
uniform float uJit;        // anticrénelage par décalage sous-pixel (0 en mouvement)
uniform int   uMode;       // 1 = sonde de collision
uniform vec3  uProbe;
out vec4 outCol;

uniform vec2  uCan;        // tranche du feuillage : bas, haut
uniform vec4  uHoup;       // houppier : forme (0 voûte commune, 1 cône par arbre), bas du cône, rayon au pied, part de perches
#define YC0 uCan.x
#define YC1 uCan.y
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

/* ---- relief et trajet, réglés par la fiche (mêmes formules dans src/main.js : à modifier des deux côtés).
   Valeurs de la forêt d'origine : uRel (1, 1, 0, 0), uTraj (1, .85, .3, .5), uCreux (.10, 1.8, .4, 0). */
uniform vec4  uRel;        // ondulation : amplitude (1 = forêt), fréquence (1 = forêt, longueur d'onde 150 m), pente le long de z, demi-largeur nivelée en travers du trajet
uniform vec4  uTraj;       // trajet : sinuosité (1 = sentier de forêt, 0 = droit), demi-largeur, fondu du bord, irrégularité du bord
uniform vec4  uCreux;      // creux du trajet : profondeur, bord haut, bord bas (distances au centre)
uniform vec2  uTerK;       // pas de marche sur le relief : partout, et près d'un bord de trajet raide (0 = inutile)
uniform float uYTop;       // hauteur au-dessus du plan de pente au-delà de laquelle il n'y a plus rien
float gAx;                   // écart au trajet du dernier point évalué par terrainH
float pathX(float z){ return uTraj.x*(3.2*sin(z*.047+uSeed.z)+1.6*sin(z*.113+1.7+uSeed.z*2.)); }
float ondul(vec2 p){ vec2 q=p*uRel.y;
  return uRel.x*(1.5*sin(q.x*.041+.6+uSeed.z)*cos(q.y*.035+1.1)+.65*sin(q.x*.097+q.y*.071+2.)+.22*sin(q.x*.29-q.y*.21+uSeed.z*3.)); }
float terrainH(vec2 p){
  if(uKit==1){                                               // dunes : crêtes vives, creux arrondis
    float a=p.x*.045+.9*sin(p.y*.021+uSeed.z)+.5*sin(p.y*.05+1.3);
    return 3.2*(1.-abs(sin(a)))*(.62+.38*sin(p.y*.03+2.+uSeed.z))+.5*sin(p.x*.11+p.y*.08);
  }
  float px=pathX(p.y); gAx=abs(p.x-px);
  float h=ondul(vec2(uRel.w>0.?mix(p.x,px,smoothstep(uRel.w+5.,uRel.w,gAx)):p.x,p.y));   // une rue reste de niveau en travers : l'ondulation y est lue sur l'axe (un seul appel)
  h+=uRel.z*p.y;
  h-=uCreux.x*smoothstep(uCreux.y,uCreux.z,gAx);
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

float sdTreeB(vec3 p, float th, out vec4 info){
  vec2 q=RB*p.xz+17.3; vec2 id=floor(q/CB); vec2 f=q-(id+.5)*CB;
  float dOut=.5*CB-max(abs(f.x),abs(f.y))+.22+(uMode==1?50.:0.);
  info=vec4(0.);
  vec4 h=h42(id+uSeed.xy+71.);
  if(h.x>uKitP.x*.8*uHoup.w) return dOut;
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
/* ---- semis : la fiche décrit un élément (jusqu'à 6 formes), le moteur le répète sur une grille, un élément par cellule.
   Aucune famille d'objets n'est écrite ici : immeubles, réverbères, voitures, tombes sont des données.
   Couche k : lignes SEM0+10k à SEM0+10k+9 de uShapes.
   ligne 0 : (cellule x, cellule z, cos, sin de la rotation) (densité, groupes, fréquence des groupes, rangée le long du trajet)
             (écart au trajet min, max, côté -1/0/1, orientation 0 aléatoire 1 face au trajet 2 fixe) (cap, cap aléatoire, penche, teinte)
   ligne 1 : (jeu x, jeu z, échelle min, max) (hauteur min, max, nombre de formes, rangées) (centre de la boîte englobante, couleurs de palette)
             (demi-tailles de la boîte englobante, suit la pente)
   lignes 2 et 3 : palette, 8 couleurs.   lignes 4 à 9 : les formes, comme celles des objets, dans le repère de l'élément. */
const int SEM0=72, SEML=10;
uniform int   uSemN;       // nombre de couches de semis
uniform vec4  uSemTop;     // hauteur au-dessus du sol au-delà de laquelle une couche n'a plus rien
float gTol;                  // tolérance de la marche en cours : au loin, la marge des cellules s'élargit d'autant
vec4 gInst;                  // élément touché : cap, échelle, étirement, aléa (écrit par objId)
vec2 semMonde(vec2 g, float side, float t0, vec4 A, bool rg){   // repère de la grille -> monde
  return rg?vec2(pathX(g.y)+side*(g.x+t0),g.y):g*mat2(A.z,A.w,-A.w,A.z);
}
float sdSemis(vec3 p, int k, out vec4 info, out vec4 inst){
  int r0=SEM0+k*SEML;
  vec4 A=texelFetch(uShapes,ivec2(0,r0),0), B=texelFetch(uShapes,ivec2(1,r0),0), T=texelFetch(uShapes,ivec2(2,r0),0);
  info=vec4(0.); inst=vec4(0.);
  bool rg=B.w>.5; float side=1.; vec2 g;
  vec4 K=texelFetch(uShapes,ivec2(1,r0+1),0);
  float marge=max(.08,1.5*gTol)+(uMode==1?50.:0.);          // jamais sous la tolérance de la marche : pas de faux impact sur une limite de cellule
  if(rg){                                                    // rangée : la grille suit le trajet, les deux rives en miroir
    float u=p.x-pathX(p.z); side=u<0.?-1.:1.;
    if(T.z*side<-.5) return abs(u)+T.x+marge;                // rive exclue
    g=vec2(abs(u)-T.x,p.z);
    if(g.x<0.) return -g.x+marge;
    float far=g.x-K.w*A.x; if(far>0.) return far+marge;
  } else g=mat2(A.z,A.w,-A.w,A.z)*p.xz;
  vec2 id=floor(g/A.xy), f=g-(id+.5)*A.xy;
  float dOut=min(.5*A.x-abs(f.x),.5*A.y-abs(f.y))+marge;
  vec4 h=h42(id+uSeed.xy+vec2(13.7,71.3)*float(k+1)+(side<0.?vec2(41.3,7.9):vec2(0.)));
  float dens=B.x;
  if(B.y>0.) dens*=mix(1.,smoothstep(.3,.7,vnoise(id*B.z+uSeed.xy+float(k)*17.)),B.y);
  if(h.x>=dens) return dOut;
  vec4 J=texelFetch(uShapes,ivec2(0,r0+1),0), D=texelFetch(uShapes,ivec2(3,r0),0);
  vec2 o=(h.yz-.5)*2.*J.xy;
  vec2 gc=(id+.5)*A.xy+o;
  vec2 w=semMonde(gc,side,T.x,A,rg);
  float dx=0.;
  if(!rg){ dx=w.x-pathX(w.y); if(abs(dx)<T.x || abs(dx)>T.y || dx*T.z<0.) return dOut; }
  if(cleared(w)) return dOut;
  vec4 h2=h42(id*1.37+h.yz*91.+float(k)*3.1+side);
  float yaw=D.x;                                             // cap dans le repère de la grille
  if(T.w<.5) yaw=h2.z*6.2832;
  else if(T.w<1.5){
    if(rg) yaw=-1.5708;
    else { float sg=dx<0.?-1.:1., z=w.y, sl=uTraj.x*(.1504*cos(z*.047+uSeed.z)+.1808*cos(z*.113+1.7+uSeed.z*2.)); yaw=atan(-sg,sg*sl)-atan(A.w,A.z); }
  }
  yaw+=(h2.w-.5)*D.y;
  vec4 E=texelFetch(uShapes,ivec2(3,r0+1),0);
  vec3 th=vec3(0.);
  for(int i=0;i<3;i++){                                      // sol sous l'élément ; s'il suit la pente, deux points de plus (un seul terrainH déplié)
    th[i]=terrainH(i==0?w:semMonde(gc+(i==1?vec2(1.,0.):vec2(0.,1.)),side,T.x,A,rg));
    if(E.w<.5) break;
  }
  vec3 lp=vec3(f.x-o.x,p.y-th.x,f.y-o.y);
  float sh=1.;
  if(E.w>.5){                                                // suit la pente : cisaillé selon le sol sous l'élément
    vec2 sl=th.yz-th.x;
    lp.y-=dot(sl,lp.xz); sh=inversesqrt(1.+dot(sl,sl));
  }
  float c=cos(yaw), sn=sin(yaw); lp.xz=vec2(c*lp.x-sn*lp.z,sn*lp.x+c*lp.z);
  if(rg && side<0.) lp.x=-lp.x;                              // l'autre rive : on défait le miroir
  if(D.z>0.){ vec2 pa=(fract(h2.zw*17.31)-.5)*2.*D.z; float c1=cos(pa.x), s1=sin(pa.x), c2=cos(pa.y), s2=sin(pa.y);
    lp.xy=vec2(c1*lp.x+s1*lp.y,-s1*lp.x+c1*lp.y); lp.zy=vec2(c2*lp.z+s2*lp.y,-s2*lp.z+c2*lp.y); }
  float s=mix(J.z,J.w,h2.x), sy=mix(K.x,K.y,h2.y);
  lp/=s; lp.y/=sy;
  float sc=s*min(1.,sy)*sh;
  vec4 bc=texelFetch(uShapes,ivec2(2,r0+1),0);
  float bb=sdBox(lp-bc.xyz,E.xyz);                           // boîte englobante : on ne détaille que de près
  if(bb>.3) return min(bb*sc*.9,dOut);
  float od=1e5, best=1e5, brow=0.; int cn=int(K.z);
  for(int j=0;j<cn;j++){
    int row=r0+4+j;
    vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), e=texelFetch(uShapes,ivec2(3,row),0);
    float dd=sdPrim(primLocal(lp,row),a.w,b.xyz)-e.y;
    if(dd<best){ best=dd; brow=float(row); }
    od=e.x>0.?smin(od,dd,e.x):min(od,dd);
  }
  info=vec4(lp,brow+.9*h2.w);
  inst=vec4(yaw,s,sy,h2.w);
  return min(od*sc*.85,dOut);
}
vec3 formeCol(int row, float hv){                            // couleur d'une forme ; "palette" : une couleur par élément
  vec4 cm=texelFetch(uShapes,ivec2(2,row),0);
  if(cm.r>=0.) return cm.rgb;
  int r0=SEM0+((row-SEM0)/SEML)*SEML;
  float np=texelFetch(uShapes,ivec2(2,r0+1),0).w;
  int i=int(min(floor(fract(hv*7.13)*np),np-1.));
  return texelFetch(uShapes,ivec2(i&3,r0+2+(i>>2)),0).rgb;
}
float map(vec3 p){
  float th=terrainH(p.xz);
  float y=p.y-th;
  float d=y*(uTerK.y>0. && abs(gAx-.5*(uCreux.y+uCreux.z))<abs(uCreux.y-uCreux.z)*.5+.3?uTerK.y:uTerK.x);   // pas réduit près d'un bord de trajet raide
  vec4 nf;
#if !NU
  if(uKit==0){
    if(y<19.) d=min(d,sdTreeA(p,th,nf)); else d=min(d,y-17.8);
    if(y<12.) d=min(d,sdTreeB(p,th,nf)); else d=min(d,y-11.3);
  }
  if(uKitP.y>0.){ if(y<4.5) d=min(d,sdRock(p,th,nf)); else d=min(d,y-3.9); }
#endif
#if SEMIS
  for(int k=0;k<uSemN;k++){                                  // une seule évaluation de semis, dans une boucle : le compilateur n'en déplie qu'une.
    float tp=uSemTop[k];                                     // En rendu logiciel, ce code coûte même quand il ne s'exécute pas : d'où la variante SEMIS.
    if(y<tp+1.){ vec4 si; d=min(d,sdSemis(p,k,nf,si)); } else d=min(d,y-tp);   // au-dessus de la couche : borne simple, jamais nulle
  }
#endif
  if(uObjN>0) d=min(d,sdProps(p,nf));
  return d;
}
int objId(vec3 p, out vec4 info){
  float th=terrainH(p.xz); float d=(p.y-th)*.88; int id=0; info=vec4(0.,0.,0.,th); vec4 nf;
  float d1;
#if !NU
  if(uKit==0){
    d1=sdTreeA(p,th,nf); if(d1<d){ d=d1; id=1; info=nf; }
    d1=sdTreeB(p,th,nf); if(d1<d){ d=d1; id=2; info=nf; }
  }
  if(uKitP.y>0.){ d1=sdRock(p,th,nf); if(d1<d){ d=d1; id=3; info=nf; } }
#endif
#if SEMIS
  for(int k=0;k<uSemN;k++){
    vec4 si; d1=sdSemis(p,k,nf,si); if(d1<d){ d=d1; id=5; info=nf; gInst=si; }
  }
#endif
  if(uObjN>0){ d1=sdProps(p,nf); if(d1<d){ d=d1; id=4; info=nf; } }
  return id;
}
vec3 calcN(vec3 p, float t){ vec2 e=vec2(1.,-1.)*(.0006*t+.0008); vec3 n=vec3(0.);
  for(int i=0;i<4;i++){                                      // un seul appel à map dans la boucle : le compilateur n'en déplie pas quatre copies
    vec3 o=i==0?e.xyy:i==1?e.yyx:i==2?e.yxy:e.xxx; n+=o*map(p+o); }
  return normalize(n); }

float march(vec3 ro, vec3 rd, float tmax, int steps){
  float t=.02;
  for(int i=0;i<130;i++){
    if(i>=steps) break;
    vec3 p=ro+rd*t;
    if(rd.y>0. && p.y-uRel.z*p.z>uYTop) return -1.;
    gTol=.0012*t+.0008;
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
    if(rd.y>0. && p.y-uRel.z*p.z>uYTop) break;
    gTol=.002*t+.001;
    float d=map(p);
    if(d<.002*t+.001) return 0.;
    t+=max(d,.03);
    if(t>tmax) break;
  }
  return 1.;
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
#if NU
  return 1.;
#endif
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
            float la=(.05+.05*hc.y)*(uHoup.x>.5?3.2:1.);   // conifère : des rameaux, pas des feuilles
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
uniform vec4 uEau;           // eau à l'horizon (mer, baie, lac) sous les rayons qui ne touchent rien : couleur, présence
vec3 eauLoin(vec3 rd){
  vec2 w=rd.xz/max(-rd.y,.004);                              // vagues : la normale bouge, plus serrée vers l'horizon
  vec3 n=normalize(vec3((vnoise(w*.9+uSeed.xy)-.5)*.12,1.,(vnoise(w*.9+uSeed.xy+7.)-.5)*.12));
  vec3 rr=reflect(rd,n); rr.y=abs(rr.y);
  float fr=.02+.98*pow(1.-max(dot(-rd,n),0.),5.);
  vec3 c=mix(uEau.rgb*(uSun*.05+uSky*.35),min(skyCol(rr),vec3(40.)),fr);
  return mix(c,fogCol(rd),.25*smoothstep(-.08,0.,rd.y));
}

/* ---- matières : une recette par surface, lue dans une texture de données.
   Aucune matière n'est écrite ici : sol, sentier, grès, écorces sont des recettes de src/matieres.json ou de la fiche.
   Une recette s'évalue une fois par impact, dans cet ordre : couleur, nuance, taches sous le motif, motif,
   variation, grain, taches, relief, mousse, salissure. Disposition des texels : voir packRecette dans src/main.js. */
uniform sampler2D uMats;
uniform vec3  uSolAlb;       // couleur du sol vue par l'éclairage indirect
uniform float uNuit;         // 0 le jour, 1 la nuit : part des fenêtres allumées qui éclairent
vec3 gQo; float gYo; vec3 gFormCol;   // gFormCol : couleur de la forme touchée, pour une recette « couleur de la forme »          // décalage des motifs propre à chaque élément ; passage de la coordonnée locale à la hauteur au-dessus de la base
uniform ivec4 uSurf;         // recettes du sol, du trajet, des rochers
uniform ivec4 uSurfT;        // écorces : arbres (a, b), perches (a, b)
uniform vec2  uSurfP;        // part de l'écorce a, arbres et perches
const vec3 HUMIDE=vec3(.563,.102,-.819);                    // côté humide, celui où la mousse monte
vec4 rT(int r, int i){ return texelFetch(uMats,ivec2(i,r),0); }
float rN(vec3 q, vec3 s, float o, bool fb, bool sol){       // bruit d'une recette : sur le plan du sol ou dans le volume
  if(sol){ vec2 x=q.xz*s.xz+o; return fb?fbm(x):vnoise(x); }
  vec3 x=q*s+o; return fb?fbm3(x):vnoise3(x);
}
float tacheM(int r, int k, vec3 q, float hs, bool sol){     // masque de la tache k ; hs = hauteur au-dessus du sol
  vec4 b=rT(r,18+k*4), c=rT(r,19+k*4), d=rT(r,20+k*4);
  float N=dot(b.xyz,b.xyz)>0.?rN(q,b.xyz,d.z,b.w>.5,sol):0.;
  if(d.x!=0.) N+=d.x*smoothstep(c.z,c.w,hs);
  return smoothstep(c.x,c.y,N);
}
vec3 palette(int r, float h){
  for(int i=0;i<5;i++){ vec4 p=rT(r,12+i); if(h<p.w || i==4) return p.rgb; }
  return vec3(0.);
}
vec2 motifUV(vec3 q, vec3 n, bool sol){ if(sol || abs(n.y)>.7) return q.xz; return abs(n.x)>abs(n.z)?q.zy:q.xy; }
float planches(vec2 uv, float e, vec4 P, out vec2 id){       // 1 sur la planche, 0 dans le joint ; P.w : planches couchées (bardage)
  if(P.w>.5) uv=uv.yx;
  float u=uv.x*e, i=floor(u), L=max(P.y,.2);
  float v=uv.y/L+h21(vec2(i,7.)), j=floor(v);
  id=vec2(i,j);
  return smoothstep(0.,P.x,min(fract(u),1.-fract(u)))*smoothstep(0.,P.x/(e*L),min(fract(v),1.-fract(v)));
}
float paves(vec2 uv, vec2 e, vec4 P, out vec2 id){           // 1 au sommet du pavé, 0 dans le joint ; e : échelle en largeur et en hauteur (briques)
  vec2 x=uv*e; x.x+=P.y*floor(x.y); id=floor(x);
  vec2 f=fract(x)-.5+(h22(id)-.5)*.08;
  float m=min(.5-abs(f.x),.5-abs(f.y));
  return smoothstep(0.,P.x,m)*(1.-P.w*dot(f,f));
}
float fenetres(vec2 uv, vec4 P, vec4 Q, out vec2 id, out float cadre){   // 1 sur la vitre, 0 sur le mur ; uv : (le long de la façade, hauteur au-dessus de la base)
  // P : largeur, hauteur, pas, étage ; Q : allège, cadre, rez-de-chaussée (0 = comme les étages), part allumée
  float W=P.x, Hh=P.y, al=Q.x, y=uv.y, fl;
  if(Q.z>0. && y<Q.z){ fl=-1.; W=P.z*.8; Hh=Q.z-.6; al=.3; }   // rez-de-chaussée : vitrine ou porte large
  else { y-=Q.z; fl=floor(y/P.w); y-=fl*P.w; }
  float u=uv.x/P.z+.5, uf=(fract(u)-.5)*P.z;
  id=vec2(floor(u),fl);
  float m=max(abs(uf)-.5*W,abs(y-al-.5*Hh)-.5*Hh);          // < 0 dans l'embrasure
  float g=smoothstep(-Q.y+.012,-Q.y-.012,m);
  if(W>.9) g*=smoothstep(.3*Q.y,.3*Q.y+.012,abs(uf));         // meneau
  cadre=smoothstep(.012,-.012,m)-g;
  return g;
}
float fissH(int r, vec3 q, bool sol){                        // 1 sur l'écorce, 0 au fond des fissures
  vec4 e=rT(r,7), p0=rT(r,9), p1=rT(r,10), e2=rT(r,11);
  float a=rN(q,e.xyz,e.w,false,sol);
  float h=1.-smoothstep(p0.x,p0.y,1.-abs(a*2.-1.))*p0.z;
  if(p1.z>0.){ float b=rN(q,e2.xyz,e2.w,false,sol); h-=p1.z*smoothstep(p1.x,p1.y,1.-abs(b*2.-1.)); }
  return clamp(h,0.,1.);
}
float recetteH(int r, vec3 q, vec3 n, float hs, bool sol){   // hauteur du relief : motif, creux des taches, bosses
  vec4 mo=rT(r,6); float H=0.;
  if(mo.w!=0.){
    int ty=int(mo.x+.5); float mh=1.; vec2 id;
    if(ty==3) mh=fissH(r,q,sol);
    else if(ty==4) mh=planches(motifUV(q,n,sol),rT(r,7).x,rT(r,9),id);
    else if(ty==5) mh=paves(motifUV(q,n,sol),sol?rT(r,7).xz:rT(r,7).xy,rT(r,9),id);
    else if(ty==6) for(int i=0;i<(ty==6&&abs(n.y)<.5?1:0);i++){ vec2 uv=motifUV(q-gQo,n,false); uv.y=q.y+gYo; float fr; mh=1.-fenetres(uv,rT(r,9),rT(r,10),id,fr); }
    for(int k=0;k<4;k++){ float cr=rT(r,20+k*4).y; if(cr!=0.) mh-=cr*tacheM(r,k,q,hs,sol); }
    H+=mo.w*mh;
  }
  for(int k=0;k<2;k++){ vec4 a=rT(r,41+k*2); if(a.w!=0.){ vec4 b=rT(r,42+k*2); H+=a.w*rN(q,a.xyz,b.y,b.x>.5,sol); } }
  return H;
}
void recette(int r, vec3 q, vec3 n, float hs, mat2 rot, out vec3 alb, out vec3 tilt, out float spec, out float em){
  vec4 c0=rT(r,0), nup=rT(r,5), mo=rT(r,6), rel=rT(r,39);
  bool sol=mod(c0.w,2.)<.5;
  alb=c0.w>1.5?gFormCol:c0.rgb; tilt=vec3(0.); spec=nup.w; em=0.;
  vec4 nc=rT(r,3);                                           // nuance : une seconde couleur par plages
  if(nc.w>0.){ vec4 ns=rT(r,4); alb=mix(alb,nc.rgb,nc.w*smoothstep(nup.x,nup.y,rN(q,ns.xyz,nup.z,ns.w>.5,sol))); }
  for(int k=0;k<4;k++){ vec4 t0=rT(r,17+k*4); float pl=rT(r,20+k*4).w; if(t0.w>0. && pl>.5 && pl<1.5) alb=mix(alb,t0.rgb,t0.w*tacheM(r,k,q,hs,sol)); }
  int ty=int(mo.x+.5); float cover=1., mm=1.;   // mm : où le motif est posé (pour les taches sur le motif)
  if(ty==1){                                                 // feuilles : cellules de Voronoï, une feuille par cellule
    vec4 e=rT(r,7), p0=rT(r,9), p1=rT(r,10);
    vec2 wp=q.xz+p0.x*vec2(vnoise(q.xz*7.)-.5,vnoise(q.xz*7.+31.)-.5);
    vec3 v=voro(wp*e.x); float hc=v.y;
    vec3 lc=palette(r,hc)*(1.-.5*p0.y+p0.y*h21(vec2(hc*91.,3.)));
    lc*=mix(1.-p0.z,1.,smoothstep(0.,.10,v.z));
    float cov=p1.x; if(p1.y>0.) cov+=p1.y*fbm(q.xz*.8+3.);
    float on=step(1.-cov,fract(hc*7.3));
    if(p1.z<.7) on*=smoothstep(p1.z+.04,p1.z-.04,v.x);
    alb=mix(alb,lc,on*mo.y); mm=on;
    vec2 tl=h22(vec2(hc*37.,hc*91.))-.5;
    tilt+=vec3(tl.x,0.,tl.y)*(rel.z+mo.z*on);
    cover=1.-p0.w*step(.5,fract(hc*5.1));                    // une part des feuilles couvre la mousse
  } else if(ty==2){                                          // rides de vent
    vec4 e=rT(r,7), p0=rT(r,9), p1=rT(r,10);
    float w=fbm(q.xz*p0.y+uSeed.xy);
    vec2 dir=normalize(vec2(1.,.35+.5*(w-.5)));
    if(p1.x!=0.){ float c=cos(p1.x), s=sin(p1.x); dir=mat2(c,s,-s,c)*dir; }
    float ph=dot(q.xz,dir)*e.x+p0.x*fbm(q.xz*1.3);
    float mk=smoothstep(p0.z,p0.w,w+.2*n.y);
    alb=mix(alb,rT(r,8).rgb,mo.y*smoothstep(.3,.8,sin(ph)*mk));
    tilt+=vec3(dir.x,0.,dir.y)*cos(ph)*mo.z*mk;
  } else if(ty==3){                                          // fissures
    float h=fissH(r,q,sol); float as=rT(r,9).w;
    alb=mix(alb,as>0.?alb*(1.-as):rT(r,8).rgb,(1.-h)*mo.y);
  } else if(ty==4 || ty==5){                                 // planches, pavés : éléments répétés et joints
    vec4 e=rT(r,7), P=rT(r,9); vec2 id;
    float s=ty==4?planches(motifUV(q,n,sol),e.x,P,id):paves(motifUV(q,n,sol),sol?e.xz:e.xy,P,id);
    if(rT(r,12).w>0.) alb=palette(r,h21(id+.5));
    alb*=1.-.5*P.z+P.z*h21(id+3.7);
    alb=mix(alb,rT(r,8).rgb,mo.y*(1.-smoothstep(.0,.6,s)));
  } else if(ty==6){                                          // fenêtres : grille d'étages sur les faces verticales
    for(int i=0;i<(ty==6&&abs(n.y)<.5?1:0);i++){
      vec2 uv=motifUV(q-gQo,n,false); uv.y=q.y+gYo; vec2 id; float fr;
      vec4 Q=rT(r,10);
      float g=fenetres(uv,rT(r,9),Q,id,fr)*mo.y;
      float lit=step(h21(id+gQo.xz*.37+3.1),Q.w)*uNuit;
      vec3 vit=mix(rT(r,8).rgb*(.6+.8*h21(id+gQo.xz)),rT(r,12).rgb*(.5+.5*h21(id*1.7+gQo.xz)),lit);
      alb=mix(alb,rT(r,11).rgb,fr*mo.y); alb=mix(alb,vit,g);
      spec=mix(spec,.6*(1.-lit),g); em=g*lit; mm=g;
    }
  } else if(ty==7){                                          // marquage au sol, mesuré depuis l'axe du trajet
    for(int i=0;i<(ty==7?1:0);i++){
    vec4 P=rT(r,9), Q=rT(r,10);                              // P : largeur du trait, tiret, intervalle, écart des lignes de bord ; Q : axe (0, 1 simple, 2 double), période des passages piétons
    float dx=q.x-pathX(q.z), lw=.5*P.x, m=0.;
    float dash=P.y>0.?step(fract(q.z/(P.y+P.z)),P.y/(P.y+P.z)):1.;
    if(Q.x>1.5) m=smoothstep(lw+.01,lw-.01,abs(abs(dx)-lw*2.5));
    else if(Q.x>.5) m=smoothstep(lw+.01,lw-.01,abs(dx))*dash;
    if(P.w>0.) m=max(m,smoothstep(lw+.01,lw-.01,abs(abs(dx)-P.w)));
    if(Q.y>0.) m=max(m,step(fract(q.z/Q.y)*Q.y,3.)*step(.5,fract(dx*1.6))*step(abs(dx),P.w>0.?P.w-.3:3.5));
    m*=1.-.7*smoothstep(.45,.75,fbm(q.xz*vec2(1.2,.5)+7.));   // usure
    alb=mix(alb,rT(r,8).rgb,m*mo.y); mm=m;
    }
  }
  vec4 va=rT(r,1); if(va.w>0.) alb*=1.-.5*va.w+va.w*rN(q,va.xyz,0.,true,sol);
  vec4 gr=rT(r,2); if(gr.w>0.) alb*=1.-.5*gr.w+gr.w*rN(q,gr.xyz,0.,false,sol);
  for(int k=0;k<4;k++){ vec4 t0=rT(r,17+k*4); float pl=rT(r,20+k*4).w; if(t0.w>0. && (pl<.5 || pl>1.5)) alb=mix(alb,t0.rgb,t0.w*tacheM(r,k,q,hs,sol)*(pl>1.5?mm:1.)); }
  if(rel.w>0.){                                              // grain du relief : petites facettes
    float s=rT(r,40).x;
    tilt+=sol?vec3(vnoise(q.xz*s)-.5,0.,vnoise(q.xz*s+9.)-.5)*rel.w
             :(vec3(vnoise3(q*s),vnoise3(q*s+9.),vnoise3(q*s+17.))-.5)*rel.w;
  }
  if(mo.w!=0. || rT(r,41).w!=0. || rT(r,43).w!=0.){         // relief en hauteur : pente par différences finies
    const float e=.004; vec4 hv=vec4(0.);
    for(int i=0;i<4;i++){                                    // un seul appel dans la boucle : le compilateur n'en déplie pas quatre copies
      vec3 o=i==1?vec3(e,0.,0.):i==2?vec3(0.,e,0.):i==3?vec3(0.,0.,e):vec3(0.);
      hv[i]=(sol && i==2)?hv.x:recetteH(r,q+o,n,hs,sol);
    }
    vec3 g=(hv.yzw-hv.x)/e;
    g.xz=g.xz*rot;
    tilt-=g;
  }
  vec4 m0=rT(r,33);
  if(m0.w>0.){                                               // mousse ou lichen : par plaques, selon l'orientation et la hauteur
    vec4 m1=rT(r,34), m2=rT(r,35), m3=rT(r,36), m4=rT(r,37), m5=rT(r,38);
    float N=sol?(m1.w>.5?fbm(q.xz*m1.xz+m2.z+uSeed.xy):vnoise(q.xz*m1.xz+m2.z+uSeed.xy)):rN(q,m1.xyz,m2.z,m1.w>.5,false);
    float m=smoothstep(m2.x,m2.y,N);
    bool dOn=m3.x!=m3.y, cOn=m4.x!=m4.y;
    float Np=m5.z>0.?rN(q,vec3(m5.z),m5.w,true,sol):N;      // bruit qui décale la limite de pente
    if(dOn || cOn) m*=max(dOn?smoothstep(m3.x,m3.y,n.y+m3.z*(Np-.5)):0.,cOn?m4.z*smoothstep(m4.x,m4.y,dot(n,HUMIDE)):0.);
    if(m5.x!=m5.y) m*=smoothstep(m5.x,m5.y,hs);
    vec3 mc=m0.rgb; if(m2.w>0.) mc*=1.-.5*m2.w+m2.w*rN(q,vec3(m3.w),0.,false,sol);
    alb=mix(alb,mc,m*cover*m0.w);                            // les feuilles posées dessus cachent la mousse...
    tilt*=1.-m4.w*m; spec*=1.-m;                             // ...mais le sol reste humide et plat dessous
  }
  if(!sol && rel.x>0.) alb*=mix(1.-rel.x,1.,smoothstep(0.,rel.y,hs));   // salissure : le pied s'assombrit
}

int matProp(vec3 p, vec3 n, vec4 info, bool sem, out vec3 alb, out vec3 nn, out float spec, out float emis, out vec3 qr, out vec3 nl, out mat2 rot){   // rend une recette, ou -1
  int row=int(info.w); float hv=fract(info.w)/.9;           // forme touchée, aléa de l'élément de semis
  vec3 q=primLocal(sem?info.xyz:p,row);
  vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), cm=texelFetch(uShapes,ivec2(2,row),0);
  { vec4 hd=vec4(0.);                                        // normale dans le repère de la forme : c'est elle qui oriente les motifs
    for(int i=0;i<4;i++){ vec3 o=i==1?vec3(.01,0.,0.):i==2?vec3(0.,.01,0.):i==3?vec3(0.,0.,.01):vec3(0.); hd[i]=sdPrim(q+o,a.w,b.xyz); }
    nl=normalize(hd.yzw-hd.x+1e-6); }
  float an=abs(nl.y)<.9&&abs(n.y)<.9?atan(n.z,n.x)-atan(nl.z,nl.x):0.;
  rot=mat2(cos(an),-sin(an),sin(an),cos(an));               // repère de la forme -> monde, pour le relief des recettes
  alb=formeCol(row,hv); nn=n; spec=.05; emis=0.;
  if(sem){                                                   // élément de semis : motifs en mètres, propres à l'élément, teinte variée
    float te=texelFetch(uShapes,ivec2(3,SEM0+((row-SEM0)/SEML)*SEML),0).w;
    alb*=max(vec3(0.),1.+te*(h33(vec3(hv*91.7,hv*37.3,5.1))-.5)*1.6);
    q*=vec3(gInst.y,gInst.y*gInst.z,gInst.y);
    gQo=vec3(hv*61.3,0.,hv*17.9); gYo=info.y*gInst.y*gInst.z-q.y;
  } else { gQo=vec3(0.); gYo=p.y-terrainH(p.xz)-q.y; }
  q+=gQo; gFormCol=alb;
  float m=cm.a;
  qr=q;
  if(m>15.5) return int(m-16.);                              // la forme nomme une recette de la fiche
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
  return -1;
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
  float ma=id>=4?texelFetch(uShapes,ivec2(2,int(info.w)),0).a:0.;
  vec3 alb=id==0?uSolAlb:id==3?vec3(.34,.33,.29):id>=4?formeCol(int(info.w),fract(info.w)/.9)*(ma>6.5&&ma<7.5?9.:1.):vec3(.11,.095,.08);
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
#if NU
  int kind=0; tl=0.; ln=vec3(0.); la=vec3(0.);
#else
  int kind=foliage(ro,rd,tmax,tl,ln,la);
#endif
  vec3 col; float t;
  if(kind==1){
    t=tl; col=shadeLeaf(ro+rd*t,ln,la,rd);
  } else if(kind==2){
    t=tl; if(dot(ln,rd)>0.) ln=-ln; col=lightSurf(ro+rd*t,ln,ln,la,.05,rd);
  } else if(tS<0.){
    gT=1e4;
    vec3 c=rd.y>0.?skyCol(rd):uEau.w>0.?eauLoin(rd):fogCol(rd);
    if(uLoin.w>0. && rd.y>-.02) c=lointain(rd,c);
    if(uTorch>0.) c+=vec3(1.,.97,.90)*uTorch*uFog*smoothstep(.72,.97,dot(rd,uCam[2]))*.07;
    return c;
  } else {
    t=tS; vec3 p=ro+rd*t;
    vec4 info; int id=objId(p,info);
    vec3 gn=calcN(p,t);
    vec3 alb; vec3 n=gn; float spec; float emis=0.;
    // Quelle recette pour cette surface ? Un seul appel à recette() plus bas : le shader reste compact.
    int r0=-1, r1=-1, nr=1; float w=0.; vec3 q=p; float hs=p.y-terrainH(p.xz); mat2 rot=mat2(1.); vec3 nr0=gn;
    if(id==0){                                               // sol, et trajet par-dessus
      r0=uSurf.x; hs=0.;
      if(uSurf.y!=uSurf.x){ w=smoothstep(uTraj.y+uTraj.z,uTraj.y-uTraj.z,abs(p.x-pathX(p.z))+(uTraj.w>0.?uTraj.w*(fbm(p.xz*.8+3.)-.5):0.)); r1=uSurf.y;
        if(w>=1.) r0=r1; else if(w>0.) nr=2; }
    }
    else if(id==3){ r0=uSurf.z; q=info.xyz; }
    else if(id>=4){ for(int i=0;i<(id>=4?1:0);i++) r0=matProp(p,gn,info,id==5,alb,n,spec,emis,q,nr0,rot); }   // garde en boucle : sautée en rendu logiciel quand aucun pixel n'est une forme
    else if(id==1 && info.w>1.5){                            // cœur de feuillage d'un conifère
      alb=leafCol(p,vnoise3(p*5.))*(.5+.6*vnoise3(p*vec3(8.,13.,8.))); spec=.02;
      n=normalize(gn+(vec3(vnoise3(p*17.),vnoise3(p*17.+7.),vnoise3(p*17.+13.))-.5)*.9);
    }
    else { r0=id==1?(fract(info.w*3.7)<uSurfP.x?uSurfT.x:uSurfT.y):(fract(info.w*9.1)<uSurfP.y?uSurfT.z:uSurfT.w); q=info.xyz; hs=info.y; rot=id==1?RA:RB; }
    if(r0>=0){
      vec3 A=vec3(0.), T=vec3(0.); float SP=0., EM=0.;
      for(int k=0;k<2;k++){
        if(k>=nr) break;
        vec3 a, tt; float sp, em; recette(k==0?r0:r1,q,nr0,hs,rot,a,tt,sp,em);
        float wk=nr==1?1.:(k==0?1.-w:w);
        A+=a*wk; T+=tt*wk; SP+=sp*wk; EM+=em*wk;
      }
      alb=A; n=normalize(gn+T); spec=SP; emis=EM;
    }
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
