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

  private collisionObjects: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private roverRadius = 3.0;

  private pickableStones: THREE.Object3D[] = [];
  private heldStone: THREE.Object3D | null = null;
  private gripGroup: THREE.Group | null = null;
  private pickupRange = 0.3;
  private fingersWereClosed = false;

  constructor(private terrainService: TerrainService) {
    window.addEventListener('keydown', (e) => this.keys[e.code] = true);
    window.addEventListener('keyup', (e) => this.keys[e.code] = false);
  }

  public setMoveSpeed(moveSpeed: number) {
      this.moveSpeed = moveSpeed;
      this.wheelRotationSpeed = moveSpeed;
    }

  /** Setzt die Objekte, mit denen der Rover kollidieren kann */
  public setCollisionObjects(objects: THREE.Object3D[]) {
    this.collisionObjects = objects;
  }

  /** Setzt die aufnehmbaren Steine */
  public setPickableStones(stones: THREE.Object3D[]) {
    this.pickableStones = stones;
  }

  create(scene: THREE.Scene): THREE.Group {
    this.group = new THREE.Group();
    // Spawnposition geändert: 30 Einheiten südlich vom Nordpol (wo die Kuppel ist)
    this.group.position.set(0, 102, 30);

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

    // Matrizen aktualisieren, damit die Weltpositionen für das Aufnehmen von Steinen aktuell sind
    this.group.updateMatrixWorld(true);

    this.handleStonePickup();
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
      // Speichere alte Position für Kollisionsrückgängig
      const oldPosition = this.group.position.clone();
      const oldQuaternion = this.group.quaternion.clone();

      this.group.translateZ(moveDir * this.moveSpeed * delta);

      // Prüfe Kollision
      if (this.checkCollision()) {
        // Kollision erkannt - Position zurücksetzen
        this.group.position.copy(oldPosition);
        this.group.quaternion.copy(oldQuaternion);
      } else {
        // Keine Kollision - Räder drehen
        this.wheels.forEach(wheel => {
          wheel.rotation.x += moveDir * this.wheelRotationSpeed * delta;
        });
      }
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

  /**
   * Prüft ob der Rover mit einem der Kollisionsobjekte kollidiert.
   * Verwendet Raycasting in 8 Richtungen um den Rover herum.
   */
  private checkCollision(): boolean {
    if (this.collisionObjects.length === 0) return false;

    const roverPos = this.group.position.clone();

    // Prüfe in 8 Richtungen (Kreuz + Diagonalen) um den Rover
    const directions = [
      new THREE.Vector3(1, 0, 0),   // Rechts
      new THREE.Vector3(-1, 0, 0),  // Links
      new THREE.Vector3(0, 0, 1),   // Vorne
      new THREE.Vector3(0, 0, -1),  // Hinten
      new THREE.Vector3(1, 0, 1).normalize(),   // Vorne-Rechts
      new THREE.Vector3(-1, 0, 1).normalize(),  // Vorne-Links
      new THREE.Vector3(1, 0, -1).normalize(),  // Hinten-Rechts
      new THREE.Vector3(-1, 0, -1).normalize(), // Hinten-Links
    ];

    for (const direction of directions) {
      // Transformiere Richtung in Weltkoordinaten (relativ zur Rover-Rotation)
      const worldDir = direction.clone().applyQuaternion(this.group.quaternion);

      this.raycaster.set(roverPos, worldDir);
      this.raycaster.far = this.roverRadius;

      const intersects = this.raycaster.intersectObjects(this.collisionObjects, true);

      if (intersects.length > 0 && intersects[0].distance < this.roverRadius) {
        return true; // Kollision erkannt
      }
    }

    return false; // Keine Kollision
  }

  /**
   * Prüft ob die Finger geschlossen sind (Greif-Bewegung)
   */
  private areFingersClosing(): boolean {
    return this.keys['KeyI']; // Taste I schließt die Finger
  }

  /**
   * Überwacht kontinuierlich das Schließen der Finger für Aufnehmen/Ablegen
   */
  private handleStonePickup(): void {
    const isClosing = this.keys['KeyI'];
    const isOpening = this.keys['KeyK'];

    // Stein aufnehmen, wenn 'I' gedrückt wird (und wir noch keinen halten)
    if (isClosing && !this.heldStone) {
      this.pickupStone();
    }

    // Stein ablegen, wenn 'K' gedrückt wird (und wir einen halten)
    if (isOpening && this.heldStone) {
      this.dropStone();
    }

    // Wenn ein Stein gehalten wird, aktualisiere seine Position kontinuierlich
    if (this.heldStone && this.fingerL && this.fingerR) {
      this.updateHeldStonePosition();
    }
  }

  /**
   * Aktualisiert die Position des gehaltenen Steins zwischen den Fingern
   */
  private updateHeldStonePosition(): void {
    if (!this.heldStone || !this.fingerL || !this.fingerR || !this.armHandgelenk || !this.gripGroup) return;

    // Wir rufen updateMatrixWorld für das Modell auf, um sicherzustellen, dass die Bone-Hierarchie aktuell ist
    // Dies ist wichtig, wenn Animationen oder manuelle Gelenkbewegungen stattfinden.
    if (this.model) this.model.updateMatrixWorld(true);

    // Hole die Weltpositionen der Finger
    const fingerLWorldPos = new THREE.Vector3();
    const fingerRWorldPos = new THREE.Vector3();
    this.fingerL.getWorldPosition(fingerLWorldPos);
    this.fingerR.getWorldPosition(fingerRWorldPos);

    // Berechne Mittelpunkt in Weltkoordinaten
    const gripCenterWorld = new THREE.Vector3();
    gripCenterWorld.addVectors(fingerLWorldPos, fingerRWorldPos).multiplyScalar(0.5);

    // Konvertiere zu lokalen Koordinaten des Handgelenks
    const handgelenkWorldPos = new THREE.Vector3();
    this.armHandgelenk.getWorldPosition(handgelenkWorldPos);

    const handgelenkInverse = new THREE.Matrix4();
    handgelenkInverse.copy(this.armHandgelenk.matrixWorld).invert();

    const localGripPos = gripCenterWorld.clone().applyMatrix4(handgelenkInverse);

    // Setze Position der Grip-Gruppe
    this.gripGroup.position.copy(localGripPos);

    // Erzwinge Matrix-Update
    this.gripGroup.updateMatrixWorld(true);
  }

  private pickupStone(): void {
    if (!this.fingerL || !this.fingerR || !this.armHandgelenk) return;

    // Berechne die Mitte zwischen den beiden Fingern in Weltkoordinaten
    const gripCenter = new THREE.Vector3();
    const fingerLPos = new THREE.Vector3();
    const fingerRPos = new THREE.Vector3();

    this.fingerL.getWorldPosition(fingerLPos);
    this.fingerR.getWorldPosition(fingerRPos);
    gripCenter.addVectors(fingerLPos, fingerRPos).multiplyScalar(0.5);

    // Suche nach dem nächsten Stein in Reichweite
    let closestStone: THREE.Object3D | null = null;
    let closestDistance = this.pickupRange;

    for (const stone of this.pickableStones) {
      if (stone.userData['pickedUp']) continue;

      // Hole die Weltposition des Steins
      const stoneWorldPos = new THREE.Vector3();
      stone.getWorldPosition(stoneWorldPos);

      const distance = gripCenter.distanceTo(stoneWorldPos);
      if (distance < closestDistance) {
        closestStone = stone;
        closestDistance = distance;
      }
    }

    if (closestStone) {
      this.heldStone = closestStone;
      closestStone.userData['pickedUp'] = true;

      console.log('Stein gefunden und wird aufgenommen:', closestStone);

      // Speichere die ursprüngliche Skalierung des Steins
      const originalScale = closestStone.scale.clone();
      closestStone.userData['originalScale'] = originalScale;

      // Erstelle eine Gruppe zwischen den Fingern
      this.gripGroup = new THREE.Group();
      this.armHandgelenk.add(this.gripGroup);

      // Berechne die initiale Position zwischen den Fingern
      const fingerLWorldPos = new THREE.Vector3();
      const fingerRWorldPos = new THREE.Vector3();
      this.fingerL.getWorldPosition(fingerLWorldPos);
      this.fingerR.getWorldPosition(fingerRWorldPos);

      const gripCenterWorld = new THREE.Vector3();
      gripCenterWorld.addVectors(fingerLWorldPos, fingerRWorldPos).multiplyScalar(0.5);

      // Konvertiere zu lokalen Koordinaten des Handgelenks
      const handgelenkInverse = new THREE.Matrix4();
      handgelenkInverse.copy(this.armHandgelenk.matrixWorld).invert();
      const localGripPos = gripCenterWorld.clone().applyMatrix4(handgelenkInverse);

      this.gripGroup.position.copy(localGripPos);

    this.gripGroup.attach(closestStone);

    closestStone.position.set(0, 0.14, 0);
    closestStone.rotation.set(0, 0, 0);
    closestStone.scale.copy(originalScale);

      console.log('Stein aufgenommen!');
    }
  }

  private dropStone(): void {
    if (!this.heldStone || !this.gripGroup) return;

    const stone = this.heldStone;

    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    stone.getWorldPosition(worldPos);
    stone.getWorldQuaternion(worldQuat);

    // Hole die ursprüngliche Skalierung
    const originalScale = stone.userData['originalScale'] || new THREE.Vector3(2, 2, 2);

    // Stein zurück zur Szene
    if (this.group.parent) {
      this.group.parent.add(stone);
    }

    // Position, Rotation und Skalierung in Weltkoordinaten wiederherstellen
    stone.position.copy(worldPos);
    stone.quaternion.copy(worldQuat);
    stone.scale.copy(originalScale);

    // Entferne die Grip-Gruppe
    this.gripGroup.removeFromParent();
    this.gripGroup = null;

    stone.userData['pickedUp'] = false;
    this.heldStone = null;

    console.log('Stein abgelegt!');
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
