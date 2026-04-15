export function multiplyMatrices(out, a, b) {
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      out[y * 4 + x] =
        a[x] * b[y * 4] +
        a[4 + x] * b[y * 4 + 1] +
        a[8 + x] * b[y * 4 + 2] +
        a[12 + x] * b[y * 4 + 3];
    }
  }
}

export function translationMatrix(out, x, y, z) {
  out[0] = 1.0; out[1] = 0.0; out[2] = 0.0; out[3] = 0.0;
  out[4] = 0.0; out[5] = 1.0; out[6] = 0.0; out[7] = 0.0;
  out[8] = 0.0; out[9] = 0.0; out[10] = 1.0; out[11] = 0.0;
  out[12] = x; out[13] = y; out[14] = z; out[15] = 1.0;
}

export function rotationMatrix(out, angleDegrees, x, y, z) {
  const angle = angleDegrees * Math.PI / 180.0;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const c2 = 1.0 - c;

  out[0] = x * x * c2 + c;
  out[1] = y * x * c2 + z * s;
  out[2] = x * z * c2 - y * s;
  out[3] = 0.0;

  out[4] = x * y * c2 - z * s;
  out[5] = y * y * c2 + c;
  out[6] = y * z * c2 + x * s;
  out[7] = 0.0;

  out[8] = x * z * c2 + y * s;
  out[9] = y * z * c2 - x * s;
  out[10] = z * z * c2 + c;
  out[11] = 0.0;

  out[12] = 0.0;
  out[13] = 0.0;
  out[14] = 0.0;
  out[15] = 1.0;
}

export function transformPosition(out, matrix, p) {
  const d = 1.0 / (matrix[3] * p[0] + matrix[7] * p[1] + matrix[11] * p[2] + matrix[15]);
  out[2] = d * (matrix[2] * p[0] + matrix[6] * p[1] + matrix[10] * p[2] + matrix[14]);
  out[1] = d * (matrix[1] * p[0] + matrix[5] * p[1] + matrix[9] * p[2] + matrix[13]);
  out[0] = d * (matrix[0] * p[0] + matrix[4] * p[1] + matrix[8] * p[2] + matrix[12]);
}

export function transposeMatrix(out, matrix) {
  out[0] = matrix[0]; out[1] = matrix[4]; out[2] = matrix[8]; out[3] = matrix[12];
  out[4] = matrix[1]; out[5] = matrix[5]; out[6] = matrix[9]; out[7] = matrix[13];
  out[8] = matrix[2]; out[9] = matrix[6]; out[10] = matrix[10]; out[11] = matrix[14];
  out[12] = matrix[3]; out[13] = matrix[7]; out[14] = matrix[11]; out[15] = matrix[15];
}

export function perspectiveMatrix(out, fovy, aspect, zNear, zFar) {
  const f = 1.0 / Math.tan(fovy * Math.PI / 360.0);
  const izFN = 1.0 / (zNear - zFar);

  out[0] = f / aspect; out[1] = 0.0; out[2] = 0.0; out[3] = 0.0;
  out[4] = 0.0; out[5] = f; out[6] = 0.0; out[7] = 0.0;
  out[8] = 0.0; out[9] = 0.0; out[10] = (zFar + zNear) * izFN; out[11] = -1.0;
  out[12] = 0.0; out[13] = 0.0; out[14] = 2.0 * zFar * zNear * izFN; out[15] = 0.0;
}
