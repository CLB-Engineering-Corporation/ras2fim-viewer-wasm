export function setGeometries(features, c, s) {
  const T = [, 'Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'];
  let i = 0, j = 0;
  const list = () => {
    const d = s[i++], n = s[i++], a = new Array(n);
    for (let k = 0; k < n; k++, j += d) a[k] = d === 3 ? [c[j], c[j + 1], c[j + 2]] : [c[j], c[j + 1]];
    return a;
  };
  const many = (f) => {
    const n = s[i++], a = new Array(n);
    for (let k = 0; k < n; k++) a[k] = f();
    return a;
  };
  const polygon = () => many(list);
  const geometry = () => {
    const t = s[i++];
    switch (t) {
      case 1: return { type: T[t], coordinates: list()[0] };
      case 2: case 4: return { type: T[t], coordinates: list() };
      case 3: case 5: return { type: T[t], coordinates: many(list) };
      case 6: return { type: T[t], coordinates: many(polygon) };
      default: return { type: T[t], geometries: many(geometry) };
    }
  };
  for (let f = 0; f < features.length; f++) {
    if (s[i] === 0) i++;
    else features[f].geometry = geometry();
  }
}