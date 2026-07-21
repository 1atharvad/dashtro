# @dashtro/client

JS/TS client SDK for the [Dashtro](https://github.com/1atharvad/dashtro) CMS
API — scoped, API-key-authenticated access to a project's documents and
realtime database from external apps (`/api/sdk/*` on your Dashtro instance).

## Install

```bash
npm install @dashtro/client
```

## Usage

```ts
import { createClient } from '@dashtro/client';

const dashtro = createClient({
  baseUrl: 'https://admin.example.com',
  projectId: '<project-id>',
  apiKey: '<api-key>',
  workspace: 'production', // optional, defaults to "production"
  cacheTtl: 60,            // optional, seconds, defaults to 60
});

const post = await dashtro.getDocument('blog-posts', '<document-id>');
const allPosts = await dashtro.getAllDocuments('blog-posts');

// Realtime database
await dashtro.rtdb.set('/counters/views', 1);
```

API keys are issued and scoped (per collection, read/write) from your
Dashtro instance's settings page.

## License

ISC
