// Distance LOD fades colour, brightness and alpha together, including textured
// flags. Tinting a sprite grey alone would leave its flag fully saturated.
import type * as THREE from 'three';

// `sat` (optional, 0..1) desaturates on top: a ghost flag outside the spotlight (#27).
export function withDetailFade(material: THREE.Material, detail: { value: number }, opacity: number, brightness = 0.45, sat: { value: number } = { value: 1 }) {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, {
      uDetail: detail,
      uFarOpacity: { value: opacity },
      uFarBrightness: { value: brightness },
      uSat: sat,
    });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDetail;\nuniform float uFarOpacity;\nuniform float uFarBrightness;\nuniform float uSat;')
      .replace('#include <tonemapping_fragment>', `
        float grey = dot( gl_FragColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
        gl_FragColor.rgb = mix( vec3( grey ), gl_FragColor.rgb, uDetail * uSat );
        gl_FragColor.rgb *= mix( uFarBrightness, 1.0, uDetail );
        gl_FragColor.a *= mix( uFarOpacity, 1.0, uDetail );
        #include <tonemapping_fragment>`);
  };
  material.customProgramCacheKey = () => `${key}|detailFade`;
  material.needsUpdate = true;
}
