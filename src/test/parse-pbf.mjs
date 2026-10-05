import https from 'node:https';
import zlib from 'node:zlib';

const tileUrl = 'https://tiles.openfreemap.org/planet/20260927_080001_pt/14/11705/6831.pbf';

https.get(tileUrl, (res) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => {
    zlib.gunzip(Buffer.concat(chunks), (err, buf) => {
      if (err) throw err;
      
      // Basic PBF protobuf parser for vector tile layers
      let pos = 0;
      while (pos < buf.length) {
        const tag = buf[pos++];
        const field = tag >> 3;
        const type = tag & 0x07;
        
        if (field === 3 && type === 2) { // Layer
          let len = 0, shift = 0;
          while (true) {
            const b = buf[pos++];
            len |= (b & 0x7f) << shift;
            if (!(b & 0x80)) break;
            shift += 7;
          }
          const end = pos + len;
          let layerName = '';
          const keys = [];
          const values = [];
          let featureCount = 0;
          
          while (pos < end) {
            const ltag = buf[pos++];
            const lfield = ltag >> 3;
            const ltype = ltag & 0x07;
            
            if (lfield === 1 && ltype === 2) { // name
              let slen = buf[pos++];
              layerName = buf.toString('utf8', pos, pos + slen);
              pos += slen;
            } else if (lfield === 3 && ltype === 2) { // keys
              let slen = buf[pos++];
              keys.push(buf.toString('utf8', pos, pos + slen));
              pos += slen;
            } else if (lfield === 4 && ltype === 2) { // values
              let vlen = buf[pos++];
              const vend = pos + vlen;
              let val = null;
              while (pos < vend) {
                const vtag = buf[pos++];
                const vfield = vtag >> 3;
                if (vfield === 1) { // string_value
                  let slen = buf[pos++];
                  val = buf.toString('utf8', pos, pos + slen);
                  pos += slen;
                } else if (vfield === 2) { // float_value
                  val = buf.readFloatLE(pos);
                  pos += 4;
                } else if (vfield === 3) { // double_value
                  val = buf.readDoubleLE(pos);
                  pos += 8;
                } else if (vfield === 4) { // int_value
                  let iv = 0, ishift = 0;
                  while (true) {
                    const b = buf[pos++];
                    iv |= (b & 0x7f) << ishift;
                    if (!(b & 0x80)) break;
                    ishift += 7;
                  }
                  val = iv;
                } else if (vfield === 5) { // uint_value
                  let uv = 0, ushift = 0;
                  while (true) {
                    const b = buf[pos++];
                    uv |= (b & 0x7f) << ushift;
                    if (!(b & 0x80)) break;
                    ushift += 7;
                  }
                  val = uv;
                } else {
                  pos++;
                }
              }
              values.push(val);
            } else if (lfield === 2 && ltype === 2) { // features
              featureCount++;
              let flen = 0, fshift = 0;
              while (true) {
                const b = buf[pos++];
                flen |= (b & 0x7f) << fshift;
                if (!(b & 0x80)) break;
                fshift += 7;
              }
              pos += flen;
            } else {
              // skip unknown
              pos++;
            }
          }
          
          if (layerName === 'building') {
            console.log('Layer "building" details:');
            console.log('  Total features in this single tile:', featureCount);
            console.log('  Keys:', keys);
            console.log('  Sample values:', values.slice(0, 15));
          }
        } else {
          pos++;
        }
      }
    });
  });
});
