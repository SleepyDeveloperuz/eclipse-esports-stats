// Separate same-origin worker: no blob workers, unsafe-eval or remote conversion.
import buildLibheif from '../vendor/heic-to-1.5.2/libheif.js';

self.onmessage = async ({ data: buffer }) => {
  let lib, decoder, images;
  try {
    lib = buildLibheif();
    decoder = new lib.HeifDecoder();
    images = decoder.decode(buffer);
    if (!images.length) throw new Error('HEIC rasmni o‘qib bo‘lmadi. JPEG nusxasini yuboring.');
    const image = images[0], width = image.get_width(), height = image.get_height();
    if (!width || !height || width * height > 24000000) throw new Error('HEIC o‘lchami juda katta (24 megapikselgacha).');
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
    const decoded = await new Promise((resolve, reject) => image.display({ data: rgba, width, height }, result => result ? resolve(result) : reject(new Error('HEIC dekodlash bajarilmadi.'))));
    self.postMessage({ width, height, pixels: decoded.data.buffer }, [decoded.data.buffer]);
  } catch (error) {
    self.postMessage({ error: error.message || 'HEIC ochilmadi. JPEG nusxasini yuboring.' });
  } finally {
    images?.forEach(image => image.free());
    if (decoder?.decoder) lib.heif_context_free(decoder.decoder);
  }
};
