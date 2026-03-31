/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader, Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { Download, RotateCcw, Settings2, Type as TypeIcon, Ruler, Box } from 'lucide-react';

// Font URLs
const FONTS = {
  'Helvetiker': 'https://threejs.org/examples/fonts/helvetiker_bold.typeface.json',
  'Gentilis': 'https://threejs.org/examples/fonts/gentilis_bold.typeface.json',
};

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    plateGroup: THREE.Group;
  } | null>(null);

  // State for parameters (pending)
  const [phoneNumber, setPhoneNumber] = useState('010-1234-5678');
  const [width, setWidth] = useState(100);
  const [height, setHeight] = useState(25);
  const [baseThickness, setBaseThickness] = useState(2);
  const [textThickness, setTextThickness] = useState(2);
  const [radius, setRadius] = useState(4);
  const [fontSize, setFontSize] = useState(12);
  const [fontName, setFontName] = useState<keyof typeof FONTS>('Helvetiker');
  const [textOverflow, setTextOverflow] = useState(false);

  // Active parameters (used for 3D generation)
  const [activeParams, setActiveParams] = useState({
    phoneNumber: '010-1234-5678',
    width: 100,
    height: 25,
    baseThickness: 2,
    textThickness: 2,
    radius: 4,
    fontSize: 12,
    fontName: 'Helvetiker' as keyof typeof FONTS,
  });

  const [loadedFont, setLoadedFont] = useState<Font | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const handlePreview = () => {
    setIsPreviewing(true);
    // Add a small delay for visual feedback
    setTimeout(() => {
      setActiveParams({
        phoneNumber,
        width,
        height,
        baseThickness,
        textThickness,
        radius,
        fontSize,
        fontName,
      });
      setIsPreviewing(false);
    }, 300);
  };

  // Initialize Three.js
  React.useLayoutEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcccccc); // Lighter gray for better contrast

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(60, 60, 100);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const initialWidth = containerRef.current.clientWidth || 800;
    const initialHeight = containerRef.current.clientHeight || 600;
    renderer.setSize(initialWidth, initialHeight);
    camera.aspect = initialWidth / initialHeight;
    camera.updateProjectionMatrix();
    
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    // Helpers
    const gridHelper = new THREE.GridHelper(200, 20, 0x888888, 0x444444);
    scene.add(gridHelper);
    
    const axesHelper = new THREE.AxesHelper(50);
    scene.add(axesHelper);

    // Test Cube (to verify rendering)
    const testBox = new THREE.Mesh(
      new THREE.BoxGeometry(5, 5, 5),
      new THREE.MeshPhongMaterial({ color: 0xff0000 })
    );
    testBox.position.set(0, 10, 0);
    scene.add(testBox);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(100, 200, 100);
    scene.add(directionalLight);

    const plateGroup = new THREE.Group();
    scene.add(plateGroup);

    sceneRef.current = { scene, camera, renderer, controls, plateGroup };

    const animate = () => {
      const id = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      return id;
    };
    const animationId = animate();

    const handleResize = () => {
      if (!containerRef.current || !sceneRef.current) return;
      const { camera, renderer } = sceneRef.current;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    
    // Use ResizeObserver for more reliable sizing
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      cancelAnimationFrame(animationId);
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Load Font
  useEffect(() => {
    const loader = new FontLoader();
    loader.load(FONTS[activeParams.fontName], (font) => {
      setLoadedFont(font);
    }, undefined, (err) => {
      console.error('Font loading error:', err);
    });
  }, [activeParams.fontName]);

  // Generate Plate Logic
  useEffect(() => {
    if (!sceneRef.current || !loadedFont) return;
    
    const { plateGroup, controls } = sceneRef.current;
    const { 
      phoneNumber: activePhone, 
      width: activeWidth, 
      height: activeHeight, 
      baseThickness: activeBaseT, 
      textThickness: activeTextT, 
      radius: activeRadius,
      fontSize: activeFontSize
    } = activeParams;

    // Clear previous children
    setTextOverflow(false);
    while (plateGroup.children.length > 0) {
      const obj = plateGroup.children[0];
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
      plateGroup.remove(obj);
    }

    // 1. Create Rounded Base
    const shape = new THREE.Shape();
    const x = -activeWidth / 2;
    const y = -activeHeight / 2;
    const r = Math.min(activeRadius, activeWidth / 2, activeHeight / 2);

    shape.moveTo(x + r, y);
    shape.lineTo(x + activeWidth - r, y);
    shape.absarc(x + activeWidth - r, y + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(x + activeWidth, y + activeHeight - r);
    shape.absarc(x + activeWidth - r, y + activeHeight - r, r, 0, Math.PI / 2, false);
    shape.lineTo(x + r, y + activeHeight);
    shape.absarc(x + r, y + activeHeight - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(x, y + r);
    shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);

    const extrudeSettings = {
      depth: activeBaseT,
      bevelEnabled: true,
      bevelThickness: 0.2,
      bevelSize: 0.2,
      bevelOffset: 0,
      bevelSegments: 3
    };

    const baseGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const baseMaterial = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 30 });
    const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
    baseMesh.rotation.x = -Math.PI / 2;
    plateGroup.add(baseMesh);

    // 2. Create 3D Text
    const cleanNumber = activePhone.replace(/[^0-9-]/g, '');
    if (cleanNumber) {
      const createTextGeo = (size: number) => {
        return new TextGeometry(cleanNumber, {
          font: loadedFont,
          size: size,
          depth: activeTextT,
          curveSegments: 12,
          bevelEnabled: false
        });
      };

      let textGeo = createTextGeo(activeFontSize);
      textGeo.computeBoundingBox();
      let textWidth = textGeo.boundingBox ? textGeo.boundingBox.max.x - textGeo.boundingBox.min.x : 0;
      let textHeight = textGeo.boundingBox ? textGeo.boundingBox.max.y - textGeo.boundingBox.min.y : 0;

      const maxTextWidth = activeWidth * 0.9;
      const maxTextHeight = activeHeight * 0.8;

      if (textWidth > maxTextWidth || textHeight > maxTextHeight) {
        setTextOverflow(true);
      }

      const textMaterial = new THREE.MeshPhongMaterial({ color: 0xffcc00, shininess: 50 });
      const textMesh = new THREE.Mesh(textGeo, textMaterial);

      // Center text on the plate
      textMesh.position.x = -textWidth / 2;
      textMesh.position.y = activeBaseT + 0.05; // Slightly above base
      textMesh.position.z = textHeight / 2; // Center vertically on the XZ plane
      textMesh.rotation.x = -Math.PI / 2;

      plateGroup.add(textMesh);
    }

    // Reset controls target just in case
    controls.target.set(0, 0, 0);
  }, [activeParams, loadedFont]);

  const handleDownloadSTL = () => {
    if (!sceneRef.current) return;
    setIsGenerating(true);
    
    setTimeout(() => {
      const exporter = new STLExporter();
      const stlString = exporter.parse(sceneRef.current!.plateGroup);
      const blob = new Blob([stlString], { type: 'text/plain' });
      const link = document.createElement('a');
      link.style.display = 'none';
      document.body.appendChild(link);
      link.href = URL.createObjectURL(blob);
      link.download = `parking_plate_${phoneNumber.replace(/[^0-9]/g, '')}.stl`;
      link.click();
      document.body.removeChild(link);
      setIsGenerating(false);
    }, 100);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#f0f2f5] font-sans overflow-hidden">
      {/* Control Panel */}
      <div className="w-full md:w-96 bg-white border-r border-gray-200 p-6 overflow-y-auto shadow-xl z-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Settings2 className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-gray-800">3D Plate Generator</h1>
        </div>

        <div className="space-y-6">
          {/* Phone Number Input */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <TypeIcon className="w-4 h-4" /> Phone Number
            </label>
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="010-1234-5678"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
            />
            {phoneNumber.replace(/[^0-9]/g, '').length !== 11 && (
              <p className="text-xs text-amber-600 font-medium">Note: Standard Korean numbers are 11 digits.</p>
            )}
          </div>

          {/* Dimensions */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Ruler className="w-4 h-4" /> Width (mm)
                </label>
                <span className="text-xs font-mono text-blue-600 font-bold">{width}</span>
              </div>
              <input
                type="range"
                min="60"
                max="150"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Ruler className="w-4 h-4 rotate-90" /> Height (mm)
                </label>
                <span className="text-xs font-mono text-blue-600 font-bold">{height}</span>
              </div>
              <input
                type="range"
                min="15"
                max="50"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Box className="w-4 h-4" /> Base Thickness (mm)
                </label>
                <span className="text-xs font-mono text-blue-600 font-bold">{baseThickness}</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={baseThickness}
                onChange={(e) => setBaseThickness(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <TypeIcon className="w-4 h-4" /> Text Thickness (mm)
                </label>
                <span className="text-xs font-mono text-blue-600 font-bold">{textThickness}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.1"
                value={textThickness}
                onChange={(e) => setTextThickness(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <RotateCcw className="w-4 h-4" /> Corner Radius
                </label>
                <span className="text-xs font-mono text-blue-600 font-bold">{radius}</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <TypeIcon className="w-4 h-4" /> Font Size (mm)
                </label>
                <span className="text-xs font-mono text-blue-600 font-bold">{fontSize}</span>
              </div>
              <input
                type="range"
                min="5"
                max="30"
                step="0.5"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          </div>

          {textOverflow && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg animate-pulse">
              <p className="text-xs text-amber-700 font-bold flex items-center gap-2">
                ⚠️ Warning: Text exceeds plate dimensions!
              </p>
              <p className="text-[10px] text-amber-600 mt-1">
                Please increase plate size or decrease font size.
              </p>
            </div>
          )}

          {/* Font Selection */}
          <div className="space-y-2 pt-4 border-t border-gray-100">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <TypeIcon className="w-4 h-4" /> Font Style
            </label>
            <select
              value={fontName}
              onChange={(e) => setFontName(e.target.value as keyof typeof FONTS)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              {Object.keys(FONTS).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="pt-8 space-y-4">
            <button
              onClick={handlePreview}
              disabled={isPreviewing || !loadedFont}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-white transition-all shadow-md ${
                isPreviewing || !loadedFont 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'
              }`}
            >
              {isPreviewing ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <RotateCcw className="w-5 h-5" />
              )}
              Apply Preview
            </button>

            <button
              onClick={handleDownloadSTL}
              disabled={isGenerating || !loadedFont}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-white transition-all shadow-lg ${
                isGenerating || !loadedFont 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
              }`}
            >
              {isGenerating ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
              Download STL
            </button>
            <p className="text-[10px] text-center text-gray-500 mt-4 uppercase tracking-widest font-semibold">
              Ready for 3D Printing
            </p>
          </div>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 relative bg-[#f8f9fa] min-h-[500px]">
        <div 
          ref={containerRef} 
          className="w-full h-full cursor-move border-4 border-dashed border-gray-300" 
        />
        
        {/* Overlay Info */}
        <div className="absolute top-6 left-6 pointer-events-none space-y-2">
          <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-white/50">
            <h2 className="text-sm font-bold text-gray-800 mb-1">Live Preview</h2>
            <p className="text-xs text-gray-500">Left click to rotate • Right click to pan • Scroll to zoom</p>
          </div>
          <div className="bg-white/80 backdrop-blur-md px-3 py-1 rounded-full shadow-sm border border-white/50 inline-block">
            <div className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Engine Active
            </div>
          </div>
        </div>

        {!loadedFont && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="font-bold text-blue-600">Loading Font Assets...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
