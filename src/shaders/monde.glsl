// Le monde, partagé par le lanceur de rayons (pathtrace.frag) et le semeur (moteur v3, v3_*.vert / v3_ombrage.frag).
// Inséré par le build (#include) : chaque fichier qui l'inclut déclare d'abord sa version et ses précisions.
// Ici : aléa, relief, familles d'objets en grilles (un objet par cellule), objets de la fiche, canopée, ciel, lointain.
// Les paramètres d'un objet (arbreA, percheB, blocGres) sont calculés en un seul endroit : le lanceur de rayons
// s'en sert pour sa distance, le semeur pour poser ses grains au même endroit.
#ifndef SEMIS
#define SEMIS 0              // variantes fixes compilées par src/main.js (progMonde) : avec ou sans semis, avec ou sans arbres. Jamais de code généré par monde.
#endif
#ifndef NU
#define NU 0                 // monde nu : ni arbres, ni rochers, ni canopée dans le code
#endif
#ifndef RELIEF
#define RELIEF 0             // 1 : la fiche demande des bosses ou des buttes (relief.bosses, relief.buttes). Variante compilée à la demande :
#endif                       // sans elle, terrainH reste celui d'avant, sans une ligne de plus (Direct3D, rendu logiciel).
#ifndef HOUPPIER
#define HOUPPIER 0           // 1 : la fiche décrit les houppiers (foret.houppiers) : charpentières, rameaux, masses de feuillage par arbre
#endif
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
uniform int   uKit;        // 0 forêt, 1 dunes, 2 nu (rien de prédéfini : tout vient de la fiche)
uniform vec4  uKitP;       // seuil d'arbres, rochers, feuillage, saison (0 été, 1 automne)
uniform int   uMode;       // 1 = sonde de collision, 2 = tournage panoramique (moteur v2)
uniform vec2  uCan;        // tranche du feuillage : bas, haut
uniform vec4  uHoup;       // houppier : forme (0 voûte commune, 1 cône par arbre), bas du cône, rayon au pied, part de perches
/* Atmosphère (fiche : ambiance.atmosphere, ambiance.brume_basse). Sans elle (x = 0), ciel, brume et soleil d'avant, à l'identique. */
uniform vec4  uAtmo;       // modèle atmosphère (0 ou 1), trouble de l'air (0 à 1), brume basse au sol (par mètre), hauteur d'échelle de la brume basse (m)
uniform vec4  uAtmo2;      // sol de référence de la brume basse (m), force du rebord, nombre de pas des rais (0 : statistique), troncs par mètre (ombre statistique)
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

/* ---- relief et trajet, réglés par la fiche (mêmes formules dans src/main.js : à modifier des deux côtés).
   Valeurs de la forêt d'origine : uRel (1, 1, 0, 0), uTraj (1, .85, .3, .5), uCreux (.10, 1.8, .4, 0). */
uniform vec4  uRel;        // ondulation : amplitude (1 = forêt), fréquence (1 = forêt, longueur d'onde 150 m), pente le long de z, demi-largeur nivelée en travers du trajet
uniform vec4  uTraj;       // trajet : sinuosité (1 = sentier de forêt, 0 = droit), demi-largeur, fondu du bord, irrégularité du bord
uniform vec4  uCreux;      // creux du trajet : profondeur, bord haut, bord bas (distances au centre)
float gAx;                   // écart au trajet du dernier point évalué par terrainH
float pathX(float z){ return uTraj.x*(3.2*sin(z*.047+uSeed.z)+1.6*sin(z*.113+1.7+uSeed.z*2.)); }
float ondul(vec2 p){ vec2 q=p*uRel.y;
  return uRel.x*(1.5*sin(q.x*.041+.6+uSeed.z)*cos(q.y*.035+1.1)+.65*sin(q.x*.097+q.y*.071+2.)+.22*sin(q.x*.29-q.y*.21+uSeed.z*3.)); }
#if RELIEF
/* Bosses et buttes (fiche : relief.bosses, relief.buttes). Bruit de valeur sur un réseau entier, haché en entiers non signés :
   la même formule existe dans src/main.js (terrainH) et donne exactement les mêmes nombres (Math.imul), le porteur ne flotte
   pas au-dessus du sol dessiné. Bosses : deux octaves tournées, creux et bosses de part et d'autre du sol moyen. Buttes : un
   bruit lent passé par un seuil doux, flanc puis plateau (une platière, une butte, un talus de colline). Le trajet les adoucit. */
