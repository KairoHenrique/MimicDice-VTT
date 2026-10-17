import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { isHostMachineRequest } from "../security/clientAddress";
import { createRateLimiter } from "../security/rateLimiter";
import type { ApiErrorResponse } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import type { ServerContext } from "../ServerContext";
import { FileStorage, UPLOADS_ROOT } from "../files/FileStorage";
import { createPackageAssetHandler } from "./packageAssetHandler";
import { readSessionToken } from "../security/cookies";
import { requireSession } from "./requestGuards";
import { createAuthRoutes } from "./routes/authRoutes";
import { createFileRoutes } from "./routes/fileRoutes";
import { createPackageRoutes } from "./routes/packageRoutes";
import { createRpgRoutes } from "./routes/rpgRoutes";
import { createUserRoutes } from "./routes/userRoutes";
import { createLauncherRoutes } from "./routes/launcherRoutes";
import { createWorldRoutes } from "./routes/worldRoutes";

function createSecurityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        mediaSrc: ["'self'", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        workerSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
      },
    },
    strictTransportSecurity: false,
    crossOriginEmbedderPolicy: false,
  });
}

function handleErrors(error: unknown, _request: Request, response: Response, next: NextFunction, context: ServerContext): void {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.statusCode).json({ error: error.publicMessage } satisfies ApiErrorResponse);
    return;
  }
  const clientErrorStatus = Number((error as { status?: unknown })?.status);
  if (clientErrorStatus >= 400 && clientErrorStatus < 500) {
    const publicMessage = clientErrorStatus === 413 ? "Arquivo grande demais" : clientErrorStatus === 404 ? "Não encontrado" : "Requisição inválida";
    response.status(clientErrorStatus).json({ error: publicMessage } satisfies ApiErrorResponse);
    return;
  }
  const isMalformedJson = error instanceof SyntaxError && "body" in error;
  if (isMalformedJson) {
    response.status(400).json({ error: "JSON malformado" } satisfies ApiErrorResponse);
    return;
  }
  context.logger.error("Erro não tratado na requisição", error);
  response.status(500).json({ error: "Erro interno do servidor" } satisfies ApiErrorResponse);
}

const UPLOAD_CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";
/** Browsers refuse to render a PDF inside a sandboxed document, so PDFs get the same lockdown minus `sandbox`. */
const PDF_UPLOAD_CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'self'";

function createUploadsHandler(context: ServerContext, storage: FileStorage) {
  const sessionGuard = requireSession(context);
  const serveUploads = express.static(storage.uploadsDirectory, {
    dotfiles: "deny",
    fallthrough: false,
    index: false,
    setHeaders: (response, filePath) => {
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Content-Security-Policy", filePath.toLowerCase().endsWith(".pdf") ? PDF_UPLOAD_CSP : UPLOAD_CSP);
    },
  });
  return (request: Request, response: Response, next: NextFunction): void => sessionGuard(request, response, () => serveUploads(request, response, next));
}

/** Serves the GM-only file manager page; anyone else is sent back to the table. */
function createGameMasterPageHandler(context: ServerContext, htmlFileName: string) {
  return (request: Request, response: Response): void => {
    const world = context.activeWorld.current;
    const session = world ? context.sessions.resolve(readSessionToken(request.headers.cookie)) : undefined;
    if (!world || !session || !world.users.isGameMaster(session.userId)) {
      response.redirect(303, "/");
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    response.sendFile(path.join(context.config.clientDistPath, htmlFileName));
  };
}

export function createHttpApp(context: ServerContext): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(createSecurityHeaders());
  const fileStorage = new FileStorage(context.config.dataPath);

  const apiRouter = express.Router();
  apiRouter.use(createRateLimiter({ windowMs: 60_000, limit: 600, standardHeaders: "draft-7", legacyHeaders: false, skip: (request) => isHostMachineRequest(request) }));
  apiRouter.use("/rpgs", createRpgRoutes(context));
  apiRouter.use(express.json({ limit: "1mb" }));
  apiRouter.use(createAuthRoutes(context));
  apiRouter.use("/users", createUserRoutes(context));
  apiRouter.use("/worlds", createWorldRoutes(context));
  apiRouter.use("/launcher", createLauncherRoutes(context));
  apiRouter.use("/packages", createPackageRoutes(context));
  apiRouter.use("/files", createFileRoutes(context, fileStorage));
  apiRouter.use(() => {
    throw HttpError.notFound();
  });
  app.use("/api", apiRouter);

  app.use("/modules", createPackageAssetHandler(context, "module"));
  app.use("/systems", createPackageAssetHandler(context, "system"));
  app.use(`/${UPLOADS_ROOT}`, createUploadsHandler(context, fileStorage));

  app.get(["/rpgs", "/rpgs.html"], createGameMasterPageHandler(context, "rpgs.html"));
  app.use(express.static(context.config.clientDistPath, { index: "index.html", dotfiles: "deny" }));
  app.get(/^\/(?!api|modules|systems|uploads|socket\.io)(?!.*\.[A-Za-z0-9]+$).*/, (_request, response) => {
    response.sendFile(path.join(context.config.clientDistPath, "index.html"));
  });

  app.use((error: unknown, request: Request, response: Response, next: NextFunction) => handleErrors(error, request, response, next, context));
  return app;
}
