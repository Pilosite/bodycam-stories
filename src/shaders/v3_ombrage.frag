#version 300 es
// Moteur v3 (essai) : la passe plein écran. Lit le tampon G (élément, coordonnées de recette, normale, distance) et
// évalue la matière avec la même fonction recette() que le lanceur de rayons (un seul appel), puis la lumière :
// soleil avec la carte d'ombres semée et la transmittance statistique de la canopée, ambiance approchée (voir ambiance()).
// Le ciel et le lointain restent un calcul par direction. Sortie au format de l'accumulation (couleur, distance),
// mélangée à l'historique reprojeté : le grain d'une image se lisse sur les suivantes.
precision highp float; precision highp int; precision highp sampler2D;
#include "monde.glsl"
#include "recette.glsl"
#include "reprojection.glsl"
uniform sampler2D uG0, uG1;  // tampon G
uniform sampler2D uOmbre;    // carte d'ombres (profondeur vue du soleil)
uniform uint  uFrame;
uniform vec2  uJitPx;        // même décalage sous-pixel que les grains, en pixels
uniform vec3  uSoleilC;
uniform mat3  uSoleilM;
uniform vec4  uSoleilE;      // demi-largeur, demi-hauteur, demi-profondeur, taille d'un texel (m)
uniform vec3  uSd;           // direction du soleil de cette image, tirée dans le disque solaire (pénombre par accumulation)
uniform int   uVoir;         // mise au point (option v3voir) : 1 ombre du soleil seule, 2 albédo, 3 normale, 5 carte d'ombres
uniform float uOccT;
uniform float uPcf;
uniform int   uProf;         // mise au point du coût (option v3prof) : 1 sans recette, 2 sans ambiance, 4 sans soleil, 8 sans pres()
uniform float uAmb;
/* Damier (en marche, qualité mobile, option v3damier) : les troncs, perches, rochers et objets ne sont ombrés qu'une image
   sur deux, par blocs de 8 × 8 pixels en damier alterné ; l'autre image relit l'historique reprojeté. La part d'image
   neuve de ces pixels passe à uAlphaD = 1 - (1 - a)² : même réponse dans le temps, deux fois moins de calcul.
   Les blocs ont la taille des macroblocs de la compression vidéo du capteur : ce qui en reste passe pour elle. */
uniform int   uDamier;
uniform float uAlphaD;
/* Tapis du sol (v3_tapis.frag) : la matière du sol, cuite dans des textures ancrées au monde. Niveau choisi selon la taille
   du pixel au sol (comme un niveau de mipmap), fondu entre deux niveaux. Hors des fenêtres prêtes : recette() comme avant. */
uniform highp sampler2DArray uTap0, uTap1;
uniform int   uTapL;         // nombre de niveaux (0 = tapis coupé)
uniform int   uTapPret;      // niveaux prêts (un bit par niveau)
uniform ivec2 uTapO[8];      // origine de la fenêtre de chaque niveau (indice de texel du monde)
uniform float uTapS0;        // côté d'un texel du niveau 0, en mètres
uniform int   uTapN;
uniform float uTapBias;      // décalage du niveau choisi (négatif : plus fin)
bool tapisDans(int k, vec2 xz){
  vec2 u=xz/(uTapS0*exp2(float(k)))-.5; ivec2 b=ivec2(floor(u)), o=uTapO[k];
  return b.x>=o.x+1 && b.y>=o.y+1 && b.x+2<=o.x+uTapN-1 && b.y+2<=o.y+uTapN-1;
}
bool tapis(vec2 xz, float lod, out vec4 a, out vec4 b){
  float l0=floor(lod); int k0=-1;
  for(int k=0;k<8;k++){ if(k>=uTapL) break;
    if(((uTapPret>>k)&1)==1 && (float(k)>=l0 || k==uTapL-1) && tapisDans(k,xz)){ k0=k; break; } }
  if(k0<0) return false;
  float s=uTapS0*exp2(float(k0)), f=float(k0)==l0?fract(lod):0.;
  vec3 c=vec3(xz/(s*float(uTapN)),float(k0));
  a=texture(uTap0,c); b=texture(uTap1,c);
  int k1=k0+1;
  if(f>0. && k1<uTapL && ((uTapPret>>k1)&1)==1 && tapisDans(k1,xz)){
    vec3 c1=vec3(c.xy*.5,float(k1));
    a=mix(a,texture(uTap0,c1),f); b=mix(b,texture(uTap1,c1),f);
  }
  return true;
}          // réglage global de l'ambiance (essai)         // troncs : épaisseur optique par mètre parcouru à l'horizontale (statistique de la fiche)
out vec4 outCol;

