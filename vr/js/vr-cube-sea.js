// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/* global mat4, WGLUProgram */

window.VRGradientExperiment = (function () {
  "use strict";

  var GradientExperimentVS = [
    "uniform mat4 projectionMat;",
    "uniform mat4 modelViewMat;",
    "uniform mat3 normalMat;",
    "attribute vec3 position;",
    "attribute vec2 texCoord;",
    "attribute vec3 normal;",
    "varying vec2 vTexCoord;",
    "varying vec3 vLight;",

    "const vec3 lightDir = vec3(0.75, 0.5, 1.0);",
    "const vec3 ambientColor = vec3(0.5, 0.5, 0.5);",
    "const vec3 lightColor = vec3(0.75, 0.75, 0.75);",

    "void main() {",
    "  vec3 normalRotated = normalMat * normal;",
    "  float lightFactor = max(dot(normalize(lightDir), normalRotated), 0.0);",
    "  vLight = ambientColor + (lightColor * lightFactor);",
    "  vTexCoord = texCoord;",
    "  gl_Position = projectionMat * modelViewMat * vec4( position, 1.0 );",
    "}",
  ].join("\n");

  var GradientExperimentFS = [
    "precision highp float;",
    "uniform sampler2D gradientHi;",
    "uniform sampler2D gradientLo;",
    "uniform float flickerCounter;",
    "varying vec2 vTexCoord;",
    "varying vec3 vLight;",
    
    "const float hw_bitdepth = 256.0; /* For 8-bit display */",
    
    "float rand(float n){return fract(sin(n) * 43758.5453123);}",

    "float rand(vec2 n) {", 
    " return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);",
    "}",

    "float noise(float p){ float fl = floor(p); float fc = fract(p); return mix(rand(fl), rand(fl + 1.0), fc);}",
  
    "float noise(vec2 n) {",
    " const vec2 d = vec2(0.0, 1.0);",
    " vec2 b = floor(n), f = smoothstep(vec2(0.0), vec2(1.0), fract(n));",
    " return mix(mix(rand(b), rand(b + d.yx), f.x), mix(rand(b + d.xy), rand(b + d.yy), f.x), f.y);",
    "}",
    
    "void main() {",
    "vec4 texHi = texture2D(gradientHi, vTexCoord);",
    "vec4 texLo = texture2D(gradientLo, vTexCoord);",
    "vec2 noice = vec2(noise(gl_FragCoord.xy), noise(gl_FragCoord.yx));",
    "highp vec4 lum = texHi;",
    
    "lum += texLo/hw_bitdepth;", //now we need to dither
    "float pattern_bit_x = mod(vTexCoord.x*512.0, 2.0);",
    "float pattern_bit_y = mod(vTexCoord.y*512.0 ,2.0);",
    "float spatial_dither = mod((pattern_bit_x + pattern_bit_y), 2.0);",
    " /*The lowest bit used for temporal dithering */",
    
    "float bit_h = mod(floor(lum.g*hw_bitdepth*2.0),2.0);", //the 9th bit
    "float bit_l = mod(floor(lum.g*hw_bitdepth*4.0),2.0);", //the 10th bit
    "lum = floor(lum*hw_bitdepth)/hw_bitdepth;", //round output to max of the HW
    "//lum += bit_h*((noice.x+noice.y)-0.5)/256.0;", //apply noise to the last bit
    "//lum += bit_l*(1.0/hw_bitdepth)*mod(flickerCounter,2.0);",
    "float full_bit = mod(flickerCounter,2.0) * bit_h * bit_l;",
    "float half_bit =  ceil((mod(flickerCounter + 1.0,2.0) * bit_h) + (mod(flickerCounter,2.0) * mod(bit_h + bit_l, 2.0) ) / 2.0);",
    "lum.xyz += full_bit/hw_bitdepth + noice.x/hw_bitdepth * half_bit;",
    "gl_FragColor = lum;",
    "}",
  ].join("\n");

  // Used when we want to stress the GPU a bit more.
  // Stolen with love from https://www.clicktorelease.com/code/codevember-2016/4/
  var heavyGradientExperimentFS = [
    "precision mediump float;",

    "uniform sampler2D diffuse;",
    "varying vec2 vTexCoord;",
    "varying vec3 vLight;",

    "vec2 dimensions = vec2(64, 64);",
    "float seed = 0.42;",

    "vec2 hash( vec2 p ) {",
    "  p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));",
    "  return fract(sin(p)*18.5453);",
    "}",

    "vec3 hash3( vec2 p ) {",
    "    vec3 q = vec3( dot(p,vec2(127.1,311.7)),",
    "           dot(p,vec2(269.5,183.3)),",
    "           dot(p,vec2(419.2,371.9)) );",
    "  return fract(sin(q)*43758.5453);",
    "}",

    "float iqnoise( in vec2 x, float u, float v ) {",
    "  vec2 p = floor(x);",
    "  vec2 f = fract(x);",
    "  float k = 1.0+63.0*pow(1.0-v,4.0);",
    "  float va = 0.0;",
    "  float wt = 0.0;",
    "  for( int j=-2; j<=2; j++ )",
    "    for( int i=-2; i<=2; i++ ) {",
    "      vec2 g = vec2( float(i),float(j) );",
    "      vec3 o = hash3( p + g )*vec3(u,u,1.0);",
    "      vec2 r = g - f + o.xy;",
    "      float d = dot(r,r);",
    "      float ww = pow( 1.0-smoothstep(0.0,1.414,sqrt(d)), k );",
    "      va += o.z*ww;",
    "      wt += ww;",
    "    }",
    "  return va/wt;",
    "}",

    "// return distance, and cell id",
    "vec2 voronoi( in vec2 x ) {",
    "  vec2 n = floor( x );",
    "  vec2 f = fract( x );",
    "  vec3 m = vec3( 8.0 );",
    "  for( int j=-1; j<=1; j++ )",
    "    for( int i=-1; i<=1; i++ ) {",
    "      vec2  g = vec2( float(i), float(j) );",
    "      vec2  o = hash( n + g );",
    "      vec2  r = g - f + (0.5+0.5*sin(seed+6.2831*o));",
    "      float d = dot( r, r );",
    "      if( d<m.x )",
    "        m = vec3( d, o );",
    "    }",
    "  return vec2( sqrt(m.x), m.y+m.z );",
    "}",

    "void main() {",
    "  vec2 uv = ( vTexCoord );",
    "  uv *= vec2( 10., 10. );",
    "  uv += seed;",
    "  vec2 p = 0.5 - 0.5*sin( 0.*vec2(1.01,1.71) );",

    "  vec2 c = voronoi( uv );",
    "  vec3 col = vec3( c.y / 2. );",

    "  float f = iqnoise( 1. * uv + c.y, p.x, p.y );",
    "  col *= 1.0 + .25 * vec3( f );",

    "  gl_FragColor = vec4(vLight, 1.0) * texture2D(diffuse, vTexCoord) * vec4( col, 1. );",
    "}"
  ].join("\n");

  var GradientExperiment = function (gl, texturePerfectHi, texturePerfectLo, textureQuantisedHi, textureQuantisedLo, wallDistance, cubeScale, heavy) {
    this.gl = gl;

    if(wallDistance){ 
      this.wallDistance = wallDistance;
    }
    else{
      this.wallDistance = 5;
    }
    this.statsMat = mat4.create();
    this.normalMat = mat3.create();
    this.heroRotationMat = mat4.create();
    this.heroModelViewMat = mat4.create();
    this.gamepadMat = mat4.create();

    this.texturePerfectHi = texturePerfectHi;
    this.texturePerfectLo = texturePerfectLo;
    this.textureQuantisedHi = textureQuantisedHi;
    this.textureQuantisedLo = textureQuantisedLo;
    this.flickerCounter = 0.0;

    this.quantisedPlane = getRandomInt(1,4); //denotes the plane that contains the quantised texture

    this.program = new WGLUProgram(gl);
    this.program.attachShaderSource(GradientExperimentVS, gl.VERTEX_SHADER);
    this.program.attachShaderSource(heavy ? heavyGradientExperimentFS :GradientExperimentFS, gl.FRAGMENT_SHADER);
    this.program.bindAttribLocation({
      position: 0,
      texCoord: 1,
      normal: 2
    });
    this.program.link();

    var cubeVerts = [];
    var cubeIndices = [];

    // Build a single cube.
    function appendPlane (x, y, z, size) {
      if (!x && !y && !z) {
        // Don't create a cube in the center.
        return;
      }

      if (!size) size = 0.2;
      if (cubeScale) size *= cubeScale;

      // Front
      var idx = cubeVerts.length / 8.0;
      cubeIndices.push(idx, idx + 1, idx + 2);
      cubeIndices.push(idx, idx + 2, idx + 3);

      cubeVerts.push(x - size, y - size, z + size, 0.0, 1.0, 0.0, 0.0, 1.0);
      cubeVerts.push(x + size, y - size, z + size, 1.0, 1.0, 0.0, 0.0, 1.0);
      cubeVerts.push(x + size, y + size, z + size, 1.0, 0.0, 0.0, 0.0, 1.0);
      cubeVerts.push(x - size, y + size, z + size, 0.0, 0.0, 0.0, 0.0, 1.0);
      return cubeIndices.length;
    }

    this.planes = []; //contains the index position of the end of the index buffer that the plane occupies 
    this.planes.push(0);
    this.planes.push(appendPlane(-1.8, 1.8, -this.wallDistance, 1.7));
    this.planes.push(appendPlane(1.8, 1.8, -this.wallDistance, 1.7));
    this.planes.push(appendPlane(-1.8, -1.8, -this.wallDistance, 1.7));
    this.planes.push(appendPlane(1.8, -1.8, -this.wallDistance, 1.7));

    this.indexCount = cubeIndices.length;
  
    this.vertBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeVerts), gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeIndices), gl.STATIC_DRAW);
  };

  var getRandomInt = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }


  GradientExperiment.prototype.render = function (projectionMat, modelViewMat, selection, flickerCounter, stats) {
    var gl = this.gl;
    var program = this.program;

    program.use();
    gl.uniformMatrix4fv(program.uniform.projectionMat, false, projectionMat);
    mat3.identity(this.normalMat);
    gl.uniformMatrix3fv(program.uniform.normalMat, false, this.normalMat);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

    gl.enableVertexAttribArray(program.attrib.position);
    gl.enableVertexAttribArray(program.attrib.texCoord);
    gl.enableVertexAttribArray(program.attrib.normal);

    gl.vertexAttribPointer(program.attrib.position, 3, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(program.attrib.texCoord, 2, gl.FLOAT, false, 32, 12);
    gl.vertexAttribPointer(program.attrib.normal, 3, gl.FLOAT, false, 32, 20);

    gl.activeTexture(gl.TEXTURE0); //texture 0 contains the perfect gradient HI
    gl.bindTexture(gl.TEXTURE_2D, this.texturePerfectHi);
    gl.activeTexture(gl.TEXTURE1); //texture 1 contains the perfect gradient Lo
    gl.bindTexture(gl.TEXTURE_2D, this.texturePerfectLo);


    gl.activeTexture(gl.TEXTURE2); //texture 2 contains the quantised gradient Lo
    gl.bindTexture(gl.TEXTURE_2D, this.textureQuantisedHi);
    gl.activeTexture(gl.TEXTURE3); //texture 3 contains the quantised gradient Hi
    gl.bindTexture(gl.TEXTURE_2D, this.textureQuantisedLo);
    //dithering
    gl.uniform1f(program.uniform.flickerCounter, flickerCounter);

    for(var i = 1; i<=4; i++){ //draw each of the four planes

      if(i == this.quantisedPlane){ //select the texture based on the plane number
        gl.uniform1i(this.program.uniform.gradientHi, 2);
        gl.uniform1i(this.program.uniform.gradientLo, 3);
      } 
      else{
        gl.uniform1i(this.program.uniform.gradientHi, 0);
        gl.uniform1i(this.program.uniform.gradientLo, 1);
      }
      if(i == selection){
        mat4.fromScaling(this.heroRotationMat, (0.5 + Math.cos(0.0)) * [1, 1, 0]);
        mat4.multiply(this.heroModelViewMat, modelViewMat, this.heroRotationMat);
        gl.uniformMatrix4fv(program.uniform.modelViewMat, false, this.heroModelViewMat);
        mat3.fromMat4(this. normalMat, this.heroRotationMat);
        gl.uniformMatrix3fv(program.uniform.normalMat, false, this.normalMat);
      }
      else{
        gl.uniformMatrix4fv(program.uniform.modelViewMat, false, modelViewMat);
      }

      gl.drawElements(gl.TRIANGLES, this.planes[i]-this.planes[i-1], gl.UNSIGNED_SHORT, this.planes[i-1]*2);
    }
    /*
    if (timestamp) {
      mat4.fromRotation(this.heroRotationMat, timestamp / 2000, [0, 1, 0]);
      mat4.multiply(this.heroModelViewMat, modelViewMat, this.heroRotationMat);
      gl.uniformMatrix4fv(program.uniform.modelViewMat, false, this.heroModelViewMat);

      // We know that the additional model matrix is a pure rotation,
      // so we can just use the non-position parts of the matrix
      // directly, this is cheaper than the transpose+inverse that
      // normalFromMat4 would do.
      mat3.fromMat4(this. normalMat, this.heroRotationMat);
      gl.uniformMatrix3fv(program.uniform.normalMat, false, this.normalMat);

      gl.drawElements(gl.TRIANGLES, this.heroCount, gl.UNSIGNED_SHORT, this.heroOffset * 2);
    }
    */

    if (stats) {
      // To ensure that the FPS counter is visible in VR mode we have to
      // render it as part of the scene.
      mat4.fromTranslation(this.statsMat, [0, -0.3, -0.5]);
      mat4.scale(this.statsMat, this.statsMat, [0.3, 0.3, 0.3]);
      mat4.rotateX(this.statsMat, this.statsMat, -0.75);
      mat4.multiply(this.statsMat, modelViewMat, this.statsMat);
      stats.render(projectionMat, this.statsMat);
    }
  };

  return GradientExperiment;
})();
