import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 43123);
const host = process.env.HOST ?? "127.0.0.1";

createApp().listen(port, host, () => {
  console.log(`COMMENT VIDEO STUDIO đang chạy tại http://${host}:${port}`);
});

