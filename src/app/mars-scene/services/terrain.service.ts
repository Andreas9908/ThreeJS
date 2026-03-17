import { Injectable } from '@angular/core';
import * as THREE from 'three';


@Injectable({ providedIn: 'root' })
export class TerrainService {

  private mesh!: THREE.Mesh;
  private material!: THREE.MeshStandardMaterial;
  private geometry!: THREE.SphereGeometry;
  private textures: THREE.Texture[] = [];
  private heightData: Uint8ClampedArray | null = null;
  private heightMapWidth: number = 0;
  private heightMapHeight: number = 0;
  private displacementScale = 5.0;

  create(scene: THREE.Scene): THREE.Mesh {
    this.geometry = new THREE.SphereGeometry(100, 1024, 512);

    const loader = new THREE.TextureLoader();
    const colorMap = this.loadTexture(loader, 'assets/textures/mars-colormap.png', false);
    const heightMap = this.loadTexture(loader, 'assets/textures/mars-heightmap.png', false, (tex) => {
      if (tex.image) {
        this.extractHeightData(tex.image as HTMLImageElement);
      }
    });
    const normalMap = this.loadTexture(loader, 'assets/textures/mars-normalmap.png', false);

    this.material = new THREE.MeshStandardMaterial({
      map: colorMap,
      displacementMap: heightMap,
      displacementScale: this.displacementScale,
      normalMap: normalMap,
      normalScale: new THREE.Vector2(1.5, 1.5),
      roughness: 0.92,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    return this.mesh;
  }

  getMaterial(): THREE.MeshStandardMaterial {
    return this.material;
  }

  setDisplacementScale(val: number): void {
    this.displacementScale = val;
    if (this.material) {
      this.material.displacementScale = val;
    }
  }

  getHeightAt(x: number, y: number, z: number): number {
    if (!this.heightData || this.heightMapWidth === 0) return 0;

    const length = Math.sqrt(x * x + y * y + z * z);
    if (length < 0.001) return 0;

    const nx = x / length;
    const ny = y / length;
    const nz = z / length;

    let phi = Math.atan2(nz, -nx);
    if (phi < 0) {
      phi += Math.PI * 2;
    }
    const u = phi / (2 * Math.PI);
    const v = 0.5 - Math.asin(ny) / Math.PI;

    const cu = Math.max(0, Math.min(0.999, u));
    const cv = Math.max(0, Math.min(0.999, v));

    const px = Math.floor(cu * this.heightMapWidth);
    const py = Math.floor(cv * this.heightMapHeight);

    const idx = (py * this.heightMapWidth + px) * 4;
    const r = this.heightData[idx] / 255.0;

    return r * this.displacementScale;
  }

  private extractHeightData(image: HTMLImageElement | ImageBitmap): void {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);

    this.heightData = ctx.getImageData(0, 0, image.width, image.height).data;
    this.heightMapWidth = image.width;
    this.heightMapHeight = image.height;
  }

  dispose(): void {
    this.geometry?.dispose();
    this.material?.dispose();
    this.textures.forEach(t => t.dispose());
  }

  private loadTexture(loader: THREE.TextureLoader, url: string, repeat: boolean, onLoad?: (tex: THREE.Texture) => void): THREE.Texture {
    const texture = loader.load(
      url,
      (tex) => {
        tex.anisotropy = 16;
        if (onLoad) onLoad(tex);
        if (this.material) {
          this.material.needsUpdate = true;
        }
      },
      undefined,
      (err) => {
        console.error(`Fehler beim Laden der Textur "${url}":`, err);
      }
    );
    texture.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    this.textures.push(texture);
    return texture;
  }
}
