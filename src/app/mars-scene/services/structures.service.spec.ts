import { TestBed } from '@angular/core/testing';
import { StructuresService } from './structures.service';
import { TerrainService } from './terrain.service';
import * as THREE from 'three';

describe('StructuresService', () => {
  let service: StructuresService;
  let terrainService: TerrainService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StructuresService, TerrainService]
    });
    service = TestBed.inject(StructuresService);
    terrainService = TestBed.inject(TerrainService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should create structures and add them to the scene', () => {
    const scene = new THREE.Scene();
    service.create(scene, terrainService);
    expect(scene.children.length).toBeGreaterThan(0);
  });
});
