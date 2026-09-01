import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// @ts-ignore
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader';
import { Play, Timer } from 'lucide-react';

const ACTIONS = [
  { id: 'idle', label: 'Parado (Idle)' },
  { id: 'walk', label: 'Andar' },
  { id: 'jog', label: 'Trote' },
  { id: 'run', label: 'Correr' },
  { id: 'corte_parado', label: 'Corte Parado' },
  { id: 'tackle', label: 'Carrinho' },
  { id: 'header', label: 'Cabeçada Pulando' },
  { id: 'header_standing', label: 'Cabeçada' },
  { id: 'kick', label: 'Chute' },
  { id: 'short_pass_normal', label: 'Passe Curto Normal' },
  { id: 'short_pass_trivela', label: 'Passe Curto Trivela' },
  { id: 'chest_trap', label: 'Matada no Peito' },
  { id: 'gk_dive', label: 'Goleiro - Pulo Alto' },
  { id: 'gk_dive_low', label: 'Goleiro - Pulo Baixo' },
  { id: 'gk_knees', label: 'Goleiro - Joelhos' },
  { id: 'fall', label: 'Queda' },
  { id: 'get_up', label: 'Levantar' },
  { id: 'throw_in', label: 'Cobrança de Lateral' }
];

const WARRIOR_ACTION_IDS = ['idle', 'walk', 'jog', 'run', 'fall'];

