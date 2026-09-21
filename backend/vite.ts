import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { getOgTagsForUrl, generateOgMetaTags, injectOgTags } from "./ogTags";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "frontend",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      
      // Inject dynamic Open Graph meta tags for session/event/profile pages
      // x-forwarded-proto can be a comma-separated list; take the first value
      const rawProto = req.headers['x-forwarded-proto'];
      const proto = (Array.isArray(rawProto) ? rawProto[0] : rawProto ?? req.protocol ?? 'https').split(',')[0].trim();
      const protocol = proto === 'http' ? 'http' : 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'riplect.com';
      const baseUrl = `${protocol}://${host}`;
      
      try {
        const ogTags = await getOgTagsForUrl(url, baseUrl);
        if (ogTags) {
          const ogMetaTags = generateOgMetaTags(ogTags);
          template = injectOgTags(template, ogMetaTags);
        }
      } catch (ogError) {
        console.error('Error injecting OG tags:', ogError);
      }
      
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the frontend first`,
    );
  }

  // Serve hashed assets with long-term caching; serve index.html with no-cache
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      } else if (/\/assets\//.test(filePath)) {
        // Vite hashes all asset filenames — safe to cache forever
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));

  // fall through to index.html if the file doesn't exist
  // with dynamic OG tag injection for session/event/profile pages
  app.use("*", async (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    const url = req.originalUrl;
    
    try {
      let html = await fs.promises.readFile(indexPath, "utf-8");
      
      // Inject dynamic Open Graph meta tags for session/event/profile pages
      // x-forwarded-proto can be a comma-separated list; take the first value
      const rawProtoStatic = req.headers['x-forwarded-proto'];
      const protoStatic = (Array.isArray(rawProtoStatic) ? rawProtoStatic[0] : rawProtoStatic ?? req.protocol ?? 'https').split(',')[0].trim();
      const protocol = protoStatic === 'http' ? 'http' : 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'riplect.com';
      const baseUrl = `${protocol}://${host}`;
      
      try {
        const ogTags = await getOgTagsForUrl(url, baseUrl);
        if (ogTags) {
          const ogMetaTags = generateOgMetaTags(ogTags);
          html = injectOgTags(html, ogMetaTags);
        }
      } catch (ogError) {
        console.error('Error injecting OG tags:', ogError);
      }
      
      res.status(200).set({
        "Content-Type": "text/html",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      }).end(html);
    } catch (error) {
      console.error('Error serving index.html:', error);
      res.sendFile(indexPath);
    }
  });
}
