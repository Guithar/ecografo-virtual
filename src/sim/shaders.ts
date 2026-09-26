/**
 * Shaders GLSL ES 3.0 del simulador ecográfico.
 *
 * Tubería (por fotograma):
 *  A. tissue      Mapa tisular en el plano de imagen: dispersores complejos fijos al tejido (speckle),
 *                 impedancia, atenuación, velocidad de la sangre, etiqueta anatómica y aguja (analítica).
 *                 Integra el grosor de corte (elevación) con 3 muestras de Gauss-Hermite.
 *  B. interface   Reflexión especular en interfaces (ΔZ) con dependencia angular, pérdidas de transmisión
 *                 y atenuación por muestra (log-amplitud).
 *  C. scan        Suma prefija (Hillis-Steele) de la log-transmisión a lo largo de cada línea de barrido.
 *  D. axial       Aplica la atenuación acumulada/sombra de aguja y convoluciona con la PSF axial.
 *  E. lateral     PSF lateral dependiente de la profundidad (foco de transmisión).
 *  F. bmode       Ruido electrónico, detección de envolvente, TGC, ganancia, compresión logarítmica,
 *                 persistencia.
 *  G. compose     Doppler color / power (estimación de velocidad media, aliasing, filtro de pared,
 *                 prioridad), fusión anatómica. Salida RGB para el monitor y la vista 3D.
 *  H. anatomy     Sección anatómica real coloreada por tejido (verdad de campo).
 */
import { tissueGLSL, TISSUES } from '../anatomy/tissues';
import { KNOT_COUNT } from '../anatomy/armShape';
import { MAX_STRUCTS } from '../anatomy/model';

export const MAX_SEG_GLSL = 192;

export const FS_VERT = /* glsl */ `
precision highp float;
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const NOISE = /* glsl */ `
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3(ivec3 p) { return vec3(pcg3d(uvec3(p))) * (1.0 / 4294967295.0); }

// Dispersores complejos blancos de varianza constante (interpolación trilineal normalizada)
vec2 scatterField(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  ivec3 ii = ivec3(i);
  vec2 acc = vec2(0.0);
  for (int dz = 0; dz < 2; dz++)
  for (int dy = 0; dy < 2; dy++)
  for (int dx = 0; dx < 2; dx++) {
    vec3 h = hash3(ii + ivec3(dx, dy, dz));
    float w = (dx == 0 ? 1.0 - f.x : f.x) * (dy == 0 ? 1.0 - f.y : f.y) * (dz == 0 ? 1.0 - f.z : f.z);
    acc += w * (h.xy * 2.0 - 1.0);
  }
  vec3 f2 = (1.0 - f) * (1.0 - f) + f * f;
  return acc * inversesqrt(f2.x * f2.y * f2.z) * 1.7320508;
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * (3.0 - 2.0 * f);
  ivec3 ii = ivec3(i);
  float a = hash3(ii).x;
  float b = hash3(ii + ivec3(1, 0, 0)).x;
  float c = hash3(ii + ivec3(0, 1, 0)).x;
  float d = hash3(ii + ivec3(1, 1, 0)).x;
  float e = hash3(ii + ivec3(0, 0, 1)).x;
  float g = hash3(ii + ivec3(1, 0, 1)).x;
  float h = hash3(ii + ivec3(0, 1, 1)).x;
  float k = hash3(ii + ivec3(1, 1, 1)).x;
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}

float fbm2(vec3 p) { return 0.65 * vnoise(p) + 0.35 * vnoise(p * 2.07 + 13.1); }

// Worley 2D: devuelve (F1, F2)
vec2 worley2(vec2 p, int seed) {
  vec2 i = floor(p);
  vec2 f = p - i;
  float F1 = 8.0, F2 = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int k = -1; k <= 1; k++) {
    vec2 o = hash3(ivec3(ivec2(i) + ivec2(j, k), seed)).xy;
    vec2 d = vec2(float(j), float(k)) + o - f;
    float dd = dot(d, d);
    if (dd < F1) { F2 = F1; F1 = dd; } else if (dd < F2) { F2 = dd; }
  }
  return sqrt(vec2(F1, F2));
}