function createLionCrestTexture(bgColor: string = '#18181b', width = 512, height = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  if (bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  }

  // Draw Medieval Golden Lion Rampant (Lego Knight Lion style)
  ctx.save();
  ctx.translate(width / 2, height / 2);

  // Body & Head outline in gold
  ctx.fillStyle = '#f59e0b';
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 6;

  // Head
  ctx.beginPath();
  ctx.arc(-15, -90, 45, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Crown / Mane tufts
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(-40, -110, 20, 0, Math.PI * 2);
  ctx.arc(-10, -125, 24, 0, Math.PI * 2);
  ctx.arc(20, -110, 20, 0, Math.PI * 2);
  ctx.fill();

  // Open mouth & red tongue
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(10, -85);
  ctx.lineTo(40, -75);
  ctx.lineTo(15, -65);
  ctx.fill();

  // Eye
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(-10, -95, 6, 0, Math.PI * 2);
  ctx.fill();

  // Torso / Body (Rampant pose)
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.moveTo(-30, -55);
  ctx.quadraticCurveTo(-70, 10, -50, 90);
  ctx.quadraticCurveTo(20, 100, 20, 40);
  ctx.quadraticCurveTo(0, -30, -30, -55);
  ctx.fill(); ctx.stroke();

  // Front raised legs & Red Claws
  ctx.fillStyle = '#dc2626';
  // Front Right Leg
  ctx.beginPath();
  ctx.moveTo(-20, -30);
  ctx.lineTo(50, -70);
  ctx.lineTo(70, -55);
  ctx.stroke();
  ctx.fillRect(60, -75, 16, 8);
  ctx.fillRect(65, -63, 16, 8);

  // Front Left Leg
  ctx.beginPath();
  ctx.moveTo(-20, -10);
  ctx.lineTo(40, -30);
  ctx.lineTo(60, -15);
  ctx.stroke();
  ctx.fillRect(55, -35, 16, 8);

  // Back legs
  ctx.beginPath();
  ctx.moveTo(-40, 60);
  ctx.lineTo(-80, 120);
  ctx.lineTo(-50, 130);
  ctx.stroke();
  ctx.fillRect(-90, 120, 20, 10);

  ctx.beginPath();
  ctx.moveTo(-10, 70);
  ctx.lineTo(40, 130);
  ctx.lineTo(60, 120);
  ctx.stroke();
  ctx.fillRect(45, 126, 20, 10);

  // Curved S-Tail
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(-40, 70);
  ctx.bezierCurveTo(-120, 30, -100, -70, -70, -90);
  ctx.stroke();

  // Tail tuft
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(-70, -92, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const axisCanvasRef = useRef<HTMLCanvasElement>(null);
  const walkTargetRef = useRef<THREE.Vector3 | null>(null);
  const targetMarkerRef = useRef<THREE.Mesh | null>(null);
  
  const actionRef = useRef('idle');
  const actionStartRef = useRef(performance.now());
  const actionElapsedRef = useRef(0);
  const [activeAction, setActiveAction] = useState('idle');
  const [isSlowMotion, setIsSlowMotion] = useState(false);
  const slowMotionRef = useRef(false);
  const resetCameraRef = useRef(true);

  const [characterMode, setCharacterMode] = useState<'soccer' | 'warrior'>('soccer');
  const modeRef = useRef<'soccer' | 'warrior'>('soccer');
  const updateModeVisibilityRef = useRef<((mode: 'soccer' | 'warrior') => void) | null>(null);

  const setAction = useCallback((actionId: string) => {
    actionRef.current = actionId;
    actionStartRef.current = performance.now();
    actionElapsedRef.current = 0;
    setActiveAction(actionId);
    if (actionId === 'idle') {
      resetCameraRef.current = true;
    }
    if (actionId !== 'walk' && actionId !== 'jog' && actionId !== 'run') {
      walkTargetRef.current = null;
      if (targetMarkerRef.current) {
        targetMarkerRef.current.visible = false;
      }
    }
  }, []);

  const handleModeChange = useCallback((newMode: 'soccer' | 'warrior') => {
    modeRef.current = newMode;
    setCharacterMode(newMode);
    if (updateModeVisibilityRef.current) {
      updateModeVisibilityRef.current(newMode);
    }
    if (newMode === 'warrior' && !WARRIOR_ACTION_IDS.includes(actionRef.current)) {
      setAction('idle');
    }
  }, [setAction]);

  const toggleSlowMotion = useCallback(() => {
    setIsSlowMotion(prev => {
      const next = !prev;
      slowMotionRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    if (mountRef.current.children.length > 0) {
      mountRef.current.innerHTML = '';
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#87CEEB');

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 15, 30);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.875, 0);
    controls.maxDistance = 150;
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.mouseButtons = {
      LEFT: -1 as unknown as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('contextmenu', handleContextMenu);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 50, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // ==========================================
    // CAMPO DE FUTEBOL
    // ==========================================
    function createPitchTexture() {
      const canvas = document.createElement('canvas');
      const scale = 20; 
      canvas.width = 112 * scale;  
      canvas.height = 74 * scale;  
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = '#45a049'; 
      const midX = canvas.width / 2;
      const midY = canvas.height / 2;
      const stripeW = 5.3 * scale; 

      for (let i = 0; i < 11; i++) {
          if (i % 2 === 0) {
              ctx.fillRect(midX + i * stripeW, 0, stripeW, canvas.height);
              ctx.fillRect(midX - (i + 1) * stripeW, 0, stripeW, canvas.height);
          }
      }

      ctx.strokeStyle = '#FFFFFF';
      ctx.fillStyle = '#FFFFFF';
      ctx.lineWidth = 0.15 * scale; 
      
      const margin = 3 * scale; 
      const fW = 106 * scale;   
      const fH = 68 * scale;    

      ctx.beginPath(); ctx.rect(margin, margin, fW, fH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(midX, margin); ctx.lineTo(midX, margin + fH); ctx.stroke();
      ctx.beginPath(); ctx.arc(midX, midY, 9.15 * scale, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(midX, midY, 0.4 * scale, 0, Math.PI * 2); ctx.fill();

      function drawArea(isLeft: boolean) {
          const penW = 16.5 * scale;
          const penH = 40.32 * scale;
          const goalW = 5.5 * scale;
          const goalH = 18.32 * scale;
          const sign = isLeft ? 1 : -1;
          const startX = isLeft ? margin : margin + fW;
          
          ctx.beginPath(); ctx.rect(isLeft ? startX : startX - penW, midY - penH/2, penW, penH); ctx.stroke();
          ctx.beginPath(); ctx.rect(isLeft ? startX : startX - goalW, midY - goalH/2, goalW, goalH); ctx.stroke();
          
          const penPointX = startX + (sign * 11 * scale);
          ctx.beginPath(); ctx.arc(penPointX, midY, 0.25 * scale, 0, Math.PI * 2); ctx.fill();
          
          ctx.save();
          ctx.beginPath(); ctx.rect(isLeft ? startX + penW : 0, 0, isLeft ? canvas.width : startX - penW, canvas.height); ctx.clip();
          ctx.beginPath(); ctx.arc(penPointX, midY, 9.15 * scale, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
      }

      drawArea(true); drawArea(false); 

      const cR = 1 * scale;
      ctx.beginPath(); ctx.arc(margin, margin, cR, 0, Math.PI/2); ctx.stroke();
      ctx.beginPath(); ctx.arc(margin, margin + fH, cR, -Math.PI/2, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(margin + fW, margin, cR, Math.PI/2, Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(margin + fW, margin + fH, cR, Math.PI, Math.PI*1.5); ctx.stroke();

      return new THREE.CanvasTexture(canvas);
    }

    const groundGeo = new THREE.PlaneGeometry(112, 74);
    const pitchTexture = createPitchTexture();
    pitchTexture.anisotropy = renderer.capabilities.getMaxAnisotropy(); 
    const groundMat = new THREE.MeshLambertMaterial({ map: pitchTexture });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    ground.receiveShadow = true;     
    scene.add(ground);

    // Marker on ground for click-to-walk destination
    const markerGeo = new THREE.RingGeometry(0.4, 0.7, 32);
    markerGeo.rotateX(-Math.PI / 2);
    const markerMat = new THREE.MeshBasicMaterial({ 
      color: 0x38bdf8, 
      side: THREE.DoubleSide, 
      transparent: true, 
      opacity: 0.85 
    });
    const targetMarkerMesh = new THREE.Mesh(markerGeo, markerMat);
    targetMarkerMesh.position.set(0, 0.05, 0);
    targetMarkerMesh.visible = false;
    scene.add(targetMarkerMesh);
    targetMarkerRef.current = targetMarkerMesh;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 2) {
        resetCameraRef.current = false;
      }
      if (event.button === 0) {
        pointerDownPos = { x: event.clientX, y: event.clientY };
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const dx = event.clientX - pointerDownPos.x;
      const dy = event.clientY - pointerDownPos.y;
      // Trigger walk destination on clean left click
      if (Math.hypot(dx, dy) < 6) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(ground, false);

        if (intersects.length > 0) {
          const point = intersects[0].point;
          walkTargetRef.current = new THREE.Vector3(point.x, basePlayerY, point.z);
          targetMarkerMesh.position.set(point.x, 0.05, point.z);
          targetMarkerMesh.visible = true;

          if (actionRef.current !== 'walk' && actionRef.current !== 'jog' && actionRef.current !== 'run') {
            setAction('walk');
          }
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    function createGoal(xPosition: number, isRotated: boolean) {
      const goalGroup = new THREE.Group();
      const postMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const radius = 0.06;
      const pL = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 2.44), postMat);
      pL.position.set(0, 2.44/2, 7.32/2); goalGroup.add(pL);
      const pR = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 2.44), postMat);
      pR.position.set(0, 2.44/2, -7.32/2); goalGroup.add(pR);
      const pT = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 7.32), postMat);
      pT.rotation.x = Math.PI / 2; pT.position.set(0, 2.44, 0); goalGroup.add(pT);
      
      const sMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
      const sL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.15), sMat);
      sL.rotation.z = -Math.PI / 4; sL.position.set(-1, 1.22, 7.32/2); goalGroup.add(sL);
      const sR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.15), sMat);
      sR.rotation.z = -Math.PI / 4; sR.position.set(-1, 1.22, -7.32/2); goalGroup.add(sR);

      goalGroup.position.set(xPosition, 0, 0);
      if(isRotated) goalGroup.rotation.y = Math.PI;
      scene.add(goalGroup);
    }
    createGoal(-53, false); 
    createGoal(53, true);   

    // ==========================================
    // PERSONAGEM VOXEL 
    // ==========================================
    const colors = {
        skin: new THREE.MeshLambertMaterial({ color: 0xa3443a }),
        hair: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
        shirt: new THREE.MeshLambertMaterial({ color: 0xf5f5f5 }),
        black: new THREE.MeshLambertMaterial({ color: 0x111111 }),
        gold: new THREE.MeshLambertMaterial({ color: 0xcfa144 }),
        blue: new THREE.MeshLambertMaterial({ color: 0x1c3f60 }),
        shoe: new THREE.MeshLambertMaterial({ color: 0xdccb9e })
    };

    const characterGroup = new THREE.Group();

    const pivotArmR = {x: 1.25, y: 4.35, z: 0}; 
    const pivotArmL = {x: -1.25, y: 4.35, z: 0};
    const pivotElbowR = {x: 3.35, y: 4.35, z: 0}; 
    const pivotElbowL = {x: -3.35, y: 4.35, z: 0};
    const pivotWristR = {x: 4.85, y: 4.35, z: 0};
    const pivotWristL = {x: -4.85, y: 4.35, z: 0};

    const pivotLegR = {x: 0.6, y: 0.95, z: 0}; 
    const pivotLegL = {x: -0.6, y: 0.95, z: 0};
    const pivotKneeR = {x: 0.6, y: -1.0, z: 0};
    const pivotKneeL = {x: -0.6, y: -1.0, z: 0};
    const pivotAnkleR = {x: 0.6, y: -2.95, z: 0};
    const pivotAnkleL = {x: -0.6, y: -2.95, z: 0};

    const pivotWaist = {x: 0, y: 2.7, z: 0};
    const torsoGrp = new THREE.Group(); torsoGrp.position.set(pivotWaist.x, pivotWaist.y, pivotWaist.z); characterGroup.add(torsoGrp);

    const shoulderGrpR = new THREE.Group(); shoulderGrpR.position.set(pivotArmR.x - pivotWaist.x, pivotArmR.y - pivotWaist.y, pivotArmR.z - pivotWaist.z); torsoGrp.add(shoulderGrpR);
    const shoulderGrpL = new THREE.Group(); shoulderGrpL.position.set(pivotArmL.x - pivotWaist.x, pivotArmL.y - pivotWaist.y, pivotArmL.z - pivotWaist.z); torsoGrp.add(shoulderGrpL);

    const upperArmR = new THREE.Group(); upperArmR.rotation.z = -Math.PI / 2 + 0.15; shoulderGrpR.add(upperArmR);
    const upperArmL = new THREE.Group(); upperArmL.rotation.z = Math.PI / 2 - 0.15; shoulderGrpL.add(upperArmL);

    const elbowGrpR = new THREE.Group(); elbowGrpR.position.set(pivotElbowR.x - pivotArmR.x, pivotElbowR.y - pivotArmR.y, pivotElbowR.z - pivotArmR.z); elbowGrpR.rotation.y = -0.22; upperArmR.add(elbowGrpR);
    const elbowGrpL = new THREE.Group(); elbowGrpL.position.set(pivotElbowL.x - pivotArmL.x, pivotElbowL.y - pivotArmL.y, pivotElbowL.z - pivotArmL.z); elbowGrpL.rotation.y = 0.22; upperArmL.add(elbowGrpL);

    const lowerArmR = new THREE.Group(); 
    lowerArmR.rotation.x = Math.PI / 2;
    elbowGrpR.add(lowerArmR);

    const lowerArmL = new THREE.Group(); 
    lowerArmL.rotation.x = Math.PI / 2;
    elbowGrpL.add(lowerArmL);

    const wristGrpR = new THREE.Group(); wristGrpR.position.set(pivotWristR.x - pivotElbowR.x, pivotWristR.y - pivotElbowR.y, pivotWristR.z - pivotElbowR.z); lowerArmR.add(wristGrpR);
    const wristGrpL = new THREE.Group(); wristGrpL.position.set(pivotWristL.x - pivotElbowL.x, pivotWristL.y - pivotElbowL.y, pivotWristL.z - pivotElbowL.z); lowerArmL.add(wristGrpL);
    
    // Dobra a mão em direção ao corpo um pouco
    wristGrpR.rotation.y = -0.3;
    wristGrpL.rotation.y = 0.3;

    const hipGrpR = new THREE.Group(); hipGrpR.position.set(pivotLegR.x, pivotLegR.y, pivotLegR.z); characterGroup.add(hipGrpR);
    const hipGrpL = new THREE.Group(); hipGrpL.position.set(pivotLegL.x, pivotLegL.y, pivotLegL.z); characterGroup.add(hipGrpL);

    const upperLegR = new THREE.Group(); hipGrpR.add(upperLegR);
    const upperLegL = new THREE.Group(); hipGrpL.add(upperLegL);

    const kneeGrpR = new THREE.Group(); kneeGrpR.position.set(pivotKneeR.x - pivotLegR.x, pivotKneeR.y - pivotLegR.y, pivotKneeR.z - pivotLegR.z); upperLegR.add(kneeGrpR);
    const kneeGrpL = new THREE.Group(); kneeGrpL.position.set(pivotKneeL.x - pivotLegL.x, pivotKneeL.y - pivotLegL.y, pivotKneeL.z - pivotLegL.z); upperLegL.add(kneeGrpL);

    const lowerLegR = new THREE.Group(); kneeGrpR.add(lowerLegR);
    const lowerLegL = new THREE.Group(); kneeGrpL.add(lowerLegL);

    const ankleGrpR = new THREE.Group(); ankleGrpR.position.set(pivotAnkleR.x - pivotKneeR.x, pivotAnkleR.y - pivotKneeR.y, pivotAnkleR.z - pivotKneeR.z); lowerLegR.add(ankleGrpR);
    const ankleGrpL = new THREE.Group(); ankleGrpL.position.set(pivotAnkleL.x - pivotKneeL.x, pivotAnkleL.y - pivotKneeL.y, pivotAnkleL.z - pivotKneeL.z); lowerLegL.add(ankleGrpL);

    const footR = new THREE.Group(); ankleGrpR.add(footR);
    const footL = new THREE.Group(); ankleGrpL.add(footL);

    function createBlock(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Group = characterGroup, pivot = {x:0,y:0,z:0}) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x - pivot.x, y - pivot.y, z - pivot.z);
        mesh.castShadow = true;
        parent.add(mesh); return mesh;
    }

    function createHandBase(w: number, hInner: number, hOuter: number, d: number, material: THREE.Material, x: number, y: number, z: number, isLeft: boolean, parent: THREE.Group = characterGroup, pivot = {x:0,y:0,z:0}) {
        const geometry = new THREE.BoxGeometry(w, 1, d);
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            let px = positions.getX(i);
            let py = positions.getY(i);
            positions.setY(i, py * (isLeft ? (px > 0 ? hInner : hOuter) : (px < 0 ? hInner : hOuter)));
        }
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x - pivot.x, y - pivot.y, z - pivot.z);
        mesh.castShadow = true;
        parent.add(mesh); return mesh;
    }

    function createShoe(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Group = characterGroup, pivot = {x:0,y:0,z:0}) {
        const geometry = new THREE.BoxGeometry(w, h, d);
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            if (positions.getY(i) > 0 && positions.getZ(i) > 0) positions.setY(i, positions.getY(i) - (h * 0.4)); 
        }
        geometry.computeVertexNormals(); 
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x - pivot.x, y - pivot.y, z - pivot.z);
        mesh.castShadow = true;
        parent.add(mesh); return mesh;
    }

    // ==========================================
    // SEPARAÇÃO DE OUTFITS (SOCCER VS WARRIOR)
    // ==========================================
    const soccerObjects: THREE.Object3D[] = [];
    const warriorObjects: THREE.Object3D[] = [];

    const addSoccer = <T extends THREE.Object3D>(obj: T): T => {
      soccerObjects.push(obj);
      return obj;
    };

    const addWarrior = <T extends THREE.Object3D>(obj: T): T => {
      warriorObjects.push(obj);
      return obj;
    };

    function createSoccerBlock(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Group = characterGroup, pivot = {x:0,y:0,z:0}) {
      const mesh = createBlock(w, h, d, material, x, y, z, parent, pivot);
      soccerObjects.push(mesh);
      return mesh;
    }

    function createWarriorBlock(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Group = characterGroup, pivot = {x:0,y:0,z:0}) {
      const mesh = createBlock(w, h, d, material, x, y, z, parent, pivot);
      warriorObjects.push(mesh);
      return mesh;
    }

    const armorColors = {
      silver: new THREE.MeshStandardMaterial({ color: 0x9fa6b2, roughness: 0.3, metalness: 0.7 }),
      silverLight: new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.2, metalness: 0.8 }),
      silverShiny: new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.1, metalness: 0.9 }),
      silverDark: new THREE.MeshLambertMaterial({ color: 0x64748b }),
      chainmail: new THREE.MeshLambertMaterial({ color: 0x475569 }),
      blackTabard: new THREE.MeshLambertMaterial({ color: 0x18181b }),
      redBelt: new THREE.MeshLambertMaterial({ color: 0x991b1b }),
      leather: new THREE.MeshLambertMaterial({ color: 0x451a03 }),
      black: new THREE.MeshLambertMaterial({ color: 0x09090b })
    };

    // CABEÇA GRUPO (PARA GIRAR A CABEÇA SEPARADA DO CORPO)
    const headGrp = new THREE.Group();
    headGrp.position.set(0 - pivotWaist.x, 5.58 - pivotWaist.y, 0 - pivotWaist.z);
    torsoGrp.add(headGrp);

    // CABEÇA E TRONCO BASE (PELE)
    createBlock(1.59, 1.59, 1.59, colors.skin, 0, 0, 0, headGrp);
    createSoccerBlock(1.66, 0.43, 1.66, colors.hair, 0, 0.87, 0, headGrp);
    const eyeR = addSoccer(createBlock(0.14, 0.36, 0.07, colors.black, -0.36, 0.14, 0.80, headGrp));
    const eyeL = addSoccer(createBlock(0.14, 0.36, 0.07, colors.black, 0.36, 0.14, 0.80, headGrp));
    addSoccer(createBlock(0.32, 0.11, 0.07, colors.black, -0.36, 0.43, 0.81, headGrp));
    addSoccer(createBlock(0.32, 0.11, 0.07, colors.black, 0.36, 0.43, 0.81, headGrp));
    addSoccer(createBlock(0.14, 0.36, 0.29, colors.skin, -0.87, 0, 0, headGrp));
    addSoccer(createBlock(0.14, 0.36, 0.29, colors.skin, 0.87, 0, 0, headGrp));
    addSoccer(createBlock(0.43, 0.11, 0.07, colors.black, 0, -0.36, 0.80, headGrp));
    addSoccer(createBlock(0.11, 0.18, 0.07, colors.black, -0.22, -0.29, 0.80, headGrp));
    addSoccer(createBlock(0.11, 0.18, 0.07, colors.black, 0.22, -0.29, 0.80, headGrp));

    createBlock(0.8, 0.5, 0.8, colors.skin, 0, 4.7, 0, torsoGrp, pivotWaist);

    // ==========================================
    // CAMISA SOCCER
    // ==========================================
    createSoccerBlock(2.5, 3.5, 1.5, colors.shirt, 0, 2.7, 0, torsoGrp, pivotWaist); 
    
    // Circle logo on right chest
    const circleGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 32);
    circleGeo.rotateX(Math.PI / 2);
    const circleMesh = new THREE.Mesh(circleGeo, colors.black);
    circleMesh.position.set(0.8 - pivotWaist.x, 3.8 - pivotWaist.y, 0.76 - pivotWaist.z);
    torsoGrp.add(addSoccer(circleMesh));
    
    // Number on the back
    const createShirtNumber = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if(ctx) {
          ctx.fillStyle = 'black';
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 16;
          ctx.lineJoin = 'round';
          ctx.font = 'bold 175px "Elephant", "Georgia", serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeText('10', 128, 140);
          ctx.fillText('10', 128, 140);
      }
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), mat);
      mesh.position.set(0 - pivotWaist.x, 3.0 - pivotWaist.y, -0.76 - pivotWaist.z);
      mesh.rotation.y = Math.PI; 
      torsoGrp.add(addSoccer(mesh));
    };
    createShirtNumber();
    
    createSoccerBlock(1.0, 0.1, 1.0, colors.black, 0, 4.46, 0.26, torsoGrp, pivotWaist);

    // ==========================================
    // CAPACETE E ARMADURA DE GUERREIRO (WARRIOR)
    // ==========================================
    const helmetGrp = addWarrior(new THREE.Group());
    helmetGrp.position.set(0, 0.14, 0);
    headGrp.add(helmetGrp);

    // Capacete balde medieval LEGO (Great Helm com pino no topo, viseira, cruz fleur-de-lis e furos de respiração)
    
    // 1. Pino LEGO no topo (Top Stud)
    const topStudGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.22, 16);
    const topStudMesh = new THREE.Mesh(topStudGeo, armorColors.silverShiny);
    topStudMesh.position.set(0, 1.05, 0);
    helmetGrp.add(addWarrior(topStudMesh));

    // 2. Topo cônico/balde do capacete (Tapered Bucket Top)
    const topDomeGeo = new THREE.CylinderGeometry(0.78, 0.89, 0.65, 24);
    const topDomeMesh = new THREE.Mesh(topDomeGeo, armorColors.silver);
    topDomeMesh.position.set(0, 0.62, 0);
    helmetGrp.add(addWarrior(topDomeMesh));

    // Anel superior de detalhes (Borda superior)
    const topRimGeo = new THREE.CylinderGeometry(0.79, 0.80, 0.08, 24);
    const topRimMesh = new THREE.Mesh(topRimGeo, armorColors.silverDark);
    topRimMesh.position.set(0, 0.94, 0);
    helmetGrp.add(addWarrior(topRimMesh));

    // 3. Casco inferior (Costas e Lados)
    const lowerBackGeo = new THREE.CylinderGeometry(0.89, 0.89, 0.95, 24, 1, true, Math.PI * 0.25, Math.PI * 1.5);
    const lowerBackMesh = new THREE.Mesh(lowerBackGeo, armorColors.silver);
    lowerBackMesh.position.set(0, -0.18, 0);
    helmetGrp.add(addWarrior(lowerBackMesh));

    // Fechamento no fundo/nuca
    createWarriorBlock(1.78, 0.95, 0.18, armorColors.silver, 0, -0.18, -0.80, helmetGrp);
    createWarriorBlock(0.18, 0.95, 1.60, armorColors.silver, -0.80, -0.18, 0, helmetGrp);
    createWarriorBlock(0.18, 0.95, 1.60, armorColors.silver, 0.80, -0.18, 0, helmetGrp);

    // 4. Placa frontal inferior (Queixo com furos de respiração)
    createWarriorBlock(1.58, 0.55, 0.14, armorColors.silver, 0, -0.38, 0.83, helmetGrp);

    // 5. Moldura de Prata Brilhante e Cruz Nasal com Ponta Fleur-de-lis (Testa)
    // Faixa da testa (acima dos olhos)
    createWarriorBlock(1.58, 0.15, 0.14, armorColors.silverShiny, 0, 0.15, 0.84, helmetGrp);
    // Faixa das bochechas (abaixo dos olhos)
    createWarriorBlock(1.58, 0.15, 0.14, armorColors.silverShiny, 0, -0.12, 0.84, helmetGrp);
    // Molduras laterais dos olhos
    createWarriorBlock(0.14, 0.38, 0.14, armorColors.silverShiny, -0.72, 0.01, 0.84, helmetGrp);
    createWarriorBlock(0.14, 0.38, 0.14, armorColors.silverShiny, 0.72, 0.01, 0.84, helmetGrp);

    // Guarda nasal vertical central
    createWarriorBlock(0.15, 1.05, 0.16, armorColors.silverShiny, 0, 0.05, 0.85, helmetGrp);

    // Ponta em Lança / Fleur-de-lis no topo da cruz (na testa)
    createWarriorBlock(0.38, 0.10, 0.12, armorColors.silverShiny, 0, 0.44, 0.85, helmetGrp);
    const spearTipGeo = new THREE.ConeGeometry(0.15, 0.26, 4);
    spearTipGeo.rotateY(Math.PI / 4);
    const spearTipMesh = new THREE.Mesh(spearTipGeo, armorColors.silverShiny);
    spearTipMesh.position.set(0, 0.58, 0.85);
    helmetGrp.add(addWarrior(spearTipMesh));

    // 6. Furos Circulares de Respiração no Queixo (5 de cada lado)
    const holeGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.08, 12);
    holeGeo.rotateX(Math.PI / 2);
    const holeMat = armorColors.silverDark;

    const holePositions = [
      // Lado Esquerdo (5 furos)
      { x: -0.30, y: -0.28 },
      { x: -0.50, y: -0.28 },
      { x: -0.20, y: -0.44 },
      { x: -0.40, y: -0.44 },
      { x: -0.60, y: -0.44 },
      // Lado Direito (5 furos)
      { x: 0.30, y: -0.28 },
      { x: 0.50, y: -0.28 },
      { x: 0.20, y: -0.44 },
      { x: 0.40, y: -0.44 },
      { x: 0.60, y: -0.44 },
    ];

    holePositions.forEach(pos => {
      const holeMesh = new THREE.Mesh(holeGeo, holeMat);
      holeMesh.position.set(pos.x, pos.y, 0.88);
      helmetGrp.add(addWarrior(holeMesh));
    });

    // 7. Pinos/Rebites Laterais do Capacete (Orelhas)
    const earTabGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.22, 12);
    earTabGeo.rotateZ(Math.PI / 2);
    const earTabL = new THREE.Mesh(earTabGeo, armorColors.silverShiny);
    earTabL.position.set(-0.88, -0.02, 0);
    helmetGrp.add(addWarrior(earTabL));

    const earTabR = new THREE.Mesh(earTabGeo, armorColors.silverShiny);
    earTabR.position.set(0.88, -0.02, 0);
    helmetGrp.add(addWarrior(earTabR));

    // Túnica e Cinto do Guerreiro
    const armorTorsoGrp = addWarrior(new THREE.Group());
    armorTorsoGrp.position.set(0 - pivotWaist.x, 2.7 - pivotWaist.y, 0 - pivotWaist.z);
    torsoGrp.add(armorTorsoGrp);

    createWarriorBlock(2.55, 3.55, 1.55, armorColors.blackTabard, 0, 0, 0, armorTorsoGrp);

    // Cinto Vermelho com Fivela
    createWarriorBlock(2.62, 0.45, 1.62, armorColors.redBelt, 0, -1.15, 0, armorTorsoGrp);
    for (let bx = -1.0; bx <= 1.0; bx += 0.5) {
      createWarriorBlock(0.1, 0.15, 0.1, armorColors.silverLight, bx, -1.15, 0.82, armorTorsoGrp);
      createWarriorBlock(0.1, 0.15, 0.1, armorColors.silverLight, bx, -1.15, -0.82, armorTorsoGrp);
    }
    createWarriorBlock(0.35, 0.55, 0.15, armorColors.silverLight, 0.3, -1.15, 0.83, armorTorsoGrp);
    const beltTail = createWarriorBlock(0.28, 1.1, 0.12, armorColors.redBelt, 0.3, -1.8, 0.82, armorTorsoGrp);
    beltTail.rotation.z = -0.12;

    // Cota de malha no pescoço
    createWarriorBlock(1.2, 0.4, 1.2, armorColors.chainmail, 0, 1.75, 0, armorTorsoGrp);

    const hw = 0.6, hInner = 0.68, hOuter = 0.7, armDepth = 0.35, handDepth = 0.25;
    const fingLenOuter = 0.4435, fingLenMid = 0.5125, fingW = 0.2, thumbLen = 0.55, thumbW = 0.2;
    const spreadAngle = Math.atan2((hOuter - hInner) / 2, hw); 

    // Helper para criar dedo articulado com nó de articulação colado na palma da mão
    function createArticulatedFinger(
      startX: number,
      startY: number,
      startZ: number,
      length: number,
      width: number,
      depth: number,
      angleZ: number,
      isLeftHand: boolean,
      parent: THREE.Group,
      pivot: { x: number; y: number; z: number },
      isClosed: boolean = false
    ) {
      // 1. Articulação principal colada na palma da mão (Knuckle Joint)
      const jointRadius = width * 0.58;
      const jointMesh = new THREE.Mesh(new THREE.SphereGeometry(jointRadius, 8, 8), colors.skin);
      jointMesh.position.set(startX - pivot.x, startY - pivot.y, startZ - pivot.z);
      jointMesh.castShadow = true;
      parent.add(jointMesh);

      const seg1Len = length * 0.52;
      const seg2Len = length * 0.48;

      if (isClosed) {
        // DEDOS FECHADOS A 90 GRAUS PARA A FRENTE DO MODELO (+Y local no wristGrp = +Z mundo)
        const p1CenterX = startX;
        const p1CenterY = startY + (seg1Len / 2);
        const p1CenterZ = startZ;

        // Segmento 1: Projetado 90 graus para a frente do modelo
        createBlock(width, seg1Len, depth, colors.skin, p1CenterX, p1CenterY, p1CenterZ, parent, pivot);

        // Segunda articulação na frente do dedo
        const joint2X = startX;
        const joint2Y = startY + seg1Len;
        const joint2Z = startZ;
        const joint2Mesh = new THREE.Mesh(new THREE.SphereGeometry(jointRadius * 0.82, 8, 8), colors.skin);
        joint2Mesh.position.set(joint2X - pivot.x, joint2Y - pivot.y, joint2Z - pivot.z);
        joint2Mesh.castShadow = true;
        parent.add(joint2Mesh);

        // Segmento 2: Curvado 90 graus para dentro (em direção ao centro da palma)
        const inwardDir = isLeftHand ? 1 : -1;
        const p2CenterX = joint2X + inwardDir * (seg2Len / 2);
        const p2CenterY = joint2Y;
        const p2CenterZ = joint2Z;

        createBlock(seg2Len, depth * 0.88, width * 0.88, colors.skin, p2CenterX, p2CenterY, p2CenterZ, parent, pivot);
      } else {
        // DEDOS ABERTOS / ESTICADOS (Especialmente o Dedão / Polegar)
        const dir = isLeftHand ? -1 : 1;
        const cosA = Math.cos(angleZ);
        const sinA = Math.sin(angleZ);

        const p1CenterX = startX + dir * (seg1Len / 2) * cosA;
        const p1CenterY = startY + (seg1Len / 2) * sinA;

        const phalanx1 = createBlock(seg1Len, width, depth, colors.skin, p1CenterX, p1CenterY, startZ, parent, pivot);
        phalanx1.rotation.z = isLeftHand ? -angleZ : angleZ;

        const joint2X = startX + dir * seg1Len * cosA;
        const joint2Y = startY + seg1Len * sinA;
        const joint2Mesh = new THREE.Mesh(new THREE.SphereGeometry(jointRadius * 0.82, 8, 8), colors.skin);
        joint2Mesh.position.set(joint2X - pivot.x, joint2Y - pivot.y, startZ - pivot.z);
        joint2Mesh.castShadow = true;
        parent.add(joint2Mesh);

        const curlAngle = angleZ - 0.12;
        const cosC = Math.cos(curlAngle);
        const sinC = Math.sin(curlAngle);

        const p2CenterX = joint2X + dir * (seg2Len / 2) * cosC;
        const p2CenterY = joint2Y + (seg2Len / 2) * sinC;

        const phalanx2 = createBlock(seg2Len, width * 0.88, depth * 0.88, colors.skin, p2CenterX, p2CenterY, startZ, parent, pivot);
        phalanx2.rotation.z = isLeftHand ? -curlAngle : curlAngle;
      }
    }

    // BRAÇO DIREITO (SOCCER & WARRIOR)
    createSoccerBlock(2.1, 0.65, 0.65, colors.shirt, 2.30, 4.35, 0, upperArmR, pivotArmR);
    createSoccerBlock(1.9, 0.05, 0.15, colors.black, 2.20, 4.68, -0.2, upperArmR, pivotArmR); 
    createSoccerBlock(1.9, 0.05, 0.15, colors.black, 2.20, 4.68, 0, upperArmR, pivotArmR);
    createSoccerBlock(1.9, 0.05, 0.15, colors.black, 2.20, 4.68, 0.2, upperArmR, pivotArmR);
    
    // Hombreira e Armadura Braço Direito (Warrior)
    createWarriorBlock(1.2, 0.9, 0.9, armorColors.silver, 2.30, 4.55, 0, upperArmR, pivotArmR);
    createWarriorBlock(2.15, 0.70, 0.70, armorColors.silverDark, 2.30, 4.35, 0, upperArmR, pivotArmR);
    createWarriorBlock(1.55, 0.42, 0.42, armorColors.silver, 4.10, 4.35, 0, lowerArmR, pivotElbowR);

    createBlock(1.5, 0.35, armDepth, colors.skin, 4.10, 4.35, 0, lowerArmR, pivotElbowR); 
    createHandBase(hw, hInner, hOuter, handDepth, colors.skin, 5.15, 4.35, 0, false, wristGrpR, pivotWristR); 
    
    // Polegar com Articulação na Palma
    createArticulatedFinger(5.05, 4.68, 0, thumbLen, thumbW, handDepth, 65 * Math.PI / 180, false, wristGrpR, pivotWristR);
    // Dedos Articulados da Mão Direita
    createArticulatedFinger(5.45, 4.60, 0, fingLenOuter, fingW, handDepth, spreadAngle, false, wristGrpR, pivotWristR);
    createArticulatedFinger(5.45, 4.35, 0, fingLenMid, fingW, handDepth, 0, false, wristGrpR, pivotWristR);
    createArticulatedFinger(5.45, 4.10, 0, fingLenOuter, fingW, handDepth, -spreadAngle, false, wristGrpR, pivotWristR);

    // ESPADA MEDIEVAL NA MÃO ESQUERDA
    const swordGroup = addWarrior(new THREE.Group());
    // Posicionada na frente do modelo (+Z mundo = +Y local em wristGrpL), no centro da mão e pegada dos dedos
    swordGroup.position.set(-5.15 - pivotWristL.x, 4.58 - pivotWristL.y, 0 - pivotWristL.z);
    swordGroup.rotation.set(0, Math.PI / 2, 0);
    wristGrpL.add(swordGroup);

    createWarriorBlock(0.22, 0.75, 0.22, armorColors.leather, 0, -0.3, 0, swordGroup);
    createWarriorBlock(0.38, 0.38, 0.38, armorColors.silverLight, 0, -0.75, 0, swordGroup);
    createWarriorBlock(1.3, 0.22, 0.35, armorColors.silverLight, 0, 0.12, 0, swordGroup);
    createWarriorBlock(0.16, 3.8, 0.45, armorColors.silverShiny, 0, 2.1, 0, swordGroup);
    createWarriorBlock(0.08, 0.6, 0.25, armorColors.silverShiny, 0, 4.2, 0, swordGroup);

    // BRAÇO ESQUERDO (SOCCER & WARRIOR)
    createSoccerBlock(2.1, 0.65, 0.65, colors.shirt, -2.30, 4.35, 0, upperArmL, pivotArmL); 
    createSoccerBlock(1.9, 0.05, 0.15, colors.black, -2.20, 4.68, -0.2, upperArmL, pivotArmL); 
    createSoccerBlock(1.9, 0.05, 0.15, colors.black, -2.20, 4.68, 0, upperArmL, pivotArmL);
    createSoccerBlock(1.9, 0.05, 0.15, colors.black, -2.20, 4.68, 0.2, upperArmL, pivotArmL);
    
    // Hombreira e Armadura Braço Esquerdo (Warrior)
    createWarriorBlock(1.2, 0.9, 0.9, armorColors.silver, -2.30, 4.55, 0, upperArmL, pivotArmL);
    createWarriorBlock(2.15, 0.70, 0.70, armorColors.silverDark, -2.30, 4.35, 0, upperArmL, pivotArmL);
    createWarriorBlock(1.55, 0.42, 0.42, armorColors.silver, -4.10, 4.35, 0, lowerArmL, pivotElbowL);

    createBlock(1.5, 0.35, armDepth, colors.skin, -4.10, 4.35, 0, lowerArmL, pivotElbowL); 
    createHandBase(hw, hInner, hOuter, handDepth, colors.skin, -5.15, 4.35, 0, true, wristGrpL, pivotWristL); 
    
    // Polegar com Articulação na Palma (Mão Esquerda) - NÃO DOBRA (isClosed = false)
    createArticulatedFinger(-5.05, 4.68, 0, thumbLen, thumbW, handDepth, 65 * Math.PI / 180, true, wristGrpL, pivotWristL, false);
    // Dedos Articulados da Mão Esquerda (Fechados em 90° segurando a espada)
    createArticulatedFinger(-5.45, 4.60, 0, fingLenOuter, fingW, handDepth, spreadAngle, true, wristGrpL, pivotWristL, true);
    createArticulatedFinger(-5.45, 4.35, 0, fingLenMid, fingW, handDepth, 0, true, wristGrpL, pivotWristL, true);
    createArticulatedFinger(-5.45, 4.10, 0, fingLenOuter, fingW, handDepth, -spreadAngle, true, wristGrpL, pivotWristL, true);

    // ESCUDO MEDIEVAL EM V ARREDONDADO (HEATER SHIELD) NA MÃO DIREITA (OPOSTO DA PALMA / DORSO DA MÃO, ESCALA 1.5X)
    const shieldGroup = addWarrior(new THREE.Group());
    // Posicionado no dorso/costas da mão direita (oposto da palma: -Z em relação à mão)
    shieldGroup.position.set(5.15 - pivotWristR.x + 0.25, 3.65 - pivotWristR.y, -0.42 - pivotWristR.z);
    shieldGroup.rotation.set(0, Math.PI - 0.2, 0);
    shieldGroup.scale.set(1.5, 1.5, 1.5); // Tamanho 1.5x
    wristGrpR.add(shieldGroup);

    // Shape do corpo do escudo (Preto com túnica)
    const shieldShape = new THREE.Shape();
    const sW = 1.15;
    const sHTop = 1.45;
    const sHBot = -1.55;

    shieldShape.moveTo(-sW + 0.35, sHTop);
    shieldShape.quadraticCurveTo(0, sHTop + 0.22, sW - 0.35, sHTop);
    shieldShape.quadraticCurveTo(sW, sHTop, sW, sHTop - 0.35);
    shieldShape.bezierCurveTo(sW * 0.92, 0.2, sW * 0.5, sHBot + 0.5, 0, sHBot);
    shieldShape.bezierCurveTo(-sW * 0.5, sHBot + 0.5, -sW * 0.92, 0.2, -sW, sHTop - 0.35);
    shieldShape.quadraticCurveTo(-sW, sHTop, -sW + 0.35, sHTop);

    const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.03,
      bevelThickness: 0.03
    });
    const shieldMesh = new THREE.Mesh(shieldGeo, armorColors.blackTabard);
    shieldMesh.position.set(0, 0, -0.06);
    shieldMesh.castShadow = true;
    shieldGroup.add(addWarrior(shieldMesh));

    // Moldura / Borda Prateada em V arredondado
    const rimShape = new THREE.Shape();
    const rW = 1.25;
    const rHTop = 1.55;
    const rHBot = -1.65;
    rimShape.moveTo(-rW + 0.35, rHTop);
    rimShape.quadraticCurveTo(0, rHTop + 0.24, rW - 0.35, rHTop);
    rimShape.quadraticCurveTo(rW, rHTop, rW, rHTop - 0.35);
    rimShape.bezierCurveTo(rW * 0.92, 0.2, rW * 0.5, rHBot + 0.5, 0, rHBot);
    rimShape.bezierCurveTo(-rW * 0.5, rHBot + 0.5, -rW * 0.92, 0.2, -rW, rHTop - 0.35);
    rimShape.quadraticCurveTo(-rW, rHTop, -rW + 0.35, rHTop);

    const holePath = new THREE.Path();
    const iW = 1.05;
    const iHTop = 1.35;
    const iHBot = -1.42;
    holePath.moveTo(-iW + 0.3, iHTop);
    holePath.quadraticCurveTo(-iW, iHTop, -iW, iHTop - 0.3);
    holePath.bezierCurveTo(-iW * 0.92, 0.2, -iW * 0.5, iHBot + 0.5, 0, iHBot);
    holePath.bezierCurveTo(iW * 0.5, iHBot + 0.5, iW * 0.92, 0.2, iW, iHTop - 0.3);
    holePath.quadraticCurveTo(iW, iHTop, iW - 0.3, iHTop);
    holePath.quadraticCurveTo(0, iHTop + 0.2, -iW + 0.3, iHTop);
    rimShape.holes.push(holePath);

    const rimGeo = new THREE.ExtrudeGeometry(rimShape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.02,
      bevelThickness: 0.02
    });
    const rimMesh = new THREE.Mesh(rimGeo, armorColors.silverLight);
    rimMesh.position.set(0, 0, -0.08);
    rimMesh.castShadow = true;
    shieldGroup.add(addWarrior(rimMesh));

    // PERNAS (SOCCER & WARRIOR)
    createSoccerBlock(1.0, 1.45, 1.0, colors.shirt, 0.6, 0.225, 0, upperLegR, pivotLegR);
    createSoccerBlock(0.05, 1.45, 0.15, colors.black, 1.1, 0.225, -0.2, upperLegR, pivotLegR);
    createSoccerBlock(0.05, 1.45, 0.15, colors.black, 1.1, 0.225, 0, upperLegR, pivotLegR);
    createSoccerBlock(0.05, 1.45, 0.15, colors.black, 1.1, 0.225, 0.2, upperLegR, pivotLegR);
    
    // Saia da Túnica e Greva Direita (Warrior)
    createWarriorBlock(1.08, 1.5, 1.08, armorColors.blackTabard, 0.6, 0.225, 0, upperLegR, pivotLegR);
    createWarriorBlock(0.85, 1.3, 0.85, armorColors.silver, 0.6, -2.325, 0, lowerLegR, pivotKneeR);
    addWarrior(createShoe(0.95, 0.55, 1.85, armorColors.silverDark, 0.6, -3.2, 0.35, footR, pivotAnkleR));

    createBlock(0.8, 0.5, 0.8, colors.skin, 0.6, -0.75, 0, upperLegR, pivotLegR);
    createBlock(0.7, 0.7, 0.7, colors.skin, 0.6, -1.35, 0, lowerLegR, pivotKneeR);

    createSoccerBlock(0.8, 1.25, 0.8, colors.shirt, 0.6, -2.325, 0, lowerLegR, pivotKneeR);
    createSoccerBlock(0.82, 0.1, 0.82, colors.black, 0.6, -1.8, 0, lowerLegR, pivotKneeR);
    createSoccerBlock(0.82, 0.1, 0.82, colors.black, 0.6, -2.1, 0, lowerLegR, pivotKneeR);
    
    addSoccer(createShoe(0.9, 0.5, 1.8, colors.shoe, 0.6, -3.2, 0.35, footR, pivotAnkleR)); 
    addSoccer(createShoe(0.92, 0.15, 1.82, colors.blue, 0.6, -3.525, 0.35, footR, pivotAnkleR));

    createSoccerBlock(1.0, 1.45, 1.0, colors.shirt, -0.6, 0.225, 0, upperLegL, pivotLegL);
    createSoccerBlock(0.05, 1.45, 0.15, colors.black, -1.1, 0.225, -0.2, upperLegL, pivotLegL);
    createSoccerBlock(0.05, 1.45, 0.15, colors.black, -1.1, 0.225, 0, upperLegL, pivotLegL);
    createSoccerBlock(0.05, 1.45, 0.15, colors.black, -1.1, 0.225, 0.2, upperLegL, pivotLegL);

    // Saia da Túnica e Greva Esquerda (Warrior)
    createWarriorBlock(1.08, 1.5, 1.08, armorColors.blackTabard, -0.6, 0.225, 0, upperLegL, pivotLegL);
    createWarriorBlock(0.85, 1.3, 0.85, armorColors.silver, -0.6, -2.325, 0, lowerLegL, pivotKneeL);
    addWarrior(createShoe(0.95, 0.55, 1.85, armorColors.silverDark, -0.6, -3.2, 0.35, footL, pivotAnkleL));

    createBlock(0.8, 0.5, 0.8, colors.skin, -0.6, -0.75, 0, upperLegL, pivotLegL);
    createBlock(0.7, 0.7, 0.7, colors.skin, -0.6, -1.35, 0, lowerLegL, pivotKneeL);

    createSoccerBlock(0.8, 1.25, 0.8, colors.shirt, -0.6, -2.325, 0, lowerLegL, pivotKneeL);
    createSoccerBlock(0.82, 0.1, 0.82, colors.black, -0.6, -1.8, 0, lowerLegL, pivotKneeL);
    createSoccerBlock(0.82, 0.1, 0.82, colors.black, -0.6, -2.1, 0, lowerLegL, pivotKneeL);
    
    addSoccer(createShoe(0.9, 0.5, 1.8, colors.shoe, -0.6, -3.2, 0.35, footL, pivotAnkleL)); 
    addSoccer(createShoe(0.92, 0.15, 1.82, colors.blue, -0.6, -3.525, 0.35, footL, pivotAnkleL));

    // Number on the shorts (front right leg of the shorts)
    const createShortsNumber = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if(ctx) {
          ctx.fillStyle = 'black';
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 14; 
          ctx.lineJoin = 'round';
          ctx.font = 'bold 95px "Elephant", "Georgia", serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeText('10', 64, 64);
          ctx.fillText('10', 64, 64);
      }
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), mat);
      mesh.position.set(0.6 - pivotLegR.x, 0.3 - pivotLegR.y, 0.51 - pivotLegR.z);
      upperLegR.add(addSoccer(mesh));
    };
    createShortsNumber();

    // Escala Final 
    const scaleFactor = 1.75 / 11.225;
    characterGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
    const basePlayerY = 3.45 * scaleFactor;
    characterGroup.position.set(0, basePlayerY, 0); 
    characterGroup.rotation.order = 'YXZ';
    characterGroup.rotation.y = 0;
    scene.add(characterGroup);

    // ==========================================
    // BOLA (BALL)
    // ==========================================
    const ballGroup = new THREE.Group();
    scene.add(ballGroup);

    const loadBall = async () => {
      try {
        const res = await fetch('Ball.dae');
        if (!res.ok) throw new Error('Not found');
        const text = await res.text();
        if (text.trim().toLowerCase().startsWith('<!doctype html')) {
          throw new Error('Retrieved HTML instead of DAE');
        }
        
        const loader = new ColladaLoader();
        const collada = loader.parse(text, '/');
        const dae = collada.scene;
        
        const box = new THREE.Box3().setFromObject(dae);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetDiameter = 0.22; // 22cm
        if (maxDim > 0) {
          const scale = targetDiameter / maxDim;
          dae.scale.set(scale, scale, scale);
        }
        
        box.setFromObject(dae);
        const center = box.getCenter(new THREE.Vector3());
        dae.position.sub(center);
        
        dae.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        ballGroup.add(dae);
      } catch (err) {
        console.log('Ball.dae failed to load, creating fallback ball', err);
        
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#eeeeee';
          ctx.fillRect(0, 0, 512, 256);
          ctx.fillStyle = '#111111';
          const r = 20;
          for (let yy = -1; yy < 7; yy++) {
            for (let xx = -1; xx < 12; xx++) {
              const px = xx * 50 + (yy % 2 === 0 ? 0 : 25);
              const py = yy * 43;
              if ((xx * 2 + yy) % 3 === 0) {
                ctx.beginPath();
                for (let i = 0; i < 5; i++) {
                  ctx.lineTo(px + r * Math.cos(i * 2 * Math.PI / 5 - Math.PI / 2), py + r * Math.sin(i * 2 * Math.PI / 5 - Math.PI / 2));
                }
                ctx.fill();
              }
            }
          }
        }
        const tex = new THREE.CanvasTexture(canvas);
        
        const ballGeo = new THREE.SphereGeometry(0.11, 32, 16);
        const ballMat = new THREE.MeshLambertMaterial({ map: tex });
        const fbBall = new THREE.Mesh(ballGeo, ballMat);
        fbBall.castShadow = true;
        fbBall.receiveShadow = true;
        ballGroup.add(fbBall);
      }
    };
    loadBall();

    ballGroup.position.set(0, 0.11, 0.8);

    const applyVisibility = (mode: 'soccer' | 'warrior') => {
      soccerObjects.forEach(obj => obj.visible = (mode === 'soccer'));
      warriorObjects.forEach(obj => obj.visible = (mode === 'warrior'));
      ballGroup.visible = (mode === 'soccer');
    };

    updateModeVisibilityRef.current = applyVisibility;
    applyVisibility(modeRef.current);

    // ==========================================
    // ANIMACOES
    // ==========================================
    let walkPhase = 0;
    let animationFrameId: number;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    function setAllLoopsToZero(amt: number) {
        const lerpRot = (grp: THREE.Group, x: number, y: number, z: number) => {
            grp.rotation.x += (x - grp.rotation.x) * amt;
            grp.rotation.y += (y - grp.rotation.y) * amt;
            grp.rotation.z += (z - grp.rotation.z) * amt;
        };
        lerpRot(torsoGrp, 0, 0, 0);
        lerpRot(shoulderGrpR, 0, 0, 0);
        lerpRot(shoulderGrpL, 0, 0, 0);
        shoulderGrpR.position.z += (0 - shoulderGrpR.position.z) * amt;
        shoulderGrpL.position.z += (0 - shoulderGrpL.position.z) * amt;
        lerpRot(elbowGrpR, 0, -0.22, 0);
        lerpRot(elbowGrpL, 0, 0.22, 0);
        lerpRot(wristGrpR, 0, -0.3, 0);
        lerpRot(wristGrpL, 0, 0.3, 0);
        lerpRot(hipGrpR, 0, 0, 0);
        lerpRot(hipGrpL, 0, 0, 0);
        lerpRot(kneeGrpR, 0, 0, 0);
        lerpRot(kneeGrpL, 0, 0, 0);
        lerpRot(ankleGrpR, 0, 0, 0);
        lerpRot(ankleGrpL, 0, 0, 0);
        lowerArmR.rotation.x += (Math.PI / 2 - lowerArmR.rotation.x) * amt;
        lowerArmL.rotation.x += (Math.PI / 2 - lowerArmL.rotation.x) * amt;
    }

    let lastBlinkTime = performance.now();
    let nextBlinkInterval = 1500 + Math.random() * 2500;
    const blinkDuration = 120; // 120ms for a quick natural blink

    let lastFrameTime = performance.now();

    let getUpStartRef: {
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number };
      torsoRot: { x: number; y: number; z: number };
      shoulderR: { x: number; y: number; z: number };
      shoulderL: { x: number; y: number; z: number };
      elbowR: { x: number; y: number; z: number };
      elbowL: { x: number; y: number; z: number };
      hipR: { x: number; y: number; z: number };
      hipL: { x: number; y: number; z: number };
      kneeR: { x: number; y: number; z: number };
      kneeL: { x: number; y: number; z: number };
      ankleR: { x: number; y: number; z: number };
      ankleL: { x: number; y: number; z: number };
    } | null = null;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Blinking eyes logic
      const now = performance.now();
      if (now - lastBlinkTime > nextBlinkInterval) {
        lastBlinkTime = now;
        nextBlinkInterval = 1500 + Math.random() * 2500;
      }
      const timeSinceBlink = now - lastBlinkTime;
      if (timeSinceBlink < blinkDuration) {
        const pBlink = Math.sin((timeSinceBlink / blinkDuration) * Math.PI);
        const scaleY = 1.0 - pBlink * 0.9;
        eyeR.scale.y = scaleY;
        eyeL.scale.y = scaleY;
      } else {
        eyeR.scale.y = 1.0;
        eyeL.scale.y = 1.0;
      }

      let dt = now - lastFrameTime;
      lastFrameTime = now;
      if (dt > 100) dt = 16.6;

      const speedFactor = slowMotionRef.current ? 0.25 : 1.0;
      const scaledDt = dt * speedFactor;

      actionElapsedRef.current += scaledDt;

      const action = actionRef.current;
      if (action !== 'get_up') {
        getUpStartRef = null;
      }
      const elapsed = actionElapsedRef.current;
      
      const durations: Record<string, number> = {
        kick: 800, short_pass_normal: 800, short_pass_trivela: 800, tackle: 2000, header: 1000, header_standing: 1000, chest_trap: 3500, 
        gk_dive: 1500, gk_dive_low: 1500, gk_knees: 1200, fall: 1500, get_up: 2000,
        throw_in: 4500
      };

      const duration = durations[action] || 1000;
      let p = elapsed / duration;
      
      const isOneShot = action !== 'idle' && action !== 'walk' && action !== 'run' && action !== 'jog' && action !== 'corte_parado';

      if (isOneShot && p >= 1.0) {
        if (['fall', 'gk_knees', 'gk_dive', 'gk_dive_low'].includes(action)) {
           p = 1.0; 
        } else {
           // Safely update state without triggering an immediate re-render bug
           setActiveAction((prev) => {
             if (prev !== 'idle') {
               actionRef.current = 'idle';
               return 'idle';
             }
             return prev;
           });
           p = 1.0;
        }
      }

      if (!isOneShot) {
        let targetX = 0;
        let targetY = 0.11;
        let targetZ = 0.8;
        let targetRotX = 0;
        let targetRotY = 0;
        let targetRotZ = 0;

        if (action === 'walk' || action === 'jog' || action === 'run') {
          // Dynamic dribble simulation:
          // The ball rolls and oscillates forward/backward on the Z-axis in sync with the swinging feet!
          const rollFactor = action === 'run' ? 3.6 : (action === 'jog' ? 2.3 : 1.2);
          const oscFactor = action === 'run' ? 0.15 : (action === 'jog' ? 0.09 : 0.04);
          targetZ = 0.82 + Math.sin(walkPhase * 2) * oscFactor;
          targetX = Math.cos(walkPhase) * (action === 'run' ? 0.05 : 0.02);
          targetRotX = walkPhase * rollFactor;
        }

        ballGroup.position.x += (targetX - ballGroup.position.x) * 0.15;
        ballGroup.position.y += (targetY - ballGroup.position.y) * 0.15;
        ballGroup.position.z += (targetZ - ballGroup.position.z) * 0.15;
        
        if (action === 'walk' || action === 'jog' || action === 'run') {
          ballGroup.rotation.x = targetRotX;
        } else {
          ballGroup.rotation.x += (0 - ballGroup.rotation.x) * 0.12;
        }
        ballGroup.rotation.y += (targetRotY - ballGroup.rotation.y) * 0.12;
        ballGroup.rotation.z += (targetRotZ - ballGroup.rotation.z) * 0.12;
      }

      // Suavemente zera rotação da cabeça por padrão (sobrescrito no idle)
      headGrp.rotation.y += (0 - headGrp.rotation.y) * 0.1;

      if (action === 'idle') {
        setAllLoopsToZero(0.1);

        // Animação Idle: Girar APENAS a cabeça com pausa (gira, pausa, gira, pausa)
        const idleTime = now * 0.0016;
        const headTurn = Math.max(-0.45, Math.min(0.45, Math.sin(idleTime) * 0.9));
        const breathY = Math.sin(idleTime * 2) * 0.012;

        headGrp.rotation.y = headTurn;
        torsoGrp.rotation.y = 0;
        torsoGrp.rotation.z = 0;

        characterGroup.position.x += (0 - characterGroup.position.x) * 0.1;
        characterGroup.position.y += (basePlayerY + breathY - characterGroup.position.y) * 0.1;
        characterGroup.position.z += (0 - characterGroup.position.z) * 0.1;
        characterGroup.rotation.x += (0 - characterGroup.rotation.x) * 0.1;
        characterGroup.rotation.z += (0 - characterGroup.rotation.z) * 0.1;
        
        let targetRotY = 0;
        let diff = targetRotY - characterGroup.rotation.y;
        while(diff < -Math.PI) diff += Math.PI * 2;
        while(diff > Math.PI) diff -= Math.PI * 2;
        characterGroup.rotation.y += diff * 0.1;
      } 
      else if (action === 'walk' || action === 'jog' || action === 'run') {
        let phaseInc = 0.075;
        let swing = 0.58;
        let liftY = 0.04;
        let tiltX = 0.04;
        let rotX_torso = 0.02;
        let rotY_torso = 0.12;
        let rotZ_torso = 0.04;
        let armBendBase = 0.10;
        let armBendSwing = 0.30;
        let moveSpeed = 0.026;

        let forwardKneeBend = 0.20;
        let backwardKneeBend = 0.10;
        let swingKneeFlex = 0.60;
        let stanceKneeFlex = 0.10;

        if (action === 'run') {
          phaseInc = 0.14;
          swing = 1.05;
          liftY = 0.08;
          tiltX = 0.22;
          rotX_torso = 0.12;
          rotY_torso = 0.22;
          rotZ_torso = 0.08;
          armBendBase = 0.95;
          armBendSwing = 0.90;
          moveSpeed = 0.082;

          forwardKneeBend = 0.35;
          backwardKneeBend = 0.20;
          swingKneeFlex = 1.05;
          stanceKneeFlex = 0.18;
        } else if (action === 'jog') {
          phaseInc = 0.105;
          swing = 0.80;
          liftY = 0.05;
          tiltX = 0.14;
          rotX_torso = 0.08;
          rotY_torso = 0.17;
          rotZ_torso = 0.06;
          armBendBase = 0.60;
          armBendSwing = 0.85;
          moveSpeed = 0.052;

          forwardKneeBend = 0.28;
          backwardKneeBend = 0.15;
          swingKneeFlex = 0.85;
          stanceKneeFlex = 0.14;
        }

        walkPhase += phaseInc * speedFactor;
        
        // Steer character towards walk target if set
        if (walkTargetRef.current) {
          const dx = walkTargetRef.current.x - characterGroup.position.x;
          const dz = walkTargetRef.current.z - characterGroup.position.z;
          const dist = Math.hypot(dx, dz);

          if (dist > 0.4) {
            const targetAngle = Math.atan2(dx, dz);
            let diff = targetAngle - characterGroup.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            characterGroup.rotation.y += diff * 0.15;
          } else {
            walkTargetRef.current = null;
            if (targetMarkerRef.current) {
              targetMarkerRef.current.visible = false;
            }
            setAction('idle');
          }
        }

        // Move character forward strictly in the direction he is facing (local +Z)
        const forwardX = Math.sin(characterGroup.rotation.y);
        const forwardZ = Math.cos(characterGroup.rotation.y);
        characterGroup.position.x += forwardX * moveSpeed * speedFactor;
        characterGroup.position.z += forwardZ * moveSpeed * speedFactor;
        
        const sinPh = Math.sin(walkPhase);
        const cosPh = Math.cos(walkPhase);

        shoulderGrpR.rotation.x = sinPh * swing;
        shoulderGrpL.rotation.x = -sinPh * swing;
        shoulderGrpR.position.z = sinPh * 0.3 * scaleFactor;
        shoulderGrpL.position.z = -sinPh * 0.3 * scaleFactor;

        // Smooth elbow flex as arms swing
        elbowGrpR.rotation.y = -(armBendBase + (0.5 - 0.5 * sinPh) * armBendSwing);
        elbowGrpL.rotation.y = (armBendBase + (0.5 + 0.5 * sinPh) * armBendSwing);

        // Smooth hip and knee motion
        hipGrpR.rotation.x = -sinPh * swing;
        hipGrpL.rotation.x = sinPh * swing;

        const kneeR = stanceKneeFlex + 0.5 * (1 + cosPh) * swingKneeFlex + (0.5 + 0.5 * sinPh) * forwardKneeBend;
        const kneeL = stanceKneeFlex + 0.5 * (1 - cosPh) * swingKneeFlex + (0.5 - 0.5 * sinPh) * forwardKneeBend;

        kneeGrpR.rotation.x = kneeR;
        kneeGrpL.rotation.x = kneeL;

        // Smooth ankle roll
        ankleGrpR.rotation.x = -cosPh * 0.15 - sinPh * 0.08;
        ankleGrpL.rotation.x = cosPh * 0.15 + sinPh * 0.08;

        // Smooth body vertical bounce twice per gait cycle
        characterGroup.position.y = basePlayerY + (0.5 - 0.5 * Math.cos(walkPhase * 2)) * liftY;
        characterGroup.rotation.x = tiltX;
        characterGroup.rotation.z += (0 - characterGroup.rotation.z) * 0.1;
        
        // Waist/torso rotates and tilts smoothly to accompany the physical swing
        torsoGrp.rotation.x = rotX_torso;
        torsoGrp.rotation.y = -sinPh * rotY_torso;
        torsoGrp.rotation.z = cosPh * rotZ_torso;
      } 
      else if (action === 'corte_parado') {
        const rate = 0.15;
        
        // Reset secondary joints to idle/neutral poses
        setAllLoopsToZero(rate);

        // Keep upright: no forward torso tilt, no rotation, centered x/z
        characterGroup.position.x += (0 - characterGroup.position.x) * rate;
        characterGroup.position.y += ((basePlayerY - 0.08 * scaleFactor) - characterGroup.position.y) * rate;
        characterGroup.position.z += (0 - characterGroup.position.z) * rate;
        characterGroup.rotation.x += (0 - characterGroup.rotation.x) * rate; 
        characterGroup.rotation.y += (0 - characterGroup.rotation.y) * rate;
        characterGroup.rotation.z += (0 - characterGroup.rotation.z) * rate;
        
        // Upright torso
        torsoGrp.rotation.x += (0 - torsoGrp.rotation.x) * rate;
        torsoGrp.rotation.y += (0 - torsoGrp.rotation.y) * rate;
        torsoGrp.rotation.z += (0 - torsoGrp.rotation.z) * rate;

        // Open/widen the compass of thighs/hips (Substantial side-to-side spread, completely aligned on the X-axis)
        hipGrpR.rotation.z += (0.45 - hipGrpR.rotation.z) * rate;     // spread right leg outward
        hipGrpL.rotation.z += (-0.45 - hipGrpL.rotation.z) * rate;   // spread left leg outward
        hipGrpR.rotation.x += (0 - hipGrpR.rotation.x) * rate;        // right leg aligned side-to-side
        hipGrpL.rotation.x += (0 - hipGrpL.rotation.x) * rate;        // left leg aligned side-to-side
        hipGrpR.rotation.y += (0 - hipGrpR.rotation.y) * rate;
        hipGrpL.rotation.y += (0 - hipGrpL.rotation.y) * rate;

        // Keep legs straight but spread
        kneeGrpR.rotation.x += (0 - kneeGrpR.rotation.x) * rate;
        kneeGrpL.rotation.x += (0 - kneeGrpL.rotation.x) * rate;
        kneeGrpR.rotation.y += (0 - kneeGrpR.rotation.y) * rate;
        kneeGrpL.rotation.y += (0 - kneeGrpL.rotation.y) * rate;

        // Support flat feet on the ground: ankles flexed Z counter-rotated to stay flat
        ankleGrpR.rotation.x += (0 - ankleGrpR.rotation.x) * rate;
        ankleGrpL.rotation.x += (0 - ankleGrpL.rotation.x) * rate;
        ankleGrpR.rotation.z += (-0.45 - ankleGrpR.rotation.z) * rate;
        ankleGrpL.rotation.z += (0.45 - ankleGrpL.rotation.z) * rate;
        ankleGrpR.rotation.y += (0 - ankleGrpR.rotation.y) * rate;
        ankleGrpL.rotation.y += (0 - ankleGrpL.rotation.y) * rate;
      }
      else if (action === 'kick') {
        if(p < 0.2) {
          let t = p/0.2;
          characterGroup.position.x = lerp(0, 1.0*scaleFactor, t);
          hipGrpL.rotation.x = lerp(0, -0.8, t);
          kneeGrpL.rotation.x = lerp(0, 0.2, t);
          hipGrpR.rotation.x = lerp(0, 0.5, t);
          kneeGrpR.rotation.x = lerp(0, 0.5, t);
          shoulderGrpR.rotation.x = lerp(0, -0.8, t);
          shoulderGrpL.rotation.x = lerp(0, 0.8, t);
          elbowGrpR.rotation.y = lerp(0, -0.5, t);
          elbowGrpL.rotation.y = lerp(0, 0.5, t);
          ballGroup.position.set(0, 0.11, 0.8);
        } else if (p < 0.4) {
          let t = (p-0.2)/0.2;
          characterGroup.position.x = lerp(1.0*scaleFactor, 2.0*scaleFactor, t);
          hipGrpL.rotation.x = lerp(-0.8, -0.2, t);
          kneeGrpL.rotation.x = lerp(0.2, 0.1, t);
          hipGrpR.rotation.x = lerp(0.5, 1.2, t);
          kneeGrpR.rotation.x = lerp(0.5, 1.5, t);
          shoulderGrpR.rotation.x = lerp(-0.8, -1.2, t);
          shoulderGrpL.rotation.x = lerp(0.8, 1.2, t);
          elbowGrpR.rotation.y = lerp(-0.5, -0.8, t);
          elbowGrpL.rotation.y = lerp(0.5, 0.8, t);
          ballGroup.position.set(0, 0.11, 0.8);
        } else if (p < 0.6) {
          let t = (p-0.4)/0.2;
          characterGroup.position.x = lerp(2.0*scaleFactor, 2.3*scaleFactor, t);
          hipGrpL.rotation.x = lerp(-0.2, 0.1, t);
          hipGrpR.rotation.x = lerp(1.2, -1.5, t);
          kneeGrpR.rotation.x = lerp(1.5, 0.1, t);
          shoulderGrpR.rotation.x = lerp(-1.2, 1.0, t);
          shoulderGrpL.rotation.x = lerp(1.2, -1.0, t);
          elbowGrpR.rotation.y = lerp(-0.8, -0.2, t);
          elbowGrpL.rotation.y = lerp(0.8, 0.2, t);
          
          // Fast and epic ball rise in +Z forward trajectory
          ballGroup.position.set(0, 0.11 + Math.sin(t * Math.PI) * 3.4, lerp(0.8, 18.0, t));
          ballGroup.rotation.x -= 0.35;
        } else {
          let t = (p-0.6)/0.4;
          characterGroup.position.x = lerp(2.3*scaleFactor, 0, t);
          hipGrpL.rotation.x = lerp(0.1, 0, t);
          hipGrpR.rotation.x = lerp(-1.5, 0, t);
          kneeGrpR.rotation.x = lerp(0.1, 0, t);
          kneeGrpL.rotation.x = lerp(0.1, 0, t);
          shoulderGrpR.rotation.x = lerp(1.0, 0, t);
          shoulderGrpL.rotation.x = lerp(-1.0, 0, t);
          elbowGrpR.rotation.y = lerp(-0.2, 0, t);
          elbowGrpL.rotation.y = lerp(0.2, 0, t);
          
          // Realistic grass landing, bouncing, and rolling further
          let bounceY = 0.11 + Math.abs(Math.cos(t * Math.PI * 2.5)) * 0.45 * (1.0 - t);
          ballGroup.position.set(0, bounceY, lerp(18.0, 26.0, t));
          ballGroup.rotation.x -= 0.15;
        }
      }
      else if (action === 'short_pass_normal') {
        if(p < 0.2) {
          let t = p/0.2;
          characterGroup.position.z = lerp(0, 0.2 * scaleFactor, t);
          hipGrpL.rotation.x = lerp(0, -0.3, t);
          kneeGrpL.rotation.x = lerp(0, 0.1, t);
          
          hipGrpR.rotation.x = lerp(0, 0.3, t);
          kneeGrpR.rotation.x = lerp(0, 0.4, t);
          hipGrpR.rotation.y = lerp(0, 0.5, t);
          
          shoulderGrpR.rotation.x = lerp(0, -0.4, t);
          shoulderGrpL.rotation.x = lerp(0, 0.4, t);
          elbowGrpR.rotation.y = lerp(0, -0.3, t);
          elbowGrpL.rotation.y = lerp(0, 0.3, t);
          ballGroup.position.set(0, 0.11, 0.8);
        } else if (p < 0.4) {
          let t = (p-0.2)/0.2;
          characterGroup.position.z = lerp(0.2 * scaleFactor, 0.4 * scaleFactor, t);
          hipGrpL.rotation.x = lerp(-0.3, -0.1, t);
          kneeGrpL.rotation.x = lerp(0.1, 0.05, t);
          
          hipGrpR.rotation.x = lerp(0.3, 0.5, t);
          kneeGrpR.rotation.x = lerp(0.4, 0.6, t);
          hipGrpR.rotation.y = lerp(0.5, 0.8, t);
          
          shoulderGrpR.rotation.x = lerp(-0.4, -0.6, t);
          shoulderGrpL.rotation.x = lerp(0.4, 0.6, t);
          elbowGrpR.rotation.y = lerp(-0.3, -0.4, t);
          elbowGrpL.rotation.y = lerp(0.3, 0.4, t);
          ballGroup.position.set(0, 0.11, 0.8);
        } else if (p < 0.6) {
          let t = (p-0.4)/0.2;
          characterGroup.position.z = lerp(0.4 * scaleFactor, 0.5 * scaleFactor, t);
          hipGrpL.rotation.x = lerp(-0.1, 0.1, t);
          
          hipGrpR.rotation.x = lerp(0.5, -0.8, t);
          kneeGrpR.rotation.x = lerp(0.6, 0.1, t);
          hipGrpR.rotation.y = 0.8;
          
          shoulderGrpR.rotation.x = lerp(-0.6, 0.5, t);
          shoulderGrpL.rotation.x = lerp(0.6, -0.5, t);
          
          ballGroup.position.set(0, 0.11, lerp(0.8, 3.5, t));
        } else {
          let t = (p-0.6)/0.4;
          characterGroup.position.z = lerp(0.5 * scaleFactor, 0, t);
          hipGrpL.rotation.x = lerp(0.1, 0, t);
          
          hipGrpR.rotation.x = lerp(-0.8, 0, t);
          kneeGrpR.rotation.x = lerp(0.1, 0, t);
          kneeGrpL.rotation.x = lerp(0.05, 0, t);
          hipGrpR.rotation.y = lerp(0.8, 0, t);
          
          shoulderGrpR.rotation.x = lerp(0.5, 0, t);
          shoulderGrpL.rotation.x = lerp(-0.5, 0, t);
          elbowGrpR.rotation.y = lerp(-0.4, 0, t);
          elbowGrpL.rotation.y = lerp(0.4, 0, t);
          
          ballGroup.position.set(0, 0.11, lerp(3.5, 4.5, t));
        }
      }
      else if (action === 'short_pass_trivela') {
        if(p < 0.2) {
          let t = p/0.2;
          characterGroup.position.z = lerp(0, 0.2 * scaleFactor, t);
          hipGrpL.rotation.x = lerp(0, -0.3, t);
          kneeGrpL.rotation.x = lerp(0, 0.1, t);
          
          hipGrpR.rotation.x = lerp(0, 0.3, t);
          kneeGrpR.rotation.x = lerp(0, 0.4, t);
          hipGrpR.rotation.y = lerp(0, -0.5, t);
          
          shoulderGrpR.rotation.x = lerp(0, -0.4, t);
          shoulderGrpL.rotation.x = lerp(0, 0.4, t);
          elbowGrpR.rotation.y = lerp(0, -0.3, t);
          elbowGrpL.rotation.y = lerp(0, 0.3, t);
          ballGroup.position.set(0, 0.11, 0.8);
        } else if (p < 0.4) {
          let t = (p-0.2)/0.2;
          characterGroup.position.z = lerp(0.2 * scaleFactor, 0.4 * scaleFactor, t);
          hipGrpL.rotation.x = lerp(-0.3, -0.1, t);
          kneeGrpL.rotation.x = lerp(0.1, 0.05, t);
          
          hipGrpR.rotation.x = lerp(0.3, 0.5, t);
          kneeGrpR.rotation.x = lerp(0.4, 0.6, t);
          hipGrpR.rotation.y = lerp(-0.5, -0.8, t);
          
          shoulderGrpR.rotation.x = lerp(-0.4, -0.6, t);
          shoulderGrpL.rotation.x = lerp(0.4, 0.6, t);
          elbowGrpR.rotation.y = lerp(-0.3, -0.4, t);
          elbowGrpL.rotation.y = lerp(0.3, 0.4, t);
          ballGroup.position.set(0, 0.11, 0.8);
        } else if (p < 0.6) {
          let t = (p-0.4)/0.2;
          characterGroup.position.z = lerp(0.4 * scaleFactor, 0.5 * scaleFactor, t);
          hipGrpL.rotation.x = lerp(-0.1, 0.1, t);
          
          hipGrpR.rotation.x = lerp(0.5, -0.8, t);
          kneeGrpR.rotation.x = lerp(0.6, 0.1, t);
          hipGrpR.rotation.y = -0.8;
          
          shoulderGrpR.rotation.x = lerp(-0.6, 0.5, t);
          shoulderGrpL.rotation.x = lerp(0.6, -0.5, t);
          
          let trivelaCurveX = Math.sin(t * Math.PI) * 0.45;
          ballGroup.position.set(trivelaCurveX, 0.11, lerp(0.8, 3.5, t));
        } else {
          let t = (p-0.6)/0.4;
          characterGroup.position.z = lerp(0.5 * scaleFactor, 0, t);
          hipGrpL.rotation.x = lerp(0.1, 0, t);
          
          hipGrpR.rotation.x = lerp(-0.8, 0, t);
          kneeGrpR.rotation.x = lerp(0.1, 0, t);
          kneeGrpL.rotation.x = lerp(0.05, 0, t);
          hipGrpR.rotation.y = lerp(-0.8, 0, t);
          
          shoulderGrpR.rotation.x = lerp(0.5, 0, t);
          shoulderGrpL.rotation.x = lerp(-0.5, 0, t);
          elbowGrpR.rotation.y = lerp(-0.4, 0, t);
          elbowGrpL.rotation.y = lerp(0.4, 0, t);
          
          ballGroup.position.set(0.45 + lerp(0, 0.35, t), 0.11, lerp(3.5, 4.5, t));
        }
      }
      else if (action === 'header') {
        if(p < 0.2) {
          let t = p/0.2;
          characterGroup.position.y = basePlayerY;
          characterGroup.rotation.x = lerp(0, 0.12, t);
          shoulderGrpR.rotation.x = lerp(0, 0.5, t);
          shoulderGrpL.rotation.x = lerp(0, 0.5, t);
          hipGrpR.rotation.x = lerp(0, -0.6, t);
          hipGrpL.rotation.x = lerp(0, -0.6, t);
          kneeGrpR.rotation.x = lerp(0, 1.2, t);
          kneeGrpL.rotation.x = lerp(0, 1.2, t);
          
          // Ball crosses in from the left-side wing high up
          ballGroup.position.set(lerp(-1.8, -0.3, t), lerp(2.8, 2.1, t), lerp(2.5, 1.3, t));
        } else if(p < 0.5) {
          let t = (p-0.2)/0.3;
          characterGroup.position.y = lerp(basePlayerY, basePlayerY + 0.5, Math.sin(t*Math.PI/2));
          characterGroup.rotation.x = lerp(0.12, -0.25, t);
          shoulderGrpR.rotation.x = lerp(0.5, -1.0, t);
          shoulderGrpL.rotation.x = lerp(0.5, -1.0, t);
          elbowGrpR.rotation.y = lerp(0, -1.5, t);
          elbowGrpL.rotation.y = lerp(0, 1.5, t);
          hipGrpR.rotation.x = lerp(-0.6, 0.2, t);
          hipGrpL.rotation.x = lerp(-0.6, 0.5, t);
          kneeGrpR.rotation.x = lerp(1.2, 0.2, t);
          kneeGrpL.rotation.x = lerp(1.2, 1.0, t);
          
          // Ball meets the forehead at exact peak height t=1.0 (p=0.5)
          ballGroup.position.set(lerp(-0.3, 0, t), lerp(2.1, basePlayerY + 0.5 + 0.5, t), lerp(1.3, 0.8, t));
        } else if(p < 0.7) {
          let t = (p-0.5)/0.2;
          characterGroup.position.y = lerp(basePlayerY + 0.5, basePlayerY + 0.45, t);
          characterGroup.rotation.x = lerp(-0.25, 0.32, t);
          shoulderGrpR.rotation.x = lerp(-1.0, 0.5, t);
          shoulderGrpL.rotation.x = lerp(-1.0, 0.5, t);
          elbowGrpR.rotation.y = lerp(-1.5, -0.5, t);
          elbowGrpL.rotation.y = lerp(1.5, 0.5, t);
          
          // Powerful downward header flying fast towards the target Z direction
          ballGroup.position.set(0, lerp(basePlayerY + 1.0, 0.6, t), lerp(0.8, 12.0, t));
        } else {
          let t = (p-0.7)/0.3;
          characterGroup.position.y = lerp(basePlayerY + 0.45, basePlayerY, t);
          characterGroup.rotation.x = lerp(0.32, 0, t);
          setAllLoopsToZero(0.2);
          
          // Ball bounces on pitch and rolls further
          let bounceY = 0.11 + Math.abs(Math.cos(t * Math.PI * 2.0)) * 0.3 * (1.0 - t);
          ballGroup.position.set(0, bounceY, lerp(12.0, 18.0, t));
        }
      }
      else if (action === 'header_standing') {
        if(p < 0.3) {
          let t = p/0.3;
          characterGroup.position.y = lerp(basePlayerY, basePlayerY - 0.4 * scaleFactor, t);
          torsoGrp.rotation.x = lerp(0, -0.4, t);
          shoulderGrpR.rotation.x = lerp(0, -0.2, t);
          shoulderGrpL.rotation.x = lerp(0, -0.2, t);
          hipGrpR.rotation.x = lerp(0, -0.6, t);
          kneeGrpR.rotation.x = lerp(0, 0.3, t);
          hipGrpL.rotation.x = lerp(0, 0.6, t);
          kneeGrpL.rotation.x = lerp(0, 0.3, t);
          elbowGrpR.rotation.y = lerp(0, -1.2, t);
          elbowGrpL.rotation.y = lerp(0, 1.2, t);
          
          // Ball incoming high in front
          ballGroup.position.set(0, lerp(2.6, basePlayerY + 0.5, t), lerp(3.2, 0.8, t));
        } else if(p < 0.6) {
          let t = (p-0.3)/0.3;
          characterGroup.position.y = basePlayerY - 0.4 * scaleFactor;
          torsoGrp.rotation.x = lerp(-0.4, 0.5, t);
          shoulderGrpR.rotation.x = lerp(-0.2, 0.2, t);
          shoulderGrpL.rotation.x = lerp(-0.2, 0.2, t);
          hipGrpR.rotation.x = -0.6;
          kneeGrpR.rotation.x = 0.3;
          hipGrpL.rotation.x = 0.6;
          kneeGrpL.rotation.x = 0.3;
          elbowGrpR.rotation.y = lerp(-1.2, -0.5, t);
          elbowGrpL.rotation.y = lerp(1.2, 0.5, t);
          
          // Ball gets headed forward
          ballGroup.position.set(0, basePlayerY + 0.5 + Math.sin(t * Math.PI) * 0.3, lerp(0.8, 8.0, t));
        } else {
          let t = (p-0.6)/0.4;
          characterGroup.position.y = lerp(basePlayerY - 0.4 * scaleFactor, basePlayerY, t);
          torsoGrp.rotation.x = lerp(0.5, 0, t);
          setAllLoopsToZero(0.2);
          
          // Ball drops to ground and rolls
          let bounceY = 0.11 + Math.abs(Math.cos(t * Math.PI * 1.5)) * 0.15 * (1.0 - t);
          ballGroup.position.set(0, bounceY, lerp(8.0, 13.0, t));
        }
      }
      else if (action === 'chest_trap') {
        if(p < 0.1) {
          let t = p/0.1;
          torsoGrp.rotation.x = lerp(0, -0.3, t);
          hipGrpR.rotation.z = lerp(0, 0.15, t);
          hipGrpL.rotation.z = lerp(0, -0.15, t);
          shoulderGrpR.rotation.x = lerp(0, -0.2, t);
          shoulderGrpL.rotation.x = lerp(0, -0.2, t);
          shoulderGrpR.rotation.z = lerp(0, 0.4, t);
          shoulderGrpL.rotation.z = lerp(0, -0.4, t);
          elbowGrpR.rotation.y = lerp(0, -1.0, t);
          elbowGrpL.rotation.y = lerp(0, 1.0, t);
          ballGroup.position.set(lerp(4, 0.4, t), lerp(4, basePlayerY + 0.3 * scaleFactor, t), 0);
        } else if (p < 0.9) {
          let t = (p-0.1)/0.8;
          torsoGrp.rotation.x = -0.3;
          hipGrpR.rotation.z = 0.15;
          hipGrpL.rotation.z = -0.15;
          shoulderGrpR.rotation.x = -0.2;
          shoulderGrpL.rotation.x = -0.2;
          shoulderGrpR.rotation.z = 0.4;
          shoulderGrpL.rotation.z = -0.4;
          elbowGrpR.rotation.y = -1.0;
          elbowGrpL.rotation.y = 1.0;
          
          if (p < 0.2) {
            let bt = (p-0.1)/0.1;
            // Parabolic fall after bouncing off chest
            ballGroup.position.set(lerp(0.4, 0.6, bt), lerp(basePlayerY + 0.3 * scaleFactor, 0.11, Math.pow(bt, 2)), 0);
          } else {
            ballGroup.position.set(0.6, 0.11, 0);
          }
        } else {
          let t = (p-0.9)/0.1;
          torsoGrp.rotation.x = lerp(-0.3, 0, t);
          hipGrpR.rotation.z = lerp(0.15, 0, t);
          hipGrpL.rotation.z = lerp(-0.15, 0, t);
          shoulderGrpR.rotation.x = lerp(-0.2, 0, t);
          shoulderGrpL.rotation.x = lerp(-0.2, 0, t);
          shoulderGrpR.rotation.z = lerp(0.4, 0, t);
          shoulderGrpL.rotation.z = lerp(-0.4, 0, t);
          elbowGrpR.rotation.y = lerp(-1.0, 0, t);
          elbowGrpL.rotation.y = lerp(1.0, 0, t);
          ballGroup.position.set(0.6, 0.11, 0);
        }
        
        if (p < 0.2) {
          ballGroup.rotation.z -= 0.1;
        }
      }
      else if (action === 'throw_in') {
        if(p < 0.1) {
          let t = p/0.1;
          torsoGrp.rotation.x = 0;
          shoulderGrpR.rotation.x = lerp(0, -0.78, t);
          shoulderGrpL.rotation.x = lerp(0, -0.78, t);
          shoulderGrpR.rotation.z = lerp(0, -0.15, t);
          shoulderGrpL.rotation.z = lerp(0, 0.15, t);
          elbowGrpR.rotation.y = lerp(0, -1.2, t);
          elbowGrpL.rotation.y = lerp(0, 1.2, t);
          ballGroup.position.set(0, basePlayerY - 0.2, 0.4);
        } else if (p < 0.2) {
          let t = (p-0.1)/0.1;
          torsoGrp.rotation.x = lerp(0, -0.3, t);
          shoulderGrpR.rotation.x = lerp(-0.78, -2.5, t);
          shoulderGrpL.rotation.x = lerp(-0.78, -2.5, t);
          shoulderGrpR.rotation.z = -0.15;
          shoulderGrpL.rotation.z = 0.15;
          elbowGrpR.rotation.y = lerp(-1.2, -2.0, t);
          elbowGrpL.rotation.y = lerp(1.2, 2.0, t);
          ballGroup.position.set(0, lerp(basePlayerY - 0.2, basePlayerY + 0.5 * scaleFactor, t), lerp(0.4, -0.3, t));
        } else if (p < 0.8) {
          torsoGrp.rotation.x = -0.3; 
          shoulderGrpR.rotation.x = -2.5;
          shoulderGrpL.rotation.x = -2.5;
          shoulderGrpR.rotation.z = -0.15;
          shoulderGrpL.rotation.z = 0.15;
          elbowGrpR.rotation.y = -2.0;
          elbowGrpL.rotation.y = 2.0;
          ballGroup.position.set(0, basePlayerY + 0.5 * scaleFactor, -0.3);
        } else if (p < 0.85) {
          let t = (p-0.8)/0.05;
          torsoGrp.rotation.x = lerp(-0.3, 0.3, t); 
          shoulderGrpR.rotation.x = lerp(-2.5, 0, t);
          shoulderGrpL.rotation.x = lerp(-2.5, 0, t);
          shoulderGrpR.rotation.z = lerp(-0.15, -0.05, t); 
          shoulderGrpL.rotation.z = lerp(0.15, 0.05, t);
          elbowGrpR.rotation.y = lerp(-2.0, -0.2, t);
          elbowGrpL.rotation.y = lerp(2.0, 0.2, t);
          ballGroup.position.set(0, lerp(basePlayerY + 0.5 * scaleFactor, basePlayerY + 0.3 * scaleFactor, t), lerp(-0.3, 2.0, t));
        } else {
          let t = (p-0.85)/0.15;
          torsoGrp.rotation.x = lerp(0.3, 0, t);
          shoulderGrpR.rotation.x = 0;
          shoulderGrpL.rotation.x = 0;
          shoulderGrpR.rotation.z = lerp(-0.05, 0, t);
          shoulderGrpL.rotation.z = lerp(0.05, 0, t);
          elbowGrpR.rotation.y = lerp(-0.2, 0, t);
          elbowGrpL.rotation.y = lerp(0.2, 0, t);
          setAllLoopsToZero(0.1);
          ballGroup.position.set(0, lerp(basePlayerY + 0.3 * scaleFactor, 0.11, Math.pow(t, 2)), lerp(2.0, 3.0, t));
        }
      }
      else if (action === 'tackle') {
        if (p < 0.15) {
          // Phase 1: Preparação (Anticipation)
          let t = p / 0.15;
          torsoGrp.rotation.x = lerp(0, 0.35, t);
          characterGroup.position.y = lerp(basePlayerY, basePlayerY * 0.75, t);
          characterGroup.position.z = lerp(0, 0.3 * scaleFactor, t);
          
          hipGrpL.rotation.x = lerp(0, -0.5, t);
          kneeGrpL.rotation.x = lerp(0, 0.3, t);
          
          hipGrpR.rotation.x = lerp(0, 0.5, t);
          kneeGrpR.rotation.x = lerp(0, 0.6, t);
          
          shoulderGrpR.rotation.x = lerp(0, -0.4, t);
          shoulderGrpL.rotation.x = lerp(0, 0.4, t);
          ballGroup.position.set(0, 0.11, 0.8);
        } else if (p < 0.35) {
          // Phase 2: Início do Carrinho (Commit)
          let t = (p - 0.15) / 0.20;
          characterGroup.position.y = lerp(basePlayerY * 0.75, 0.2, t);
          characterGroup.position.z = lerp(0.3 * scaleFactor, 1.3 * scaleFactor, t);
          characterGroup.rotation.x = lerp(0, Math.PI / 2 - 0.2, t);
          characterGroup.rotation.z = lerp(0, -0.4, t);
          torsoGrp.rotation.x = lerp(0.35, 0, t);
          
          hipGrpR.rotation.x = lerp(0.5, -0.6, t);
          kneeGrpR.rotation.x = lerp(0.6, 0, t);
          
          hipGrpL.rotation.x = lerp(-0.5, -0.2, t);
          kneeGrpL.rotation.x = lerp(0.3, 1.5, t);
          
          shoulderGrpR.rotation.x = lerp(-0.4, -1.2, t);
          shoulderGrpL.rotation.x = lerp(0.4, -1.2, t);
          ballGroup.position.set(0, 0.11, 0.8);
        } else if (p < 0.65) {
          // Phase 3: Deslizamento (Execution)
          let t = (p - 0.35) / 0.30;
          characterGroup.position.y = 0.2;
          characterGroup.position.z = lerp(1.3 * scaleFactor, 3.2 * scaleFactor, t);
          characterGroup.rotation.x = Math.PI / 2 - 0.2;
          characterGroup.rotation.z = -0.4;
          
          hipGrpR.rotation.x = -0.6;
          kneeGrpR.rotation.x = 0;
          
          hipGrpL.rotation.x = -0.2;
          kneeGrpL.rotation.x = 1.5;
          
          shoulderGrpR.rotation.x = -1.2;
          shoulderGrpL.rotation.x = -1.2;
          ballGroup.position.set(0, 0.11, lerp(0.8, 4.0, t));
        } else {
          // Phase 4: Recuperação (Recovery)
          let t = (p - 0.65) / 0.35;
          characterGroup.position.y = lerp(0.2, basePlayerY, t);
          characterGroup.position.z = lerp(3.2 * scaleFactor, 4.0 * scaleFactor, t);
          characterGroup.rotation.x = lerp(Math.PI / 2 - 0.2, 0, t);
          characterGroup.rotation.z = lerp(-0.4, 0, t);
          
          hipGrpR.rotation.x = lerp(-0.6, 0, t);
          kneeGrpR.rotation.x = 0;
          
          hipGrpL.rotation.x = lerp(-0.2, 0, t);
          kneeGrpL.rotation.x = lerp(1.5, 0, t);
          
          shoulderGrpR.rotation.x = lerp(-1.2, 0, t);
          shoulderGrpL.rotation.x = lerp(-1.2, 0, t);
          ballGroup.position.set(0, 0.11, lerp(4.0, 5.5, t));
        }
      }
      else if (action === 'gk_knees') {
        if (p < 0.35) {
          // Phase 1: Descent to kneeling (drop onto left knee, right foot flat)
          let t = p / 0.35;
          characterGroup.position.y = lerp(basePlayerY, basePlayerY * 0.42, t);
          characterGroup.rotation.x = lerp(0, 0.1, t);
          
          // Left leg (knee to ground)
          hipGrpL.rotation.x = lerp(0, -1.2, t);
          kneeGrpL.rotation.x = lerp(0, 1.6, t);
          ankleGrpL.rotation.x = lerp(0, 0.3, t);

          // Right leg (foot flat on ground)
          hipGrpR.rotation.x = lerp(0, -0.55, t);
          kneeGrpR.rotation.x = lerp(0, 0.85, t);
          ankleGrpR.rotation.x = lerp(0, -0.3, t);
          
          // Arms flare out/ready
          shoulderGrpR.rotation.x = lerp(0, -0.4, t);
          shoulderGrpL.rotation.x = lerp(0, -0.4, t);
          shoulderGrpR.rotation.z = lerp(0, 0.5, t);
          shoulderGrpL.rotation.z = lerp(0, -0.5, t);
          elbowGrpR.rotation.y = lerp(0, -0.8, t);
          elbowGrpL.rotation.y = lerp(0, 0.8, t);
          
          // Ball slides in low towards keeper
          ballGroup.position.set(0, 0.11, lerp(2.8, 0.8, t));
        } 
        else if (p < 0.75) {
          // Phase 2: Hold kneeling alert stance (one knee on ground)
          characterGroup.position.y = basePlayerY * 0.42;
          characterGroup.rotation.x = 0.1;
          
          hipGrpL.rotation.x = -1.2;
          kneeGrpL.rotation.x = 1.6;
          ankleGrpL.rotation.x = 0.3;

          hipGrpR.rotation.x = -0.55;
          kneeGrpR.rotation.x = 0.85;
          ankleGrpR.rotation.x = -0.3;

          shoulderGrpR.rotation.x = -0.4;
          shoulderGrpL.rotation.x = -0.4;
          shoulderGrpR.rotation.z = 0.5;
          shoulderGrpL.rotation.z = -0.5;
          elbowGrpR.rotation.y = -0.8;
          elbowGrpL.rotation.y = 0.8;
          
          // Keeper smothers and locks the ball on the grass safely at their feet
          ballGroup.position.set(0, 0.11, 0.8);
          ballGroup.rotation.x -= 0.1;
        } 
        else {
          // Phase 3: Recovery (returning to standing position)
          let t = (p - 0.75) / 0.25;
          characterGroup.position.y = lerp(basePlayerY * 0.42, basePlayerY, t);
          characterGroup.rotation.x = lerp(0.1, 0, t);
          
          hipGrpL.rotation.x = lerp(-1.2, 0, t);
          kneeGrpL.rotation.x = lerp(1.6, 0, t);
          ankleGrpL.rotation.x = lerp(0.3, 0, t);

          hipGrpR.rotation.x = lerp(-0.55, 0, t);
          kneeGrpR.rotation.x = lerp(0.85, 0, t);
          ankleGrpR.rotation.x = lerp(-0.3, 0, t);

          shoulderGrpR.rotation.x = lerp(-0.4, 0, t);
          shoulderGrpL.rotation.x = lerp(-0.4, 0, t);
          shoulderGrpR.rotation.z = lerp(0.5, 0, t);
          shoulderGrpL.rotation.z = lerp(-0.5, 0, t);
          elbowGrpR.rotation.y = lerp(-0.8, 0, t);
          elbowGrpL.rotation.y = lerp(0.8, 0, t);
          
          // Keeper rolls or leaves the ball in front of them
          ballGroup.position.set(0, 0.11, 0.8);
        }
      }
      else if (action === 'gk_dive') {
        if (p < 0.22) {
          // Phase 1: Prep/Wind-up - open legs, bend knees, crouch, incline waist to side of jump (right)
          let t = p / 0.22;
          characterGroup.position.y = lerp(basePlayerY, basePlayerY - 0.22 * scaleFactor, t);
          characterGroup.position.x = 0;
          characterGroup.position.z = 0;
          characterGroup.rotation.z = 0;
          
          // Open legs (abduct sideways)
          hipGrpR.rotation.z = lerp(0, 0.22, t);
          hipGrpL.rotation.z = lerp(0, -0.22, t);
          
          // Bend knees slightly
          kneeGrpR.rotation.x = lerp(0, 0.4 * scaleFactor, t);
          kneeGrpL.rotation.x = lerp(0, 0.4 * scaleFactor, t);
          
          // Incline waist (torso) to the side of the jump (right side)
          torsoGrp.rotation.z = lerp(0, -0.35, t);
          
          // Prepare arms
          shoulderGrpR.rotation.z = lerp(0, 0.2, t);
          shoulderGrpL.rotation.z = lerp(0, -0.2, t);
          
          // Ball is shot towards the right corner
          ballGroup.position.set(lerp(-1.0, 0.3, t), lerp(1.2, 0.7, t), lerp(3.5, 1.8, t));
        } else if (p < 0.60) {
          // Phase 2: Active Leap & Flight - stretch right arm parallel to body, palm forward, lift off, rotate body to right side
          let t = (p - 0.22) / 0.38;
          let startY = basePlayerY - 0.22 * scaleFactor;
          let peakY = basePlayerY + 0.85 * scaleFactor;
          
          // Fly parabolic arc to the right
          characterGroup.position.x = lerp(0, 2.3 * scaleFactor, t);
          characterGroup.position.y = lerp(startY, peakY, t) + Math.sin(t * Math.PI) * 0.45 * scaleFactor;
          characterGroup.position.z = lerp(0, 0.4 * scaleFactor, t);
          
          // Body rotates sideways to parallel with ground (laying on right side)
          characterGroup.rotation.z = lerp(0, -Math.PI / 2, t);
          
          // Return torso relative tilt as main body rotates
          torsoGrp.rotation.z = -0.35 * (1.0 - t);
          
          // Right arm (dive side): o braço de baixo, stays straight, hand in the line of the arm (aligned)
          shoulderGrpR.rotation.z = lerp(0.2, 2.85, t);
          shoulderGrpR.rotation.y = 0;
          shoulderGrpR.rotation.x = 0;
          elbowGrpR.rotation.x = 0; 
          elbowGrpR.rotation.y = 0; // Arm perfectly straight in direction of the arm
          wristGrpR.rotation.y = lerp(-0.3, 0, t); // Aligned directly with the arm
          wristGrpR.rotation.x = 0; // Thumbs stay inside (pointing towards each other)
          
          // Left arm (opposite): o braço de cima, fully stretched in the direction of the body (overhead, inline)
          shoulderGrpL.rotation.z = lerp(-0.2, -2.85, t);
          shoulderGrpL.rotation.y = 0;
          shoulderGrpL.rotation.x = 0;
          elbowGrpL.rotation.x = 0;
          elbowGrpL.rotation.y = 0; // Arm perfectly straight in direction of the arm
          wristGrpL.rotation.y = lerp(0.3, 0, t); // Aligned directly with the arm
          wristGrpL.rotation.x = 0; // Thumbs stay inside (pointing towards each other)
          
          // Legs trailing flight extension
          hipGrpR.rotation.z = lerp(0.22, 0.1, t);
          hipGrpL.rotation.z = lerp(-0.22, -0.4, t);
          kneeGrpR.rotation.x = lerp(0.4, 0.1, t);
          kneeGrpL.rotation.x = lerp(0.4, 0.4, t);
          
          // Keeper tips the fast shot wide! At p=0.5 (t=0.74 approx) it is touched and deflected upward and wide
          if (t < 0.74) {
            let subt = t / 0.74;
            ballGroup.position.set(lerp(0.3, 1.0, subt), lerp(0.7, 1.1, subt), lerp(1.8, 0.8, subt));
          } else {
            let subt = (t - 0.74) / 0.26;
            ballGroup.position.set(lerp(1.0, 2.1, subt), lerp(1.1, 1.6, subt), lerp(0.8, -0.5, subt));
          }
        } else {
          // Phase 3: Slide/Fall & land on ground, holding the beautiful stretched stretch/pose
          let t = Math.min((p - 0.60) / 0.40, 1.0);
          let startY = basePlayerY + 0.85 * scaleFactor;
          
          // Land fast on the ground
          characterGroup.position.x = lerp(2.3 * scaleFactor, 2.7 * scaleFactor, t);
          characterGroup.position.y = lerp(startY, 0.25, t * t);
          characterGroup.position.z = lerp(0.4 * scaleFactor, 0.5 * scaleFactor, t);
          characterGroup.rotation.z = -Math.PI / 2;
          torsoGrp.rotation.z = 0;
          
          // Maintain exact stretch and arm poses upon impact
          shoulderGrpR.rotation.z = 2.85;
          shoulderGrpR.rotation.y = 0;
          shoulderGrpR.rotation.x = 0;
          elbowGrpR.rotation.x = 0;
          elbowGrpR.rotation.y = 0;
          wristGrpR.rotation.y = 0;
          wristGrpR.rotation.x = 0;
          
          shoulderGrpL.rotation.z = -2.85;
          shoulderGrpL.rotation.y = 0;
          shoulderGrpL.rotation.x = 0;
          elbowGrpL.rotation.x = 0;
          elbowGrpL.rotation.y = 0;
          wristGrpL.rotation.y = 0;
          wristGrpL.rotation.x = 0;
          
          // Legs relax slightly on contact
          hipGrpR.rotation.z = lerp(0.1, 0.2, t);
          hipGrpL.rotation.z = lerp(-0.4, -0.6, t);
          kneeGrpR.rotation.x = lerp(0.1, 0.6, t);
          kneeGrpL.rotation.x = lerp(0.4, 0.8, t);
          
          // Deflected ball curves high over/around the post into corner of field out of bounds
          let bounceY = 0.11 + Math.abs(THREE.MathUtils.lerp(0, 0.8, Math.sin((1.0 - t) * Math.PI)));
          ballGroup.position.set(lerp(2.1, 3.2, t), bounceY, lerp(-0.5, -2.5, t));
        } 
      }
      else if (action === 'gk_dive_low') {
        if (p < 0.20) {
          // Phase 1: Wind-up / Ready Stance crouching to react
          let t = p / 0.20;
          characterGroup.position.y = lerp(basePlayerY, basePlayerY - 0.25 * scaleFactor, t);
          characterGroup.position.x = 0;
          characterGroup.position.z = 0;
          characterGroup.rotation.z = 0;
          torsoGrp.rotation.z = 0;
          
          // Knees bend, hips spread for defensive wall
          hipGrpR.rotation.z = lerp(0, 0.4, t);
          hipGrpL.rotation.z = lerp(0, -0.4, t);
          kneeGrpR.rotation.x = lerp(0, 0.6, t);
          kneeGrpL.rotation.x = lerp(0, 0.6, t);
          
          // Torso dips ready to dive right
          torsoGrp.rotation.z = lerp(0, -0.2, t);
          
          // Arms out wide
          shoulderGrpR.rotation.z = lerp(0, 0.4, t);
          shoulderGrpL.rotation.z = lerp(0, -0.4, t);
          
          // Ball is shot low to the right corner (grass-burner)
          ballGroup.position.set(lerp(-1.0, 0.4, t), 0.11, lerp(3.5, 1.8, t));
        }
        else if (p < 0.55) {
          // Phase 2: Beautiful horizontal low sweep (sliding along the grass)
          let t = (p - 0.20) / 0.35;
          let startY = basePlayerY - 0.25 * scaleFactor;
          
          // Move body horizontally across the field fast, staying about 30 cm above the pitch
          characterGroup.position.x = lerp(0, 2.7 * scaleFactor, t);
          characterGroup.position.y = lerp(startY, 1.9 * scaleFactor, t * t); // Hovering at 30cm (1.9 units) above grass
          characterGroup.position.z = lerp(0, 0.3 * scaleFactor, t);
          
          // Lay flat on right side
          characterGroup.rotation.z = lerp(0, -Math.PI / 2, t);
          torsoGrp.rotation.z = -0.2 * (1.0 - t);
          
          // Right arm (dive side / bottom): slightly bent elbow to look realistic
          shoulderGrpR.rotation.z = lerp(0.4, 2.85, t);
          shoulderGrpR.rotation.y = 0;
          shoulderGrpR.rotation.x = lerp(0, 0.5, t); // Both arms more forward of the face
          elbowGrpR.rotation.x = 0;
          elbowGrpR.rotation.y = lerp(0, -0.6, t); // Keep bottom arm slightly bent
          lowerArmR.rotation.x = lerp(Math.PI / 2, 0, t); // Twist right forearm to point thumb inwards/upwards
          wristGrpR.rotation.y = lerp(-0.3, 0, t);
          wristGrpR.rotation.x = 0;
          
          // Left arm (overhead etc / top): fully extended forward towards the ball parallel to the right arm (matching reference sketch)
          shoulderGrpL.rotation.z = lerp(-0.4, -2.85, t);
          shoulderGrpL.rotation.y = 0;
          shoulderGrpL.rotation.x = lerp(0, 0.5, t); // Both arms more forward of the face
          elbowGrpL.rotation.x = 0; // Fully straight
          elbowGrpL.rotation.y = 0; // Top arm perfectly straight (not bent)
          lowerArmL.rotation.x = lerp(Math.PI / 2, 0, t); // Twist left forearm 90 degrees CW (thumbs center)
          wristGrpL.rotation.y = lerp(0.3, 0, t);
          wristGrpL.rotation.x = 0;
          
          // Leg geometry matching the request:
          // Bottom leg (Right): knee bent strongly forward
          // Top leg (Left): stretched straight backwards aligned with the torso
          hipGrpR.rotation.z = lerp(0.4, 0.25, t);
          hipGrpR.rotation.x = lerp(0, -1.2, t); // Knee and hip bent forward (negative x is forward)
          kneeGrpR.rotation.x = lerp(0.6, 1.4, t); // Knee bent strongly forward!
          
          // Place the right foot at 90 degrees to the leg (neutral / flexed properly)
          ankleGrpR.rotation.x = 0; // neutral at 90 degrees
          ankleGrpR.rotation.y = 0;
          ankleGrpR.rotation.z = 0;
          
          hipGrpL.rotation.z = lerp(-0.4, -0.3, t); // Under side-angle raised slightly
          hipGrpL.rotation.x = lerp(0, -0.1, t); // Pushed straight back
          kneeGrpL.rotation.x = lerp(0.6, 0.02, t); // Completely straight
          
          // Place the left foot at 90 degrees to the leg (neutral / flexed properly)
          ankleGrpL.rotation.x = 0; // neutral at 90 degrees
          
          // Ball travels very low to the right corner, rising to match the goalkeeper's 30cm elevation height
          if (t < 0.8) {
            let subt = t / 0.8;
            ballGroup.position.set(lerp(0.4, 1.4, subt), lerp(0.11, 1.0 * scaleFactor, subt), lerp(1.8, 0.8, subt));
          } else {
            let subt = (t - 0.8) / 0.2;
            ballGroup.position.set(lerp(1.4, 2.45, subt), lerp(1.0 * scaleFactor, 1.9 * scaleFactor, subt), lerp(0.8, 0.82, subt));
          }
        }
        else {
          // Phase 3: Slide to rest & smother (holding the secure "Pulo Baixo" pose 30cm up)
          let t = Math.min((p - 0.55) / 0.45, 1.0);
          
          characterGroup.position.x = lerp(2.7 * scaleFactor, 3.2 * scaleFactor, t);
          characterGroup.position.y = 1.9 * scaleFactor; // Hovering at 30cm (1.9 units) above grass
          characterGroup.position.z = lerp(0.3 * scaleFactor, 0.35 * scaleFactor, t);
          characterGroup.rotation.z = -Math.PI / 2;
          torsoGrp.rotation.z = 0;
          
           // Maintain the perfect low save shape matching the style perfectly
          shoulderGrpR.rotation.z = 2.85;
          shoulderGrpR.rotation.y = 0;
          shoulderGrpR.rotation.x = 0.5; // Both arms more forward of the face
          elbowGrpR.rotation.x = 0;
          elbowGrpR.rotation.y = -0.6; // Keep bottom arm slightly bent
          lowerArmR.rotation.x = 0; // Twist right forearm to point thumb inwards/upwards
          wristGrpR.rotation.y = 0;
          wristGrpR.rotation.x = 0;
          
          shoulderGrpL.rotation.z = -2.85;
          shoulderGrpL.rotation.y = 0;
          shoulderGrpL.rotation.x = 0.5; // Both arms more forward of the face
          elbowGrpL.rotation.x = 0;
          elbowGrpL.rotation.y = 0; // Top arm perfectly straight (not bent)
          lowerArmL.rotation.x = 0; // Twist left forearm 90 degrees CW (thumbs center)
          wristGrpL.rotation.y = 0;
          wristGrpL.rotation.x = 0;
          
          hipGrpR.rotation.z = 0.25;
          hipGrpR.rotation.x = -1.2; // bent hip forward (negative x!)
          kneeGrpR.rotation.x = 1.4; // bent knee strongly forward
          
          // Place the right foot at 90 degrees to the leg (neutral / flexed properly)
          ankleGrpR.rotation.x = 0; // neutral at 90 degrees
          ankleGrpR.rotation.y = 0;
          ankleGrpR.rotation.z = 0;
          
          hipGrpL.rotation.z = -0.3; // top leg aligned and raised slightly
          hipGrpL.rotation.x = -0.1; // straight back
          kneeGrpL.rotation.x = 0.02; // straight knee
          ankleGrpL.rotation.x = 0; // neutral at 90 degrees
          
          // Ball locked fully under the keeper's gloves, resting safely at the 30cm elevation height
          ballGroup.position.set(lerp(2.45, 2.9, t), 1.9 * scaleFactor, 0.82);
          ballGroup.rotation.x = 0.45; // Secure lock angle
        }
      }
      else if (action === 'fall') {
        if (p < 0.5) {
          // Fase 1: Caindo para frente. Braços levantam para frente (pelo eixo Z) e tocam a grama ligeiramente dobrados
          let t = p / 0.5;
          characterGroup.rotation.x = lerp(0, Math.PI / 2, t);
          // O jogador cai em direção ao chão, pousando em Y = 0.18
          characterGroup.position.y = lerp(basePlayerY, 0.18, t);
          characterGroup.position.z = 0;
          
          // Gira os ombros em Z para apontar os braços para frente (direção headward do jogador deitado)
          shoulderGrpR.rotation.z = lerp(0, 2.3, t);
          shoulderGrpL.rotation.z = lerp(0, -2.3, t);
          
          // E inclina levemente os braços para baixo para acompanhar o corpo sem enterrar na grama
          shoulderGrpR.rotation.x = lerp(0, -0.1, t);
          shoulderGrpL.rotation.x = lerp(0, -0.1, t);
          
          // Cotovelos dobrados no impacto para apoio realista amortecendo a queda
          elbowGrpR.rotation.y = lerp(0, -1.0, t);
          elbowGrpL.rotation.y = lerp(0, 1.0, t);
          
          hipGrpR.rotation.x = lerp(0, 0.7, t);
          kneeGrpR.rotation.x = lerp(0, 1.2, t);
          hipGrpL.rotation.x = lerp(0, 0.4, t);
          kneeGrpL.rotation.x = lerp(0, 0.8, t);
        } else {
          // Fase 2: Escorregando de peito na grama. 
          // O modelo baixa ainda mais para deslizar rente ao chão (de 0.18 para 0.08)
          let t = (p - 0.5) / 0.5;
          characterGroup.rotation.x = Math.PI / 2;
          characterGroup.position.y = lerp(0.18, 0.08, t);
          characterGroup.position.z = lerp(0, 0.6 * scaleFactor, t); // Deslizando na grama
          
          // Conforme o peito baixa, os braços vão esticando totalmente para frente,
          // levantando sutilmente na rotação x para deslizar rente e sem entrar no chão (estilo pranchado)
          shoulderGrpR.rotation.z = lerp(2.3, 2.5, t);
          shoulderGrpL.rotation.z = lerp(-2.3, -2.5, t);
          
          shoulderGrpR.rotation.x = lerp(-0.1, -0.05, t);
          shoulderGrpL.rotation.x = lerp(-0.1, -0.05, t);
          
          // Cotovelos vão esticando até ficarem retos deslizando suavemente
          elbowGrpR.rotation.y = lerp(-1.0, 0, t);
          elbowGrpL.rotation.y = lerp(1.0, 0, t);
          
          hipGrpR.rotation.x = lerp(0.7, 0.2, t);
          kneeGrpR.rotation.x = lerp(1.2, 0.3, t);
          hipGrpL.rotation.x = lerp(0.4, 0.1, t);
          kneeGrpL.rotation.x = lerp(0.8, 0.2, t);
        }
      }
      else if (action === 'get_up') {
        if (!getUpStartRef) {
          getUpStartRef = {
            position: { x: characterGroup.position.x, y: characterGroup.position.y, z: characterGroup.position.z },
            rotation: { x: characterGroup.rotation.x, y: characterGroup.rotation.y, z: characterGroup.rotation.z },
            torsoRot: { x: torsoGrp.rotation.x, y: torsoGrp.rotation.y, z: torsoGrp.rotation.z },
            shoulderR: { x: shoulderGrpR.rotation.x, y: shoulderGrpR.rotation.y, z: shoulderGrpR.rotation.z },
            shoulderL: { x: shoulderGrpL.rotation.x, y: shoulderGrpL.rotation.y, z: shoulderGrpL.rotation.z },
            elbowR: { x: elbowGrpR.rotation.x, y: elbowGrpR.rotation.y, z: elbowGrpR.rotation.z },
            elbowL: { x: elbowGrpL.rotation.x, y: elbowGrpL.rotation.y, z: elbowGrpL.rotation.z },
            hipR: { x: hipGrpR.rotation.x, y: hipGrpR.rotation.y, z: hipGrpR.rotation.z },
            hipL: { x: hipGrpL.rotation.x, y: hipGrpL.rotation.y, z: hipGrpL.rotation.z },
            kneeR: { x: kneeGrpR.rotation.x, y: kneeGrpR.rotation.y, z: kneeGrpR.rotation.z },
            kneeL: { x: kneeGrpL.rotation.x, y: kneeGrpL.rotation.y, z: kneeGrpL.rotation.z },
            ankleR: { x: ankleGrpR.rotation.x, y: ankleGrpR.rotation.y, z: ankleGrpR.rotation.z },
            ankleL: { x: ankleGrpL.rotation.x, y: ankleGrpL.rotation.y, z: ankleGrpL.rotation.z }
          };
        }

        let startVal = getUpStartRef;
        // Smoothly drift horizontal positions and secondary rotations back to standing defaults across the entire duration (0 to 1)
        characterGroup.position.x = lerp(startVal.position.x, 0, p);
        characterGroup.position.z = lerp(startVal.position.z, 0, p);
        characterGroup.rotation.y = lerp(startVal.rotation.y, 0, p);
        characterGroup.rotation.z = lerp(startVal.rotation.z, 0, p);

        if (p < 0.25) {
          // Phase 1: Começa na exata posição em que caiu/se esticou e apoia de 4
          let t = p / 0.25;
          characterGroup.position.y = lerp(startVal.position.y, basePlayerY * 0.48, t);
          characterGroup.rotation.x = lerp(startVal.rotation.x, 1.2, t);
          
          torsoGrp.rotation.x = lerp(startVal.torsoRot.x, 0, t);
          torsoGrp.rotation.y = lerp(startVal.torsoRot.y, 0, t);
          torsoGrp.rotation.z = lerp(startVal.torsoRot.z, 0, t);

          hipGrpR.rotation.x = lerp(startVal.hipR.x, -1.0, t);
          hipGrpR.rotation.y = lerp(startVal.hipR.y, 0, t);
          hipGrpR.rotation.z = lerp(startVal.hipR.z, 0, t);

          kneeGrpR.rotation.x = lerp(startVal.kneeR.x, 1.3, t);
          kneeGrpR.rotation.y = lerp(startVal.kneeR.y, 0, t);
          kneeGrpR.rotation.z = lerp(startVal.kneeR.z, 0, t);

          hipGrpL.rotation.x = lerp(startVal.hipL.x, -1.0, t);
          hipGrpL.rotation.y = lerp(startVal.hipL.y, 0, t);
          hipGrpL.rotation.z = lerp(startVal.hipL.z, 0, t);

          kneeGrpL.rotation.x = lerp(startVal.kneeL.x, 1.3, t);
          kneeGrpL.rotation.y = lerp(startVal.kneeL.y, 0, t);
          kneeGrpL.rotation.z = lerp(startVal.kneeL.z, 0, t);

          shoulderGrpR.rotation.x = lerp(startVal.shoulderR.x, -0.8, t);
          shoulderGrpR.rotation.y = lerp(startVal.shoulderR.y, 0, t);
          shoulderGrpR.rotation.z = lerp(startVal.shoulderR.z, 0.35, t);

          shoulderGrpL.rotation.x = lerp(startVal.shoulderL.x, -0.8, t);
          shoulderGrpL.rotation.y = lerp(startVal.shoulderL.y, 0, t);
          shoulderGrpL.rotation.z = lerp(startVal.shoulderL.z, -0.35, t);

          elbowGrpR.rotation.x = lerp(startVal.elbowR.x, 0, t);
          elbowGrpR.rotation.y = lerp(startVal.elbowR.y, -1.2, t);
          elbowGrpR.rotation.z = lerp(startVal.elbowR.z, 0, t);

          elbowGrpL.rotation.x = lerp(startVal.elbowL.x, 0, t);
          elbowGrpL.rotation.y = lerp(startVal.elbowL.y, 1.2, t);
          elbowGrpL.rotation.z = lerp(startVal.elbowL.z, 0, t);

          ankleGrpR.rotation.x = lerp(startVal.ankleR.x, 0, t);
          ankleGrpR.rotation.y = lerp(startVal.ankleR.y, 0, t);
          ankleGrpR.rotation.z = lerp(startVal.ankleR.z, 0, t);

          ankleGrpL.rotation.x = lerp(startVal.ankleL.x, 0, t);
          ankleGrpL.rotation.y = lerp(startVal.ankleL.y, 0, t);
          ankleGrpL.rotation.z = lerp(startVal.ankleL.z, 0, t);
        } else if (p < 0.50) {
          // Phase 2: Levanta o tronco ficando de joelhos
          let t = (p - 0.25) / 0.25;
          characterGroup.rotation.x = lerp(1.2, 0, t);
          characterGroup.position.y = lerp(basePlayerY * 0.48, basePlayerY * 0.55, t);
          
          hipGrpR.rotation.x = lerp(-1.0, 0, t);
          kneeGrpR.rotation.x = lerp(1.3, 1.5, t);
          hipGrpL.rotation.x = lerp(-1.0, 0, t);
          kneeGrpL.rotation.x = lerp(1.3, 1.5, t);
          
          shoulderGrpR.rotation.x = lerp(-0.8, -0.2, t);
          shoulderGrpL.rotation.x = lerp(-0.8, -0.2, t);
          shoulderGrpR.rotation.z = lerp(0.35, 0.1, t);
          shoulderGrpL.rotation.z = lerp(-0.35, -0.1, t);
          elbowGrpR.rotation.y = lerp(-1.2, -0.2, t);
          elbowGrpL.rotation.y = lerp(1.2, 0.2, t);
        } else if (p < 0.75) {
          // Phase 3: Apoia a perna direita no chão colocando-a para frente
          let t = (p - 0.50) / 0.25;
          characterGroup.position.y = lerp(basePlayerY * 0.55, basePlayerY * 0.72, t);
          characterGroup.rotation.x = 0;
          
          hipGrpL.rotation.x = lerp(0, -0.2, t);
          kneeGrpL.rotation.x = lerp(1.5, 1.5, t);
          
          hipGrpR.rotation.x = lerp(0, -1.0, t); // Quadril para frente (negativo)
          kneeGrpR.rotation.x = lerp(1.5, 1.0, t); // Joelho flete para apoiar o pé no chão
          
          shoulderGrpR.rotation.x = lerp(-0.2, -0.6, t);
          shoulderGrpL.rotation.x = lerp(-0.2, 0.4, t);
          shoulderGrpR.rotation.z = 0.1;
          shoulderGrpL.rotation.z = -0.1;
          elbowGrpR.rotation.y = lerp(-0.2, -0.4, t);
          elbowGrpL.rotation.y = lerp(0.2, 0.3, t);
        } else {
          // Phase 4: Dá o impulso para cima para se levantar
          let t = (p - 0.75) / 0.25;
          characterGroup.position.y = lerp(basePlayerY * 0.72, basePlayerY, t);
          characterGroup.rotation.x = 0;
          characterGroup.rotation.y = 0; // Termina perfeitamente reto
          
          hipGrpR.rotation.x = lerp(-1.0, 0, t); // Retorna suavemente da perna à frente
          kneeGrpR.rotation.x = lerp(1.0, 0, t);  // Estica o joelho até em pé
          hipGrpL.rotation.x = lerp(-0.2, 0, t);
          kneeGrpL.rotation.x = lerp(1.5, 0, t);
          
          shoulderGrpR.rotation.x = lerp(-0.6, 0, t);
          shoulderGrpL.rotation.x = lerp(0.4, 0, t);
          shoulderGrpR.rotation.z = lerp(0.1, 0, t);
          shoulderGrpL.rotation.z = lerp(-0.1, 0, t);
          elbowGrpR.rotation.y = lerp(-0.4, 0, t);
          elbowGrpL.rotation.y = lerp(0.3, 0, t);
        }
      }

      // Soltar espada e escudo no chão na animação de morte/queda do guerreiro
      if (modeRef.current === 'warrior') {
        if (action === 'fall') {
          let dropT = Math.min(p / 0.45, 1.0);

          // Espada (mão esquerda) se solta da mão e cai espalhada na grama
          swordGroup.position.x = lerp(-5.15 - pivotWristL.x, -5.15 - pivotWristL.x - 0.6, dropT);
          swordGroup.position.y = lerp(4.58 - pivotWristL.y, 4.58 - pivotWristL.y + 1.8, dropT);
          swordGroup.position.z = lerp(0 - pivotWristL.z, 0.8, dropT);
          swordGroup.rotation.x = lerp(0, Math.PI / 2 - 0.2, dropT);
          swordGroup.rotation.y = lerp(Math.PI / 2, 0.2, dropT);
          swordGroup.rotation.z = lerp(0, -0.6, dropT);

          // Escudo (mão direita) cai e solta plano na grama
          shieldGroup.position.x = lerp(5.15 - pivotWristR.x + 0.25, 5.15 - pivotWristR.x + 0.9, dropT);
          shieldGroup.position.y = lerp(3.65 - pivotWristR.y, 3.65 - pivotWristR.y + 1.5, dropT);
          shieldGroup.position.z = lerp(-0.42 - pivotWristR.z, 0.5, dropT);
          shieldGroup.rotation.x = lerp(0, -Math.PI / 2, dropT);
          shieldGroup.rotation.y = lerp(Math.PI - 0.2, Math.PI, dropT);
          shieldGroup.rotation.z = lerp(0, 0.5, dropT);
        } else {
          // Posição padrão presa nas mãos quando não estiver caindo
          swordGroup.position.set(-5.15 - pivotWristL.x, 4.58 - pivotWristL.y, 0 - pivotWristL.z);
          swordGroup.rotation.set(0, Math.PI / 2, 0);

          shieldGroup.position.set(5.15 - pivotWristR.x + 0.25, 3.65 - pivotWristR.y, -0.42 - pivotWristR.z);
          shieldGroup.rotation.set(0, Math.PI - 0.2, 0);
        }
      }

      if (action === 'idle') {
        if (resetCameraRef.current) {
          const defaultCamPos = new THREE.Vector3(0, 15, 30);
          const defaultTarget = new THREE.Vector3(0, 0.875, 0);
          camera.position.lerp(defaultCamPos, 0.06);
          controls.target.lerp(defaultTarget, 0.06);
          if (camera.position.distanceTo(defaultCamPos) < 0.1 && controls.target.distanceTo(defaultTarget) < 0.1) {
            resetCameraRef.current = false;
          }
        }
      } else if (action === 'walk' || action === 'jog' || action === 'run') {
        // Acompanhar o personagem suavemente permitindo rotação e ajuste livre de câmera
        controls.target.lerp(characterGroup.position, 0.05);
      }

      controls.update();
      renderer.render(scene, camera);

      // Render 3D Axis Indicator in bottom-right HUD
      if (axisCanvasRef.current) {
        const canvas = axisCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          const cx = w / 2;
          const cy = h / 2;
          const r = 36;

          ctx.clearRect(0, 0, w, h);

          characterGroup.updateMatrixWorld();
          const charQuat = new THREE.Quaternion();
          characterGroup.getWorldQuaternion(charQuat);

          camera.updateMatrixWorld();
          const viewMatrix = camera.matrixWorldInverse;

          const axes = [
            { dir: new THREE.Vector3(1, 0, 0).applyQuaternion(charQuat), color: '#ef4444', label: 'X' },
            { dir: new THREE.Vector3(0, 1, 0).applyQuaternion(charQuat), color: '#22c55e', label: 'Y' },
            { dir: new THREE.Vector3(0, 0, 1).applyQuaternion(charQuat), color: '#3b82f6', label: 'Z' },
          ];

          const projected = axes.map(axis => {
            const v = axis.dir.clone().transformDirection(viewMatrix);
            return {
              x: cx + v.x * r,
              y: cy - v.y * r,
              z: v.z,
              color: axis.color,
              label: axis.label
            };
          });

          projected.sort((a, b) => a.z - b.z);

          projected.forEach(axis => {
            const isBehind = axis.z < -0.05;
            
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(axis.x, axis.y);
            ctx.strokeStyle = axis.color;
            ctx.lineWidth = isBehind ? 2 : 3.5;
            ctx.globalAlpha = isBehind ? 0.35 : 1.0;
            if (isBehind) ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.fillStyle = axis.color;
            ctx.globalAlpha = isBehind ? 0.45 : 1.0;
            ctx.beginPath();
            ctx.arc(axis.x, axis.y, isBehind ? 3.5 : 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.fillStyle = axis.color;
            ctx.globalAlpha = isBehind ? 0.55 : 1.0;
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const dx = axis.x - cx;
            const dy = axis.y - cy;
            const len = Math.hypot(dx, dy) || 1;
            const tx = axis.x + (dx / len) * 12;
            const ty = axis.y + (dy / len) * 12;
            ctx.fillText(axis.label, tx, ty);
            ctx.restore();
          });

          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
    };
  }, []); // Run once to boot three.js scene

  return (
    <div className="w-full h-screen relative bg-slate-900 overflow-hidden font-sans">
      <div ref={mountRef} className="absolute inset-0 cursor-crosshair outline-none" />
      
      {/* Botão de Slow Motion Flutuante no Topo */}
      <div className="absolute top-4 left-4 md:left-[360px] right-4 flex justify-center md:justify-end items-center z-20 pointer-events-none">
        <button
          onClick={toggleSlowMotion}
          className={`
            pointer-events-auto flex items-center gap-2.5 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all duration-300 shadow-2xl border cursor-pointer font-mono
            ${isSlowMotion 
              ? 'bg-amber-500 text-slate-950 border-amber-400 hover:bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.5)]' 
              : 'bg-slate-900/90 text-slate-300 border-slate-700/50 hover:bg-slate-800 hover:text-white hover:scale-105'
            }
          `}
        >
          <Timer size={14} className={`${isSlowMotion ? 'animate-pulse' : ''}`} />
          <span>{isSlowMotion ? 'Slow Motion: LIGADO' : 'Slow Motion: DESLIGADO'}</span>
        </button>
      </div>
      
      {/* UI Overlay */}
      <div className="absolute top-0 left-0 h-full w-[340px] bg-slate-900/80 backdrop-blur-md border-r border-slate-700/50 p-6 flex flex-col z-10 shadow-2xl overflow-y-auto">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-400 to-emerald-400 bg-clip-text text-transparent mb-1">
          Soccer3D Core
        </h1>
        <p className="text-sm text-slate-400 mb-6 font-medium">
          Motion Control System
        </p>

        {/* CONTROLES DO MOUSE */}
        <div className="mb-5 p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex flex-col gap-2 text-xs text-slate-300">
          <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400 font-mono">
            Controles de Navegação
          </div>
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono font-bold text-[10px] border border-sky-500/40">Clique Esq.</span>
            <span>Andar até o local no campo</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[10px] border border-amber-500/40">Botão Dir.</span>
            <span>Rotacionar câmera (todas direções)</span>
          </div>
        </div>

        {/* OPÇÕES DE MODELO (SoccerPlayer / Guerreiro) */}
        <div className="mb-6 p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1 mb-1">
            Modelo
          </div>

          <button
            onClick={() => handleModeChange('soccer')}
            className={`
              flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 border cursor-pointer
              ${characterMode === 'soccer' 
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.3)]' 
                : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
              }
            `}
          >
            <span className="flex items-center gap-2 font-medium">⚽ SoccerPlayer</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${characterMode === 'soccer' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-500'}`}>
              {characterMode === 'soccer' ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            onClick={() => handleModeChange('warrior')}
            className={`
              flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 border cursor-pointer
              ${characterMode === 'warrior' 
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.3)]' 
                : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
              }
            `}
          >
            <span className="flex items-center gap-2 font-medium">⚔️ Guerreiro</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${characterMode === 'warrior' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500'}`}>
              {characterMode === 'warrior' ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {(characterMode === 'warrior'
            ? ACTIONS.filter(a => WARRIOR_ACTION_IDS.includes(a.id))
            : ACTIONS
          ).map(action => (
            <button
              key={action.id}
              onClick={() => setAction(action.id)}
              className={`
                group flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-all duration-300
                ${activeAction === action.id 
                  ? 'bg-sky-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.5)] translate-x-2' 
                  : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white hover:translate-x-1'
                }
              `}
            >
              <span>{characterMode === 'warrior' && action.id === 'fall' ? 'Morte 1' : action.label}</span>
              <Play 
                size={16} 
                className={`transition-transform duration-300 ${activeAction === action.id ? 'opacity-100 scale-110 text-white' : 'opacity-40 group-hover:opacity-100'}`} 
              />
            </button>
          ))}
        </div>
      </div>

      {/* Indicador de Eixos 3D (Canto Inferior Direito) */}
      <div className="absolute bottom-4 right-4 z-20 bg-slate-900/85 backdrop-blur-md border border-slate-700/60 rounded-2xl p-3 shadow-2xl flex flex-col items-center gap-2 select-none pointer-events-auto">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
          <span>Eixos 3D (Modelo)</span>
        </div>
        
        <div className="relative w-28 h-28 flex items-center justify-center bg-slate-950/70 rounded-xl border border-slate-800">
          <canvas
            ref={axisCanvasRef}
            width={112}
            height={112}
            className="w-full h-full block"
          />
        </div>

        <div className="flex gap-3 text-[11px] font-mono font-bold">
          <span className="flex items-center gap-1 text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> X
          </span>
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Y
          </span>
          <span className="flex items-center gap-1 text-blue-400">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Z
          </span>
        </div>
      </div>
    </div>
  );
}
