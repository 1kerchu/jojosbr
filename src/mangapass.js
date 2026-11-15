import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// Renderiza la escena y aplica: contornos de tinta (por profundidad), gradación de color tipo anime,
// viñeta y protección contra NaN/infinitos. Sustituye al RenderPass.
export class MangaPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene; this.camera = camera;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.rt.depthTexture = new THREE.DepthTexture(1, 1);
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.uniforms = {
      tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture },
      resolution: { value: new THREE.Vector2(1, 1) }, cameraNear: { value: camera.near }, cameraFar: { value: camera.far },
      ink: { value: 1.0 }, saturation: { value: 1.1 }, contrast: { value: 1.08 }, tint: { value: new THREE.Color(1, 1, 1) },
      vignette: { value: 0.55 }, vigColor: { value: new THREE.Color(0x1a0630) }
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        #include <packing>
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 resolution;
        uniform float cameraNear; uniform float cameraFar; uniform float ink; uniform float saturation; uniform float contrast;
        uniform vec3 tint; uniform float vignette; uniform vec3 vigColor;
        varying vec2 vUv;
        float lin(vec2 uv) { float d = texture2D(tDepth, uv).x; return -perspectiveDepthToViewZ(d, cameraNear, cameraFar); }
        void main() {
          vec4 c = texture2D(tColor, vUv);
          if (c.r != c.r || c.g != c.g || c.b != c.b || c.r > 1e4 || c.g > 1e4 || c.b > 1e4) c = vec4(0.0, 0.0, 0.0, 1.0);
          vec3 col = min(c.rgb, vec3(16.0));
          // contornos: discontinuidades de profundidad relativas
          vec2 px = 1.0 / resolution;
          float z = lin(vUv);
          float zl = lin(vUv - vec2(px.x, 0.0)), zr = lin(vUv + vec2(px.x, 0.0));
          float zu = lin(vUv + vec2(0.0, px.y)), zd = lin(vUv - vec2(0.0, px.y));
          float lap = abs(zl + zr + zu + zd - 4.0 * z) / max(z, 0.001);
          float edge = smoothstep(0.04, 0.12, lap);
          edge *= 1.0 - smoothstep(180.0, 600.0, z);   // sin líneas a lo lejos
          // gradación
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(l), col, saturation);
          col = (col - 0.18) * contrast + 0.18;
          col = max(col, 0.0) * tint;
          col = mix(col, col * 0.08, edge * ink);
          // viñeta
          vec2 q = vUv - 0.5; float v = smoothstep(0.35, 0.85, length(q * vec2(1.15, 1.0)));
          col = mix(col, vigColor * 0.3, v * vignette);
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  setSize(w, h) { this.rt.setSize(w, h); this.uniforms.resolution.value.set(w, h); }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.uniforms.cameraNear.value = this.camera.near; this.uniforms.cameraFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
  dispose() { this.rt.dispose(); this.material.dispose(); this.fsQuad.dispose(); }
}
