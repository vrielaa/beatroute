import "dotenv/config";
import { createApp } from "./app.js";
import { PORT } from "./config/spotify.config.js";

const app = createApp();

app.listen(PORT, () => {
  console.log(`Backend działa na porcie ${PORT}`);
});
