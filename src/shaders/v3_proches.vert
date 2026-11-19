#version 300 es
// Moteur v3 : les éléments proches. Une surface opaque proche (mur, façade, bloc de grès, objet de la fiche) demande à
// l'écran plus de grains que n'en reçoit son élément, et un grain ne peut pas grandir sans limite : elle se piquetait de
// trous. On la dessine donc « vers l'avant » comme le sol : la boîte englobante de chaque forme, en triangles (une grille
// de NS × NS carreaux par face, pour suivre le fisheye), puis chaque pixel cherche la forme exacte le long de son rayon
// (v3_proches.frag, la distance du lanceur de rayons). Rien ne reste troué.
// Coût fixe : une fenêtre de cellules autour de la caméra par couche de semis (uPrxN), 5 × 5 cellules de blocs, toutes
// les formes des objets (64 au plus). Aucun tampon : gl_VertexID donne l'emplacement (genre, cellule, forme) et le coin.
precision highp float; precision highp int; precision highp sampler2D;
#include "monde.glsl"
#include "v3_commun.glsl"
uniform int   uPrxO;         // emplacements des formes d'objets (lignes 8 et suivantes)
uniform int   uPrxB;         // emplacements des blocs (25, ou 0)
uniform int   uPrxA;         // emplacements des arbres (9, ou 0) : le tronc, et le cœur des conifères
uniform int   uPrxP;         // emplacements des perches (25, ou 0)
uniform ivec4 uPrxS;         // fin des emplacements de chaque couche de semis (cellules × formes), après objets et blocs
flat out ivec4 vK;           // genre (0 objet, 1 semis, 2 bloc, 3 arbre, 4 perche), ligne de la forme, couche, rive
flat out vec2 vId;           // cellule
flat out vec2 vPrx;          // caméra dans la boîte (1/0), diamètre de la boîte (m)
out vec3 vW;                 // point du monde sur la boîte
const int NS=5, VPS=6*NS*NS*6;
/* Les carreaux d'une face sont répartis à angles égaux vus de la caméra, pas à pas égaux : en fisheye, un segment droit
   devient une courbe, et un tronc vu à 50 cm couvre 150° de haut en bas. Chaque carreau sous-tend ainsi le même angle. */
