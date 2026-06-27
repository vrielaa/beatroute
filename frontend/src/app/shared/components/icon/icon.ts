import { Component, computed, input } from '@angular/core';
import { ICONS, IconName } from '@shared/icons/icons';

@Component({
  selector: 'app-icon',
  imports: [],
  templateUrl: './icon.html',
  host: {
    class: 'inline-flex flex-none text-inherit',
  },
})
export class Icon {
  public readonly name = input.required<IconName>();
  public readonly size = input(20);
  public readonly viewBox = input('0 0 20 20');
  public readonly strokeWidth = input(1.333);

  public readonly paths = computed(() => ICONS[this.name()]);
}
