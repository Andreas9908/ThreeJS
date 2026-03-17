import { Injectable } from '@angular/core';
import * as THREE from 'three';

@Injectable({ providedIn: 'root' })
export class LightingService {

    sunLight!: THREE.DirectionalLight;
    baseLights: THREE.PointLight[] = [];
    spotLight!: THREE.SpotLight;
    ambientLight!: THREE.AmbientLight;

    private helpers: THREE.Object3D[] = [];

    create(scene: THREE.Scene): void {
        this.ambientLight = new THREE.AmbientLight(0x331111, 0.25);
        scene.add(this.ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xFFDDCC, 1.8);
        this.sunLight.position.set(100, 150, -50);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 4096;
        this.sunLight.shadow.mapSize.height = 4096;
        this.sunLight.shadow.camera.near = 1;
        this.sunLight.shadow.camera.far = 400;
        this.sunLight.shadow.camera.left = -150;
        this.sunLight.shadow.camera.right = 150;
        this.sunLight.shadow.camera.top = 150;
        this.sunLight.shadow.camera.bottom = -150;
        this.sunLight.shadow.bias = -0.0001;
        this.sunLight.shadow.normalBias = 0.05;
        scene.add(this.sunLight);

        const pointConfigs = [
            { color: 0xFFAA44, intensity: 1.5, x: 0, y: 6, z: 0 },       // Kuppel-Licht
            { color: 0xFF6633, intensity: 1.0, x: -8, y: 5, z: 3 },       // Modul links
            { color: 0xFF6633, intensity: 1.0, x: 8, y: 5, z: 3 },       // Modul rechts
        ];
        pointConfigs.forEach(cfg => {
            const light = new THREE.PointLight(cfg.color, cfg.intensity, 40, 1.5);
            light.position.set(cfg.x, cfg.y, cfg.z);
            light.castShadow = true;
            light.shadow.bias = -0.0005;
            light.shadow.normalBias = 0.02;
            this.baseLights.push(light);
            scene.add(light);
        });

        // ------ SpotLight (Rover-Scheinwerfer) ------
        this.spotLight = new THREE.SpotLight(0xFFFFDD, 2.5, 60, Math.PI / 8, 0.3, 1.5);
        this.spotLight.position.set(20, 5, 15);
        this.spotLight.target.position.set(10, 0, 5);
        this.spotLight.castShadow = true;
        this.spotLight.shadow.bias = -0.0005;
        this.spotLight.shadow.normalBias = 0.02;
        scene.add(this.spotLight);
        scene.add(this.spotLight.target);
    }

    getSunIntensity(): number {
        return this.sunLight?.intensity ?? 1.8;
    }

    setSunIntensity(value: number): void {
        if (this.sunLight) {
            this.sunLight.intensity = value;
        }
    }

    dispose(): void {
        this.sunLight?.dispose();
        this.baseLights.forEach(l => l.dispose());
        this.spotLight?.dispose();
        this.ambientLight?.dispose();
        this.helpers.forEach(h => {
            if (h.parent) h.parent.remove(h);
        });
    }
}
