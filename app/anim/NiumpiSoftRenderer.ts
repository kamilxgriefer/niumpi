import type { MotionSample } from "./NiumpiContinuousMotion.ts";

const GRID = 36;

const VERTEX_SHADER = `
  precision highp float;
  attribute vec2 a_position;
  attribute vec2 a_uv;
  uniform float u_time;
  uniform vec2 u_fit;
  uniform vec2 u_translate;
  uniform vec2 u_scale;
  uniform float u_rotation;
  uniform float u_wobble;
  uniform float u_leaf;
  uniform float u_left_arm;
  uniform float u_right_arm;
  varying vec2 v_uv;

  float gaussian(vec2 point, vec2 centre, vec2 radius) {
    vec2 delta = (point - centre) / radius;
    return exp(-dot(delta, delta) * 2.25);
  }

  void main() {
    vec2 uv = a_uv;
    vec2 p = a_position;
    float body = smoothstep(0.02, 0.18, uv.y) * (1.0 - smoothstep(0.92, 1.0, uv.y));
    float centre = 1.0 - smoothstep(0.3, 0.95, abs(uv.x - 0.5) * 2.0);

    // A single continuous skin.  Every point follows the same low-frequency
    // volume wave, so the cloud bends instead of breaking into rigid pieces.
    p.x += sin(u_time * 2.15 + uv.y * 7.1 + uv.x * 1.8) * u_wobble * 0.012 * body;
    p.y += cos(u_time * 1.72 + uv.x * 6.4 - uv.y * 1.6) * u_wobble * 0.008 * body * centre;

    // Follow-through is spatially feathered into the same surface.  There are
    // no separate leaf or arm sprites and therefore no visible joints.
    float leaf = 1.0 - smoothstep(0.22, 0.47, uv.y);
    p.x += leaf * u_leaf * (0.045 + (0.46 - uv.y) * 0.14);
    p.y -= leaf * abs(u_leaf) * 0.008;

    float leftArm = gaussian(uv, vec2(0.205, 0.625), vec2(0.19, 0.22));
    float rightArm = gaussian(uv, vec2(0.795, 0.625), vec2(0.19, 0.22));
    p.x -= leftArm * u_left_arm * 0.038;
    p.y += leftArm * abs(u_left_arm) * 0.09;
    p.x += rightArm * u_right_arm * 0.038;
    p.y += rightArm * abs(u_right_arm) * 0.09;

    // Soft belly drag makes acceleration travel through the form rather than
    // moving every pixel as one cardboard cutout.
    float belly = gaussian(uv, vec2(0.5, 0.69), vec2(0.42, 0.34));
    p.x -= belly * sin(u_time * 1.35) * u_wobble * 0.004;
    p.y += belly * cos(u_time * 1.1) * u_wobble * 0.004;

    vec2 pivot = vec2(0.0, -0.62);
    p -= pivot;
    p *= u_scale;
    float c = cos(u_rotation);
    float s = sin(u_rotation);
    p = mat2(c, -s, s, c) * p;
    p += pivot;
    p = p * u_fit + u_translate;

    gl_Position = vec4(p, 0.0, 1.0);
    v_uv = uv;
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  uniform sampler2D u_texture;
  uniform float u_time;
  uniform vec2 u_gaze;
  uniform float u_blink;
  uniform float u_smile;
  uniform float u_shadow_scale;
  uniform float u_shadow_alpha;
  uniform float u_glow;
  uniform vec2 u_texel;
  varying vec2 v_uv;

  float ellipse(vec2 point, vec2 centre, vec2 radius) {
    vec2 delta = (point - centre) / radius;
    return exp(-dot(delta, delta) * 2.8);
  }

  void main() {
    vec2 uv = v_uv;
    vec2 leftEye = vec2(0.395, 0.535);
    vec2 rightEye = vec2(0.605, 0.535);
    float eyeL = ellipse(uv, leftEye, vec2(0.085, 0.088));
    float eyeR = ellipse(uv, rightEye, vec2(0.085, 0.088));
    float eyeMask = clamp(eyeL + eyeR, 0.0, 1.0);

    // The painted irises remain the same approved eyes; a sub-pixel texture
    // warp lets their attention drift without drawing a second face on top.
    uv -= u_gaze * vec2(0.008, 0.006) * eyeMask;

    // A blink compresses the original painted eye into its own centre.  The
    // feathered field preserves the surrounding fur and avoids a pasted lid.
    float nearestCentre = uv.x < 0.5 ? leftEye.y : rightEye.y;
    float squeeze = mix(1.0, 0.16, u_blink);
    float squeezedY = nearestCentre + (uv.y - nearestCentre) / squeeze;
    uv.y = mix(uv.y, squeezedY, eyeMask * u_blink);

    // The mouth is part of the same texture.  A local cheek-and-mouth warp
    // changes expression without introducing duplicate line art.
    float mouth = ellipse(v_uv, vec2(0.5, 0.65), vec2(0.16, 0.105));
    uv.x = mix(uv.x, 0.5 + (uv.x - 0.5) / (1.0 + max(0.0, u_smile) * 0.16), mouth);
    uv.y -= mouth * u_smile * (0.5 - abs(v_uv.x - 0.5)) * 0.012;

    vec4 colour = texture2D(u_texture, uv);

    // At full closure the compressed painted pupils form the lash; this tiny
    // line keeps the blink readable at small mobile sizes.
    float lashL = ellipse(v_uv, leftEye, vec2(0.056, 0.009));
    float lashR = ellipse(v_uv, rightEye, vec2(0.056, 0.009));
    float lash = clamp(lashL + lashR, 0.0, 1.0) * smoothstep(0.62, 1.0, u_blink);
    colour.rgb = mix(colour.rgb, vec3(0.17, 0.09, 0.28) * colour.a, lash * 0.82);

    // A restrained moving highlight gives the pearl paint depth while leaving
    // the authored colours intact.
    float sheen = max(0.0, sin((v_uv.x * 1.4 + v_uv.y - u_time * 0.035) * 6.28318));
    sheen = pow(sheen, 7.0) * 0.025 * colour.a;
    colour.rgb += vec3(0.72, 0.88, 1.0) * sheen;

    // Four alpha taps create a soft reaction halo without another image layer.
    float around = 0.0;
    around = max(around, texture2D(u_texture, v_uv + vec2(u_texel.x * 5.0, 0.0)).a);
    around = max(around, texture2D(u_texture, v_uv - vec2(u_texel.x * 5.0, 0.0)).a);
    around = max(around, texture2D(u_texture, v_uv + vec2(0.0, u_texel.y * 5.0)).a);
    around = max(around, texture2D(u_texture, v_uv - vec2(0.0, u_texel.y * 5.0)).a);
    float halo = max(0.0, around - colour.a) * u_glow;

    vec2 shadowDelta = (v_uv - vec2(0.5, 0.89)) / vec2(0.27 * u_shadow_scale, 0.036);
    float shadow = exp(-dot(shadowDelta, shadowDelta) * 2.0) * u_shadow_alpha;
    float shadowA = shadow * (1.0 - colour.a);
    float haloA = halo * 0.45 * (1.0 - colour.a) * (1.0 - shadowA);
    float paintA = colour.a * (1.0 - shadowA) * (1.0 - haloA);
    float outA = shadowA + haloA + paintA;
    vec3 premultiplied = vec3(0.12, 0.07, 0.2) * shadowA
      + vec3(0.52, 0.88, 1.0) * haloA
      + colour.rgb * paintA;
    gl_FragColor = outA > 0.0001
      ? vec4(premultiplied / outA, outA)
      : vec4(0.0);
  }
`;