// Ruido gaussiano temporal (Box-Muller)
vec2 gauss2(vec2 fc, float seed) {
  vec3 h = hash3(ivec3(ivec2(fc), int(seed)));
  float r = sqrt(-2.0 * log(max(h.x, 1e-7)));
  return r * vec2(cos(6.2831853 * h.y), sin(6.2831853 * h.y));
}
`;

const ARM = /* glsl */ `
uniform vec4 uKnots[${KNOT_COUNT}];
uniform float uKnotX0;
uniform float uKnotDX;
vec4 armSec(float x) {
  float fx = (x - uKnotX0) / uKnotDX;
  float fi = floor(fx);
  float t = fx - fi;
  int i = int(fi);
  if (i < 0) { i = 0; t = 0.0; }
  if (i > ${KNOT_COUNT - 2}) { i = ${KNOT_COUNT - 2}; t = 1.0; }
  vec4 p0 = uKnots[max(i - 1, 0)];
  vec4 p1 = uKnots[i];
  vec4 p2 = uKnots[min(i + 1, ${KNOT_COUNT - 1})];
  vec4 p3 = uKnots[min(i + 2, ${KNOT_COUNT - 1})];
  float t2 = t * t, t3 = t2 * t;
  return 0.5 * (2.0 * p1 + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3);
}
float sdEll(vec2 p, vec2 ab) {
  vec2 q = p / ab;
  float k0 = length(q);
  float k1 = length(p / (ab * ab));
  return k1 < 1e-6 ? -min(ab.x, ab.y) : k0 * (k0 - 1.0) / k1;
}
// profundidad bajo la piel (x: longitudinal, y: volar, z: radial)
float skinDepth(vec3 p) {
  vec4 s = armSec(p.x);
  float ext = s.z + s.w;
  return -sdEll(p.zy, s.xy + ext);
}
`;

// -------------------------------------------------------------------------------------------------
// A. Mapa tisular
// -------------------------------------------------------------------------------------------------
export const TISSUE_FRAG = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vUv;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;

${tissueGLSL()}
${NOISE}
${ARM}

uniform vec2 uRes;
uniform vec3 uF;
uniform vec3 uL;
uniform vec3 uB;
uniform vec3 uE;
uniform float uW;
uniform float uD;
uniform float uPress;
uniform sampler2D uSeg;
uniform int uSegCount;
uniform vec4 uStrA[${MAX_STRUCTS}];
uniform vec4 uStrB[${MAX_STRUCTS}];
uniform float uTime;
uniform float uLambda;      // longitud de onda (mm)
uniform float uElevFocus;   // foco de elevación (mm)
uniform float uElevFWHM;    // grosor de corte en el foco (mm)
uniform vec3 uDopDir;
uniform vec4 uNdA[2];       // punto posterior (fuera) + radio
uniform vec4 uNdB[2];       // punta + activo
uniform vec4 uTent;         // punta + cantidad de "tienda" (mm)
uniform vec4 uTentDir;      // dirección de la aguja + índice de estructura
uniform float uGelMax;
uniform float uCompLambda;
uniform float uPressK;      // mmHg por mm de indentación
uniform float uSoftLift;    // mm que el tejido puede adaptarse a la sonda
uniform float uNeedleEcho;  // factor de ecogenicidad de la aguja

const float LATTICE = 0.072; // mm, red de dispersores

struct Tis {
  int t;          // tejido
  float echo;     // amplitud media de retrodispersión
  int sidx;       // estructura (-1 ninguna)
  float vtow;     // velocidad hacia la sonda (cm/s)
  float blood;    // peso sangre
  float turb;
  float prio;
  float sd;
  float advect;   // desplazamiento de advección de la sangre (mm)
  vec3 axis;
};

Tis baseLayers(vec3 p) {
  Tis r;
  r.sidx = -1; r.vtow = 0.0; r.blood = 0.0; r.turb = 0.0; r.prio = 0.0; r.sd = 1e9; r.advect = 0.0; r.axis = vec3(1.0, 0.0, 0.0);
  vec4 s = armSec(p.x);
  float ext = s.z + s.w;
  float dS = -sdEll(p.zy, s.xy + ext);
  if (dS < 0.0) { r.t = TI_GEL; r.echo = 0.0; return r; }
  if (dS < s.w) {
    r.t = TI_SKIN;
    float epi = 1.0 - smoothstep(0.0, 0.18, dS);
    r.echo = T_ECHO[TI_SKIN] * (0.85 + 0.3 * vnoise(p * 1.7)) + 0.9 * epi;
    return r;
  }
  float dF = -sdEll(p.zy, s.xy);
  if (dF < -0.28) {
    r.t = TI_FAT;
    float R = sqrt(s.x * s.y);
    float th = atan(p.z, p.y);
    vec3 q = vec3(p.x * 0.11, dS * 0.75, th * R * 0.11);
    float n = fbm2(q);
    float septa = 1.0 - smoothstep(0.0, 0.045, abs(n - 0.5));
    float lob = vnoise(q * 1.9 + 7.0);
    float septa2 = 1.0 - smoothstep(0.0, 0.03, abs(vnoise(q * 2.3 + 31.0) - 0.5));
    r.echo = T_ECHO[TI_FAT] * (0.45 + 0.6 * lob) + 0.9 * septa + 0.35 * septa2;
    return r;
  }
  if (dF < 0.28) {
    r.t = TI_FASCIA;
    r.echo = T_ECHO[TI_FASCIA] * (0.85 + 0.3 * vnoise(p * 0.8));
    return r;
  }
  r.t = TI_MUSCLE;
  // fascículos (perimisio fibroadiposo): puntos/estrías ecogénicos sobre fondo hipoecoico
  // ("cielo estrellado" en transversal, patrón plumoso/estriado en longitudinal)
  vec2 fz = worley2(p.zy * 0.62 + vec2(p.x * 0.012, p.x * 0.008), 5);
  float fasc = 1.0 - smoothstep(0.0, 0.09, fz.y - fz.x);
  float fib = vnoise(vec3(p.x * 0.05, p.y * 1.3, p.z * 1.3));
  float dots = smoothstep(0.72, 0.9, vnoise(vec3(p.x * 0.09, p.y * 2.6, p.z * 2.6)));
  // tabiques intermusculares (compartimentos)
  vec2 warp = vec2(vnoise(vec3(p.zy * 0.08, p.x * 0.01)), vnoise(vec3(p.zy * 0.08 + 17.0, p.x * 0.01))) - 0.5;
  vec2 wz = worley2(p.zy * 0.055 + warp * 0.9 + vec2(p.x * 0.0045, -p.x * 0.003), 11);
  float sept = 1.0 - smoothstep(0.0, 0.05, wz.y - wz.x);
  r.echo = T_ECHO[TI_MUSCLE] * (0.3 + 0.55 * fib * fib + 1.5 * fasc + 1.6 * dots) + 0.6 * sept;
  return r;
}

// Evalúa un segmento para un punto: actualiza el mejor candidato
void evalSeg(inout Tis best, vec3 p, int si, float depthW, float dloc) {
  vec4 T0 = texelFetch(uSeg, ivec2(0, si), 0);
  vec4 T1 = texelFetch(uSeg, ivec2(1, si), 0);
  vec4 T2 = texelFetch(uSeg, ivec2(2, si), 0);
  int sidx = int(T2.z + 0.5);
  int code = int(T2.w + 0.5);
  vec4 SA = uStrA[sidx];
  vec4 SB = uStrB[sidx];
  float rscale = (code <= 4) ? SA.w : 1.0;
  vec3 a = T0.xyz;
  vec3 b = T1.xyz;
  vec3 pp = p;
  // deformación en "tienda" de la pared por la punta de la aguja
  if (sidx == int(uTentDir.w + 0.5) && uTent.w > 0.0) {
    vec3 dd = p - uTent.xyz;
    pp = p - uTentDir.xyz * uTent.w * exp(-dot(dd, dd) / 3.2);
  }
  vec3 ba = b - a;
  float L2 = max(dot(ba, ba), 1e-6);
  float h = clamp(dot(pp - a, ba) / L2, 0.0, 1.0);
  vec3 c = a + ba * h;
  vec3 o = pp - c;
  vec3 tax = ba * inversesqrt(L2);
  float r = mix(T0.w, T1.w, h) * rscale;
  float wall = mix(T2.x, T2.y, h);
  float prio = code == 12 ? 5.0 : (code <= 4 ? 4.0 : (code == 10 ? 3.0 : (code == 11 ? 2.0 : 1.0)));
  if (prio < best.prio) return;

  float kc = 1.0, kw = 1.0;
  vec3 cdir = uB - tax * dot(uB, tax);
  float cl = length(cdir);
  if (code <= 3 && cl > 0.15) {
    cdir /= cl;
    float Ploc = uPressK * max(dloc, 0.0) * exp(-depthW / uCompLambda);
    float Pv = SA.z;
    float col = clamp((Ploc - Pv) / (0.6 * Pv + 8.0), 0.0, 0.94);
    kc = 1.0 - col;
    kw = 1.0 + 0.4 * col;
  } else {
    cdir = cl > 1e-3 ? cdir / cl : vec3(0.0, 1.0, 0.0);
  }
  float oc = dot(o, cdir);
  vec3 oe = o - cdir * oc;
  float shift = r * (1.0 - kc);
  float ocN = (oc - shift) / (r * kc);
  float oeN = length(oe) / (r * kw);
  float rho = sqrt(ocN * ocN + oeN * oeN);
  float sd = (rho - 1.0) * r * (kc < 0.999 ? mix(kc, 1.0, 0.5) : 1.0);

  if (code <= 4) {
    vec4 T4 = texelFetch(uSeg, ivec2(4, si), 0);
    float wallExtra = T4.z;
    float wt = wall + wallExtra;
    if (sd >= wt) return;
    if (prio == best.prio && sd >= best.sd) return;
    best.prio = prio; best.sd = sd; best.sidx = sidx; best.axis = tax;
    best.vtow = 0.0; best.blood = 0.0; best.turb = 0.0; best.advect = 0.0;
    if (sd < 0.0) {
      vec4 T3 = texelFetch(uSeg, ivec2(3, si), 0);
      float ol = length(o);
      float cth = ol > 1e-4 ? dot(o / ol, T3.xyz) : 0.0;
      float thLocal = T3.w * sqrt(clamp((cth - 0.15) / 0.85, 0.0, 1.0));
      if (T3.w > 0.0 && ol > r - thLocal) {
        best.t = TI_THROMBUS;
        float het = fbm2(pp * 0.9);
        best.echo = T_ECHO[TI_THROMBUS] * (0.5 + 1.3 * het) ;
        return;
      }
      best.t = code == 1 ? TI_BLOODART : ((code == 2) ? TI_BLOODVEN : TI_BLOODAVF);
      float n = max(SA.y, 1.0);
      float area = 3.14159265 * (r * 0.1) * (r * 0.1) * kc * kw;
      float vmean = SA.x / max(area, 1e-4);
      float rr = min(rho, 1.0);
      float vprof = vmean * (n + 2.0) / n * (1.0 - pow(rr, n));
      vec3 vv = tax * vprof;
      if (T4.y > 0.0) {
        vec3 sw = cross(tax, o);
        float sl = length(sw);
        if (sl > 1e-4) vv += sw / sl * abs(vmean) * 0.9 * T4.y * rr;
      }
      best.vtow = -dot(vv, uDopDir);
      best.blood = 1.0;
      best.turb = T4.x;
      best.advect = vprof;
      best.echo = T_ECHO[best.t] * (1.0 + 6.0 * (T4.w + SB.w));
      return;
    }
    // pared
    float f = sd / max(wt, 1e-3);
    if (code == 4) {
      best.t = TI_GRAFT;
      float lines = max(exp(-pow((f - 0.08) / 0.12, 2.0)), exp(-pow((f - 0.9) / 0.12, 2.0)));
      best.echo = T_ECHO[TI_GRAFT] * (0.35 + 1.1 * lines);
      return;
    }
    best.t = TI_WALL;
    float calc = SB.z;
    if (calc > 0.0 && f > 0.35) {
      float cn = vnoise(vec3(dot(pp, tax) * 0.35, atan(dot(o, cross(tax, cdir)), oc) * 1.6, 0.0));
      if (cn > 1.0 - calc * 0.75) { best.t = TI_CALCIUM; best.echo = T_ECHO[TI_CALCIUM] * (0.8 + 0.4 * cn); return; }
    }
    float fin = sd < wallExtra ? sd / max(wallExtra, 1e-3) : -1.0;
    if (fin >= 0.0) {
      best.echo = 0.55 + 0.6 * vnoise(pp * 2.2); // hiperplasia intimal: ecogénica heterogénea
      return;
    }
    float fw = (sd - wallExtra) / max(wall, 1e-3);
    float intima = exp(-pow(fw / 0.18, 2.0));
    float advent = smoothstep(0.45, 0.85, fw);
    best.echo = SB.y * (0.28 + 0.95 * intima + 0.9 * advent);
    return;
  }
  if (sd >= 0.0) return;
  if (prio == best.prio && sd >= best.sd) return;
  best.prio = prio; best.sd = sd; best.sidx = sidx; best.axis = tax;
  best.vtow = 0.0; best.blood = 0.0; best.turb = 0.0; best.advect = 0.0;
  if (code == 12) {
    best.t = TI_BONE;
    best.echo = T_ECHO[TI_BONE];
  } else if (code == 10) {
    best.t = TI_NERVE;
    vec4 T3 = texelFetch(uSeg, ivec2(3, si), 0);
    vec3 n1 = normalize(T3.xyz);
    vec3 n2 = cross(tax, n1);
    vec2 q2 = vec2(dot(o, n1), dot(o, n2));
    vec2 wz = worley2(q2 * 1.25 + vec2(dot(pp, tax) * 0.02), 23);
    float fasc = smoothstep(0.28, 0.5, wz.x);
    float rim = smoothstep(-0.35, -0.05, sd);
    best.echo = T_ECHO[TI_NERVE] * (0.3 + 1.6 * fasc) + 0.6 * rim;
  } else if (code == 11) {
    best.t = TI_TENDON;
    float cb = dot(tax, uB);
    float aniso = pow(max(0.0, 1.0 - cb * cb), 7.0);
    vec3 q = vec3(dot(pp, tax) * 0.12, dot(pp, cross(tax, uB)) * 3.5, dot(pp, uB) * 3.5);
    float fibr = vnoise(q);
    best.echo = T_ECHO[TI_TENDON] * (0.18 + 1.1 * aniso * (0.5 + fibr));
  } else {
    best.t = TI_HEMATOMA;
    float n = fbm2(pp * 0.45);
    float clot = smoothstep(0.42, 0.62, n);
    best.echo = 0.04 + 0.62 * clot + 0.1 * vnoise(pp * 2.0);
  }
}

Tis evalPoint(vec3 p, float depthW, float dloc) {
  Tis best;
  best.prio = -1.0; best.sd = 1e9; best.sidx = -1; best.t = -1;
  best.vtow = 0.0; best.blood = 0.0; best.turb = 0.0; best.advect = 0.0; best.echo = 0.0; best.axis = vec3(1.0, 0.0, 0.0);
  for (int i = 0; i < ${MAX_SEG_GLSL}; i++) {
    if (i >= uSegCount) break;
    vec4 T0 = texelFetch(uSeg, ivec2(0, i), 0);
    vec4 T1 = texelFetch(uSeg, ivec2(1, i), 0);
    // rechazo rápido por esfera envolvente
    vec3 m = 0.5 * (T0.xyz + T1.xyz);
    float hl = 0.5 * distance(T0.xyz, T1.xyz);
    float rmax = max(T0.w, T1.w) * 1.9 + 2.2;
    vec3 dm = p - m;
    if (dot(dm, dm) > (hl + rmax) * (hl + rmax)) continue;
    evalSeg(best, p, i, depthW, dloc);
  }
  if (best.t < 0) best = baseLayers(p);
  return best;
}

// Intersección rayo-cilindro finito (aguja). Devuelve (s_entrada, s_salida, cosIncidencia, distTip) o s<0 si no hay.
vec4 needleHit(vec3 ro, vec3 rd, vec3 A, vec3 Btip, float rn) {
  vec3 ax = Btip - A;
  float len = length(ax);
  vec3 u = ax / len;
  vec3 oc = ro - A;
  float rdu = dot(rd, u);
  float ocu = dot(oc, u);
  vec3 d = rd - u * rdu;
  vec3 w0 = oc - u * ocu;
  float aa = dot(d, d);
  if (aa < 1e-8) return vec4(-1.0);
  float bb = 2.0 * dot(d, w0);
  float cc = dot(w0, w0) - rn * rn;
  float disc = bb * bb - 4.0 * aa * cc;
  if (disc < 0.0) return vec4(-1.0);
  float sq = sqrt(disc);
  float s0 = (-bb - sq) / (2.0 * aa);
  float s1 = (-bb + sq) / (2.0 * aa);
  float h0 = ocu + s0 * rdu;
  if (h0 < 0.0 || h0 > len) return vec4(-1.0);
  vec3 hp = ro + rd * s0;
  vec3 nrm = normalize((hp - A) - u * h0);
  float cosi = max(0.0, dot(nrm, -rd));
  return vec4(s0, s1, cosi, len - h0);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  float u = (fc.x / uRes.x - 0.5) * uW;        // lateral (mm), negativo = lado del marcador
  float w = (fc.y / uRes.y) * uD;               // profundidad (mm)
  float dz = uD / uRes.y;

  // --- contacto sonda-piel y compresión ---
  vec3 Fp0 = uF + uL * u;
  float gap0 = max(0.0, -skinDepth(Fp0));
  float dloc = uPress - gap0;                   // indentación local (negativa = el tejido "sube" hacia la sonda)
  float lift = uSoftLift + 0.5 * uPress;        // adaptación del tejido blando a la cara plana de la sonda
  vec3 P = Fp0 + uB * (uPress + w);             // punto en el espacio deformado (imagen)
  vec3 P0 = P;
  bool air = false;
  bool gel = false;
  if (dloc >= -lift) {
    P0 = P - uB * (dloc * exp(-w / uCompLambda));
  } else {
    float gap = -dloc - lift;
    if (gap > uGelMax) air = true;
    else if (w < gap) gel = true;
    P0 = P + uB * (lift * exp(-max(w - gap, 0.0) / uCompLambda));
  }

  // grosor de corte (elevación) dependiente de la profundidad
  float zr = 8.7;
  float fwhm = uElevFWHM * sqrt(1.0 + pow((w - uElevFocus) / zr, 2.0));
  float sig = fwhm / 2.3548;

  vec2 iq = vec2(0.0);
  float Z = 0.0, att = 0.0, vW = 0.0, bW = 0.0, turbW = 0.0;
  float label = 0.0;
  float needleT = 1.0;

  if (air) {
    // reverberaciones de la lente contra el aire y sombra total
    float rev = 0.0;
    for (int k = 0; k < 6; k++) {
      float s = 0.55 + float(k) * 1.1;
      rev += exp(-float(k) * 0.55) * exp(-pow((w - s) / 0.12, 2.0));
    }
    vec2 n = gauss2(fc, 3.0 + floor(uTime * 30.0));
    iq = vec2(rev * 1.2, 0.0) + n * rev * 0.3;
    Z = T_Z[TI_AIR];
    att = T_ATT[TI_AIR];
    label = float(TI_AIR);
  } else if (gel) {
    Z = T_Z[TI_GEL];
    att = T_ATT[TI_GEL];
    label = float(TI_GEL);
    iq = scatterField(P0 / LATTICE) * 0.004;
  } else {
    float ek[3] = float[3](-1.7320508, 0.0, 1.7320508);
    float wk[3] = float[3](0.1666667, 0.6666667, 0.1666667);
    for (int k = 0; k < 3; k++) {
      vec3 pk = P0 + uE * (ek[k] * sig);
      Tis ts = evalPoint(pk, w, dloc);
      int t = ts.t;
      vec3 sp = pk;
      if (ts.blood > 0.0) {
        // la sangre se desplaza: speckle que fluye
        sp = pk - ts.axis * mod(ts.advect * 10.0 * uTime, 4000.0);
      }
      vec2 sc = scatterField(sp / LATTICE);
      iq += wk[k] * ts.echo * sc;
      Z += wk[k] * T_Z[t];
      att += wk[k] * T_ATT[t];
      vW += wk[k] * ts.vtow * ts.blood;
      bW += wk[k] * ts.blood;
      turbW += wk[k] * ts.turb * ts.blood;
      if (k == 1) label = float(t) + 32.0 * float(ts.sidx + 1);
    }
  }

  // --- aguja(s): intersección analítica con integración en elevación ---
  if (!air) {
    for (int n = 0; n < 2; n++) {
      if (uNdB[n].w < 0.5) continue;
      vec3 A = uNdA[n].xyz;
      vec3 Tt = uNdB[n].xyz;
      float rn = uNdA[n].w;
      float amp = 0.0;
      float trans = 0.0;
      float wsum = 0.0;
      bool centerHit = false;
      for (int k = -3; k <= 3; k++) {
        float e = float(k) * 0.75 * sig;
        float wgt = exp(-0.5 * pow(float(k) * 0.75, 2.0));
        wsum += wgt;
        vec3 ro = uF + uL * u + uE * e + uB * uPress;
        vec4 hit = needleHit(ro, uB, A, Tt, rn);
        if (hit.x < 0.0) { trans += wgt; continue; }
        float s0 = hit.x;
        float chord = max(hit.y - hit.x, 0.2);
        float th = acos(clamp(hit.z, 0.0, 1.0));
        // reflexión especular (dependiente del ángulo de incidencia) + componente difusa (rugosidad,
        // apertura finita del transductor)
        float spec = 0.3 + 0.7 * exp(-pow(th / 0.6, 2.0));
        float tipB = 1.0 + 0.9 * exp(-hit.w * 1.4);
        float sdz = max(dz * 0.8, 0.045);
        float e0 = exp(-pow((w - s0) / sdz, 2.0));
        float rv = 0.0;
        for (int m = 1; m <= 5; m++) {
          float sm = s0 + chord * float(m);
          rv += pow(0.52, float(m)) * exp(-pow((w - sm) / (sdz * 1.3), 2.0));
        }
        amp += wgt * spec * tipB * (e0 + rv);
        trans += wgt * (w > s0 + sdz ? 0.4 + 0.25 * (1.0 - spec) : 1.0);
        if (k == 0 && abs(w - s0) < chord) centerHit = true;
      }
      // el eco especular de cada rayo de elevación se suma con su peso del haz (sin normalizar:
      // una aguja centrada en el plano devuelve el eco completo); la transmisión sí se promedia
      trans /= wsum;
      needleT *= trans;
      float ph = 12.566370 * w / uLambda;
      iq += uNeedleEcho * amp * vec2(cos(ph), sin(ph));
      if (centerHit) label = float(TI_NEEDLE);
    }
  }

  // o1.y empaqueta la fracción de sangre (0..1) y la turbulencia (centenas × 10)
  float turbN = bW > 0.001 ? floor(clamp(turbW / bW, 0.0, 0.99) * 100.0) * 10.0 : 0.0;
  o0 = vec4(iq, Z, att);
  o1 = vec4(vW, bW + turbN, label, needleT);
}
`;

