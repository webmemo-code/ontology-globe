import * as THREE from 'three';

/**
 * LineDashedMaterial whose dashes can travel: three.js has no dash offset for
 * it, so shift the line distance in the shader. Returns the shift uniform.
 */
export function flowingDash(params: THREE.LineDashedMaterialParameters) {
  const mat = new THREE.LineDashedMaterial(params);
  const shift = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDashShift = shift;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDashShift;')
      .replace('mod( vLineDistance, totalSize )', 'mod( vLineDistance + uDashShift, totalSize )');
  };
  return { mat, shift };
}