function compile(gl: WebGLRenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind);
  if (!shader) throw new Error("Unable to create Niumpi motion shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function uniform(gl: WebGLRenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new Error(`Missing Niumpi motion uniform: ${name}`);
  return location;
}

export class NiumpiSoftRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly indexCount: number;
  private readonly uniforms: Record<string, WebGLUniformLocation>;
  private imageWidth = 1;
  private imageHeight = 1;

  constructor(canvas: HTMLCanvasElement, image: HTMLImageElement) {
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      depth: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL animation is unavailable");
    this.gl = gl;
    this.imageWidth = image.naturalWidth || image.width;
    this.imageHeight = image.naturalHeight || image.height;

    const program = gl.createProgram();
    if (!program) throw new Error("Unable to create Niumpi motion program");
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link Niumpi motion program");
    }
    this.program = program;
    gl.useProgram(program);

    const vertices: number[] = [];
    const indices: number[] = [];
    for (let row = 0; row <= GRID; row += 1) {
      const v = row / GRID;
      for (let column = 0; column <= GRID; column += 1) {
        const u = column / GRID;
        vertices.push(u * 2 - 1, 1 - v * 2, u, v);
      }
    }
    for (let row = 0; row < GRID; row += 1) {
      for (let column = 0; column < GRID; column += 1) {
        const topLeft = row * (GRID + 1) + column;
        const topRight = topLeft + 1;
        const bottomLeft = topLeft + GRID + 1;
        const bottomRight = bottomLeft + 1;
        indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
      }
    }
    this.indexCount = indices.length;

    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!vertexBuffer || !indexBuffer) throw new Error("Unable to allocate Niumpi motion mesh");
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, "a_position");
    const uv = gl.getAttribLocation(program, "a_uv");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);

    const texture = gl.createTexture();
    if (!texture) throw new Error("Unable to allocate Niumpi paint texture");
    this.texture = texture;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // The mesh UVs deliberately use the DOM image's top-left convention.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    this.uniforms = Object.fromEntries([
      "u_time", "u_fit", "u_translate", "u_scale", "u_rotation", "u_wobble", "u_leaf",
      "u_left_arm", "u_right_arm", "u_gaze", "u_blink", "u_smile", "u_shadow_scale",
      "u_shadow_alpha", "u_glow", "u_texel", "u_texture",
    ].map((name) => [name, uniform(gl, program, name)]));
    gl.uniform1i(this.uniforms.u_texture, 0);
    gl.uniform2f(this.uniforms.u_texel, 1 / this.imageWidth, 1 / this.imageHeight);
  }

  draw(sample: MotionSample, elapsedSeconds: number) {
    const gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    const aspect = this.imageWidth / this.imageHeight;
    gl.uniform1f(this.uniforms.u_time, elapsedSeconds);
    gl.uniform2f(this.uniforms.u_fit, aspect < 1 ? aspect : 1, aspect > 1 ? 1 / aspect : 1);
    gl.uniform2f(this.uniforms.u_translate, sample.x, sample.y);
    gl.uniform2f(this.uniforms.u_scale, sample.scaleX, sample.scaleY);
    gl.uniform1f(this.uniforms.u_rotation, sample.rotate);
    gl.uniform1f(this.uniforms.u_wobble, sample.wobble);
    gl.uniform1f(this.uniforms.u_leaf, sample.leaf);
    gl.uniform1f(this.uniforms.u_left_arm, sample.leftArm);
    gl.uniform1f(this.uniforms.u_right_arm, sample.rightArm);
    gl.uniform2f(this.uniforms.u_gaze, sample.gazeX, sample.gazeY);
    gl.uniform1f(this.uniforms.u_blink, sample.blink);
    gl.uniform1f(this.uniforms.u_smile, sample.smile);
    gl.uniform1f(this.uniforms.u_shadow_scale, sample.shadowScale);
    gl.uniform1f(this.uniforms.u_shadow_alpha, sample.shadowAlpha);
    gl.uniform1f(this.uniforms.u_glow, sample.glow);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
  }

  dispose() {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteProgram(this.program);
  }
}
