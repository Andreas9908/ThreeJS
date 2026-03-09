import { TestBed } from '@angular/core/testing';
import { GuiService } from './gui.service';
import { LightingService } from './lighting.service';
import { TerrainService } from './terrain.service';
import * as THREE from 'three';

describe('GuiService', () => {
  let service: GuiService;
  let lightingService: LightingService;
  let terrainService: TerrainService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GuiService, LightingService, TerrainService]
    });
    service = TestBed.inject(GuiService);
    lightingService = TestBed.inject(LightingService);
    terrainService = TestBed.inject(TerrainService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should create GUI', () => {
    const scene = new THREE.Scene();
    lightingService.create(scene);

    // Test that create doesn't throw
    expect(() => service.create(scene, lightingService, terrainService)).not.toThrow();
  });
});
