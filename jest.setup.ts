/// <reference types="@testing-library/jest-dom" />
/// <reference types="@testing-library/jest-dom/jest-globals" />
import '@testing-library/jest-dom';

// Мокируем window.scrollTo, который не реализован в jsdom
Object.defineProperty(window, 'scrollTo', {
  value: jest.fn(),
  writable: true,
});

// Мокируем HTMLDialogElement.showModal, который не реализован в jsdom
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = jest.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = jest.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
}

// jsdom does not implement canvas/WebGL APIs used by Three.js views (e.g. Universe3D).
const canvas2DContextMock = {
  clearRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  fillText: jest.fn(),
  measureText: jest.fn((text: string) => ({ width: String(text).length * 8 })),
  save: jest.fn(),
  restore: jest.fn(),
  translate: jest.fn(),
  scale: jest.fn(),
  createRadialGradient: jest.fn(() => ({
    addColorStop: jest.fn(),
  })),
  shadowBlur: 0,
  shadowColor: '',
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  globalAlpha: 1,
};

const webglContextMock = {
  VERTEX_SHADER: 0x8b31,
  FRAGMENT_SHADER: 0x8b30,
  COMPILE_STATUS: 0x8b81,
  LINK_STATUS: 0x8b82,
  ARRAY_BUFFER: 0x8892,
  STATIC_DRAW: 0x88e4,
  FLOAT: 0x1406,
  TRIANGLE_STRIP: 0x0005,
  COLOR_BUFFER_BIT: 0x4000,
  createShader: jest.fn(() => ({})),
  shaderSource: jest.fn(),
  compileShader: jest.fn(),
  getShaderParameter: jest.fn(() => true),
  getShaderInfoLog: jest.fn(() => ''),
  deleteShader: jest.fn(),
  createProgram: jest.fn(() => ({})),
  attachShader: jest.fn(),
  linkProgram: jest.fn(),
  getProgramParameter: jest.fn(() => true),
  getProgramInfoLog: jest.fn(() => ''),
  deleteProgram: jest.fn(),
  createBuffer: jest.fn(() => ({})),
  bindBuffer: jest.fn(),
  bufferData: jest.fn(),
  getAttribLocation: jest.fn(() => 0),
  getUniformLocation: jest.fn(() => ({})),
  viewport: jest.fn(),
  useProgram: jest.fn(),
  clearColor: jest.fn(),
  clear: jest.fn(),
  enableVertexAttribArray: jest.fn(),
  vertexAttribPointer: jest.fn(),
  uniform1f: jest.fn(),
  uniform2f: jest.fn(),
  drawArrays: jest.fn(),
};

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: jest.fn((contextType: string) => {
    if (contextType === '2d') return canvas2DContextMock;
    if (contextType === 'webgl') return webglContextMock;
    return null;
  }),
});

if (typeof window.fetch === 'undefined') {
  (window as unknown as { fetch: typeof fetch }).fetch = jest.fn(() =>
    Promise.reject(new Error('fetch is not available in test environment'))
  ) as unknown as typeof fetch;
}
