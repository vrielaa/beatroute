import { Signal } from '@angular/core';
import { IconName } from '@shared/icons/icons';

export type BaseNavLink = {
  label: string;
  path: string;
  exact?: boolean;
  id: string;
  icon: IconName;
  showAnalysisFilters?: boolean;
};

export type NavLink = BaseNavLink & {
  isActive: Signal<boolean>;
};
