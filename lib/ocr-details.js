import jpeg from 'jpeg-js';

// Supplementary medal strips retain image order and row order. Originals remain
// the evidence; this helper does not recognize players, rows, or medals.
export function buildMedalDetail(imageParts = []) {
  if (!imageParts.length || imageParts.length > 2) return null;
  const width = imageParts.length * 272, height = 1000;
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = 7; data[i + 1] = 20; data[i + 2] = 38; data[i + 3] = 255; }
  try {
    for (const [index, part] of imageParts.entries()) {
      if (part?.inline_data?.mime_type !== 'image/jpeg') return null;
      const bytes = Buffer.from(part.inline_data.data, 'base64');
      if (bytes.length > 3 * 1024 * 1024) return null;
      const decoded = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 12, maxMemoryUsageInMB: 96 });
      const aspect = decoded.width / decoded.height;
      if (aspect < 1.65 || aspect > 2.65 || decoded.width < 240 || decoded.height < 100) return null;
      const region = { x: decoded.width * .415, y: decoded.height * .18, width: decoded.width * .080, height: decoded.height * .70 };
      const scale = Math.min(256 / region.width, height / region.height);
      for (let y = 0; y < Math.floor(region.height * scale); y++) {
        for (let x = 0; x < Math.floor(region.width * scale); x++) {
          const src = (Math.floor(region.y + y / scale) * decoded.width + Math.floor(region.x + x / scale)) * 4;
          const dst = (y * width + index * 272 + 8 + x) * 4;
          data[dst] = decoded.data[src]; data[dst + 1] = decoded.data[src + 1]; data[dst + 2] = decoded.data[src + 2];
        }
      }
    }
    const encoded = jpeg.encode({ data, width, height }, 88).data;
    return encoded.length <= 450000 ? { inline_data: { mime_type: 'image/jpeg', data: encoded.toString('base64') } } : null;
  } catch { return null; }
}
