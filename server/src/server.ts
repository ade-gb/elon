import app from './app';
import { checkDatabaseConnection } from './config/database';
import { env } from './config/env';

async function bootstrap() {
  await checkDatabaseConnection();

  app.listen(env.PORT, () => {
    console.log(`API server listening on http://localhost:${env.PORT}`);
  });
}

void bootstrap().catch((error) => {
  console.error('Failed to start API server', error);
  process.exit(1);
});
