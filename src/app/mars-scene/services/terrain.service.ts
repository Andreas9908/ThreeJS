import { Injectable } from '@angular/core';
import * as THREE from 'three';


@Injectable({ providedIn: 'root' })
export class TerrainService {

  private mesh!: THREE.Mesh;
  private material!: THREE.ShaderMaterial;
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

    const detailColorMap = this.generateDetailColorTexture(2048);
    const detailNormalMap = this.generateDetailNormalTexture(2048);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColorMap: { value: colorMap },
        uHeightMap: { value: heightMap },
        uDetailColor: { value: detailColorMap },
        uDetailNormal: { value: detailNormalMap },
        uDisplacementScale: { value: this.displacementScale },
        uDetailTiling: { value: 45.0 },
        uDetailStrength: { value: 0.8 },
        uNormalStrength: { value: 5.0 },
        uRoughness: { value: 0.92 },
        uMetalness: { value: 0.05 },

        uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        uSunColor: { value: new THREE.Color(1.0, 0.95, 0.85) },
        uSunIntensity: { value: 2.0 },
        uAmbientColor: { value: new THREE.Color(0.25, 0.12, 0.08) },

        uFogColor: { value: new THREE.Color(0x331a0d) },
        uFogDensity: { value: 0.008 },
      },
      vertexShader: this.getVertexShader(),
      fragmentShader: this.getFragmentShader(),
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    return this.mesh;
  }

  getMaterial(): THREE.ShaderMaterial {
    return this.material;
  }

  setDisplacementScale(val: number): void {
    this.displacementScale = val;
    if (this.material) {
      this.material.uniforms['uDisplacementScale'].value = val;
    }
  }

  getHeightAt(x: number, y: number, z: number): number {
    if (!this.heightData || this.heightMapWidth === 0) return 0;

    const length = Math.sqrt(x * x + y * y + z * z);
    if (length < 0.001) return 0;

    const nx = x / length;
    const ny = y / length;
    const nz = z / length;

    const u = 0.5 + Math.atan2(nx, nz) / (2 * Math.PI);
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

  // ====================================================================
  // Vertex Shader
  // ====================================================================

  private getVertexShader(): string {
    return /* glsl */ `
      uniform sampler2D uHeightMap;
      uniform float uDisplacementScale;

      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vObjectPosition;

      void main() {
        vUv = uv;
        vObjectPosition = position;

        float height = texture2D(uHeightMap, uv).r;
        vec3 displaced = position + normalize(position) * height * uDisplacementScale;

        vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
        vWorldPosition = worldPos.xyz;

        vNormal = normalize(normalMatrix * normalize(position));
        vViewDir = normalize(cameraPosition - worldPos.xyz);

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;
  }

  // ====================================================================
  // Fragment Shader
  // ====================================================================

  private getFragmentShader(): string {
    return /* glsl */ `
      uniform sampler2D uColorMap;
      uniform sampler2D uHeightMap;
      uniform sampler2D uDetailColor;
      uniform sampler2D uDetailNormal;

      uniform float uDetailTiling;
      uniform float uDetailStrength;
      uniform float uNormalStrength;
      uniform float uRoughness;
      uniform float uMetalness;

      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform float uSunIntensity;
      uniform vec3 uAmbientColor;

      uniform vec3 uFogColor;
      uniform float uFogDensity;

      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vObjectPosition;

      vec3 perturbNormal(vec3 baseNormal, vec3 detailNormal, float strength, vec3 objPos) {
        vec3 dn = detailNormal * 2.0 - 1.0;
        dn.xy *= strength;

        vec3 t = normalize(cross(vec3(0.0, 1.0, 0.0), baseNormal));
        if (length(t) < 0.001) {
            t = vec3(1.0, 0.0, 0.0);
        }
        vec3 b = cross(baseNormal, t);

        return normalize(t * dn.x + b * dn.y + baseNormal * dn.z);
      }

      void main() {
        vec3 baseColor = texture2D(uColorMap, vUv).rgb;

        vec2 detailUV = vUv * uDetailTiling;

        vec3 detailColor = texture2D(uDetailColor, detailUV).rgb;

        vec3 mixedColor = baseColor * (1.0 + (detailColor - 0.5) * uDetailStrength * 2.0);
        mixedColor = clamp(mixedColor, 0.0, 1.0);

        vec3 detailNorm = texture2D(uDetailNormal, detailUV).rgb;
        vec3 normal = perturbNormal(vNormal, detailNorm, uNormalStrength, vObjectPosition);

        float NdotL = max(dot(normal, uSunDirection), 0.0);
        vec3 diffuse = mixedColor * uSunColor * NdotL * uSunIntensity;

        vec3 ambient = mixedColor * uAmbientColor;

        vec3 halfDir = normalize(uSunDirection + vViewDir);
        float NdotH = max(dot(normal, halfDir), 0.0);
        float specPower = mix(8.0, 64.0, 1.0 - uRoughness);
        float spec = pow(NdotH, specPower) * (1.0 - uRoughness) * 0.3;
        vec3 specColor = uSunColor * spec * uSunIntensity;

        float h = texture2D(uHeightMap, vUv).r;
        float heightTint = mix(0.75, 1.15, h);

        vec3 finalColor = (diffuse + ambient + specColor) * heightTint;

        float dist = length(vWorldPosition - cameraPosition);
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        fogFactor = clamp(fogFactor, 0.0, 1.0);
        finalColor = mix(finalColor, uFogColor, fogFactor);

        finalColor = finalColor / (finalColor + vec3(1.0));

        finalColor = pow(finalColor, vec3(1.0 / 2.2));

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;
  }

  private generateDetailColorTexture(size: number): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#8B5E3C';
    ctx.fillRect(0, 0, size, size);

    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % size;
      const y = Math.floor((i / 4) / size);

      let noise = 0;
      noise += this.fbmNoise(x, y, size, 4, 0.5);

      const r = 140 + noise * 60 + (Math.random() - 0.5) * 20;
      const g = 85 + noise * 35 + (Math.random() - 0.5) * 12;
      const b = 50 + noise * 20 + (Math.random() - 0.5) * 8;

      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
      data[i + 3] = 255;
    }

    for (let i = 0; i < size * size * 0.002; i++) {
      const px = Math.floor(Math.random() * size);
      const py = Math.floor(Math.random() * size);
      const radius = 1 + Math.random() * 3;
      const brightness = 0.6 + Math.random() * 0.4;

      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (dx * dx + dy * dy <= radius * radius) {
            const sx = ((px + dx) % size + size) % size;
            const sy = ((py + dy) % size + size) % size;
            const idx = (sy * size + sx) * 4;
            const dist = Math.sqrt(dx * dx + dy * dy) / radius;
            const falloff = 1.0 - dist * dist;

            data[idx] = Math.min(255, data[idx] * brightness * (1 + falloff * 0.3));
            data[idx + 1] = Math.min(255, data[idx + 1] * brightness * (1 + falloff * 0.2));
            data[idx + 2] = Math.min(255, data[idx + 2] * brightness * (1 + falloff * 0.15));
          }
        }
      }
    }

    for (let i = 0; i < 80; i++) {
      let cx = Math.random() * size;
      let cy = Math.random() * size;
      let angle = Math.random() * Math.PI * 2;
      const len = 20 + Math.random() * 100;
      const steps = Math.floor(len);

      for (let s = 0; s < steps; s++) {
        const sx = ((Math.floor(cx)) % size + size) % size;
        const sy = ((Math.floor(cy)) % size + size) % size;
        const idx = (sy * size + sx) * 4;
        data[idx] = Math.max(0, data[idx] * 0.7);
        data[idx + 1] = Math.max(0, data[idx + 1] * 0.7);
        data[idx + 2] = Math.max(0, data[idx + 2] * 0.7);

        angle += (Math.random() - 0.5) * 0.5;
        cx += Math.cos(angle);
        cy += Math.sin(angle);
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 16;
    this.textures.push(texture);
    return texture;
  }

  private generateDetailNormalTexture(size: number): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const heightData = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let h = 0;
        h += this.fbmNoise(x, y, size, 6, 0.55) * 0.5;

        const stoneNoise = this.fbmNoise(x * 3.7, y * 3.7, size, 3, 0.6);
        h += stoneNoise * 0.3;

        h += (Math.random() - 0.5) * 0.05;

        heightData[y * size + x] = h;
      }
    }

    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    const strength = 2.0;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;

        const xp = ((x + 1) % size);
        const xm = ((x - 1 + size) % size);
        const yp = ((y + 1) % size);
        const ym = ((y - 1 + size) % size);

        const left = heightData[y * size + xm];
        const right = heightData[y * size + xp];
        const up = heightData[ym * size + x];
        const down = heightData[yp * size + x];

        const dx = (left - right) * strength;
        const dy = (up - down) * strength;
        const dz = 1.0;

        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const nx = dx / len;
        const ny = dy / len;
        const nz = dz / len;

        const pixIdx = idx * 4;
        data[pixIdx] = Math.floor((nx * 0.5 + 0.5) * 255);
        data[pixIdx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        data[pixIdx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
        data[pixIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 16;
    this.textures.push(texture);
    return texture;
  }

  private fbmNoise(x: number, y: number, size: number, octaves: number, persistence: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1 / 64;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.valueNoise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return value / maxValue;
  }

  private valueNoise(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const n00 = this.hash2d(ix, iy);
    const n10 = this.hash2d(ix + 1, iy);
    const n01 = this.hash2d(ix, iy + 1);
    const n11 = this.hash2d(ix + 1, iy + 1);

    const nx0 = n00 * (1 - sx) + n10 * sx;
    const nx1 = n01 * (1 - sx) + n11 * sx;
    return nx0 * (1 - sy) + nx1 * sy;
  }

  private hash2d(x: number, y: number): number {
    let h = x * 374761393 + y * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return (h & 0x7fffffff) / 0x7fffffff;
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
