import { TestBed } from '@angular/core/testing';
import { RoverService } from './rover.service';
import { TerrainService } from './terrain.service';
import * as THREE from 'three';

describe('RoverService', () => {
  let service: RoverService;
  let terrainService: TerrainService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RoverService, TerrainService]
    });
    service = TestBed.inject(RoverService);
    terrainService = TestBed.inject(TerrainService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should create rover group and add it to the scene', () => {
    const scene = new THREE.Scene();
    const group = service.create(scene);
    expect(group).toBeDefined();
    expect(group instanceof THREE.Group).toBeTrue();
    expect(scene.children).toContain(group);
  });

  it('should return position via getPosition', () => {
    const scene = new THREE.Scene();
    service.create(scene);
    const pos = service.getPosition();
    expect(pos).toBeDefined();
    expect(pos instanceof THREE.Vector3).toBeTrue();
  });
});