float angulaire(float v, float h, float c, float dp){ float a0=atan(-h-c,dp), a1=atan(h-c,dp); return c+dp*tan(mix(a0,a1,v*.5+.5)); }
vec3 coin(vec3 u, vec3 hb, vec3 cl){
  vec3 r=u*hb;
  if(abs(u.x)<.999) r.x=angulaire(u.x,hb.x,cl.x,max(length(cl.yz),.05));
  if(abs(u.y)<.999) r.y=angulaire(u.y,hb.y,cl.y,max(length(cl.xz),.05));
  if(abs(u.z)<.999) r.z=angulaire(u.z,hb.z,cl.z,max(length(cl.xy),.05));
  return r;
}
vec3 boite(float ty, vec3 b, float ar){                       // demi-tailles de la boîte englobante d'une forme (repère de la forme)
  ty=mod(ty,8.);                                             // dents du peigne : même boîte
  if(ty>1.5 && ty<4.5){ float r=b.x+ar; return vec3(r,b.y+(ty>3.5?r:ar),r); }
  return b+ar;
}
void main(){
  sansGrain();
  gl_Position=vec4(2.,2.,2.,1.); vK=ivec4(-1); vId=vec2(0.); vPrx=vec2(0.); vW=vec3(0.);
  int slot=gl_VertexID/VPS, v=gl_VertexID-slot*VPS;
  int f=v/(NS*NS*6), r=v-f*(NS*NS*6), qd=r/6, c=r-qd*6;
  vec2 cr=vec2((c==1||c==3||c==4)?1.:0.,(c==2||c==4||c==5)?1.:0.);
  vec2 uw=(vec2(float(qd-(qd/NS)*NS),float(qd/NS))+cr)/float(NS)*2.-1.;
  int ax=f>>1; float sg=(f&1)==0?1.:-1.;
  vec3 u=ax==0?vec3(sg,uw.x,uw.y):ax==1?vec3(uw.y,sg,uw.x):vec3(uw.x,uw.y,sg);
  vec3 W, cl; vec3 hb; float diam;
  if(slot<uPrxO){                                            // forme d'un objet de la fiche
    int row=8+slot;
    for(int i=0;i<8;i++){ if(i>=uObjN) break; vec4 o1=texelFetch(uShapes,ivec2(1,i),0);
      if(row>=int(o1.x) && row<int(o1.x+o1.y) && o1.w<.5) return; }   // objet caché
    vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), e=texelFetch(uShapes,ivec2(3,row),0);
    hb=boite(a.w,b.xyz,e.y)*1.04+.03;
    cl=primLocal(uCamPos,row); W=primMonde(coin(u,hb,cl),row,false); diam=2.*length(hb);
    vK=ivec4(0,row,0,0);
  } else if(slot<uPrxO+uPrxB){                               // bloc de grès d'une des 5 × 5 cellules autour de la caméra
    int s=slot-uPrxO; vec2 id=floor(uCamPos.xz/CC)+vec2(float(s-(s/5)*5)-2.,float(s/5)-2.);
    Bloc B; if(!blocGres(id,B)) return;
    hb=B.rad*1.12+.15*B.R+vec3(.05,.4,.05);                   // bosses, et le sol qui varie sous le bloc
    vec2 cw=(id+.5)*CC+B.o; float th=terrainH(cw);
    float ca=cos(B.a), sa=sin(B.a);
    vec3 lc=uCamPos-vec3(cw.x,th+B.R*.22,cw.y); vec2 lr=mat2(ca,sa,-sa,ca)*lc.xz; cl=vec3(lr.x,lc.y,lr.y);
    vec3 lp=coin(u,hb,cl); vec2 xz=lp.xz*mat2(ca,sa,-sa,ca);
    W=vec3(cw.x+xz.x,th+B.R*.22+lp.y,cw.y+xz.y);
    diam=2.*length(hb);
    vK=ivec4(2,0,0,0); vId=id;
  } else if(slot<uPrxO+uPrxB+uPrxA+uPrxP){                  // tronc d'arbre (3 × 3 cellules) ou perche (5 × 5)
    int s=slot-uPrxO-uPrxB; bool arbre=s<uPrxA; if(!arbre) s-=uPrxA;
    int w=arbre?3:5; vec2 dc=vec2(float(s-(s/w)*w),float(s/w))-float(w/2);
    vec2 c0, ax0, lean; float H, r, R=0., y0=-1.3, y1;
    mat2 M; vec2 id;
    if(arbre){ id=floor(RA*uCamPos.xz/CA)+dc; ArbreA A; if(!arbreA(id,A)) return;
      c0=(id+.5)*CA; ax0=A.o; lean=A.lean; H=A.H; r=A.r0*1.5; M=RA; y1=H+.3;
      if(uHoup.x>.5){ R=min(uHoup.z*(.8+.4*A.h.w),3.3-max(abs(A.o.x),abs(A.o.y)))*.74+.1; y1=H+1.3; }
    } else { id=floor((RB*uCamPos.xz+17.3)/CB)+dc; PercheB B; if(!percheB(id,B)) return;
      c0=(id+.5)*CB-17.3; ax0=B.o; lean=B.lean; H=B.H; r=B.r0*1.4+.07; M=RB; y1=H+.3; }
    vec2 ctr=ax0+lean*(H-1.)*.5; float hx=max(r+abs(lean.x)*(H+1.)*.5,R)+.05, hz=max(r+abs(lean.y)*(H+1.)*.5,R)+.05;
    if(R>0.) ctr=ax0;
    vec2 pied=(c0+ctr)*M; float th=terrainH(pied);
    hb=vec3(hx,(y1-y0)*.5,hz);
    vec3 bc=vec3(ctr.x,y0+hb.y+th,ctr.y);                    // repère de la cellule ; le sol varie peu sous un tronc (marge en bas)
    vec2 cq=M*uCamPos.xz-c0; cl=vec3(cq.x,uCamPos.y,cq.y)-bc;
    vec3 lp=bc+coin(u,hb,cl);
    vec2 xz=(c0+lp.xz)*M; W=vec3(xz.x,lp.y,xz.y);
    diam=2.*length(hb);
    vK=ivec4(arbre?3:4,0,0,0); vId=id;
  } else {                                                   // élément d'une couche de semis, cellules voisines de la caméra
    int k=slot<uPrxS.x?0:slot<uPrxS.y?1:slot<uPrxS.z?2:3;
    int s=slot-(k==0?uPrxO+uPrxB+uPrxA+uPrxP:k==1?uPrxS.x:k==2?uPrxS.y:uPrxS.z);
    int n=k==0?uPrxN.x:k==1?uPrxN.y:k==2?uPrxN.z:uPrxN.w, w=2*n+1;
    ElemS e; semisTete(k,1.,e);
    int cn=int(e.K.z); if(cn<1) return;
    int ce=s/cn, j=s-ce*cn; vec2 id;
    if(e.rg){
      int rows=int(min(e.K.w,2.)), sides=e.T.z==0.?2:1;
      int zi=ce-(ce/w)*w, rr=ce/w, row=rr-(rr/rows)*rows, si=rr/rows;
      if(si>=sides) return;
      semisTete(k,sides==2?(si==0?1.:-1.):e.T.z,e);
      id=vec2(float(row),floor(uCamPos.z/e.A.y)+float(zi-n));
    } else id=floor(semisG(uCamPos.xz,e)/e.A.xy)+vec2(float(ce-(ce/w)*w-n),float(ce/w-n));
    if(!semisElem(k,id,e)) return;
    int row=SEM0+k*SEML+4+j;
    vec4 a=texelFetch(uShapes,ivec2(0,row),0), b=texelFetch(uShapes,ivec2(1,row),0), ee=texelFetch(uShapes,ivec2(3,row),0);
    hb=boite(a.w,b.xyz,ee.y)*1.06+.05/e.s;
    cl=primLocal(semisLocal(uCamPos,e),row); W=semisMonde(primMonde(coin(u,hb,cl),row,false),e);
    diam=2.*length(hb)*e.s*max(1.,e.sy);
    vK=ivec4(1,row,k,int(e.side)); vId=id;
  }
  vec4 pos; float dist, ang;
  projette(W,3.13,pos,dist,ang);
  gl_Position=pos; vW=W;
  vPrx=vec2(all(lessThan(abs(cl),hb))?1.:0.,diam);
}
