import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { Component, ViewEncapsulation, computed, input, signal } from '@angular/core';
import {
  TooltipContent,
  isStructuredTooltipContent,
  tooltipContentToText,
} from '@shared/tooltip/tooltip-content';

let tooltipId = 0;

@Component({
  selector: 'app-tooltip',
  imports: [OverlayModule],
  templateUrl: './tooltip.html',
  styleUrl: './tooltip.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'app-tooltip-host',
  },
})
export class Tooltip {
  public readonly content = input<TooltipContent | null | undefined>(null);
  public readonly isOpen = signal(false);
  public readonly tooltipId = `app-tooltip-${tooltipId++}`;
  public readonly tooltipText = computed(() => tooltipContentToText(this.content()));
  public readonly structuredContent = computed(() => {
    const content = this.content();

    return isStructuredTooltipContent(content) ? content : null;
  });
  public readonly plainContent = computed(() =>
    this.structuredContent() ? null : this.tooltipText()
  );
  public readonly positions: ConnectedPosition[] = [
    {
      originX: 'center',
      originY: 'top',
      overlayX: 'center',
      overlayY: 'bottom',
      offsetY: -8,
    },
    {
      originX: 'center',
      originY: 'bottom',
      overlayX: 'center',
      overlayY: 'top',
      offsetY: 8,
    },
  ];

  public show(): void {
    if (this.tooltipText()) {
      this.isOpen.set(true);
    }
  }

  public hide(): void {
    this.isOpen.set(false);
  }
}
