import https from 'node:https';

function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}
function lat2tile(lat, zoom) {
  return Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
}

const cities = [
  { name: 'Delhi', lat: 28.6139, lon: 77.209 },
  { name: 'Mumbai', lat: 19.076, lon: 72.8777 },
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  { name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Pune', lat: 18.5204, lon: 73.8567 },
  { name: 'Surat', lat: 21.1702, lon: 72.8311 },
  { name: 'Bhopal', lat: 23.2599, lon: 77.4126 },
  { name: 'Indore', lat: 22.7196, lon: 75.8577 },
];

const z = 14;
for (const c of cities) {
  const x = lon2tile(c.lon, z);
  const y = lat2tile(c.lat, z);
  const tileUrl = `https://tiles.openfreemap.org/planet/20260927_080001_pt/${z}/${x}/${y}.pbf`;
  https
    .get(tileUrl, (res) => {
      console.log(
        `${c.name} (z=${z}, x=${x}, y=${y}) STATUS: ${res.statusCode} Content-Length: ${res.headers['content-length']} Content-Type: ${res.headers['content-type']}`
      );
    })
    .on('error', (e) => console.error(c.name, 'ERROR:', e.message));
}
