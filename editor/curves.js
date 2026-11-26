// Linework's bounded Hermite centerline, pressure interpolation and solid ink profiles.
const curveDistance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const curveClamp = (v, min, max) => Math.min(max, Math.max(min, v));
const curveGeometry = new WeakMap();

function inkNoise(distance, seed) {
  function at(cell) {
    let n = (cell + seed + 0x9e3779b9) | 0;
    n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff * 2 - 1;
  }
  const cell = Math.floor(distance), t = distance - cell;
  return at(cell) + (at(cell + 1) - at(cell)) * t * t * (3 - 2 * t);
}

function inkGeometry(stroke) {
  if (curveGeometry.has(stroke)) return curveGeometry.get(stroke);
  const {points, width, preset} = stroke;
  const samples = [{...points[0], distance:0, segment:0}];
  function tangent(a, b, c, key) {
    const left = curveDistance(a,b), right = curveDistance(b,c);
    if (Math.min(left,right) < .0001) return (c[key]-a[key]) / 2;
    return ((b[key]-a[key])/left + (c[key]-b[key])/right) * Math.min(left,right) / 2;
  }
  const slope = (a,b) => (b.pressure-a.pressure) / Math.max(.001,curveDistance(a,b));
  const blend = (a,b) => a*b <= 0 ? 0 : 2*a*b/(a+b);
  for (let i = 0; i + 1 < points.length; i++) {
    const b = points[i], c = points[i+1], a = points[i-1] || b, d = points[i+2] || c;
    const span = curveDistance(b,c), rate = slope(b,c);
    const steps = curveClamp(Math.ceil(span/.75), 8, 2048);
    const start = {x:tangent(a,b,c,'x'), y:tangent(a,b,c,'y'), pressure:span*(a===b ? rate : blend(slope(a,b),rate))};
    const end = {x:tangent(b,c,d,'x'), y:tangent(b,c,d,'y'), pressure:span*(c===d ? rate : blend(rate,slope(c,d)))};
    for (let n = 1; n <= steps; n++) {
      const t = n/steps, t2 = t*t, t3 = t2*t;
      const hermite = key => (2*t3-3*t2+1)*b[key] + (t3-2*t2+t)*start[key]
        + (3*t2-2*t3)*c[key] + (t3-t2)*end[key];
      const p = {x:hermite('x'), y:hermite('y'), pressure:hermite('pressure'), segment:i};
      const last = samples[samples.length-1], length = curveDistance(last,p);
      if (length < .0001) { last.pressure = p.pressure; continue; }
      p.distance = last.distance + length;
      samples.push(p);
    }
  }
  const hand = preset === 'hand', scale = curveClamp(width*1.6,9,60);
  const total = samples[samples.length-1].distance;
  const path = new Path2D(), right = [];
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i], dist = p.distance;
    const variation = hand ? 1 + .25*inkNoise(dist/scale,71) + .055*inkNoise(dist/(scale*.35),179) : 1;
    const radius = width * Math.max(0,p.pressure) * variation / 2;
    if (samples.length === 1) { path.arc(p.x,p.y,radius,0,2*Math.PI); break; }
    const before = samples[i-1] || p, after = samples[i+1] || p;
    const angle = Math.atan2(after.y-before.y, after.x-before.x) + Math.PI/2;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const fade = Math.min(1,dist/(width*2))*Math.min(1,(total-dist)/(width*2));
    const drift = hand ? radius*fade*.055*inkNoise(dist/curveClamp(width*1.2,8,45),137) : 0;
    const x = p.x+dx*(radius+drift), y = p.y+dy*(radius+drift);
    if (!i) path.moveTo(x,y); else path.lineTo(x,y);
    right.push({x:p.x-dx*(radius-drift), y:p.y-dy*(radius-drift)});
    if (i === samples.length-1) {
      path.arc(p.x,p.y,radius,angle,angle-Math.PI,true);
      for (let j=right.length-1; j>=0; j--) path.lineTo(right[j].x,right[j].y);
      const first = samples[0], next = samples[1];
      const back = Math.atan2(next.y-first.y,next.x-first.x)-Math.PI/2;
      const firstRadius = curveDistance(first,right[0]);
      path.arc(first.x,first.y,firstRadius,back,back-Math.PI,true);
    }
  }
  path.closePath();
  const geometry = {path,samples};
  curveGeometry.set(stroke,geometry);
  return geometry;
}

function curveHit(entries, pos, radius, segments, eligible) {
  let best = null, limit = radius;
  for (let i = entries.length-1; i >= 0; i--) {
    const stroke = entries[i];
    if (!stroke.points || !eligible(stroke)) continue;
    const list = segments ? inkGeometry(stroke).samples : stroke.points;
    for (let j = segments && list.length > 1 ? 1 : 0; j < list.length; j++) {
      const b = list[j], a = segments && j ? list[j-1] : b;
      const x = b.x-a.x, y = b.y-a.y, len = x*x+y*y;
      const t = len ? curveClamp(((pos.x-a.x)*x+(pos.y-a.y)*y)/len,0,1) : 0;
      const point = {x:a.x+t*x,y:a.y+t*y,pressure:a.pressure+t*(b.pressure-a.pressure)};
      const dist = curveDistance(point,pos);
      if (dist < limit) { best = {i, j:segments ? b.segment : j, point}; limit = dist; }
    }
  }
  return best;
}
