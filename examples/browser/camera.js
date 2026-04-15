import {
  rotationMatrix,
  multiplyMatrices,
  transformPosition,
  transposeMatrix,
  translationMatrix
} from "./math.js";

export function createCamera(canvasElement) {
  const cameraState = {
    position: new Float32Array([0.0, 0.3, 1.5]),
    rotation: new Float32Array([0.0, 0.0]),
    keys: new Set(),
    dragging: false,
    lastMouseX: 0,
    lastMouseY: 0
  };

  window.addEventListener("keydown", (event) => {
    cameraState.keys.add(event.code);
  });

  window.addEventListener("keyup", (event) => {
    cameraState.keys.delete(event.code);
  });

  canvasElement.addEventListener("mousedown", (event) => {
    if (event.button === 0) {
      cameraState.dragging = true;
      cameraState.lastMouseX = event.clientX;
      cameraState.lastMouseY = event.clientY;
    }
  });

  canvasElement.addEventListener("mouseup", () => {
    cameraState.dragging = false;
  });

  canvasElement.addEventListener("mouseleave", () => {
    cameraState.dragging = false;
  });

  canvasElement.addEventListener("mousemove", (event) => {
    if (!cameraState.dragging) {
      cameraState.lastMouseX = event.clientX;
      cameraState.lastMouseY = event.clientY;
      return;
    }

    cameraState.rotation[0] += (event.clientY - cameraState.lastMouseY) * -0.2;
    cameraState.rotation[1] += (event.clientX - cameraState.lastMouseX) * -0.2;

    cameraState.lastMouseX = event.clientX;
    cameraState.lastMouseY = event.clientY;
  });

  const rotationY = new Float32Array(16);
  const rotationX = new Float32Array(16);
  const rotationYX = new Float32Array(16);
  const movement = new Float32Array(3);
  const worldMovement = new Float32Array(3);
  const inverseRotation = new Float32Array(16);
  const inverseTranslation = new Float32Array(16);

  return {
    updateView(view, dtSeconds) {
      rotationMatrix(rotationX, cameraState.rotation[0], 1.0, 0.0, 0.0);
      rotationMatrix(rotationY, cameraState.rotation[1], 0.0, 1.0, 0.0);
      multiplyMatrices(rotationYX, rotationY, rotationX);

      movement[0] = 0.0;
      movement[1] = 0.0;
      movement[2] = 0.0;

      const unitsPerSecond = cameraState.keys.has("ShiftLeft") ? 6.0 : 0.9;
      const speed = unitsPerSecond * dtSeconds;

      if (cameraState.keys.has("KeyW")) movement[2] -= speed;
      if (cameraState.keys.has("KeyS")) movement[2] += speed;
      if (cameraState.keys.has("KeyA")) movement[0] -= speed;
      if (cameraState.keys.has("KeyD")) movement[0] += speed;
      if (cameraState.keys.has("KeyE")) movement[1] -= speed;
      if (cameraState.keys.has("KeyQ")) movement[1] += speed;

      transformPosition(worldMovement, rotationYX, movement);
      cameraState.position[0] += worldMovement[0];
      cameraState.position[1] += worldMovement[1];
      cameraState.position[2] += worldMovement[2];

      transposeMatrix(inverseRotation, rotationYX);
      translationMatrix(inverseTranslation, -cameraState.position[0], -cameraState.position[1], -cameraState.position[2]);
      multiplyMatrices(view, inverseRotation, inverseTranslation);
    }
  };
}
