//image convolution
Filters = {};

Filters.getPixels = function(img) {
  var c,ctx;
  if (img.getContext) {
    c = img;
    try { ctx = c.getContext('2d'); } catch(e) {}
  }
  if (!ctx) {
    c = this.getCanvas(img.width, img.height);
    ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
  }
  return ctx.getImageData(0,0,c.width,c.height);
};

Filters.getCanvas = function(w,h) {
  var c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

Filters.filterImage = function(filter, image, var_args) {
  var args = [this.getPixels(image)];
  for (var i=2; i<arguments.length; i++) {
    args.push(arguments[i]);
  }
  return filter.apply(null, args);
};

Filters.grayscale = function(pixels, args) {
  var d = pixels.data;
  for (var i=0; i<d.length; i+=4) {
    var r = d[i];
    var g = d[i+1];
    var b = d[i+2];
    // CIE luminance for the RGB
    // The human eye is bad at seeing red and blue, so we de-emphasize them.
    var v = 0.2126*r + 0.7152*g + 0.0722*b;
    d[i] = d[i+1] = d[i+2] = v
  }
  return pixels;
};

Filters.brightness = function(pixels, adjustment) {
  var d = pixels.data;
  for (var i=0; i<d.length; i+=4) {
    d[i] += adjustment;
    d[i+1] += adjustment;
    d[i+2] += adjustment;
  }
  return pixels;
};

Filters.brightnesscontrast = function(pixels, factor, bias) {
  var d = pixels.data;
  for (var i=0; i<d.length; i+=4) {
    d[i] = Math.min(Math.max(Math.floor(factor * d[i] + bias),0),255);
    d[i+1] = Math.min(Math.max(Math.floor(factor * d[i+1] + bias),0),255);
    d[i+2] = Math.min(Math.max(Math.floor(factor * d[i+2] + bias),0),255);
  }
  return pixels;
};

Filters.threshold = function(pixels, threshold) {
  var d = pixels.data;
  for (var i=0; i<d.length; i+=4) {
    var r = d[i];
    var g = d[i+1];
    var b = d[i+2];
    var v = (0.2126*r + 0.7152*g + 0.0722*b >= threshold) ? 255 : 0;
    d[i] = d[i+1] = d[i+2] = v
  }
  return pixels;
};

Filters.invert = function(pixels) {
  var d = pixels.data;
  for (var i=0; i<d.length; i+=4) {
    d[i] = 255 - d[i];
    d[i+1] = 255 - d[i+1];
    d[i+2] = 255 - d[i+2];
  }
  return pixels;
};

Filters.doFilters = function(pixels, f) {
  var d = pixels.data;
  var n;
  for (var i=0; i<d.length; i+=4) {

    if (f.inverse) {
      d[i] = 255 - d[i];
      d[i+1] = 255 - d[i+1];
      d[i+2] = 255 - d[i+2];
    }
  
    n = d[i] * f.R * f.contrast;
    n = 255 * Math.pow(n / 255, 1 / f.gamma);
    d[i] = 255 * (n/255 + f.bright);

    n = d[i+1] * f.G * f.contrast;
    n = 255 * Math.pow(n / 255, 1 / f.gamma);
    d[i+1] = 255 * (n/255 + f.bright);

    n = d[i+2] * f.B * f.contrast;
    n = 255 * Math.pow(n / 255, 1 / f.gamma);
    d[i+2] = 255 * (n/255 + f.bright);

  }
  return pixels;
};

Filters.grayscalechannel = function(pixels, args) {
  if (args=='') return pixels;
  var d = pixels.data;
  var off;
  if (args=='R') off = 0;
  if (args=='G') off = 1;
  if (args=='B') off = 2;

  for (var i=0; i<d.length; i+=4) {
    var v = d[i+off];
    d[i] = d[i+1] = d[i+2] = v;
  }
  return pixels;
};

Filters.emboss = function(pixels, args) {
  if (args=='') return pixels;
  /*
  // sharp
  return Filters.convolute(pixels,
  [  0, -1,  0,
    -1,  5, -1,
     0, -1,  0 ], false, 1, 0);

  // Gaussian Blur
  return Filters.convolute(pixels,
  [   1,  2,  1,
      2,  4, 2,
      1,  2, 1 ], false, 1/16.0, 0);
*/
  if (args=='N')
  return Filters.convoluteY(pixels,
  [  -1, -1,  0,
     -1,  0,  1,
      0,  1,  1 ], true, 1, 128);
	  else
  return Filters.convoluteY(pixels,
  [   1,  1,  0,
      1,  0, -1,
      0, -1, -1 ], true, 1, 128);
};

Filters.tmpCanvas = document.createElement('canvas');
Filters.tmpCtx = Filters.tmpCanvas.getContext('2d');

Filters.createImageData = function(w,h) {
  return this.tmpCtx.createImageData(w,h);
};

Filters.convolute = function(pixels, weights, opaque, factor, bias) {
  var side = Math.round(Math.sqrt(weights.length));
  var halfSide = Math.floor(side/2);
  var src = pixels.data;
  var sw = pixels.width;
  var sh = pixels.height;
  // pad output by the convolution matrix
  var w = sw;
  var h = sh;
  var output = Filters.createImageData(w, h);
  var dst = output.data;
  // go through the destination image pixels
  var alphaFac = opaque ? 1 : 0;
  for (var y=0; y<h; y++) {
    for (var x=0; x<w; x++) {
      var sy = y;
      var sx = x;
      var dstOff = (y*w+x)*4;
      // calculate the weighed sum of the source image pixels that
      // fall under the convolution matrix
      var r=0, g=0, b=0, a=0;
      for (var cy=0; cy<side; cy++) {
        for (var cx=0; cx<side; cx++) {
          var scy = (sy + cy - halfSide) % h;
          var scx = (sx + cx - halfSide) % w;
//          if (scy >= 0 && scy < sh && scx >= 0 && scx < sw)
		  {
            var srcOff = (scy*sw+scx)*4;
            var wt = weights[cy*side+cx];
            r += src[srcOff] * wt;
            g += src[srcOff+1] * wt;
            b += src[srcOff+2] * wt;
            a += src[srcOff+3] * wt;
          }
        }
      }
      dst[dstOff] = Math.min(Math.max(factor * r + bias,0),255);
      dst[dstOff+1] = Math.min(Math.max(factor * g + bias,0),255);
      dst[dstOff+2] = Math.min(Math.max(factor * b + bias,0),255);
      dst[dstOff+3] = a + alphaFac*(255-a);
    }
  }
  return output;
};

Filters.toYUV = function(pixels) {
  var d = pixels.data;
  for (var i=0; i<d.length; i+=4) {
    var R = d[i];
    var G = d[i+1];
    var B = d[i+2];
    var Y = 0.299 * R + 0.587 * G + 0.114 * B;
    var U = 0.492 * (B - Y);
    var V = 0.877 * (R - Y);
	d[i] = Y;
	d[i+1] = U;
	d[i+2] = V;
  }
  return pixels;
};

Filters.convoluteY = function(pixels, weights, opaque, factor, bias) {
  var side = Math.round(Math.sqrt(weights.length));
  var halfSide = Math.floor(side/2);
  var src = Filters.toYUV(pixels).data;
  var sw = pixels.width;
  var sh = pixels.height;
  // pad output by the convolution matrix
  var w = sw;
  var h = sh;
  var output = Filters.createImageData(w, h);
  var dst = output.data;
  var Y,U,V;
  // go through the destination image pixels
  var alphaFac = opaque ? 1 : 0;
  for (var y=0; y<h; y++) {
    for (var x=0; x<w; x++) {
      var sy = y;
      var sx = x;
      var dstOff = (y*w+x)*4;
      // calculate the weighed sum of the source image pixels that
      // fall under the convolution matrix
      var Y=0;
      for (var cy=0; cy<side; cy++) {
        for (var cx=0; cx<side; cx++) {
          var scy = (y + cy - halfSide) % h;
          var scx = (x + cx - halfSide) % w;
//          if (scy >= 0 && scy < sh && scx >= 0 && scx < sw)
		  {
            var srcOff = (scy*sw+scx)*4;
            var wt = weights[cy*side+cx];
            Y += src[srcOff] * wt;
          }
        }
      }
      U = src[srcOff+1];
      V = src[srcOff+2];
r = Y + 1.13983*V;
g = Y - 0.39465*U - 0.5806*V;
b = Y + 2.03211*U;
      dst[dstOff] = Math.min(Math.max(factor * r + bias,0),255);
      dst[dstOff+1] = Math.min(Math.max(factor * g + bias,0),255);
      dst[dstOff+2] = Math.min(Math.max(factor * b + bias,0),255);
      dst[dstOff+3] = src[srcOff+3];
    }
  }
  return output;
};
