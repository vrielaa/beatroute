import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClusterControl } from './cluster-control';

describe('ClusterControl', () => {
  let fixture: ComponentFixture<ClusterControl>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClusterControl],
    }).compileComponents();

    fixture = TestBed.createComponent(ClusterControl);
    fixture.componentRef.setInput('minClusterCount', 2);
    fixture.componentRef.setInput('maxClusterCount', 8);
    fixture.componentRef.setInput('selectedClusterCount', 2);
    fixture.detectChanges();
  });

  it('previews the selected value while the slider is moving', () => {
    const clusterCountChange = vi.fn();
    const slider = getSlider();
    fixture.componentInstance.clusterCountChange.subscribe(clusterCountChange);

    slider.value = '5';
    slider.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(getDisplayedValue()).toBe('5');
    expect(clusterCountChange).not.toHaveBeenCalled();
  });

  it('emits the selected value after the slider is released', () => {
    const clusterCountChange = vi.fn();
    const slider = getSlider();
    fixture.componentInstance.clusterCountChange.subscribe(clusterCountChange);

    slider.value = '5';
    slider.dispatchEvent(new Event('change'));

    expect(clusterCountChange).toHaveBeenCalledOnce();
    expect(clusterCountChange).toHaveBeenCalledWith(5);
  });

  it('disables the slider when the data allows only one value', () => {
    fixture.componentRef.setInput('maxClusterCount', 2);
    fixture.detectChanges();

    expect(getSlider().disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'Obecne dane pozwalają utworzyć maksymalnie 2 klastry.'
    );
  });

  function getSlider(): HTMLInputElement {
    return fixture.nativeElement.querySelector('#music-map-cluster-count');
  }

  function getDisplayedValue(): string {
    return fixture.nativeElement.querySelector('.cluster-control-slider strong').textContent.trim();
  }
});
