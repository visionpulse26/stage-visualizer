# 3D Stage Visualizer

A WebGL-based 3D stage visualizer for VJs and visual artists. Upload 3D models and apply video textures to create dynamic LED screen simulations.

## Features

- **3D Model Support**: Load `.glb` and `.gltf` 3D models
- **Video Textures**: Apply `.mp4` and `.webm` videos as textures
- **Raycasting**: Click on any mesh to apply video texture
- **Emissive Materials**: Video textures glow like real LED screens
- **OrbitControls**: Pan, zoom, and rotate the 3D scene

## Quick Start

### Prerequisites
- Node.js 18+ installed on your system

### Installation

1. Open a terminal in the `stage-visualizer` folder

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open http://localhost:3000 in your browser

## Usage

1. Click **"Upload 3D Model"** to load a `.glb` or `.gltf` file
2. Click **"Upload Video"** to load a `.mp4` or `.webm` video file
3. Click on any surface of the 3D model to apply the video texture
4. Use mouse to navigate:
   - **Left-click + drag**: Rotate
   - **Right-click + drag** or **Shift + left-click + drag**: Pan
   - **Scroll**: Zoom

## Tech Stack

- React 18
- Vite
- Three.js
- React Three Fiber
- @react-three/drei
- Tailwind CSS

## Sample Assets

You can test with free 3D models from:
- [Sketchfab](https://sketchfab.com/search?type=models&features=downloadable&q=stage)
- [Poly Haven](https://polyhaven.com/)
- [glTF Sample Models](https://github.com/KhronosGroup/glTF-Sample-Models)

## License

MIT
