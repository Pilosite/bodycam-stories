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
uniform ivec4 uPrxS;         // fin des emplacements de chaque couche de semis (cellules × formes), après objets et blocs
flat out ivec4 vK;           // genre (0 objet, 1 semis, 2 bloc), ligne de la forme, couche, rive
flat out vec2 vId;           // cellule
flat out vec2 vPrx;          // caméra dans la boîte (1/0), diamètre de la boîte (m)
out vec3 vW;                 // point du monde sur la boîte
const int NS=3, VPS=6*NS*NS*6;
vec3 boite(float ty, vec3 b, float ar){                       // demi-tailles de la boîte englobante d'une forme (repère de la forme)
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
    W=primMonde(u*hb,row,false); cl=primLocal(uCamPos,row); diam=2.*length(hb);
    vK=ivec4(0,row,0,0);
  } else if(slot<uPrxO+uPrxB){                               // bloc de grès d'une des 5 × 5 cellules autour de la caméra
    int s=slot-uPrxO; vec2 id=floor(uCamPos.xz/CC)+vec2(float(s-(s/5)*5)-2.,float(s/5)-2.);
    Bloc B; if(!blocGres(id,B)) return;
    hb=B.rad*1.12+.15*B.R+vec3(.05,.4,.05);                   // bosses, et le sol qui varie sous le bloc
    vec2 cw=(id+.5)*CC+B.o; float th=terrainH(cw);
    vec3 lp=u*hb; float ca=cos(B.a), sa=sin(B.a); vec2 xz=lp.xz*mat2(ca,sa,-sa,ca);
    W=vec3(cw.x+xz.x,th+B.R*.22+lp.y,cw.y+xz.y);
    vec3 lc=uCamPos-vec3(cw.x,th+B.R*.22,cw.y); vec2 lr=mat2(ca,sa,-sa,ca)*lc.xz; cl=vec3(lr.x,lc.y,lr.y);
    diam=2.*length(hb);
    vK=ivec4(2,0,0,0); vId=id;
  } else {                                                   // élément d'une couche de semis, cellules voisines de la caméra
    int k=slot<uPrxS.x?0:slot<uPrxS.y?1:slot<uPrxS.z?2:3;
    int s=slot-(k==0?uPrxO+uPrxB:k==1?uPrxS.x:k==2?uPrxS.y:uPrxS.z);
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
    W=semisMonde(primMonde(u*hb,row,false),e); cl=primLocal(semisLocal(uCamPos,e),row);
    diam=2.*length(hb)*e.s*max(1.,e.sy);
    vK=ivec4(1,row,k,int(e.side)); vId=id;
  }
  vec4 pos; float dist, ang;
  projette(W,3.13,pos,dist,ang);
  gl_Position=pos; vW=W;
  vPrx=vec2(all(lessThan(abs(cl),hb))?1.:0.,diam);
}