// -------------------------------------------------------------------------------------------------
// B. Interfaces y log-transmisión
// -------------------------------------------------------------------------------------------------
export const INTERFACE_FRAG = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vUv;
layout(location = 0) out vec4 o0;
uniform sampler2D uT0;
uniform sampler2D uT1;
uniform vec2 uRes;
uniform float uDz;        // mm por muestra
uniform float uDx;        // mm por columna
uniform float uFreq;      // MHz
uniform float uLambda;
uniform float uSpecK;
${tissueGLSL()}
int tis(float lab) { return int(mod(floor(lab + 0.01), 32.0)); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 R = ivec2(uRes);
  vec4 c = texelFetch(uT0, p, 0);
  vec4 up = texelFetch(uT0, ivec2(p.x, max(p.y - 1, 0)), 0);
  vec4 dn = texelFetch(uT0, ivec2(p.x, min(p.y + 1, R.y - 1)), 0);
  vec4 lf = texelFetch(uT0, ivec2(max(p.x - 1, 0), p.y), 0);
  vec4 rt = texelFetch(uT0, ivec2(min(p.x + 1, R.x - 1), p.y), 0);
  float Zc = c.z, Zu = up.z;
  float rAmp = (Zc - Zu) / max(Zc + Zu, 1e-6);
  float Rint = rAmp * rAmp;
  // normal de la interfaz a partir del gradiente de Z
  float gx = (rt.z - lf.z) / (2.0 * uDx);
  float gy = (dn.z - up.z) / (2.0 * uDz);
  float gl = sqrt(gx * gx + gy * gy) + 1e-6;
  float cosi = abs(gy) / gl;
  float spec = uSpecK * abs(rAmp) * (0.25 + 0.75 * pow(cosi, 3.0));
  float w = (float(p.y) + 0.5) * uDz;
  float ph = 12.566370 * w / uLambda;
  vec2 iq = c.xy + spec * vec2(cos(ph), sin(ph));
  // log-transmisión (amplitud, ida y vuelta)
  float L = log(max(1.0 - Rint, 1e-6));
  L -= c.w * uFreq * 2.0 * (uDz * 0.1) * 0.115129;   // dB→neper (ln10/20)
  // sombra de refracción en bordes de vasos (incidencia rasante sobre interfaz sangre/pared)
  vec4 l1c = texelFetch(uT1, p, 0);
  vec4 l1u = texelFetch(uT1, ivec2(p.x, max(p.y - 1, 0)), 0);
  int tc = tis(l1c.z), tu = tis(l1u.z);
  bool bc = tc >= 10 && tc <= 12;
  bool bu = tu >= 10 && tu <= 12;
  if (bc != bu) {
    float gr = 1.0 - cosi;
    L -= 0.55 * pow(gr, 3.0);
  }
  o0 = vec4(iq, L, 0.0);
}
`;

// -------------------------------------------------------------------------------------------------
// C. Suma prefija
// -------------------------------------------------------------------------------------------------
export const SCAN_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
layout(location = 0) out vec4 o0;
uniform sampler2D uIn;
uniform int uStep;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(uIn, p, 0);
  if (p.y >= uStep) {
    c.w += texelFetch(uIn, ivec2(p.x, p.y - uStep), 0).w;
  }
  o0 = c;
}
`;
// Nota: antes del primer paso, .w se inicializa con L (ver INIT_SCAN_FRAG)
export const INIT_SCAN_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
layout(location = 0) out vec4 o0;
uniform sampler2D uIn;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(uIn, p, 0);
  o0 = vec4(c.xy, c.z, c.z);
}
`;

// -------------------------------------------------------------------------------------------------
// D. Atenuación + PSF axial
// -------------------------------------------------------------------------------------------------
export const AXIAL_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
layout(location = 0) out vec4 o0;
uniform sampler2D uScan;  // xy: IQ, z: L propio, w: suma inclusiva
uniform sampler2D uT1;    // w: transmisión de aguja
uniform vec2 uRes;
uniform float uSigma;     // sigma axial en muestras
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int K = int(clamp(ceil(uSigma * 3.0), 1.0, 14.0));
  vec2 acc = vec2(0.0);
  float norm = 0.0;
  for (int k = -14; k <= 14; k++) {
    if (k < -K || k > K) continue;
    int y = p.y + k;
    if (y < 0 || y >= int(uRes.y)) continue;
    vec4 s = texelFetch(uScan, ivec2(p.x, y), 0);
    float nt = texelFetch(uT1, ivec2(p.x, y), 0).w;
    float g = exp(-0.5 * float(k * k) / (uSigma * uSigma));
    float a = exp(s.w - s.z) * nt;
    acc += g * a * s.xy;
    norm += g * g;
  }
  o0 = vec4(acc / sqrt(max(norm, 1e-6)), 0.0, 0.0);
}
`;

