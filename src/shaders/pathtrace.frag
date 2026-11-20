#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform float uTick;
uniform int   uQ;
uniform float uJit;        // anticrénelage par décalage sous-pixel (0 en mouvement)
uniform vec3  uProbe;
out vec4 outCol;
float gT;                    // distance du premier impact, gardée pour la reprojection

#include "monde.glsl"
uniform float uYTop;       // hauteur au-dessus du plan de pente au-delà de laquelle il n'y a plus rien
uniform vec3  uSolAlb;     // couleur du sol vue par l'éclairage indirect

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

#include "recette.glsl"

#include "reprojection.glsl"

/* ---- éclairage */
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
      if(uAtmo2.y>0.){ float fr=1.-abs(dot(n,rd)); fr*=fr; fr*=fr;   // rebord en contre-jour (modèle atmosphère), comme v3_ombrage.frag
        col+=SUN*vis*uAtmo2.y*fr*smoothstep(-.1,.7,dot(rd,sd))*smoothstep(-.35,.25,dot(n,sd))*(alb*1.6+.025); }
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
    if(uAtmo.x>0.){ float T=exp(-(brumeTau(ro,rd,400.)-uFog*400.));   // brume basse devant le ciel (modèle atmosphère)
      c=c*T+(brumeAmb(rd)+brumeSoleil(rd)*brumeStat(ro.y-uAtmo2.x)*.5)*(1.-T); }
    return c;
  } else {
    t=tS; vec3 p=ro+rd*t;
    vec4 info; int id=objId(p,info);
    vec3 gn=calcN(p,t);
    vec3 alb; vec3 n=gn; float spec; float emis=0.;
    // Quelle recette pour cette surface ? Un seul appel à recette() plus bas : le shader reste compact.
    int r0=-1, r1=-1, nr=1; float w=0.; vec3 q=p; float hs=p.y-terrainH(p.xz); mat2 rot=mat2(1.); vec3 nr0=gn; gTon=vec3(1.);
    if(id==0){                                               // sol, et trajet par-dessus
      r0=uSurf.x; hs=0.;
      if(uSurf.y!=uSurf.x){ w=smoothstep(uTraj.y+uTraj.z,uTraj.y-uTraj.z,abs(p.x-pathX(p.z))+(uTraj.w>0.?uTraj.w*(fbm(p.xz*.8+3.)-.5):0.)); r1=uSurf.y;
        if(w>=1.) r0=r1; else if(w>0.) nr=2; }
    }
    else if(id==3){ r0=uSurf.z; q=info.xyz; }
    else if(id>=4){ for(int i=0;i<(id>=4?1:0);i++) r0=matProp(p,gn,info,id==5,alb,n,spec,emis,q,nr0,rot); }   // garde en boucle : sautée en rendu logiciel quand aucun pixel n'est une forme
    else if(id==1 && info.w>1.5) matCone(p,gn,alb,n,spec);   // cœur de feuillage d'un conifère
    else { r0=id==1?(fract(info.w*3.7)<uSurfP.x?uSurfT.x:uSurfT.y):(fract(info.w*9.1)<uSurfP.y?uSurfT.z:uSurfT.w); q=info.xyz+troncVar(info.w); hs=info.y; rot=id==1?RA:RB; }
    if(r0>=0){
      vec3 A=vec3(0.), T=vec3(0.); float SP=0., EM=0.;
      for(int k=0;k<2;k++){
        if(k>=nr) break;
        vec3 a, tt; float sp, em; recette(k==0?r0:r1,q,nr0,hs,rot,a,tt,sp,em);
        float wk=nr==1?1.:(k==0?1.-w:w);
        A+=a*wk; T+=tt*wk; SP+=sp*wk; EM+=em*wk;
      }
      alb=A*gTon; n=normalize(gn+T); spec=SP; emis=EM;
    }
    col=lightSurf(p,gn,n,alb,spec,rd)+alb*emis*8.;
  }
  gT=t;
  if(uAtmo.x>0.) col=brumeMix(col,ro,rd,t,brumeStat(ro.y-uAtmo2.x)*.5);   // sans carte d'ombres : pas de rais, l'ombre statistique (canopée comptée pour moitié)
  else col=mix(fogCol(rd),col,exp(-t*uFog));
  if(uTorch>0.) col+=vec3(1.,.97,.90)*uTorch*uFog*smoothstep(.72,.97,dot(rd,uCam[2]))*.045*(1.667-1./max(t,.6));
  return col;
}

void main(){
  if(uMode==1){                                              // sonde : distance au décor en 3 points voisins
    int ix=int(gl_FragCoord.x);
    vec3 q=uProbe+(ix==1?vec3(.05,0.,0.):ix==2?vec3(0.,0.,.05):vec3(0.));
    float v=clamp((map(q)+1.)/9.,0.,1.)*255.;                // distance de -1 à 8 m sur 16 bits, dans une cible RGBA8 : relire des flottants est lent sur téléphone
    outCol=vec4(floor(v)/255.,fract(v),0.,1.); return;
  }
  ivec2 ip=ivec2(gl_FragCoord.xy);
  rs=uint(ip.x)*1973u+uint(ip.y)*9277u+uint(uTick)*26699u+1u; rnd(); rnd();
  vec2 px=gl_FragCoord.xy+(vec2(rnd(),rnd())-.5)*uJit;
  vec3 rd;
  if(uMode==2){                                              // tournage : sphère complète en équirectangulaire, axes du monde
    vec2 e=px/uRes; float lon=(e.x*2.-1.)*3.14159265, lat=(e.y-.5)*3.14159265;
    rd=vec3(sin(lon)*cos(lat),sin(lat),cos(lon)*cos(lat));
  } else {
    vec2 uv=(px-.5*uRes)/uRes.y;
    float rr=length(uv), ang=rr*uFish;                       // projection fisheye équidistante
    rd=normalize(uCam*vec3(uv/max(rr,1e-5)*sin(ang),cos(ang)));
  }
  gT=1e4;
  vec3 col=render(uCamPos,rd);
  col=min(max(col,vec3(0.)),vec3(60.));
  if(col.x!=col.x||col.y!=col.y||col.z!=col.z) col=vec3(0.);

  outCol=vec4(melangeHistoire(col,uCamPos+rd*gT,ip),gT);
}