uint hu(uint x){ x=x*747796405u+2891336453u; x=((x>>((x>>28u)+4u))^x)*277803737u; return (x>>22u)^x; }

float ombreSoleil(vec3 p, vec3 gn){                          // 1 = éclairé ; quatre lectures tirées au hasard autour du texel
  vec3 l=(p+gn*.08-uSoleilC)*uSoleilM;
  vec2 uv=l.xy/uSoleilE.xy*.5+.5;
  // hors de la carte (au loin) : la part statistique de soleil qui passe entre les troncs
  float h=max(13.-(p.y-terrainH(p.xz)),0.), stat=exp(-uOccT*h/max(uSd.y,.1)*length(uSd.xz));
  float bord=smoothstep(.85,1.,max(abs(uv.x*2.-1.),abs(uv.y*2.-1.)));
  if(bord>=1.) return stat;
  float z=(clamp(-l.z/uSoleilE.z,-1.,1.))*.5+.5-.075/uSoleilE.z;  // marge de 15 cm vers le soleil (un grain est plat)
  float v=0.; vec2 tx=uSoleilE.w/(2.*uSoleilE.xy);
  for(int k=0;k<4;k++){
    vec2 o=(vec2(rnd(),rnd())-.5)*tx*uPcf;
    v+=z<=texture(uOmbre,uv+o).r?1.:0.;
  }
  return mix(v*.25,stat,bord);
}

/* Près d'un tronc, d'une perche ou d'un bloc, on voit moins de ciel. Distance à l'objet de la cellule, sans parcourir
   la scène : trois familles, une cellule chacune. Les objets de la fiche n'assombrissent pas (non fait). */
float pres(vec3 p){
  float d=9.;
  if(uKit==0){
    vec2 q=RA*p.xz; vec2 id=floor(q/CA); ArbreA A;
    if(arbreA(id,A)){ float y=p.y-terrainH(p.xz); vec2 f=q-(id+.5)*CA; d=min(d,length(f-(A.o+A.lean*clamp(y,-1.,A.H)))-rayonA(A,y)); }
    q=RB*p.xz+17.3; id=floor(q/CB); PercheB B;
    if(percheB(id,B)){ float y=p.y-terrainH(p.xz); vec2 f=q-(id+.5)*CB; d=min(d,length(f-axeB(B,clamp(y,-1.,B.H)))-rayonB(B,y)); }
  }
  if(uKitP.y>0.){ vec2 id=floor(p.xz/CC); Bloc B; if(blocGres(id,B)) d=min(d,blocForme(blocLocal(p,terrainH(p.xz),id,B),B)); }
  return d;
}

/* Lumière d'ambiance : approximation assumée de l'essai n° 1 (docs/moteur-v3.md).
   Un échantillon cosinus par pixel et par image : vers le haut, le ciel atténué par la canopée (canopyT, statistique)
   et par la futaie (troncs, statistique) ; vers le bas, le sol éclairé ; près du pied des objets, moins de ciel.
   C'est ici que se branchera la lumière d'ambiance rangée dans le monde (grille le long du trajet, calculée en fond). */
