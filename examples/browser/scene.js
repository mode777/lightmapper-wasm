import { loadSimpleObj } from "./obj-loader.js";
import { createProgram } from "./gl-utils.js";

const LIGHTMAP_WIDTH = 654;
const LIGHTMAP_HEIGHT = 654;
const VERTEX_STRIDE_BYTES = 5 * 4;
const OBJ_URL = "../../thirdparty/lightmapper/example/gazebo.obj";

const VERTEX_SOURCE = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec2 a_texcoord;
uniform mat4 u_view;
uniform mat4 u_projection;
out vec2 v_texcoord;
void main() {
  gl_Position = u_projection * (u_view * vec4(a_position, 1.0));
  v_texcoord = a_texcoord;
}`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 v_texcoord;
uniform sampler2D u_lightmap;
out vec4 o_color;
void main() {
  o_color = vec4(texture(u_lightmap, v_texcoord).rgb, gl_FrontFacing ? 1.0 : 0.0);
}`;

const EMISSIVE_VERTEX_SOURCE = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
uniform mat4 u_view;
uniform mat4 u_projection;
uniform vec3 u_lightPos;
uniform float u_lightScale;
void main() {
  vec3 worldPos = a_position * u_lightScale + u_lightPos;
  gl_Position = u_projection * (u_view * vec4(worldPos, 1.0));
}`;

const EMISSIVE_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
uniform vec3 u_emissiveColor;
out vec4 o_color;
void main() {
  o_color = vec4(u_emissiveColor, gl_FrontFacing ? 1.0 : 0.0);
}`;

// Unit cube: 8 vertices, 36 indices (12 triangles)
const CUBE_POSITIONS = new Float32Array([
  -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5,  0.5, -0.5,  -0.5,  0.5, -0.5,
  -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5
]);

const CUBE_INDICES = new Uint16Array([
  0,1,2, 2,3,0,  1,5,6, 6,2,1,  5,4,7, 7,6,5,
  4,0,3, 3,7,4,  3,2,6, 6,7,3,  4,5,1, 1,0,4
]);
const CUBE_INDEX_COUNT = 36;

export async function initScene(glContext, lightmapper) {
  const mesh = await loadSimpleObj(OBJ_URL);

  const vao = glContext.createVertexArray();
  const vbo = glContext.createBuffer();
  const ibo = glContext.createBuffer();
  if (!vao || !vbo || !ibo) {
    throw new Error("Could not create scene buffers.");
  }

  glContext.bindVertexArray(vao);
  glContext.bindBuffer(glContext.ARRAY_BUFFER, vbo);
  glContext.bufferData(glContext.ARRAY_BUFFER, mesh.vertices, glContext.STATIC_DRAW);
  glContext.bindBuffer(glContext.ELEMENT_ARRAY_BUFFER, ibo);
  glContext.bufferData(glContext.ELEMENT_ARRAY_BUFFER, mesh.indices, glContext.STATIC_DRAW);

  glContext.enableVertexAttribArray(0);
  glContext.vertexAttribPointer(0, 3, glContext.FLOAT, false, VERTEX_STRIDE_BYTES, 0);
  glContext.enableVertexAttribArray(1);
  glContext.vertexAttribPointer(1, 2, glContext.FLOAT, false, VERTEX_STRIDE_BYTES, 3 * 4);

  const lightmapTexture = glContext.createTexture();
  if (!lightmapTexture) {
    throw new Error("Could not create lightmap texture.");
  }

  glContext.bindTexture(glContext.TEXTURE_2D, lightmapTexture);
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.LINEAR);
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, glContext.LINEAR);
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, glContext.CLAMP_TO_EDGE);
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, glContext.CLAMP_TO_EDGE);
  glContext.texImage2D(
    glContext.TEXTURE_2D,
    0,
    glContext.RGBA8,
    1,
    1,
    0,
    glContext.RGBA,
    glContext.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255])
  );

  const program = createProgram(glContext, VERTEX_SOURCE, FRAGMENT_SOURCE);

  const uView = glContext.getUniformLocation(program, "u_view");
  const uProjection = glContext.getUniformLocation(program, "u_projection");
  const uLightmap = glContext.getUniformLocation(program, "u_lightmap");
  if (!uView || !uProjection || !uLightmap) {
    throw new Error("Could not resolve required shader uniforms.");
  }

  const verticesPtr = lightmapper.copyToHeap(mesh.vertices);
  const indicesPtr = lightmapper.copyToHeap(mesh.indices);

  // --- Emissive cube resources ---
  const cubeVao = glContext.createVertexArray();
  const cubeVbo = glContext.createBuffer();
  const cubeIbo = glContext.createBuffer();
  if (!cubeVao || !cubeVbo || !cubeIbo) {
    throw new Error("Could not create emissive cube buffers.");
  }

  glContext.bindVertexArray(cubeVao);
  glContext.bindBuffer(glContext.ARRAY_BUFFER, cubeVbo);
  glContext.bufferData(glContext.ARRAY_BUFFER, CUBE_POSITIONS, glContext.STATIC_DRAW);
  glContext.bindBuffer(glContext.ELEMENT_ARRAY_BUFFER, cubeIbo);
  glContext.bufferData(glContext.ELEMENT_ARRAY_BUFFER, CUBE_INDICES, glContext.STATIC_DRAW);
  glContext.enableVertexAttribArray(0);
  glContext.vertexAttribPointer(0, 3, glContext.FLOAT, false, 3 * 4, 0);
  glContext.bindVertexArray(null);

  const emissiveProgram = createProgram(glContext, EMISSIVE_VERTEX_SOURCE, EMISSIVE_FRAGMENT_SOURCE);
  const eUView = glContext.getUniformLocation(emissiveProgram, "u_view");
  const eUProjection = glContext.getUniformLocation(emissiveProgram, "u_projection");
  const eULightPos = glContext.getUniformLocation(emissiveProgram, "u_lightPos");
  const eULightScale = glContext.getUniformLocation(emissiveProgram, "u_lightScale");
  const eUEmissiveColor = glContext.getUniformLocation(emissiveProgram, "u_emissiveColor");

  return {
    vao,
    vbo,
    ibo,
    program,
    uView,
    uProjection,
    uLightmap,
    lightmapTexture,
    verticesPtr,
    indicesPtr,
    indexCount: mesh.indexCount,
    vertexStrideBytes: VERTEX_STRIDE_BYTES,
    lightmapWidth: LIGHTMAP_WIDTH,
    lightmapHeight: LIGHTMAP_HEIGHT,
    baking: false,
    // Emissive light resources
    cubeVao,
    cubeVbo,
    cubeIbo,
    emissiveProgram,
    eUView,
    eUProjection,
    eULightPos,
    eULightScale,
    eUEmissiveColor,
    lights: []
  };
}

