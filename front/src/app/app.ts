// import { Component, inject } from '@angular/core';
// import { SpotifyService } from './spotify.service';

// @Component({
//   selector: 'app-root',
//   templateUrl: './app.html',
//   styleUrl: './app.scss',
// })
// export class App {
//   private readonly spotifyService = inject(SpotifyService);

//   public isLoggedIn = false;
//   public topTracks: any[] = [];

//   public login(): void {
//     this.spotifyService.loginWithSpotify();
//   }

//   public checkLogin(): void {
//     this.spotifyService.checkAuth().subscribe((response) => {
//       this.isLoggedIn = response.isLoggedIn;
//       console.log('isLoggedIn:', response.isLoggedIn);
//     });
//   }

//   public getUserProfile(): void {
//     this.spotifyService.getUserProfile().subscribe((response) => {
//       console.log('User Profile:', response);
//     });
//   }

//   public loadTopTracks(): void {
//     this.spotifyService.getTopTracks().subscribe((response: any) => {
//       this.topTracks = response.items ?? [];
//       console.log(response);
//     });
//   }
// }
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
