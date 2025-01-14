import express, { Application } from 'express';
import router from './routes.js';
import swaggerUi from 'swagger-ui-express';

const PORT = 3000;
const app: Application = express();

app.use(express.json());
app.use(express.static('public'));

app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      swaggerOptions: {
        url: "/swagger.json",
      },
    })
  );


// Routen einbinden
app.use(router);


// Server starten
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT} and API documentation: http://localhost:${PORT}/docs`);
});