import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Wspólny komunikat dashboardu i profilu; ponowienie jest dostępne tylko przy awarii. */
@Component({
  selector: 'app-listening-tracks-feedback',
  templateUrl: './listening-tracks-feedback.html',
  styleUrl: './listening-tracks-feedback.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ListeningTracksFeedback {
  public readonly message = input.required<string>();
  public readonly hasError = input(false);
  public readonly retryRequested = output<void>();
}

export { ListeningTracksFeedback };
