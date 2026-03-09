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
    const normalMap = this.loadTexture(loader, 'assets/textures/mars-normalmap.png', false);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColorMap: { value: colorMap },
        uHeightMap: { value: heightMap },
        uNormalMap: { value: normalMap },
        uDisplacementScale: { value: this.displacementScale },
        uNormalStrength: { value: 1.5 },
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

    // Match THREE.SphereGeometry UV mapping:
    // x = -cos(phi) * sin(theta), z = sin(phi) * sin(theta), u = phi / (2*pi)
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
      uniform sampler2D uNormalMap;

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

        vec3 normalFromMap = texture2D(uNormalMap, vUv).rgb;
        vec3 normal = perturbNormal(vNormal, normalFromMap, uNormalStrength, vObjectPosition);

        float NdotL = max(dot(normal, uSunDirection), 0.0);
        vec3 diffuse = baseColor * uSunColor * NdotL * uSunIntensity;

        vec3 ambient = baseColor * uAmbientColor;

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