// -------------------------------------------------------------------------------------------------
// E. PSF lateral dependiente de la profundidad
// -------------------------------------------------------------------------------------------------
export const LATERAL_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
layout(location = 0) out vec4 o0;
uniform sampler2D uIn;
uniform vec2 uRes;
uniform float uDx;
uniform float uDz;
uniform float uSigFocus;  // sigma lateral en el foco (mm)
uniform float uFocus;     // mm
uniform float uFocusB;    // segundo foco (mm) o <0
uniform float uZR;        // "rango de Rayleigh" efectivo (mm)
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float w = (float(p.y) + 0.5) * uDz;
  float d1 = (w - uFocus) / uZR;
  float s = uSigFocus * sqrt(1.0 + d1 * d1);
  if (uFocusB > 0.0) {
    float d2 = (w - uFocusB) / uZR;
    s = min(s, uSigFocus * sqrt(1.0 + d2 * d2));
  }
  // región de campo cercano: apertura pequeña → algo más ancho
  s *= 1.0 + 0.35 * exp(-w / 1.5);
  float sp = s / uDx;
  int K = int(clamp(ceil(sp * 3.0), 1.0, 16.0));
  vec2 acc = vec2(0.0);
  float norm = 0.0;
  for (int k = -16; k <= 16; k++) {
    if (k < -K || k > K) continue;
    int x = p.x + k;
    if (x < 0 || x >= int(uRes.x)) continue;
    float g = exp(-0.5 * float(k * k) / (sp * sp));
    acc += g * texelFetch(uIn, ivec2(x, p.y), 0).xy;
    norm += g * g;
  }
  o0 = vec4(acc / sqrt(max(norm, 1e-6)), 0.0, 0.0);
}
`;

// -------------------------------------------------------------------------------------------------
// F. Modo B: envolvente, TGC, compresión log, persistencia
// -------------------------------------------------------------------------------------------------
export const BMODE_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
layout(location = 0) out vec4 o0;
uniform sampler2D uIn;
uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uDz;
uniform float uGain;      // dB
uniform float uDR;        // dB
uniform float uComp;      // compensación automática dB/cm/MHz
uniform float uFreq;
uniform float uTgc[8];    // dB por banda de profundidad
uniform float uNoise;
uniform float uTime;
uniform float uPersist;
uniform float uSRI;       // reducción de speckle 0..1
${NOISE}
float envAt(ivec2 p, vec2 n) {
  vec2 iq = texelFetch(uIn, p, 0).xy + n;
  return length(iq);
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 n = gauss2(vec2(p) + 0.5, 7.0 + floor(mod(uTime * 60.0, 100000.0))) * uNoise;
  float env = envAt(p, n);
  if (uSRI > 0.0) {
    // filtro de reducción de speckle: media ponderada 3x5 (preserva bordes por diferencia)
    float acc = env;
    float ws = 1.0;
    for (int j = -2; j <= 2; j++)
    for (int i = -1; i <= 1; i++) {
      if (i == 0 && j == 0) continue;
      ivec2 q = clamp(p + ivec2(i, j), ivec2(0), ivec2(uRes) - 1);
      float e = length(texelFetch(uIn, q, 0).xy);
      float wgt = exp(-pow((e - env) / (0.6 * env + 1e-4), 2.0));
      acc += wgt * e;
      ws += wgt;
    }
    env = mix(env, acc / ws, uSRI);
  }
  float w = (float(p.y) + 0.5) * uDz;     // mm
  float depthFrac = clamp(w / (uDz * uRes.y), 0.0, 1.0) * 7.0;
  int ti = int(floor(depthFrac));
  float tf = depthFrac - float(ti);
  float tg = mix(uTgc[min(ti, 7)], uTgc[min(ti + 1, 7)], tf);
  float comp = uComp * uFreq * 2.0 * (w * 0.1);
  float dB = 20.0 * log(env + 1e-9) / log(10.0) + uGain + comp + tg;
  float v = clamp((dB + uDR) / uDR, 0.0, 1.0);
  // mapa de grises en "S" (post-procesado típico de los equipos): más contraste en tonos medios
  v = pow(v, 1.7);
  v = v * v * (3.0 - 2.0 * v) * 0.35 + v * 0.65;
  float prev = texelFetch(uPrev, p, 0).x;
  v = mix(v, prev, uPersist);
  o0 = vec4(v, 0.0, 0.0, 1.0);
}
`;