vec3 ambiance(vec3 po, vec3 gn, vec3 n, float Ts){
  vec3 wi=cosDir(n); if(dot(wi,gn)<0.) wi=reflect(wi,gn);
  vec3 L;
  vec3 solE=vec3(.24,.15,.07)*(vec3(.20,.21,.20)*uSky+SUN*max(uSunDir.y,0.)*Ts*.8);   // sol éclairé, vu d'en haut
  if(wi.y>.02){
    float T=canopyT(po,wi);
    vec3 ciel=min(skyBase(wi),vec3(6.))*T+CANOPY_GLOW*(1.-T);
    float trajet=max(YC0-po.y,0.)/wi.y*length(wi.xz);       // distance horizontale parcourue sous la canopée
    float Tt=exp(-uOccT*trajet);
    vec3 tronc=vec3(.11,.095,.08)*(vec3(.20,.21,.20)*uSky+SUN*.3*Ts);
    L=mix(tronc,ciel,Tt);
  } else L=solE;
  float h1=.25, h2=.8;
  float occ=(uProf&8)!=0?0.:max(0.,h1-pres(po+n*h1))*1.6+max(0.,h2-pres(po+n*h2))*.5;
  return L*clamp(1.-occ,.25,1.)*uAmb;
}

vec3 lumiere(vec3 p, vec3 gn, vec3 n, vec3 alb, float spec, vec3 rd, float TsCuit){   // TsCuit < 0 : à calculer
  vec3 sd=uSd;
  vec3 po=p+gn*(.004+.0015*length(p-uCamPos));
  float Ts=(uProf&4)!=0?1.:TsCuit>=0.?TsCuit:canopyT(po,uSunDir);                              // transmittance de la canopée vers le soleil (statistique)
  vec3 col=vec3(0.);
  float ndl=max(dot(n,sd),0.);
  if(ndl>0. && dot(gn,sd)>0.){
    float vis=(uProf&4)!=0?1.:ombreSoleil(p,gn)*Ts;
    vec3 h=normalize(sd-rd);
    col+=SUN*vis*ndl*(alb+spec*2.*pow(max(dot(n,h),0.),28.));
  }
  col+=(uProf&2)!=0?alb*.3:alb*ambiance(po,gn,n,Ts);
  return col;
}

