import {
    Component,
    ElementRef,
    ViewChild,
    AfterViewInit,
    OnDestroy,
    NgZone,
} from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { TerrainService } from './services/terrain.service';
import { StructuresService } from './services/structures.service';
import { LightingService } from './services/lighting.service';
import { GuiService } from './services/gui.service';
import { RoverService } from './services/rover.service';

@Component({
    selector: 'app-mars-scene',
    templateUrl: './mars-scene.component.html',
    styleUrls: ['./mars-scene.component.scss'],
    providers: [
        TerrainService,
        StructuresService,
        LightingService,
        GuiService,
        RoverService,
    ],
})
export class MarsSceneComponent implements AfterViewInit, OnDestroy {

    @ViewChild('canvas', { static: true })
    canvasRef!: ElementRef<HTMLCanvasElement>;

    private renderer!: THREE.WebGLRenderer;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private controls!: OrbitControls;
    private animationId = 0;
    private clock = new THREE.Clock();

    constructor(
        private ngZone: NgZone,
        private terrainService: TerrainService,
        private structuresService: StructuresService,
        private lightingService: LightingService,
        private guiService: GuiService,
        private roverService: RoverService
    ) { }

    ngAfterViewInit(): void {
        this.initScene();
        this.initFog();
        this.initCamera();
        this.initRenderer();
        this.initControls();

    const terrainMesh = this.terrainService.create(this.scene);
    const collisionObjects = this.structuresService.create(this.scene, this.terrainService);
    this.lightingService.create(this.scene);
    this.roverService.create(this.scene);

    this.roverService.setCollisionObjects(collisionObjects);

    this.roverService.setPickableStones(this.structuresService.getPickableStones());

        this.guiService.create(
            this.scene,
            this.lightingService,
            this.terrainService,
            this.roverService
        );

        this.createStars();

        window.addEventListener('resize', this.onResize);

        this.ngZone.runOutsideAngular(() => this.animate());
    }

    ngOnDestroy(): void {
        cancelAnimationFrame(this.animationId);

        window.removeEventListener('resize', this.onResize);

        this.terrainService.dispose();
        this.structuresService.dispose();
        this.lightingService.dispose();
        this.guiService.dispose();
        this.roverService.dispose();

        this.controls?.dispose();
        this.renderer?.dispose();
    }

    private initScene(): void {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x331a0d);
    }

    private initFog(): void {
        const fogColor = new THREE.Color(0x331a0d);
        this.scene.fog = new THREE.FogExp2(fogColor, 0.008);
    }

    private initCamera(): void {
        const canvas = this.canvasRef.nativeElement;
        const aspect = canvas.clientWidth / canvas.clientHeight;
        this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 1000);
        this.camera.position.set(130, 120, 140);
        this.camera.lookAt(0, 0, 0);
    }

    private initRenderer(): void {
        const canvas = this.canvasRef.nativeElement;
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
        });
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.9;
    }

    private initControls(): void {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 500;
        this.controls.target.set(0, 0, 0);
    }

    private starGeometry!: THREE.BufferGeometry;
    private starMaterial!: THREE.PointsMaterial;

    private createStars(): void {
        const starCount = 5000;
        const positions = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i++) {
            const r = 400 + Math.random() * 200;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
        }

        this.starGeometry = new THREE.BufferGeometry();
        this.starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        this.starMaterial = new THREE.PointsMaterial({
            color: 0xFFFFFF,
            size: 0.4,
            sizeAttenuation: true,
        });

        const stars = new THREE.Points(this.starGeometry, this.starMaterial);
        this.scene.add(stars);
    }

    private animate = (): void => {
        this.animationId = requestAnimationFrame(this.animate);

        const delta = this.clock.getDelta();

        this.controls.update();

        this.roverService.update(delta);
        if (this.roverService.getPosition()) {
          this.controls.target.copy(this.roverService.getPosition());
        }

        this.renderer.render(this.scene, this.camera);
    };

    private onResize = (): void => {
        const canvas = this.canvasRef.nativeElement;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
        this.renderer.setSize(width, height);
    };
}
