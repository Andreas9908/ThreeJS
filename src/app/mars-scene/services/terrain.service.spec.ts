import { TestBed } from '@angular/core/testing';
import { TerrainService } from './terrain.service';
import * as THREE from 'three';

describe('TerrainService', () => {
  let service: TerrainService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TerrainService]
    });
    service = TestBed.inject(TerrainService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should create a mesh and add it to the scene', () => {
    const scene = new THREE.Scene();
    const mesh = service.create(scene);
    expect(mesh).toBeDefined();
    expect(mesh instanceof THREE.Mesh).toBeTrue();
    expect(scene.children).toContain(mesh);
  });

  it('should return material via getMaterial', () => {
    const scene = new THREE.Scene();
    service.create(scene);
    const material = service.getMaterial();
    expect(material).toBeDefined();
    expect(material instanceof THREE.ShaderMaterial).toBeTrue();
  });
});
