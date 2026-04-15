function compileShader(glContext, type, source) {
  const shader = glContext.createShader(type);
  if (!shader) {
    throw new Error("Could not create shader.");
  }

  glContext.shaderSource(shader, source);
  glContext.compileShader(shader);

  if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
    const log = glContext.getShaderInfoLog(shader) || "No shader log.";
    glContext.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }

  return shader;
}

export function createProgram(glContext, vertexSource, fragmentSource) {
  const vertexShader = compileShader(glContext, glContext.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(glContext, glContext.FRAGMENT_SHADER, fragmentSource);
  const program = glContext.createProgram();

  if (!program) {
    throw new Error("Could not create program.");
  }

  glContext.attachShader(program, vertexShader);
  glContext.attachShader(program, fragmentShader);
  glContext.bindAttribLocation(program, 0, "a_position");
  glContext.bindAttribLocation(program, 1, "a_texcoord");
  glContext.linkProgram(program);
  glContext.deleteShader(vertexShader);
  glContext.deleteShader(fragmentShader);

  if (!glContext.getProgramParameter(program, glContext.LINK_STATUS)) {
    const log = glContext.getProgramInfoLog(program) || "No program log.";
    glContext.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }

  return program;
}

export function resizeCanvasForDisplaySize(canvas, glContext) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.floor(canvas.clientWidth * dpr);
  const height = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  glContext.viewport(0, 0, canvas.width, canvas.height);
}
