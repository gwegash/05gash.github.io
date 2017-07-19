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
    "precision mediump float;",
    "uniform sampler2D diffuse;",
    "uniform float frameCounter;",
    "varying vec2 vTexCoord;",
    "varying vec3 vLight;",

    "void main() {",
    "gl_FragColor = texture2D(diffuse, vTexCoord);",
    "//gl_FragColor = mod(vec4(frameCounter, frameCounter, frameCounter, 1.0), vec4(2.0,2.0,2.0,1.0));",
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

  var GradientExperiment = function (gl, texturePerfect, textureQuantised, gridSize, cubeScale, heavy) {
    this.gl = gl;

    if (!gridSize) {
      gridSize = 10;
    }

    this.statsMat = mat4.create();
    this.normalMat = mat3.create();
    this.heroRotationMat = mat4.create();
    this.heroModelViewMat = mat4.create();
    this.gamepadMat = mat4.create();

    this.texturePerfect = texturePerfect;
    this.textureQuantised = textureQuantised;

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
    this.planes.push(appendPlane(-2, 2, -4, 1.8));
    this.planes.push(appendPlane(2, 2, -4, 1.8));
    this.planes.push(appendPlane(-2, -2, -4, 1.8));
    this.planes.push(appendPlane(2, -2, -4, 1.8));

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


  var isClicked = function(gamepad){
    for (var j = 0; j < gamepad.buttons.length; ++j) {
      if(gamepad.buttons[j].pressed){ 
        return true;
      }
    }
    return false;
  };

  var extractGradientSelection = function(gamepad){
    //returns the selection the thing was pointing to, if it was indeed clicked
    if(gamepad && isClicked(gamepad)){
      var orientation = mat4.create()
      getPoseMatrix(orientation, gamepad.pose, true);
      var unit = vec4.fromValues(0, 0, 1, 1);
      mat4.multiply(unit, orientation, unit);
      if(unit[0] < 0){
        //top half of the screen
        if(unit[1] < 0){
          //top left
          return 2;
        }
        else{
          return 4;
        }
      }
      else{
        //bottom half of the screen
        if(unit[1] < 0){
          return 1;
        }
        else{
          return 3;
        }
      }
    }
    else{
      return 0;
    }
  };


  function getPoseMatrix (out, pose) {
    var orientation = pose.orientation;
    mat4.fromRotationTranslation(out, orientation, vec3.fromValues(0,0,0));
  }


  GradientExperiment.prototype.render = function (projectionMat, modelViewMat, gamepad, timestamp, stats) {
    var gl = this.gl;
    var program = this.program;
    var selection = extractGradientSelection(gamepad);

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

    gl.activeTexture(gl.TEXTURE0); //texture 0 contains the perfect gradient
    gl.bindTexture(gl.TEXTURE_2D, this.texturePerfect);

    gl.activeTexture(gl.TEXTURE1); //texture 1 contains the quantised gradient
    gl.bindTexture(gl.TEXTURE_2D, this.textureQuantised);
    
    for(var i = 1; i<=4; i++){ //draw each of the four planes

      if(i == this.quantisedPlane){ //select the texture based on the plane number
        gl.uniform1i(this.program.uniform.diffuse, 1);
      } 
      else{
        gl.uniform1i(this.program.uniform.diffuse, 0);
      }
      if(i == selection){
        mat4.fromScaling(this.heroRotationMat, (0.5 + Math.cos(timestamp)) * [1, 1, 0]);
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
    if(selection){
      console.log(selection);
    }
  };

  return GradientExperiment;
})();
