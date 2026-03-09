import { Injectable } from '@angular/core';
import * as THREE from 'three';
import * as dat from 'dat.gui';
import { LightingService } from './lighting.service';
import { TerrainService } from './terrain.service';
import { RoverService } from './rover.service';

@Injectable({ providedIn: 'root' })
export class GuiService {

    private gui!: dat.GUI;

    create(
        scene: THREE.Scene,
        lightingService: LightingService,
        terrainService?: TerrainService,
        roverService?: RoverService
    ): void {
        this.gui = new dat.GUI({ width: 320 });
        this.gui.domElement.style.position = 'absolute';
        this.gui.domElement.style.top = '10px';
        this.gui.domElement.style.right = '10px';

        const lightFolder = this.gui.addFolder('Beleuchtung');
        const lightParams = {
            sunIntensity: lightingService.sunLight.intensity,
            baseLightsIntensity: lightingService.baseLights[0]?.intensity ?? 1.5
        };
        lightFolder.add(lightParams, 'sunIntensity', 0, 5, 0.1)
            .name('Sonne')
            .onChange((val: number) => {
                lightingService.sunLight.intensity = val;
            });
        lightFolder.add(lightParams, 'baseLightsIntensity', 0, 5, 0.1)
            .name('Basis-Lichter')
            .onChange((val: number) => {
                lightingService.baseLights.forEach(l => l.intensity = val);
            });
        lightFolder.open();

        const fogFolder = this.gui.addFolder('Nebel');
        const fogParams = {
            density: (scene.fog as THREE.FogExp2)?.density ?? 0.008,
            color: '#' + ((scene.fog as THREE.FogExp2)?.color?.getHexString() ?? '331a0d'),
        };
        fogFolder.add(fogParams, 'density', 0, 0.05, 0.001)
            .name('Dichte')
            .onChange((val: number) => {
                if (scene.fog instanceof THREE.FogExp2) {
                    scene.fog.density = val;
                }
            });
        fogFolder.addColor(fogParams, 'color')
            .name('Farbe')
            .onChange((val: string) => {
                if (scene.fog instanceof THREE.FogExp2) {
                    scene.fog.color.set(val);
                }
                if (scene.background instanceof THREE.Color) {
                    scene.background.set(val);
                }
            });
        fogFolder.open();

        if (roverService) {
            const roverFolder = this.gui.addFolder('Rover');

            const roverParams = {
                speed: 5.0,
                turnSpeed: 2.0
            };
            roverFolder.add(roverParams, 'speed', 0.5, 15, 0.5)
                .name('Geschwindigkeit')
                .onChange((val: number) => {
                    roverService.setMoveSpeed(val);
                });
            roverFolder.add(roverParams, 'turnSpeed', 0.5, 10, 0.5)
                .name('Drehgeschwindigkeit')
                .onChange((val: number) => {
                    roverService.setTurnSpeed(val);
                });
            roverFolder.open();

            const controlFolder = this.gui.addFolder('Steuerung (Rover)');
            const controls = {
                move: 'W / S',
                turn: 'A / D',
                cam: 'Pfeiltasten L / R',
                armBase: 'Q / E',
                armShoulder: 'R / F',
                armElbow: 'T / G',
                armWrist: 'U / J',
                gripper: 'I / K'
            };

            controlFolder.add(controls, 'move').name('Vor / Zurück');
            controlFolder.add(controls, 'turn').name('Links / Rechts drehen');
            controlFolder.add(controls, 'cam').name('Kamera drehen');
            controlFolder.add(controls, 'armBase').name('Arm: Basis');
            controlFolder.add(controls, 'armShoulder').name('Arm: Schulter');
            controlFolder.add(controls, 'armElbow').name('Arm: Ellenbogen');
            controlFolder.add(controls, 'armWrist').name('Arm: Handgelenk');
            controlFolder.add(controls, 'gripper').name('Greifer: Auf / Zu');
            controlFolder.open();
        }

    }

    dispose(): void {
        this.gui?.destroy();
    }
}
