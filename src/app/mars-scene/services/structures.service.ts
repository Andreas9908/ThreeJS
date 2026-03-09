import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { TerrainService } from './terrain.service';

/**
 * StructuresService – Erstellt 10+ verschiedene Geometrien für die Mars-Basis.
 * Jede Struktur wird mit einem passenden Material versehen und positioniert.
 */
@Injectable({ providedIn: 'root' })
export class StructuresService {

    private meshes: THREE.Mesh[] = [];
    private geometries: THREE.BufferGeometry[] = [];
    private materials: THREE.Material[] = [];

    // ====================================================================
    // Materialien (5+ verschiedene MeshStandardMaterials)
    // ====================================================================

    /** 1. Oxidierter Mars-Staub (Felsen) */
    private createDustMaterial(): THREE.MeshStandardMaterial {
        const mat = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 1.0,
            metalness: 0.0,
            flatShading: true,
        });
        this.materials.push(mat);
        return mat;
    }

    /** 2. Gebürstetes Metall (Basis-Strukturen) */
    private createMetalMaterial(): THREE.MeshStandardMaterial {
        const mat = new THREE.MeshStandardMaterial({
            color: 0xCCCCCC,
            roughness: 0.15,
            metalness: 0.95,
        });
        this.materials.push(mat);
        return mat;
    }

    /** 3. Glühendes Glas (Kuppel) */
    private createGlassMaterial(): THREE.MeshStandardMaterial {
        const mat = new THREE.MeshStandardMaterial({
            color: 0xAAEEFF,
            roughness: 0.05,
            metalness: 0.1,
            transparent: true,
            opacity: 0.35,
            emissive: 0x4488AA,
            emissiveIntensity: 0.6,
        });
        this.materials.push(mat);
        return mat;
    }

    /** 4. Dunkles Gestein */
    private createDarkRockMaterial(): THREE.MeshStandardMaterial {
        const mat = new THREE.MeshStandardMaterial({
            color: 0x3D2B1F,
            roughness: 0.95,
            metalness: 0.05,
            flatShading: true,
        });
        this.materials.push(mat);
        return mat;
    }

    /** 5. Antennen-Material (leicht emissiv) */
    private createAntennaMaterial(): THREE.MeshStandardMaterial {
        const mat = new THREE.MeshStandardMaterial({
            color: 0xCCCCCC,
            roughness: 0.2,
            metalness: 0.9,
            emissive: 0xFF4400,
            emissiveIntensity: 0.15,
        });
        this.materials.push(mat);
        return mat;
    }

    // ====================================================================
    // Szene aufbauen
    // ====================================================================

    create(scene: THREE.Scene, terrainService: TerrainService): void {
        const sphereRadius = 100;
        // Materialien erzeugen
        const dustMat = this.createDustMaterial();
        const metalMat = this.createMetalMaterial();
        const glassMat = this.createGlassMaterial();
        const darkRockMat = this.createDarkRockMaterial();
        const antennaMat = this.createAntennaMaterial();

        // ------ 1–3: Icosahedron-Felsen (3×) ------
        const rockPositions = [
            { x: -25, z: -15, scale: 3.5 },
            { x: 18, z: -30, scale: 2.0 },
            { x: -40, z: 10, scale: 4.0 },
        ];
        rockPositions.forEach(pos => {
            const geo = new THREE.IcosahedronGeometry(pos.scale, 1);
            this.geometries.push(geo);
            const mesh = new THREE.Mesh(geo, dustMat);

            const dir = new THREE.Vector3(pos.x, sphereRadius, pos.z).normalize();
            const groundOffset = terrainService.getHeightAt(dir.x * sphereRadius, dir.y * sphereRadius, dir.z * sphereRadius);
            const totalRadius = sphereRadius + groundOffset;

            mesh.position.copy(dir).multiplyScalar(totalRadius + pos.scale * 0.5 - 0.5);
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

            mesh.rotation.x += Math.random();
            mesh.rotation.y += Math.random();
            mesh.rotation.z += Math.random();

            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.meshes.push(mesh);
            scene.add(mesh);
        });

        // ------ 4: Habitat-Kuppel Komplex ------
        const habitatGroup = new THREE.Group();
        const domeDir = new THREE.Vector3(0, 1, 0); // Nordpol
        const domeOffset = terrainService.getHeightAt(0, sphereRadius, 0);

        // Die Kuppel selbst
        const domeGeo = new THREE.SphereGeometry(6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        this.geometries.push(domeGeo);
        const domeMesh = new THREE.Mesh(domeGeo, glassMat);
        habitatGroup.add(domeMesh);

        // Basis-Ring der Kuppel
        const baseRingGeo = new THREE.CylinderGeometry(6, 6.2, 1.5, 32);
        this.geometries.push(baseRingGeo);
        const baseRingMesh = new THREE.Mesh(baseRingGeo, metalMat);
        baseRingMesh.position.y = 0.5;
        habitatGroup.add(baseRingMesh);

        // Stützen (Legs)
        const legGeo = new THREE.BoxGeometry(0.8, 3, 0.8);
        this.geometries.push(legGeo);
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const leg = new THREE.Mesh(legGeo, metalMat);
            leg.position.set(Math.cos(angle) * 5, -1, Math.sin(angle) * 5);
            leg.rotation.z = Math.cos(angle) * 0.2;
            leg.rotation.x = Math.sin(angle) * 0.2;
            habitatGroup.add(leg);
        }

        habitatGroup.position.copy(domeDir).multiplyScalar(sphereRadius + domeOffset);
        habitatGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), domeDir);
        scene.add(habitatGroup);

        // ------ 5–6: Basis-Module mit Solarpanels ------
        const modulePositions = [
            { x: -10, z: 5 },
            { x: 10, z: 5 },
        ];
        modulePositions.forEach(pos => {
            const modGroup = new THREE.Group();
            const dir = new THREE.Vector3(pos.x, sphereRadius, pos.z).normalize();
            const groundOffset = terrainService.getHeightAt(dir.x * sphereRadius, dir.y * sphereRadius, dir.z * sphereRadius);

            const bodyGeo = new THREE.CylinderGeometry(2.2, 2.2, 5, 16);
            this.geometries.push(bodyGeo);
            const body = new THREE.Mesh(bodyGeo, metalMat);
            body.rotation.z = Math.PI / 2; // Horizontal liegend
            modGroup.add(body);

            // Solarpanels
            const panelGeo = new THREE.BoxGeometry(4, 0.1, 2);
            this.geometries.push(panelGeo);
            const panelMat = new THREE.MeshStandardMaterial({ color: 0x112244, metalness: 0.8, roughness: 0.2 });
            this.materials.push(panelMat);

            const panel1 = new THREE.Mesh(panelGeo, panelMat);
            panel1.position.set(0, 2, 1.5);
            panel1.rotation.x = 0.5;
            modGroup.add(panel1);

            const panel2 = new THREE.Mesh(panelGeo, panelMat);
            panel2.position.set(0, 2, -1.5);
            panel2.rotation.x = -0.5;
            modGroup.add(panel2);

            modGroup.position.copy(dir).multiplyScalar(sphereRadius + groundOffset + 2.2);
            modGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            scene.add(modGroup);
        });

        // ------ 7: Fortschrittliche Antenne ------
        const antGroup = new THREE.Group();
        const antDir = new THREE.Vector3(12, sphereRadius, -5).normalize();
        const antOffset = terrainService.getHeightAt(antDir.x * sphereRadius, antDir.y * sphereRadius, antDir.z * sphereRadius);

        const mastGeo = new THREE.CylinderGeometry(0.3, 0.5, 10, 8);
        this.geometries.push(mastGeo);
        const mast = new THREE.Mesh(mastGeo, metalMat);
        mast.position.y = 5;
        antGroup.add(mast);

        // Satellitenschüssel (Dish)
        const dishGeo = new THREE.SphereGeometry(2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        this.geometries.push(dishGeo);
        const dish = new THREE.Mesh(dishGeo, metalMat);
        dish.position.y = 10;
        dish.rotation.x = -Math.PI / 4;
        antGroup.add(dish);

        // Blinkendes Licht an der Spitze
        const lightGeo = new THREE.SphereGeometry(0.3, 8, 8);
        this.geometries.push(lightGeo);
        const lightMat = new THREE.MeshStandardMaterial({
            color: 0xFF0000,
            emissive: 0xFF0000,
            emissiveIntensity: 1.5
        });
        this.materials.push(lightMat);
        const light = new THREE.Mesh(lightGeo, lightMat);
        light.position.y = 11;
        antGroup.add(light);

        antGroup.position.copy(antDir).multiplyScalar(sphereRadius + antOffset);
        antGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), antDir);
        scene.add(antGroup);

        // ------ 8: Container-Einheit ------
        const boxGeo = new THREE.BoxGeometry(4, 3, 6);
        this.geometries.push(boxGeo);
        const boxMesh = new THREE.Mesh(boxGeo, metalMat);
        const boxDir = new THREE.Vector3(-15, sphereRadius, -10).normalize();
        const boxOffset = terrainService.getHeightAt(boxDir.x * sphereRadius, boxDir.y * sphereRadius, boxDir.z * sphereRadius);
        boxMesh.position.copy(boxDir).multiplyScalar(sphereRadius + boxOffset + 1.5);
        boxMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), boxDir);
        boxMesh.castShadow = true;
        scene.add(boxMesh);

        // ------ 9: Forschungs-Ring ------
        const ringDir = new THREE.Vector3(25, sphereRadius, 15).normalize();
        const ringOffset = terrainService.getHeightAt(ringDir.x * sphereRadius, ringDir.y * sphereRadius, ringDir.z * sphereRadius);

        const platformGeo = new THREE.CylinderGeometry(8, 8, 0.5, 32);
        this.geometries.push(platformGeo);
        const platform = new THREE.Mesh(platformGeo, darkRockMat);
        platform.position.copy(ringDir).multiplyScalar(sphereRadius + ringOffset + 0.25);
        platform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ringDir);
        scene.add(platform);

        const markerGeo = new THREE.RingGeometry(1, 1.5, 32);
        this.geometries.push(markerGeo);
        const marker = new THREE.Mesh(markerGeo, antennaMat);
        marker.position.copy(ringDir).multiplyScalar(sphereRadius + ringOffset + 0.55);
        marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ringDir);
        marker.rotateX(-Math.PI / 2);
        scene.add(marker);
    }

    /** Aufräumen aller Geometrien und Materialien */
    dispose(): void {
        this.geometries.forEach(g => g.dispose());
        this.materials.forEach(m => m.dispose());
    }
}
