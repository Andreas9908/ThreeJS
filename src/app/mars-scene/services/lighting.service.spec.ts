import { TestBed } from '@angular/core/testing';
import { LightingService } from './lighting.service';
import * as THREE from 'three';

describe('LightingService', () => {
  let service: LightingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LightingService]
    });
    service = TestBed.inject(LightingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should create lights and add them to the scene', () => {
    const scene = new THREE.Scene();
    service.create(scene);
    expect(service.sunLight).toBeDefined();
    expect(service.ambientLight).toBeDefined();
    expect(service.spotLight).toBeDefined();
    expect(service.baseLights.length).toBeGreaterThan(0);
    expect(scene.children.length).toBeGreaterThan(0);
  });

  it('should set sun intensity', () => {
    const scene = new THREE.Scene();
    service.create(scene);
    service.setSunIntensity(3.0);
    expect(service.getSunIntensity()).toBe(3.0);
  });
});
