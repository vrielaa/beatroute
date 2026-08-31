import "dotenv/config";
import { createApp } from "./app.js";
import { appConfig } from "./config/app.config.js";

const app = createApp(appConfig);

app.listen(appConfig.server.port, () => {
  console.log(`Backend działa na porcie ${appConfig.server.port}`);
});
