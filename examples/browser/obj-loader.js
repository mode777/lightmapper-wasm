export async function loadSimpleObj(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch OBJ: ${url} (${response.status})`);
  }

  const text = await response.text();
  const lines = text.split(/\r?\n/);
  const positions = [];
  const texcoords = [];
  const normals = [];
  const faces = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const parts = line.split(/\s+/);
    const id = parts[0];

    if (id === "v") {
      positions.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
      continue;
    }

    if (id === "vt") {
      texcoords.push([Number(parts[1]), Number(parts[2])]);
      continue;
    }

    if (id === "vn") {
      normals.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
      continue;
    }

    if (id === "f") {
      if (parts.length !== 4) {
        throw new Error("Only triangulated OBJ faces are supported by this example.");
      }
      faces.push(parts.slice(1));
      continue;
    }

    throw new Error(`Unsupported OBJ identifier: ${id}`);
  }

  if (positions.length !== texcoords.length || positions.length !== normals.length) {
    throw new Error("This example expects the native sample OBJ format with shared position/uv/normal indexing.");
  }

  const vertexCount = positions.length;
  if (vertexCount > 65535) {
    throw new Error("OBJ has too many vertices for Uint16 index mode used by the native sample.");
  }

  const vertices = new Float32Array(vertexCount * 5);
  for (let i = 0; i < vertexCount; i++) {
    const p = positions[i];
    const t = texcoords[i];
    const base = i * 5;
    vertices[base + 0] = p[0];
    vertices[base + 1] = p[1];
    vertices[base + 2] = p[2];
    vertices[base + 3] = t[0];
    vertices[base + 4] = t[1];
  }

  const indices = new Uint16Array(faces.length * 3);
  let at = 0;
  for (const face of faces) {
    for (const corner of face) {
      const [piText, tiText, niText] = corner.split("/");
      const pi = Number(piText);
      const ti = Number(tiText);
      const ni = Number(niText);
      if (pi !== ti || pi !== ni) {
        throw new Error("This example requires OBJ faces where position/uv/normal indices are identical.");
      }
      indices[at++] = pi - 1;
    }
  }

  return {
    vertices,
    indices,
    vertexCount,
    indexCount: indices.length
  };
}
