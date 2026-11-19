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
uniform float uAmb;          // réglage global de l'ambiance (essai)         // troncs : épaisseur optique par mètre parcouru à l'horizontale (statistique de la fiche)
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
  float occ=max(0.,h1-pres(po+n*h1))*1.6+max(0.,h2-pres(po+n*h2))*.5;
  return L*clamp(1.-occ,.25,1.)*uAmb;
}

vec3 lumiere(vec3 p, vec3 gn, vec3 n, vec3 alb, float spec, vec3 rd){
  vec3 sd=uSd;
  vec3 po=p+gn*(.004+.0015*length(p-uCamPos));
  float Ts=canopyT(po,uSunDir);                              // transmittance de la canopée vers le soleil (statistique)
  vec3 col=vec3(0.);
  float ndl=max(dot(n,sd),0.);
  if(ndl>0. && dot(gn,sd)>0.){
    float vis=ombreSoleil(p,gn)*Ts;
    vec3 h=normalize(sd-rd);
    col+=SUN*vis*ndl*(alb+spec*2.*pow(max(dot(n,h),0.),28.));
  }
  col+=alb*ambiance(po,gn,n,Ts);
  return col;
}

void main(){
  ivec2 ip=ivec2(gl_FragCoord.xy);
  rs=hu(uint(ip.x)*1973u+uint(ip.y)*9277u^hu(uFrame)); rnd();
  vec2 uv=(gl_FragCoord.xy+uJitPx-.5*uRes)/uRes.y;
  float rr=length(uv), ang=rr*uFish;
  vec3 rd=normalize(uCam*vec3(uv/max(rr,1e-5)*sin(ang),cos(ang)));
  vec4 g0=texelFetch(uG0,ip,0), g1=texelFetch(uG1,ip,0);
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
      int r0=-1, r1=-1, nr=1; float w=0.; vec3 q=g0.xyz; float hs=p.y-terrainH(p.xz); mat2 rot=mat2(1.);
      if(id==0){                                             // sol, et trajet par-dessus
        r0=uSurf.x; hs=0.;
        if(uSurf.y!=uSurf.x){ w=smoothstep(1.15,.55,abs(q.x-pathX(q.z))+.5*(fbm(q.xz*.8+3.)-.5)); r1=uSurf.y;
          if(w>=1.) r0=r1; else if(w>0.) nr=2; }
      }
      else if(id==3) r0=uSurf.z;
      else if(id==4){ vec3 qr; r0=matProp(q,gn,vec4(0.,0.,0.,floor(par*128.+.5)),alb,n,spec,emis,qr); q=qr; }
      else { r0=id==1?(fract(par*3.7)<uSurfP.x?uSurfT.x:uSurfT.y):(fract(par*9.1)<uSurfP.y?uSurfT.z:uSurfT.w); hs=q.y; rot=id==1?RA:RB; }
      if(r0>=0){
        vec3 A=vec3(0.), T=vec3(0.); float SP=0.;
        for(int k=0;k<2;k++){
          if(k>=nr) break;
          vec3 a, tt; float sp; recette(k==0?r0:r1,q,gn,hs,rot,a,tt,sp);
          float wk=nr==1?1.:(k==0?1.-w:w);
          A+=a*wk; T+=tt*wk; SP+=sp*wk;
        }
        alb=A; n=normalize(gn+T); spec=SP;
      }
      col=lumiere(p,gn,n,alb,spec,rd)+alb*emis*8.;
      if(uVoir==1) col=vec3(ombreSoleil(p,gn));
      else if(uVoir==2) col=alb*3.;
      else if(uVoir==3) col=n*.5+.5;
    }
    col=mix(fogCol(rd),col,exp(-t*uFog));
  }
  col=min(max(col,vec3(0.)),vec3(60.));
  if(col.x!=col.x||col.y!=col.y||col.z!=col.z) col=vec3(0.);
  if(uVoir==5){ float z=texture(uOmbre,gl_FragCoord.xy/uRes).r; col=vec3(z<1.?1.:0.); }   // la carte d'ombres elle-même
  outCol=vec4(melangeHistoire(col,uCamPos+rd*t,ip),t);
}