void main(){
  ivec2 ip=ivec2(gl_FragCoord.xy);
  if((uProf&16)!=0){ outCol=texelFetch(uG1,ip,0); return; }
  if((uProf&32)!=0){ vec4 a=texelFetch(uG0,ip,0); if(a.w==5.){ outCol=vec4(1.); return; } }
  rs=hu(uint(ip.x)*1973u+uint(ip.y)*9277u^hu(uFrame)); rnd();
  vec2 uv=(gl_FragCoord.xy+uJitPx-.5*uRes)/uRes.y;
  float rr=length(uv), ang=rr*uFish;
  vec3 rd=normalize(uCam*vec3(uv/max(rr,1e-5)*sin(ang),cos(ang)));
  vec4 g0=texelFetch(uG0,ip,0), g1=texelFetch(uG1,ip,0);
  float idD=floor(g0.w); bool dam=uDamier>0 && idD>=1. && idD<=4.;
  if(dam && (((ip.x>>3)+(ip.y>>3)+int(uFrame))&1)==1){ vec3 h; if(histoireReproj(uCamPos+rd*g1.w,h)){ outCol=vec4(h,g1.w); return; } }
  vec3 col; float t;
  if(g0.w<0.){                                               // rien de semé : ciel, brume, lointain
    t=1e4;
    col=rd.y>0.?skyCol(rd):fogCol(rd);
    if(uLoin.w>0. && rd.y>-.02) col=lointain(rd,col);
  } else {
    t=g1.w;
    vec3 p=uCamPos+rd*t;
    vec3 gn=normalize(g1.xyz);
    int id=int(floor(g0.w)); float par=(g0.w-float(id))*2.;
    if(id==5){
      col=shadeLeaf(p,gn,g0.xyz,rd);                         // feuille : couleur portée par le grain
    } else {
      if(dot(gn,rd)>0.) gn=-gn;
      // Quelle recette pour cette surface ? Même choix que render() dans pathtrace.frag ; un seul appel à recette().
      vec3 alb=vec3(.3); vec3 n=gn; float spec=.05; float emis=0.;
      int r0=-1, r1=-1, nr=1; float w=0.; vec3 q=g0.xyz; float hs=p.y-terrainH(p.xz); mat2 rot=mat2(1.); vec3 nr0=gn;
      vec4 ta, tb; float TsC=-1.;
      if(id==0 && uTapL>0 && (uProf&1)==0 && tapis(q.xz,log2(t*uFish/uRes.y/sqrt(max(abs(dot(rd,gn)),.05))/uTapS0)+uTapBias,ta,tb)){
        alb=ta.rgb*ta.rgb; spec=ta.w; emis=tb.z;             // sol cuit : deux lectures (quatre au fondu) au lieu de recette()
        vec2 ti=tb.xy*4.-2.; n=normalize(gn+vec3(ti.x,0.,ti.y)); TsC=tb.w;
      }
      else if(id==0){                                        // sol, et trajet par-dessus
        r0=uSurf.x; hs=0.;
        if(uSurf.y!=uSurf.x){ w=smoothstep(uTraj.y+uTraj.z,uTraj.y-uTraj.z,abs(q.x-pathX(q.z))+(uTraj.w>0.?uTraj.w*(fbm(q.xz*.8+3.)-.5):0.)); r1=uSurf.y;
          if(w>=1.) r0=r1; else if(w>0.) nr=2; }
      }
      else if(id==3) r0=uSurf.z;
      else if(id==4){ vec3 qr; r0=matProp(q,gn,vec4(0.,0.,0.,floor(par*128.+.5)),false,alb,n,spec,emis,qr,nr0,rot); q=qr; }
      else { r0=id==1?(fract(par*3.7)<uSurfP.x?uSurfT.x:uSurfT.y):(fract(par*9.1)<uSurfP.y?uSurfT.z:uSurfT.w); hs=q.y; rot=id==1?RA:RB; }
      if(r0>=0 && (uProf&1)==0 && !((uProf&64)!=0 && id==0) && !((uProf&128)!=0 && id!=0)){
        vec3 A=vec3(0.), T=vec3(0.); float SP=0., EM=0.;
        for(int k=0;k<2;k++){
          if(k>=nr) break;
          vec3 a, tt; float sp, em; recette(k==0?r0:r1,q,nr0,hs,rot,a,tt,sp,em);
          float wk=nr==1?1.:(k==0?1.-w:w);
          A+=a*wk; T+=tt*wk; SP+=sp*wk; EM+=em*wk;
        }
        alb=A; n=normalize(gn+T); spec=SP; emis=max(emis,EM);
      }
      col=lumiere(p,gn,n,alb,spec,rd,TsC)+alb*emis*8.;
      if(uVoir==1) col=vec3(ombreSoleil(p,gn));
      else if(uVoir==2) col=alb*3.;
      else if(uVoir==3) col=n*.5+.5;
    }
    col=mix(fogCol(rd),col,exp(-t*uFog));
  }
  col=min(max(col,vec3(0.)),vec3(60.));
  if(col.x!=col.x||col.y!=col.y||col.z!=col.z) col=vec3(0.);
  if(uVoir==5){ float z=texture(uOmbre,gl_FragCoord.xy/uRes).r; col=vec3(z<1.?1.:0.); }   // la carte d'ombres elle-même
  outCol=vec4(melangeHistoireA(col,uCamPos+rd*t,ip,dam?uAlphaD:uAlpha),t);
}
