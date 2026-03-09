import { TestBed } from '@angular/core/testing';
import { MarsSceneComponent } from './mars-scene.component';
import { NgZone } from '@angular/core';
import { TerrainService } from './services/terrain.service';
import { StructuresService } from './services/structures.service';
import { LightingService } from './services/lighting.service';
import { GuiService } from './services/gui.service';
import { RoverService } from './services/rover.service';

describe('MarsSceneComponent', () => {
  let component: MarsSceneComponent;
  let fixture: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ MarsSceneComponent ],
      providers: [
        TerrainService,
        StructuresService,
        LightingService,
        GuiService,
        RoverService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MarsSceneComponent);
    component = fixture.componentInstance;

    // Mock canvas element
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: 800 });
    Object.defineProperty(canvas, 'clientHeight', { value: 600 });
    component.canvasRef = { nativeElement: canvas } as any;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
