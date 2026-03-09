import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TerrainService } from './terrain.service';

/**
 * RoverService – Platzhalter für den Mars-Rover.
 *
 * Aktuell wird ein einfacher Box-Mesh als Platzhalter gerendert.
 * Sobald ein Blender-Modell (.glb) vorliegt, kann der auskommentierte
 * GLTFLoader-Code aktiviert werden.
 */
@Injectable({ providedIn: 'root' })
export class RoverService {

  private group!: THREE.Group;
  private model?: THREE.Object3D;
  private mixer?: THREE.AnimationMixer;

  // Rover Teile
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

  // Steuerungszustand
  private keys: { [key: string]: boolean } = {};

  // Bewegungswerte
  private moveSpeed = 5.0;
  private turnSpeed = 2.0;
  private wheelRotationSpeed = 5.0;
  private yOffset = 0;

  constructor(private terrainService: TerrainService) {
    window.addEventListener('keydown', (e) => this.keys[e.code] = true);
    window.addEventListener('keyup', (e) => this.keys[e.code] = false);
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

        // Bounding Box berechnen, bevor das Modell der Gruppe (die schon positioniert ist) hinzugefügt wird
        // Wenn es bereits in der Gruppe wäre, die bei (0, 102, 0) steht,
        // würde box.min.y etwa 101-102 sein und yOffset negativ werden!
        const box = new THREE.Box3().setFromObject(this.model);
        this.yOffset = -box.min.y;

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

    // Drehung (um die eigene Hochachse)
    if (turnDir !== 0) {
      this.group.rotateY(turnDir * this.turnSpeed * delta);
    }

    // Bewegung (in Blickrichtung)
    if (moveDir !== 0) {
      this.group.translateZ(moveDir * this.moveSpeed * delta);

      // Räder drehen
      this.wheels.forEach(wheel => {
        wheel.rotation.x += moveDir * this.wheelRotationSpeed * delta;
      });
    }

    // --- Auf Oberfläche der Mars-Kugel snappen ---
    const pos = this.group.position.clone();
    const radius = 100; // Basisradius der Marskugel
    const height = this.terrainService.getHeightAt(pos.x, pos.y, pos.z);

    const sphereNormal = pos.length() > 0.001 ? pos.clone().normalize() : new THREE.Vector3(0, 1, 0);

    // Gelände-Normale berechnen für bessere Ausrichtung an Krümmung und Steigung
    const terrainNormal = this.calculateTerrainNormal(pos, sphereNormal, radius);

    // Neue Position auf der Oberfläche (Radius + lokaler Höhen-Offset + Rover-Höhen-Offset)
    this.group.position.copy(sphereNormal).multiplyScalar(radius + height + this.yOffset);

    // Ausrichtung an die Gelände-Normale anpassen
    // Wir behalten die aktuelle Blickrichtung bei, richten aber die Up-Achse neu aus
    const currentForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);

    // Orthogonale Basis berechnen:
    // 1. Right ist Kreuzprodukt aus Normal und Forward
    const right = new THREE.Vector3().crossVectors(terrainNormal, currentForward).normalize();

    // Falls Forward und Normal parallel sind (unwahrscheinlich), brauchen wir einen Fallback
    if (right.lengthSq() < 0.0001) {
        right.set(1, 0, 0).applyQuaternion(this.group.quaternion);
    }

    // 2. Echtes Forward ist Kreuzprodukt aus Right und Normal
    const forward = new THREE.Vector3().crossVectors(right, terrainNormal).normalize();

    // Matrix aus den drei Achsen bauen und als Rotation setzen
    const matrix = new THREE.Matrix4().makeBasis(right, terrainNormal, forward);
    this.group.quaternion.setFromRotationMatrix(matrix);
  }

  /** Berechnet die lokale Oberflächennormale des Terrains */
  private calculateTerrainNormal(pos: THREE.Vector3, sphereNormal: THREE.Vector3, radius: number): THREE.Vector3 {
    const epsilon = 0.2; // Messabstand für Steigungsberechnung

    // Hilfsvektoren für Tangenten
    const tangent1 = new THREE.Vector3();
    const tangent2 = new THREE.Vector3();

    if (Math.abs(sphereNormal.y) < 0.9) {
      tangent1.set(0, 1, 0).cross(sphereNormal).normalize();
    } else {
      tangent1.set(1, 0, 0).cross(sphereNormal).normalize();
    }
    tangent2.copy(sphereNormal).cross(tangent1).normalize();

    // Drei Punkte auf dem Gelände samplen
    const getPoint = (dir: THREE.Vector3) => {
      const h = this.terrainService.getHeightAt(dir.x, dir.y, dir.z);
      return dir.clone().multiplyScalar(radius + h);
    };

    const p0 = getPoint(sphereNormal);
    const p1 = getPoint(sphereNormal.clone().add(tangent1.multiplyScalar(epsilon)).normalize());
    const p2 = getPoint(sphereNormal.clone().add(tangent2.multiplyScalar(epsilon)).normalize());

    const v1 = p1.sub(p0);
    const v2 = p2.sub(p0);

    return v1.cross(v2).normalize();
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

  /** Aufräumen */
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
