import { Signal } from '@angular/core';
import { IconName } from '@shared/icons/icons';

type BaseNavLink = {
  label: string;
  path: string;
  exact?: boolean;
  id: string;
  icon: IconName;
  showAnalysisFilters?: boolean;
};

type NavLink = BaseNavLink & {
  isActive: Signal<boolean>;
};

export type { BaseNavLink, NavLink };
