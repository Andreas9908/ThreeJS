import { Component } from '@angular/core';
import { MarsSceneComponent } from '../mars-scene/mars-scene.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [MarsSceneComponent],
})
export class HomePage {
  constructor() { }
}
