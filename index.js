const createApp = require("./src/app");
const config = require("./src/shared/config/config");

const app = createApp();

app.listen(config.port, () => {
  console.log(`Servidor corriendo en http://localhost:${config.port}`);
});
