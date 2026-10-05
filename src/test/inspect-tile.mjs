import https from 'node:https';
import zlib from 'node:zlib';

// Delhi center tile: z=14, x=11705, y=6831
const tileUrl = 'https://tiles.openfreemap.org/planet/20260927_080001_pt/14/11705/6831.pbf';

https.get(tileUrl, (res) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => {
    const rawBuffer = Buffer.concat(chunks);
    zlib.gunzip(rawBuffer, (err, unzipped) => {
      const buf = err ? rawBuffer : unzipped;
      console.log('Unzipped tile size:', buf.length, 'bytes');

      // Simple string scanner to inspect keys and values in protobuf
      const str = buf.toString('latin1');
      const buildingIdx = str.indexOf('building');
      console.log('Contains "building" layer:', buildingIdx !== -1);
      
      const properties = [
        'render_height',
        'render_min_height',
        'colour',
        'hide_3d',
        'levels',
        'height',
        'amenity',
        'name'
      ];
      properties.forEach(p => {
        console.log(`Property key "${p}" present:`, str.includes(p));
      });
    });
  });
}).on('error', console.error);
