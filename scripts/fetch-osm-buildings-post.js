const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');

const CITIES = [
  { id: 'city-delhi', name: 'Delhi', lat: 28.6139, lon: 77.2090 },
  { id: 'city-mumbai', name: 'Mumbai', lat: 18.9220, lon: 72.8347 },
  { id: 'city-bengaluru', name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  { id: 'city-chennai', name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { id: 'city-kolkata', name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { id: 'city-pune', name: 'Pune', lat: 18.5204, lon: 73.8567 },
  { id: 'city-surat', name: 'Surat', lat: 21.1702, lon: 72.8311 },
  { id: 'city-bhopal', name: 'Bhopal', lat: 23.2599, lon: 77.4126 },
  { id: 'city-indore', name: 'Indore', lat: 22.7196, lon: 75.8577 },
];

function fetchCityPost(city) {
  const delta = 0.008; // ~800m around city center
  const s = (city.lat - delta).toFixed(4);
  const w = (city.lon - delta).toFixed(4);
  const n = (city.lat + delta).toFixed(4);
  const e = (city.lon + delta).toFixed(4);

  const query = `[out:json][timeout:30];way["building"](${s},${w},${n},${e});out tags geom 60;`;
  const postData = querystring.stringify({ data: query });

  return new Promise((resolve) => {
    const req = https.request('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'VAJRA-Omega/1.0 (https://github.com/Deepak-CodeX/VAJRA-Omega)',
        'Accept': 'application/json',
      },
    }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          const count = j.elements ? j.elements.length : 0;
          console.log(`[OSM Overpass POST] ${city.name} (${city.id}): ${res.statusCode} — ${count} real buildings fetched`);
          resolve(j.elements || []);
        } catch (err) {
          console.warn(`[OSM Overpass POST] ${city.name} parse error (${res.statusCode}): ${b.slice(0, 150)}`);
          resolve([]);
        }
      });
    });

    req.on('error', (err) => {
      console.warn(`[OSM Overpass POST] ${city.name} network error: ${err.message}`);
      resolve([]);
    });

    req.write(postData);
    req.end();
  });
}

async function run() {
  const output = {};
  for (const city of CITIES) {
    const elements = await fetchCityPost(city);
    output[city.id] = elements;
    await new Promise(r => setTimeout(r, 2000)); // Respect Overpass rate limits
  }

  const outDir = path.join(process.cwd(), 'src', 'data', 'geo');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, 'realOsmBuildings.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Successfully saved real OSM footprints to ${outPath}`);
}

run();
