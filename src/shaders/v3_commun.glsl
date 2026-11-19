// Moteur v3 (essai) : ce que partagent les deux programmes qui remplissent le tampon G (sol en maillage, grains).
// Inséré après monde.glsl. Même fisheye équidistant que pathtrace.frag ; profondeur linéaire (distance / 400).
uniform vec2  uJit;          // décalage sous-pixel de l'image (en unités de l'écran), pour l'accumulation à l'arrêt
out vec3 vQ;                 // coordonnées de la recette (repère local de l'objet, ou monde), ou couleur d'une feuille
out vec3 vN;                 // normale, monde
flat out float vCode;        // élément (partie entière) et paramètre (partie fractionnaire × 2)
out float vDist;             // distance à la caméra
out vec3 vDx;                // variation des coordonnées de recette par pixel, en x et en y de l'écran (grains seulement)
out vec3 vDy;
out vec2 vDd;                // variation de la distance par pixel
out float vSz;               // côté du grain, en pixels
const float DMAX=400.;
// Projette P ; rend false s'il est derrière ou trop loin du champ. ang : angle à l'axe de visée.
bool projette(vec3 P, float marge, out vec4 pos, out float dist, out float ang){
  vec3 d=P-uCamPos; dist=length(d);
  pos=vec4(0.,0.,2.,1.);
  if(dist<.05) return false;
  vec3 dl=(d/dist)*uCam;
  ang=acos(clamp(dl.z,-1.,1.));
  if(ang>marge) return false;
  float sxy=length(dl.xy);
  vec2 puv=(sxy>1e-6?dl.xy/sxy:vec2(0.))*(ang/uFish);
  pos=vec4(puv*2.*uRes.y/uRes+uJit,clamp(dist/DMAX,0.,1.)*2.-1.,1.);
  return true;
}
void sansGrain(){ vQ=vec3(0.); vN=vec3(0.,1.,0.); vCode=-1.; vDist=0.; vDx=vec3(0.); vDy=vec3(0.); vDd=vec2(0.); vSz=0.; }
