import { Component } from '@angular/core';
import { PeriodSelector } from '../period-selector/period-selector';

@Component({
  selector: 'app-dashboard',
  imports: [PeriodSelector],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {}
