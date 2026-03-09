import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TerrainService } from './terrain.service';

@Injectable({ providedIn: 'root' })
export class RoverService {

  private group!: THREE.Group;
  private model?: THREE.Object3D;
  private mixer?: THREE.AnimationMixer;

  private wheels: THREE.Object3D[] = [];
  private kameraZylinder?: THREE.Object3D;
  private kameraKopf?: THREE.Object3D;
  private kameraLinse?: THREE.Object3D;
  private armBasis?: THREE.Object3D;
  private armSchulter?: THREE.Object3D;
  private armEllenbogen?: THREE.Object3D;
  private armHandgelenk?: THREE.Object3D;
  private fingerL?: THREE.Object3D;
  private fingerR?: THREE.Object3D;

  private keys: { [key: string]: boolean } = {};

  private moveSpeed = 5.0;
  private turnSpeed = 2.0;
  private wheelRotationSpeed = 5.0;
  private yOffset = 0;

  constructor(private terrainService: TerrainService) {
    window.addEventListener('keydown', (e) => this.keys[e.code] = true);
    window.addEventListener('keyup', (e) => this.keys[e.code] = false);
  }

  public setMoveSpeed(moveSpeed: number) {
      this.moveSpeed = moveSpeed;
      this.wheelRotationSpeed = moveSpeed;
    }