// -------------------------------------------------------------------------------------------------
// G. Composición: Doppler color/power y fusión anatómica
// -------------------------------------------------------------------------------------------------
const palette = TISSUES.map((t) => {
  const c = parseInt(t.color.slice(1), 16);
  return `vec3(${(((c >> 16) & 255) / 255).toFixed(3)}, ${(((c >> 8) & 255) / 255).toFixed(3)}, ${((c & 255) / 255).toFixed(3)})`;
}).join(', ');

export const COMPOSE_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
layout(location = 0) out vec4 o0;
uniform sampler2D uB;     // modo B (x)
uniform sampler2D uT1;    // (vW, bW+turb, label, needleT)
uniform vec2 uRes;
uniform int uMode;        // 0 B, 1 color, 2 power
uniform vec4 uBox;        // u0, w0, u1, w1 (mm)
uniform float uSteer;     // tan(ángulo de dirección)
uniform float uW;
uniform float uD;
uniform float uVn;        // velocidad de Nyquist (cm/s)
uniform float uBaseline;  // desplazamiento de línea base (fracción)
uniform float uWallF;     // filtro de pared (cm/s)
uniform float uCGain;     // ganancia color 0..1
uniform float uPriority;  // umbral de prioridad
uniform float uTime;
uniform float uFusion;    // 0..1
uniform float uInvert;    // 1 invertir colores
uniform int uHighlight;   // índice de estructura resaltada
uniform int uMapB;        // mapa de grises: 0 gris, 1 sepia, 2 azul
${NOISE}
const vec3 PAL[${TISSUES.length}] = vec3[${TISSUES.length}](${palette});
vec3 bart(float v) {
  // v en [-1, 1] (fracción de Nyquist). Positivo = hacia la sonda (rojo)
  float a = abs(v);
  if (v >= 0.0) return mix(vec3(0.45, 0.0, 0.0), mix(vec3(1.0, 0.1, 0.05), vec3(1.0, 0.95, 0.4), smoothstep(0.55, 1.0, a)), smoothstep(0.0, 0.55, a));
  return mix(vec3(0.0, 0.05, 0.45), mix(vec3(0.1, 0.35, 1.0), vec3(0.4, 1.0, 1.0), smoothstep(0.55, 1.0, a)), smoothstep(0.0, 0.55, a));
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float g = texelFetch(uB, p, 0).x;
  vec3 col = uMapB == 1 ? g * vec3(1.0, 0.9, 0.74) : (uMapB == 2 ? g * vec3(0.78, 0.9, 1.0) : vec3(g));
  float u = (gl_FragCoord.x / uRes.x - 0.5) * uW;
  float w = (gl_FragCoord.y / uRes.y) * uD;
  vec4 t1 = texelFetch(uT1, p, 0);
  int lab = int(floor(t1.z + 0.01));
  int tis = lab - 32 * (lab / 32);
  int sidx = lab / 32 - 1;
  if (uMode > 0) {
    float us = u - (w - uBox.y) * uSteer;
    if (us >= uBox.x && us <= uBox.z && w >= uBox.y && w <= uBox.w) {
      // estimación de la velocidad media en la celda de color (autocorrelación ~ media ponderada)
      float sv = 0.0, sb = 0.0, st = 0.0;
      for (int j = -3; j <= 3; j++)
      for (int i = -1; i <= 1; i++) {
        ivec2 q = clamp(p + ivec2(i * 2, j * 2), ivec2(0), ivec2(uRes) - 1);
        vec4 s = texelFetch(uT1, q, 0);
        float bw = mod(s.y, 10.0);
        float tb = floor(s.y / 10.0) / 100.0;
        sv += s.x;
        sb += bw;
        st += tb * bw;
      }
      float nS = 21.0;
      float power = sb / nS;
      float turb = sb > 1e-3 ? st / sb : 0.0;
      float v = sb > 1e-3 ? sv / sb : 0.0;
      // celdas de color (resolución de color más gruesa) y ruido de estimación variable en el tiempo
      ivec2 cell = ivec2(gl_FragCoord.xy / vec2(3.0, 5.0));
      float fr = floor(uTime * 22.0);
      vec2 nz = gauss2(vec2(cell) + 0.5, 11.0 + mod(fr, 997.0));
      vec2 nz2 = gauss2(vec2(cell) + 17.5, 29.0 + mod(fr, 991.0));
      float sens = mix(0.08, 0.95, uCGain);
      float thr = 0.5 * (1.0 - sens);
      bool detect = power > thr;
      // ruido de color en el tejido con ganancia excesiva
      bool noiseCol = uCGain > 0.82 && nz2.x > 2.6 - (uCGain - 0.82) * 9.0 && g < 0.6;
      // ruido del estimador de autocorrelación: proporcional a la anchura espectral (turbulencia)
      float tEff = max(turb - 0.08, 0.0);
      v += nz.x * (0.015 * uVn + 0.06 * abs(v) + tEff * 1.2 * uVn);
      if (noiseCol) { v = nz.y * uVn * 0.7; detect = true; power = 0.4; }
      bool pass = detect && abs(v) > uWallF && g < uPriority + 0.2 * (1.0 - power);
      if (pass) {
        if (uMode == 1) {
          float vn = v / uVn + uBaseline;
          vn = mod(vn + 1.0, 2.0) - 1.0;
          vn -= uBaseline;
          if (uInvert > 0.5) vn = -vn;
          vec3 cc = bart(clamp(vn / (1.0 - abs(uBaseline) * 0.0), -1.0, 1.0));
          // mosaico de turbulencia (mapa de varianza)
          cc = mix(cc, vec3(0.2, 0.95, 0.35), clamp(tEff * 0.8, 0.0, 0.35) * step(0.45, fract(sin(dot(vec2(cell), vec2(12.9, 78.2)) + fr) * 43758.5)));
          col = cc;
        } else {
          float pw = clamp(0.35 + 0.65 * power + 0.1 * nz.y, 0.0, 1.0);
          col = mix(vec3(0.35, 0.02, 0.0), vec3(1.0, 0.85, 0.35), pw);
        }
      }
    }
  }
  if (uFusion > 0.0 && tis >= 0 && tis < ${TISSUES.length}) {
    vec3 pc = PAL[tis];
    float a = uFusion * (tis == 3 || tis == 5 ? 0.35 : 0.6);
    if (tis == 0 || tis == 1) a = 0.0;
    col = mix(col, pc, a);
  }
  if (uHighlight >= 0 && sidx == uHighlight) col = mix(col, vec3(0.2, 1.0, 0.6), 0.35);
  o0 = vec4(col, 1.0);
}
`;

// -------------------------------------------------------------------------------------------------
// H. Sección anatómica real
// -------------------------------------------------------------------------------------------------
export const ANATOMY_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
layout(location = 0) out vec4 o0;
uniform sampler2D uT1;
uniform vec2 uRes;
uniform int uHighlight;
${NOISE}
const vec3 PAL[${TISSUES.length}] = vec3[${TISSUES.length}](${palette});
int tisAt(ivec2 q) {
  float l = texelFetch(uT1, clamp(q, ivec2(0), ivec2(uRes) - 1), 0).z;
  int lab = int(floor(l + 0.01));
  return lab - 32 * (lab / 32);
}
int sAt(ivec2 q) {
  float l = texelFetch(uT1, clamp(q, ivec2(0), ivec2(uRes) - 1), 0).z;
  return int(floor(l + 0.01)) / 32 - 1;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int t = tisAt(p);
  int s = sAt(p);
  vec3 c = PAL[clamp(t, 0, ${TISSUES.length - 1})];
  // textura sutil según tejido
  float n = vnoise(vec3(vec2(p) * vec2(0.25, 0.1), 3.0));
  if (t == 5) c *= 0.85 + 0.3 * vnoise(vec3(vec2(p) * vec2(0.6, 0.08), 1.0));
  else if (t == 3) c *= 0.93 + 0.12 * n;
  else c *= 0.95 + 0.08 * n;
  // contornos entre estructuras
  int tr = tisAt(p + ivec2(1, 0));
  int td = tisAt(p + ivec2(0, 1));
  int sr = sAt(p + ivec2(1, 0));
  int sd = sAt(p + ivec2(0, 1));
  if (tr != t || td != t || sr != s || sd != s) c *= 0.55;
  if (uHighlight >= 0 && s == uHighlight) c = mix(c, vec3(0.2, 1.0, 0.6), 0.4);
  o0 = vec4(c, 1.0);
}
`;
