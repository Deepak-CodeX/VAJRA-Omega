import https from 'https';
import fs from 'fs';
import path from 'path';

interface CityTarget {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

const CITIES: CityTarget[] = [
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

async function fetchCityBuildings(city: CityTarget): Promise<any[]> {
  const delta = 0.009; // ~1km bounding box
  const s = (city.lat - delta).toFixed(4);
  const w = (city.lon - delta).toFixed(4);
  const n = (city.lat + delta).toFixed(4);
  const e = (city.lon + delta).toFixed(4);

  const query = `[out:json][timeout:25];way["building"](${s},${w},${n},${e});out tags geom 50;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'VAJRA-Omega-CityTwin/1.0' } }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const count = json.elements ? json.elements.length : 0;
          console.log(`[OSM] ${city.name}: ${res.statusCode} — ${count} real buildings fetched`);
          resolve(json.elements || []);
        } catch (err: any) {
          console.warn(`[OSM] ${city.name} parse error: ${err.message}`);
          resolve([]);
        }
      });
    }).on('error', (err) => {
      console.warn(`[OSM] ${city.name} request error: ${err.message}`);
      resolve([]);
    });
  });
}

async function run() {
  const output: Record<string, any[]> = {};
  for (const city of CITIES) {
    const elements = await fetchCityBuildings(city);
    output[city.id] = elements;
    await new Promise(r => setTimeout(r, 1200)); // Respect OSM rate limits
  }

  const outDir = path.join(process.cwd(), 'src', 'data', 'geo');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, 'realOsmBuildings.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Saved genuine OSM footprints to ${outPath}`);
}

run();