  create(scene: THREE.Scene): THREE.Group {
    this.group = new THREE.Group();
    this.group.position.set(0, 102, 0);

    scene.add(this.group);

    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      'assets/Rover.glb',
      (gltf) => {
        this.model = gltf.scene;
        this.model.scale.set(1, 1, 1);
        this.model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }

          const name = child.name;
          const lowerName = name.toLowerCase();

          if (lowerName.includes('rad')) {
            this.wheels.push(child);
          } else if (lowerName.includes('kamerazylinder') || lowerName.includes('kamerapfosten')) {
            this.kameraZylinder = child;
          } else if (lowerName.includes('kamera')) {
            this.kameraKopf = child;
          } else if (lowerName === 'basis' || (lowerName.includes('basis') && !lowerName.includes('finger'))) {
            this.armBasis = child;
          } else if (lowerName.includes('schulter')) {
            this.armSchulter = child;
          } else if (lowerName.includes('ellenbogen')) {
            this.armEllenbogen = child;
          } else if (lowerName.includes('handgelenk')) {
            this.armHandgelenk = child;
          } else if (lowerName.includes('fingerl')) {
            this.fingerL = child;
          } else if (lowerName.includes('fingerr')) {
            this.fingerR = child;
          }
        });

        if (gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(this.model);
          gltf.animations.forEach(clip => {
            this.mixer!.clipAction(clip).play();
          });
        }


        const box = new THREE.Box3().setFromObject(this.model);
        // Kleiner Abzug (0.05) damit die Räder minimal einsinken und nicht schweben
        this.yOffset = -box.min.y - 0.05;

        // Verschiebe das Modell so, dass die Unterseite (Räder) bei y=0 in der lokalen Gruppe liegen
        // Dadurch rotiert der Rover um seinen Bodenkontaktpunkt statt um sein Zentrum.
        this.model.position.y = this.yOffset;

        this.group.add(this.model);
      },
      (progress) => {
        console.log('Rover laden:', (progress.loaded / progress.total * 100).toFixed(0) + '%');
      },
      (error) => {
        console.error('Fehler beim Laden des Rover-Modells:', error);
      }
    );

    return this.group;
  }

  update(delta: number): void {
    if (!this.model) return;

    if (this.mixer) {
      this.mixer.update(delta);
    }

    this.handleMovement(delta);
    this.handleCamera(delta);
    this.handleArm(delta);
  }

  private handleMovement(delta: number): void {
    let moveDir = 0;
    let turnDir = 0;

    if (this.keys['KeyS']) moveDir += 1;
    if (this.keys['KeyW']) moveDir -= 1;
    if (this.keys['KeyA']) turnDir += 1;
    if (this.keys['KeyD']) turnDir -= 1;

    if (turnDir !== 0) {
      this.group.rotateY(turnDir * this.turnSpeed * delta);
    }

    if (moveDir !== 0) {
      this.group.translateZ(moveDir * this.moveSpeed * delta);

      this.wheels.forEach(wheel => {
        wheel.rotation.x += moveDir * this.wheelRotationSpeed * delta;
      });
    }

    const pos = this.group.position.clone();
    const radius = 100;
    const height = this.terrainService.getHeightAt(pos.x, pos.y, pos.z);

    const sphereNormal = pos.length() > 0.001 ? pos.clone().normalize() : new THREE.Vector3(0, 1, 0);

    const terrainInfo = this.calculateTerrainNormal(pos, sphereNormal, radius);
    const terrainNormal = terrainInfo.normal;
    const avgHeight = terrainInfo.avgHeight;

    // Setze die Position der Gruppe exakt auf die Geländeoberfläche (Durchschnittshöhe für Stabilität)
    // Ziehe yOffset ab, da das Modell innerhalb der Gruppe bereits nach oben verschoben ist
    this.group.position.copy(sphereNormal).multiplyScalar(radius + avgHeight - this.yOffset);

    const currentForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);

    const right = new THREE.Vector3().crossVectors(terrainNormal, currentForward).normalize();

    if (right.lengthSq() < 0.0001) {
        right.set(1, 0, 0).applyQuaternion(this.group.quaternion);
    }

    const forward = new THREE.Vector3().crossVectors(right, terrainNormal).normalize();

    const matrix = new THREE.Matrix4().makeBasis(right, terrainNormal, forward);
    this.group.quaternion.setFromRotationMatrix(matrix);
  }

  private calculateTerrainNormal(pos: THREE.Vector3, sphereNormal: THREE.Vector3, radius: number): { normal: THREE.Vector3, avgHeight: number } {
    // Ein Epsilon, das etwa der Größe des Rovers entspricht für stabile Neigung
    const epsilon = 1.5;

    const tangent1 = new THREE.Vector3();
    const tangent2 = new THREE.Vector3();

    // Basis-Tangenten auf der Kugeloberfläche berechnen
    if (Math.abs(sphereNormal.y) < 0.9) {
      tangent1.set(0, 1, 0).cross(sphereNormal).normalize();
    } else {
      tangent1.set(1, 0, 0).cross(sphereNormal).normalize();
    }
    tangent2.copy(sphereNormal).cross(tangent1).normalize();

    const getHeight = (dir: THREE.Vector3) => this.terrainService.getHeightAt(dir.x, dir.y, dir.z);

    // 5 Punkte abfragen: Mitte + 4 Punkte im Kreuz (vorne, hinten, links, rechts)
    const h0 = getHeight(sphereNormal);
    const h1 = getHeight(sphereNormal.clone().add(tangent1.clone().multiplyScalar(epsilon)).normalize());
    const h2 = getHeight(sphereNormal.clone().add(tangent1.clone().multiplyScalar(-epsilon)).normalize());
    const h3 = getHeight(sphereNormal.clone().add(tangent2.clone().multiplyScalar(epsilon)).normalize());
    const h4 = getHeight(sphereNormal.clone().add(tangent2.clone().multiplyScalar(-epsilon)).normalize());

    const p1 = sphereNormal.clone().add(tangent1.clone().multiplyScalar(epsilon)).normalize().multiplyScalar(radius + h1);
    const p2 = sphereNormal.clone().add(tangent1.clone().multiplyScalar(-epsilon)).normalize().multiplyScalar(radius + h2);
    const p3 = sphereNormal.clone().add(tangent2.clone().multiplyScalar(epsilon)).normalize().multiplyScalar(radius + h3);
    const p4 = sphereNormal.clone().add(tangent2.clone().multiplyScalar(-epsilon)).normalize().multiplyScalar(radius + h4);

    // Vektoren aufspannen (Links->Rechts und Hinten->Vorne)
    const vX = p1.sub(p2);
    const vZ = p3.sub(p4);

    // Kreuzprodukt für die Normale
    const normal = new THREE.Vector3().crossVectors(vX, vZ).normalize();

    // Sicherstellen, dass die Normale nach außen zeigt (weg vom Planetenkern)
    if (normal.dot(sphereNormal) < 0) {
      normal.negate();
    }

    const avgHeight = (h0 + h1 + h2 + h3 + h4) / 5;

    return { normal, avgHeight };
  }

  private handleCamera(delta: number): void {
    if (!this.kameraZylinder) return;

    const camRotationSpeed = 1.5;
    if (this.keys['ArrowLeft']) this.kameraZylinder.rotation.y += camRotationSpeed * delta;
    if (this.keys['ArrowRight']) this.kameraZylinder.rotation.y -= camRotationSpeed * delta;
  }

  private handleArm(delta: number): void {
    const armRotationSpeed = 1.0;

    if (this.armBasis) {
      if (this.keys['KeyQ']) this.armBasis.rotation.y += armRotationSpeed * delta;
      if (this.keys['KeyE']) this.armBasis.rotation.y -= armRotationSpeed * delta;
    }

    if (this.armSchulter) {
      if (this.keys['KeyR']) this.armSchulter.rotation.y += armRotationSpeed * delta;
      if (this.keys['KeyF']) this.armSchulter.rotation.y -= armRotationSpeed * delta;
    }

    if (this.armEllenbogen) {
      if (this.keys['KeyT']) this.armEllenbogen.rotation.x += armRotationSpeed * delta;
      if (this.keys['KeyG']) this.armEllenbogen.rotation.x -= armRotationSpeed * delta;
    }

    if (this.armHandgelenk) {
      if (this.keys['KeyU']) this.armHandgelenk.rotation.y += armRotationSpeed * delta;
      if (this.keys['KeyJ']) this.armHandgelenk.rotation.y -= armRotationSpeed * delta;
    }

    if (this.fingerL && this.fingerR) {
      if (this.keys['KeyI']) {
        this.fingerL.rotation.x += armRotationSpeed * delta;
        this.fingerR.rotation.x -= armRotationSpeed * delta;
      }
      if (this.keys['KeyK']) {
        this.fingerL.rotation.x -= armRotationSpeed * delta;
        this.fingerR.rotation.x += armRotationSpeed * delta;
      }
    }
  }



  getPosition(): THREE.Vector3 {
    return this.group.position;
  }

  dispose(): void {
    if (this.model) {
      this.model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).geometry.dispose();
          const materials = (child as THREE.Mesh).material;
          if (Array.isArray(materials)) {
            materials.forEach(m => m.dispose());
          } else {
            materials.dispose();
          }
        }
      });
    }
  }
}
