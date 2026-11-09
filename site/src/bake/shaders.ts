export const BAKE_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;

uniform mat4 u_view;
uniform mat4 u_projection;

out vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = u_projection * (u_view * vec4(a_position, 1.0));
}
`;

export const BAKE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_lightmap;
uniform vec3 u_color;
uniform int u_mode;

out vec4 o_color;

void main() {
  vec3 color = u_mode == 0
    ? texture(u_lightmap, v_uv).rgb * u_color
    : u_color;
  o_color = vec4(color, gl_FrontFacing ? 1.0 : 0.0);
}
`;
