import http, { type Server } from 'node:http';

const editorPage = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Extension E2E Editor</title></head>
<body><label for="editor">Editor</label><textarea id="editor">hello world</textarea>
<script>const editor=document.getElementById('editor');let inputEvents=0;editor.addEventListener('input',()=>{inputEvents+=1;editor.dataset.inputEvents=String(inputEvents);});</script>
</body></html>`;

export const startTestServer = async (): Promise<Server> => {
  const server = http.createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('ok');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(editorPage);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(4173, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
};

export const stopTestServer = async (server: Server): Promise<void> => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
};