uniform vec4  uRelB;       // bosses : hauteur (m), fréquence (1/m) ; buttes : hauteur (m), fréquence (1/m)
uniform vec4  uRelC;       // buttes : seuils du bruit (pied du flanc, bord du plateau) ; part gardée sur le trajet : bosses, buttes
uniform vec2  uRelS;       // décalage entier du réseau (graine)
float hR(ivec2 c){ uvec2 u=uvec2(c+ivec2(uRelS)+46000); uint x=(u.x*1597334677u)^(u.y*3812015801u);
  x=x*747796405u+2891336453u; x=((x>>((x>>28u)+4u))^x)*277803737u; x=(x>>22u)^x; return float(x>>8u)*(1./16777216.); }
float bruitR(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); ivec2 c=ivec2(i);
  return mix(mix(hR(c),hR(c+ivec2(1,0)),f.x),mix(hR(c+ivec2(0,1)),hR(c+ivec2(1,1)),f.x),f.y); }
float reliefDetail(vec2 p, float ax){
  vec2 q=p*uRelB.y;
  float b=(bruitR(q)-.5)*1.4+(bruitR(vec2(.8*q.x-.6*q.y,.6*q.x+.8*q.y)*2.13+vec2(31.,17.))-.5)*.6;
  vec2 r=p*uRelB.w;
  float t=smoothstep(uRelC.x,uRelC.y,bruitR(vec2(.6*r.x+.8*r.y,-.8*r.x+.6*r.y)+vec2(-57.,83.)));
  return uRelB.x*b*mix(uRelC.z,1.,smoothstep(uTraj.y,uTraj.y+2.5,ax))+uRelB.z*t*mix(uRelC.w,1.,smoothstep(uTraj.y+1.,uTraj.y+14.,ax));
}
#endif
float terrainH(vec2 p){
  if(uKit==1){                                               // dunes : crêtes vives, creux arrondis
    float a=p.x*.045+.9*sin(p.y*.021+uSeed.z)+.5*sin(p.y*.05+1.3);
    return 3.2*(1.-abs(sin(a)))*(.62+.38*sin(p.y*.03+2.+uSeed.z))+.5*sin(p.x*.11+p.y*.08);
  }
  float px=pathX(p.y); gAx=abs(p.x-px);
  float h=ondul(vec2(uRel.w>0.?mix(p.x,px,smoothstep(uRel.w+5.,uRel.w,gAx)):p.x,p.y));   // une rue reste de niveau en travers : l'ondulation y est lue sur l'axe (un seul appel)
  h+=uRel.z*p.y;
  h-=uCreux.x*smoothstep(uCreux.y,uCreux.z,gAx);
#if RELIEF
  h+=reliefDetail(p,gAx);
#endif
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
#if HOUPPIER
/* ---- houppiers (fiche : foret.houppiers). Rien n'est une essence en dur : quatre ports réglés par la fiche, un par écorce
   (arbres a et b, perches a et b, même partage que les écorces). Un port : où commence et finit le houppier sur la hauteur
   du tronc, sa largeur, son profil (ovale ou en plateau), le nombre de charpentières, leur montée, leur retombée, les rameaux
   de chaque charpentière, et les masses de feuillage au bout des rameaux et des charpentières (taille, remplissage, feuilles).
   Une charpentière : deux segments (part du tronc, puis se courbe ou retombe). Tout se calcule à partir de l'arbre (tirages de
   sa cellule) : le semeur pose ses grains dessus, vus de la caméra comme du soleil (les masses trouées laissent passer les rais). */
uniform vec4  uHp[16];     // port e (0 arbres a, 1 arbres b, 2 perches a, 3 perches b), 4 lignes :
                           // (bas, haut : part de la hauteur ; largeur (m) ; aplati 0 ovale, 1 plateau) (charpentières, montée, retombée, rameaux)
                           // (masse (m), feuilles 0 à 1, taille d'une feuille (m), actif) (part de l'écorce a, inégal 0 à 1, -, -)
struct Tige { vec2 c; mat2 M; vec2 o; vec2 lean; float H; float r0; vec4 h; int e; float wa; float wp; vec2 wd; float th; };
vec2 axeT(Tige T, float y){ return T.o+T.lean*y+T.wa*sin(y*.6+T.wp)*T.wd; }   // axe du tronc (repère de la cellule), à la hauteur y
bool portA(ArbreA A, out Tige T){
  T.c=vec2(0.); T.M=RA; T.o=A.o; T.lean=A.lean; T.H=A.H; T.r0=A.r0; T.h=A.h; T.wa=0.; T.wp=0.; T.wd=vec2(1.,0.); T.th=0.;
  T.e=fract(A.h.w*.999*3.7)<uHp[3].x?0:1;                    // même partage que l'écorce (v3_ombrage : fract(par × 3,7) < part)
  return uHp[T.e*4+2].w>.5;
}
/* Charpentière k : a0 sur le tronc, am au coude, a1 au bout ; rb son rayon au départ ; d2 la direction du bout. Repère de la cellule. */
void charpente(Tige T, int k, out vec3 a0, out vec3 am, out vec3 a1, out float rb, out vec3 d2){
  vec4 P0=uHp[T.e*4], P1=uHp[T.e*4+1];
  float fk=float(k), nb=max(P1.x,1.);
  vec4 r=h42(T.h.zw*37.1+vec2(fk*7.31,fk*3.17));
  float u=clamp((fk+.2+.6*r.x)/nb,0.,1.);                    // place dans le houppier, du bas vers le haut
  float y=T.H*mix(P0.x,P0.y,u);
  float prof=mix(sin(3.1416*(.15+.8*u)),.55+.45*u,P0.w);    // profil : ovale, ou en plateau (plus large en haut)
  float L=P0.z*prof*(.7+.45*r.y);
  float az=fk*2.39996+T.h.x*6.2832+(r.z-.5)*.9;             // angle d'or, plus un aléa
  float el=mix(.12,1.35,P1.y)*(.75+.5*r.w)-.3*u*P0.w;
  vec2 ax=axeT(T,y);
  a0=vec3(ax.x,y,ax.y);
  vec3 d1=vec3(cos(az)*cos(el),sin(el),sin(az)*cos(el));
  am=a0+d1*L*.5;
  float el2=el-P1.z*1.4-.12, a2=az+(r.y-.5)*.6;
  d2=vec3(cos(a2)*cos(el2),sin(el2),sin(a2)*cos(el2));
  a1=am+d2*L*.55;
  rb=T.r0*mix(.62,.3,u)*(.8+.3*r.x);
}
/* Rameau j de la charpentière (départ, bout, rayon) ; masse de feuillage m (m = rameaux : au bout de la charpentière). */
void rameau(Tige T, int k, int j, vec3 a0, vec3 am, vec3 a1, float rb, out vec3 s0, out vec3 s1, out float rr){
  vec4 P1=uHp[T.e*4+1];
  vec4 r=h42(T.h.yx*53.7+vec2(float(k)*5.1+float(j)*1.7,float(j)*9.3));
  float t=.3+.6*(float(j)+.3+.4*r.x)/max(P1.w,1.);
  s0=t<.5?mix(a0,am,2.*t):mix(am,a1,2.*t-1.);
  vec3 d=t<.5?am-a0:a1-am; float L=length(a1-am)+length(am-a0); d/=max(length(d),1e-4);
  vec3 sd=normalize(cross(d,vec3(0.,1.,0.))+vec3(0.,1e-3,0.));
  d=normalize(d+sd*(r.y-.5)*2.4+vec3(0.,.35-P1.z*.9,0.));
  s1=s0+d*L*.42*(.65+.6*r.z);
  rr=rb*.38;
}
void masse(Tige T, int k, int m, out vec3 c, out vec3 rad){
  vec4 P0=uHp[T.e*4], P1=uHp[T.e*4+1], P2=uHp[T.e*4+2];
  vec3 a0, am, a1, d2; float rb; charpente(T,k,a0,am,a1,rb,d2);
  if(m<int(P1.w)){ vec3 s0; float rr; rameau(T,k,m,a0,am,a1,rb,s0,c,rr); }
  else c=a1+d2*P2.x*.25;
  float M=P2.x*(.7+.6*h42(T.h.wz*21.3+vec2(float(k)*2.7,float(m)*4.1)).x);
  c.y-=P1.z*.35*M;                                           // retombée : la masse pend
  rad=vec3(M,M*(1.-.4*P0.w)*(1.+.7*P1.z),M);
}
#endif
void brancheA(ArbreA A, int k, out vec3 a0, out vec3 a1, out float rb){   // branche k (0 à 2), dans le repère de la cellule
#if HOUPPIER
  Tige T; if(portA(A,T)){ vec3 d2, b1; charpente(T,k,a0,a1,b1,rb,d2); return; }   // houppier réglé : les trois premières charpentières (premier segment)
#endif
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
/* Type de forme : 0 boîte, 1 boule, 2 cylindre, 3 cône, 4 capsule, 5 toit ; + 8 × dents : la forme est découpée en peigne
   le long de son axe x (fente de part et d'autre d'une nervure centrale, dents penchées vers le bout) : fronde de fougère,
   palme, grille, clôture ajourée. Une forme sans dents ne paie qu'un test. */
float sdPrim0(vec3 q, float ty, vec3 s){
  if(ty<.5) return sdBox(q,s);                                                   // boîte
  if(ty<1.5) return sdEll(q,s);                                                  // boule ou ellipsoïde
  if(ty<2.5){ vec2 d=vec2(length(q.xz)-s.x,abs(q.y)-s.y); return min(max(d.x,d.y),0.)+length(max(d,0.)); }   // cylindre debout
  if(ty<3.5){ float r=s.x*clamp(.5-q.y/(2.*s.y),0.,1.); return max(length(q.xz)-r,abs(q.y)-s.y)*.7; }      // cône, pointe en haut
  if(ty<4.5){ q.y-=clamp(q.y,-s.y,s.y); return length(q)-s.x; }                  // capsule debout
  vec2 nn=normalize(vec2(2.*s.y,s.z));                                           // toit à deux pentes, faîtage le long de x
  return max(abs(q.x)-s.x,max(abs(q.z)*nn.x+q.y*nn.y-(nn.x*s.z-nn.y*s.y),-q.y-s.y));
}
float sdPrim(vec3 q, float ty, vec3 s){
  float dn=floor(ty*.125+.01), d=sdPrim0(q,ty-8.*dn,s);
  if(dn>0.){                                                 // peigne : dn dents sur la longueur 2 s.x, contour en fuseau (pointu aux deux bouts)
    float P=2.*s.x/dn, u=q.x+.45*abs(q.z), f=(fract(u/P)-.5)*P, x=q.x/s.x;
    d=max(d,max(-max(abs(f)-.28*P,.08*s.z-abs(q.z))*.8,(abs(q.z)-s.z*(1.-x*x))*.6));
  }
  return d;
}
vec3 primLocal(vec3 p, int row){
  vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), e=texelFetch(uShapes,ivec2(3,row),0);
  vec3 q=p-a.xyz; float c=cos(b.w), s=sin(b.w);
  q.xz=vec2(c*q.x-s*q.z,s*q.x+c*q.z);
  if(e.w!=0.){ c=cos(e.w); s=sin(e.w); q.xy=vec2(c*q.x+s*q.y,-s*q.x+c*q.y); }
  if(e.z!=0.){ c=cos(e.z); s=sin(e.z); q.yz=vec2(c*q.y+s*q.z,-s*q.y+c*q.z); }
  return q;
}
vec3 primMonde(vec3 q, int row, bool dir){                    // inverse de primLocal
  vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), e=texelFetch(uShapes,ivec2(3,row),0);
  float c, s;
  if(e.z!=0.){ c=cos(e.z); s=sin(e.z); q.yz=vec2(c*q.y-s*q.z,s*q.y+c*q.z); }
  if(e.w!=0.){ c=cos(e.w); s=sin(e.w); q.xy=vec2(c*q.x-s*q.y,s*q.x+c*q.y); }
  c=cos(b.w); s=sin(b.w); q.xz=vec2(c*q.x+s*q.z,-s*q.x+c*q.z);
  return dir?q:q+a.xyz;
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
   lignes 2 et 3 : palette, 8 couleurs.   lignes 4 à 9 : les formes, comme celles des objets, dans le repère de l'élément.
   Le lanceur de rayons n'appelle ce code que dans sa variante SEMIS ; le semeur (moteur v3) sème les mêmes éléments (semeS). */
const int SEM0=72, SEML=10;
uniform int   uSemN;       // nombre de couches de semis
uniform vec4  uSemTop;     // hauteur au-dessus du sol au-delà de laquelle une couche n'a plus rien
float gTol;                  // tolérance de la marche en cours : au loin, la marge des cellules s'élargit d'autant
vec4 gInst;                  // élément touché : cap, échelle, étirement, aléa (écrit par objId)
vec2 semMonde(vec2 g, float side, float t0, vec4 A, bool rg){   // repère de la grille -> monde
  return rg?vec2(pathX(g.y)+side*(g.x+t0),g.y):g*mat2(A.z,A.w,-A.w,A.z);
}
/* Un élément de semis : tout ce que la cellule tire (présence, décalage, cap, échelle, sol dessous). Calculé par les fonctions
   ci-dessous, en un seul endroit : sdSemis (lanceur de rayons, sonde, matière du semeur) et le semeur (v3_grains.vert)
   s'en servent, un élément semé tombe donc là où le lanceur de rayons le voit. */
struct ElemS { vec4 A, B, T, K, J, D, E, h2; vec2 gc, sl; vec3 th; float side, yaw, s, sy, sh; bool rg; };
vec2 semisG(vec2 xz, ElemS e){ return e.rg?vec2(e.side*(xz.x-pathX(xz.y))-e.T.x,xz.y):mat2(e.A.z,e.A.w,-e.A.w,e.A.z)*xz; }   // monde -> repère de la grille
// Cellule de la couche k sous le point xz du sol. Rend -1 si le point est dans la grille (id, f : cellule et position dans
// la cellule), sinon une borne de la distance horizontale à la grille (rive exclue, trop près ou trop loin du trajet).
void semisTete(int k, float side, out ElemS e){              // la couche k (et la rive, en rangée) : sa grille
  int r0=SEM0+k*SEML;
  e.A=texelFetch(uShapes,ivec2(0,r0),0); e.B=texelFetch(uShapes,ivec2(1,r0),0); e.T=texelFetch(uShapes,ivec2(2,r0),0);
  e.K=texelFetch(uShapes,ivec2(1,r0+1),0);
  e.rg=e.B.w>.5; e.side=e.rg?side:1.;
}
float semisGrille(vec2 xz, int k, out ElemS e, out vec2 id, out vec2 f){
  semisTete(k,1.,e); id=vec2(0.); f=vec2(0.);
  if(e.rg){                                                  // rangée : la grille suit le trajet, les deux rives en miroir
    float u=xz.x-pathX(xz.y); e.side=u<0.?-1.:1.;
    if(e.T.z*e.side<-.5) return abs(u)+e.T.x;                // rive exclue
    float gx=abs(u)-e.T.x;
    if(gx<0.) return -gx;
    float far=gx-e.K.w*e.A.x; if(far>0.) return far;
  }
  vec2 g=semisG(xz,e);
  id=floor(g/e.A.xy); f=g-(id+.5)*e.A.xy;
  return -1.;
}
// L'élément de la cellule id (après semisGrille) : false si la cellule est vide (densité, groupes, bande d'écart au trajet, objet dégagé).
// Tirages de la cellule id de la couche k (rive side) : h (présence, décalage), puis h2 (échelle, étirement, cap, aléa).
vec4 semisH(int k, vec2 id, float side){ return h42(id+uSeed.xy+vec2(13.7,71.3)*float(k+1)+(side<0.?vec2(41.3,7.9):vec2(0.))); }
vec4 semisH2(int k, vec2 id, vec4 h, float side){ return h42(id*1.37+h.yz*91.+float(k)*3.1+side); }
bool semisElem(int k, vec2 id, inout ElemS e){
  int r0=SEM0+k*SEML;
  vec4 h=semisH(k,id,e.side);
  float dens=e.B.x;
  if(e.B.y>0.) dens*=mix(1.,smoothstep(.3,.7,vnoise(id*e.B.z+uSeed.xy+float(k)*17.)),e.B.y);
  if(h.x>=dens) return false;
  e.J=texelFetch(uShapes,ivec2(0,r0+1),0); e.D=texelFetch(uShapes,ivec2(3,r0),0); e.E=texelFetch(uShapes,ivec2(3,r0+1),0);
  e.gc=(id+.5)*e.A.xy+(h.yz-.5)*2.*e.J.xy;
  vec2 w=semMonde(e.gc,e.side,e.T.x,e.A,e.rg);
  float dx=0.;
  if(!e.rg){ dx=w.x-pathX(w.y); if(abs(dx)<e.T.x || abs(dx)>e.T.y || dx*e.T.z<0.) return false; }
  if(cleared(w)) return false;
  e.h2=semisH2(k,id,h,e.side);
  float yaw=e.D.x;                                           // cap dans le repère de la grille
  if(e.T.w<.5) yaw=e.h2.z*6.2832;
  else if(e.T.w<1.5){
    if(e.rg) yaw=-1.5708;
    else { float sg=dx<0.?-1.:1., z=w.y, sl=uTraj.x*(.1504*cos(z*.047+uSeed.z)+.1808*cos(z*.113+1.7+uSeed.z*2.)); yaw=atan(-sg,sg*sl)-atan(e.A.w,e.A.z); }
  }
  e.yaw=yaw+(e.h2.w-.5)*e.D.y;
  vec3 th=vec3(0.);
  for(int i=0;i<3;i++){                                      // sol sous l'élément ; s'il suit la pente, deux points de plus (un seul terrainH déplié)
    th[i]=terrainH(i==0?w:semMonde(e.gc+(i==1?vec2(1.,0.):vec2(0.,1.)),e.side,e.T.x,e.A,e.rg));
    if(e.E.w<.5) break;
  }
  e.th=th; e.sl=e.E.w>.5?th.yz-th.x:vec2(0.); e.sh=inversesqrt(1.+dot(e.sl,e.sl));
  e.s=mix(e.J.z,e.J.w,e.h2.x); e.sy=mix(e.K.x,e.K.y,e.h2.y);
  return true;
}
vec3 semisLocal(vec3 p, ElemS e){                            // monde -> repère de l'élément (mètres de la fiche, avant échelle)
  vec2 d=semisG(p.xz,e)-e.gc;
  vec3 lp=vec3(d.x,p.y-e.th.x,d.y);
  lp.y-=dot(e.sl,lp.xz);                                     // suit la pente : cisaillé selon le sol sous l'élément
  float c=cos(e.yaw), sn=sin(e.yaw); lp.xz=vec2(c*lp.x-sn*lp.z,sn*lp.x+c*lp.z);
  if(e.rg && e.side<0.) lp.x=-lp.x;                          // l'autre rive : on défait le miroir
  if(e.D.z>0.){ vec2 pa=(fract(e.h2.zw*17.31)-.5)*2.*e.D.z; float c1=cos(pa.x), s1=sin(pa.x), c2=cos(pa.y), s2=sin(pa.y);
    lp.xy=vec2(c1*lp.x+s1*lp.y,-s1*lp.x+c1*lp.y); lp.zy=vec2(c2*lp.z+s2*lp.y,-s2*lp.z+c2*lp.y); }
  lp/=e.s; lp.y/=e.sy;
  return lp;
}
vec3 semisMonde(vec3 lp, ElemS e){                           // l'inverse : repère de l'élément -> monde
  lp.y*=e.sy; lp*=e.s;
  if(e.D.z>0.){ vec2 pa=(fract(e.h2.zw*17.31)-.5)*2.*e.D.z; float c1=cos(pa.x), s1=sin(pa.x), c2=cos(pa.y), s2=sin(pa.y);
    lp.zy=vec2(c2*lp.z-s2*lp.y,s2*lp.z+c2*lp.y); lp.xy=vec2(c1*lp.x-s1*lp.y,s1*lp.x+c1*lp.y); }
  if(e.rg && e.side<0.) lp.x=-lp.x;
  float c=cos(e.yaw), sn=sin(e.yaw); lp.xz=vec2(c*lp.x+sn*lp.z,-sn*lp.x+c*lp.z);
  lp.y+=dot(e.sl,lp.xz);
  vec2 w=semMonde(e.gc+lp.xz,e.side,e.T.x,e.A,e.rg);
  return vec3(w.x,lp.y+e.th.x,w.y);
}
float sdSemis(vec3 p, int k, out vec4 info, out vec4 inst){
  int r0=SEM0+k*SEML;
  info=vec4(0.); inst=vec4(0.);
  float marge=max(.08,1.5*gTol)+(uMode==1?50.:0.);          // jamais sous la tolérance de la marche : pas de faux impact sur une limite de cellule
  ElemS e; vec2 id, f;
  float bg=semisGrille(p.xz,k,e,id,f);
  if(bg>=0.) return bg+marge;
  float dOut=min(.5*e.A.x-abs(f.x),.5*e.A.y-abs(f.y))+marge;
  if(!semisElem(k,id,e)) return dOut;
  vec3 lp=semisLocal(p,e);
  float sc=e.s*min(1.,e.sy)*e.sh;
  vec4 bc=texelFetch(uShapes,ivec2(2,r0+1),0);
  float bb=sdBox(lp-bc.xyz,e.E.xyz);                         // boîte englobante : on ne détaille que de près
  if(bb>.3) return min(bb*sc*.9,dOut);
  float od=1e5, best=1e5, brow=0.; int cn=int(e.K.z);
  for(int j=0;j<cn;j++){
    int row=r0+4+j;
    vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), ee=texelFetch(uShapes,ivec2(3,row),0);
    float dd=sdPrim(primLocal(lp,row),a.w,b.xyz)-ee.y;
    if(dd<best){ best=dd; brow=float(row); }
    od=ee.x>0.?smin(od,dd,ee.x):min(od,dd);
  }
  info=vec4(lp,brow+.9*e.h2.w);
  inst=vec4(e.yaw,e.s,e.sy,e.h2.w);
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

/* ---- distance au décor : tout ce qui est solide (sol, arbres, perches, blocs, semis, objets). Lue par le lanceur de rayons
   à chaque pas, et par la sonde de collision (v3_sonde.frag, compilée avec SEMIS). */
uniform vec2  uTerK;       // pas de marche sur le relief : partout, et près d'un bord de trajet raide (0 = inutile)
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
void matCone(vec3 p, vec3 gn, out vec3 alb, out vec3 n, out float spec){   // cœur de feuillage d'un conifère, vu de près (lanceur de rayons et semeur)
  alb=leafCol(p,vnoise3(p*5.))*(.5+.6*vnoise3(p*vec3(8.,13.,8.))); spec=.02;
  n=normalize(gn+(vec3(vnoise3(p*17.),vnoise3(p*17.+7.),vnoise3(p*17.+13.))-.5)*.9);
}

/* ---- ciel et brume */
/* Ciel d'aube et de soir (modèle atmosphère) : soleil bas, l'horizon se colore, or du côté du soleil, rose à l'opposé
   (ceinture de Vénus), le zénith reste d'un bleu froid et profond. Tout dépend de la hauteur du soleil : rien n'est réglé
   pour une heure. Le halo autour du soleil grandit avec le trouble de l'air. */
vec3 skyAtmo(vec3 rd){
  float y=max(rd.y,0.), sy=uSunDir.y, bas=1.-smoothstep(.02,.42,sy);   // 0 au-delà de 25° environ
  vec2 h=rd.xz/max(length(rd.xz),1e-4), sz=uSunDir.xz/max(length(uSunDir.xz),1e-4);
  float ca=dot(h,sz)*.5+.5;                                             // 1 : sous le soleil, 0 : à l'opposé
  vec3 zen=mix(vec3(.16,.34,.78),vec3(.085,.19,.52),bas);
  vec3 hzJour=mix(vec3(.62,.72,.86),vec3(.78,.80,.84),uAtmo.y*.5);
  vec3 hzBas=mix(vec3(.80,.56,.62),vec3(1.45,.86,.42),pow(ca,2.2));      // rose à l'opposé du soleil, or vers lui
  vec3 hz=mix(hzJour,hzBas,bas);
  float bande=mix(.45,.28+.12*ca,bas);                                  // l'horizon coloré est plus mince quand le soleil est bas
  vec3 c=mix(hz,zen,mix(pow(y,bande),1.-exp(-y*7.),bas));
  c+=vec3(.55,.30,.30)*bas*exp(-y*14.)*(1.-ca)*.35;                     // ceinture de Vénus, juste au-dessus de l'horizon opposé
  c*=2.2*uSky;
  float s=max(dot(rd,uSunDir),0.);
  c+=uSun*vec3(.143,.129,.109)*(.9*pow(s,6.)+3.*pow(s,48.))*(1.+uAtmo.y)+uSun*.05*(.4+uAtmo.y)*pow(s,2.)*bas;
  return c;
}
vec3 skyBase(vec3 rd){
  if(uAtmo.x>0.) return skyAtmo(rd);
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
/* Brume (modèle atmosphère) : brume uniforme (ambiance.brume) plus brume basse, dense au sol et qui s'amincit avec la hauteur
   (exp(-h/H) au-dessus du sol de référence, celui de la caméra). Épaisseur optique le long d'un rayon : formule exacte, coût fixe.
   La lumière qu'elle diffuse : l'ambiance (gris bleuté, froid à l'ombre) et le soleil, très en avant (Henyey-Greenstein) :
   face au soleil bas, la brume s'allume. Ce que la brume voit du soleil (vSol) est donné par l'appelant : rais tracés dans
   la carte d'ombres (moteur v3, qualité complète), ou ombre statistique des troncs et de la canopée. */
float brumeTau(vec3 ro, vec3 rd, float t){
  float H=max(uAtmo.w,.05), k=rd.y/H, y0=ro.y-uAtmo2.x;
  float f=abs(k*t)<1e-3?t*(1.-.5*k*t):(1.-exp(-k*t))/k;
  return uFog*t+uAtmo.z*exp(-y0/H)*f;
}
float brumeDens(vec3 p){ return uFog+uAtmo.z*exp(-(p.y-uAtmo2.x)/max(uAtmo.w,.05)); }
float phaseHG(float mu, float g){ float d=1.+g*g-2.*g*mu; return (1.-g*g)/(d*sqrt(d)); }   // × 1/4π omis : 1 = isotrope
vec3 brumeAmb(vec3 rd){ return mix(vec3(.17,.20,.27),vec3(.24,.26,.30),uAtmo.y)*uSky*(.8+.2*max(rd.y,0.)); }   // à l'ombre, la brume est d'un gris bleu
vec3 brumeSoleil(vec3 rd){                                   // éclat du soleil diffusé, par unité de visibilité
  float mu=dot(rd,uSunDir), g=.62+.1*uAtmo.y;
  return uSun*(.70*phaseHG(mu,g)+.30*phaseHG(mu,.15))*.25;   // π/4π : un pinceau de soleil dans une brume blanche
}
/* Ombre statistique de la brume : part du soleil qui passe entre les troncs (hauteur sous la voûte, longueur du trajet rasant). */
float brumeStat(float hSol){ float sy=max(uSunDir.y,.03); return exp(-uAtmo2.w*max(13.-hSol,0.)*length(uSunDir.xz)/sy); }
vec3 brumeMix(vec3 col, vec3 ro, vec3 rd, float t, float vSol){
  float T=exp(-brumeTau(ro,rd,t));
  return col*T+(brumeAmb(rd)+brumeSoleil(rd)*vSol)*(1.-T);
}
uniform vec4 uEau;           // eau à l'horizon (mer, baie, lac) sous les rayons qui ne touchent rien : couleur, présence
vec3 eauLoin(vec3 rd){
  vec2 w=rd.xz/max(-rd.y,.004);                              // vagues : la normale bouge, plus serrée vers l'horizon
  vec3 n=normalize(vec3((vnoise(w*.9+uSeed.xy)-.5)*.12,1.,(vnoise(w*.9+uSeed.xy+7.)-.5)*.12));
  vec3 rr=reflect(rd,n); rr.y=abs(rr.y);
  float fr=.02+.98*pow(1.-max(dot(-rd,n),0.),5.);
  vec3 c=mix(uEau.rgb*(uSun*.05+uSky*.35),min(skyCol(rr),vec3(40.)),fr);
  return mix(c,fogCol(rd),.25*smoothstep(-.08,0.,rd.y));
}

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