export function drawScene(glContext, meshScene, view, projection, baking = false) {
  glContext.enable(glContext.DEPTH_TEST);
  glContext.useProgram(meshScene.program);
  glContext.uniform1i(meshScene.uLightmap, 0);
  glContext.uniformMatrix4fv(meshScene.uProjection, false, projection);
  glContext.uniformMatrix4fv(meshScene.uView, false, view);

  glContext.activeTexture(glContext.TEXTURE0);
  glContext.bindTexture(glContext.TEXTURE_2D, meshScene.lightmapTexture);
  glContext.bindVertexArray(meshScene.vao);
  glContext.drawElements(glContext.TRIANGLES, meshScene.indexCount, glContext.UNSIGNED_SHORT, 0);

  // Draw emissive light cubes
  if (meshScene.lights.length > 0) {
    glContext.useProgram(meshScene.emissiveProgram);
    glContext.uniformMatrix4fv(meshScene.eUView, false, view);
    glContext.uniformMatrix4fv(meshScene.eUProjection, false, projection);
    glContext.bindVertexArray(meshScene.cubeVao);

    for (const light of meshScene.lights) {
      glContext.uniform3f(meshScene.eULightPos, light.position[0], light.position[1], light.position[2]);
      glContext.uniform1f(meshScene.eULightScale, light.radius);

      let r = light.color[0] * light.intensity;
      let g = light.color[1] * light.intensity;
      let b = light.color[2] * light.intensity;
      if (!baking) {
        // Clamp to visible range in preview so the color is distinguishable
        const maxC = Math.max(r, g, b, 1.0);
        r /= maxC;
        g /= maxC;
        b /= maxC;
      }
      glContext.uniform3f(meshScene.eUEmissiveColor, r, g, b);
      glContext.drawElements(glContext.TRIANGLES, CUBE_INDEX_COUNT, glContext.UNSIGNED_SHORT, 0);
    }
  }
}

export function addLight(scene, position, color, intensity, radius) {
  scene.lights.push({ position, color, intensity, radius });
}

export function destroyScene(glContext, meshScene, lightmapper) {
  lightmapper.free(meshScene.verticesPtr);
  lightmapper.free(meshScene.indicesPtr);
  glContext.deleteVertexArray(meshScene.vao);
  glContext.deleteBuffer(meshScene.vbo);
  glContext.deleteBuffer(meshScene.ibo);
  glContext.deleteTexture(meshScene.lightmapTexture);
  glContext.deleteProgram(meshScene.program);
  glContext.deleteVertexArray(meshScene.cubeVao);
  glContext.deleteBuffer(meshScene.cubeVbo);
  glContext.deleteBuffer(meshScene.cubeIbo);
  glContext.deleteProgram(meshScene.emissiveProgram);
}
