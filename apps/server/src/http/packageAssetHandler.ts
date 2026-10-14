import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { PACKAGE_ID_PATTERN, type PackageType } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import type { ServerContext } from "../ServerContext";
import { requireSession } from "./requestGuards";

export function createPackageAssetHandler(context: ServerContext, packageType: PackageType) {
  const sessionGuard = requireSession(context);

  return (request: Request, response: Response, next: NextFunction): void => {
    sessionGuard(request, response, () => {
      const [, packageId, ...assetSegments] = request.path.split("/");
      if (!packageId || !PACKAGE_ID_PATTERN.test(packageId) || assetSegments.length === 0) throw HttpError.notFound();

      const installedPackage = context.packageRegistry.find(packageType, packageId);
      if (!installedPackage) throw HttpError.notFound();

      let relativeAssetPath: string;
      try {
        relativeAssetPath = decodeURIComponent(assetSegments.join("/"));
      } catch {
        throw HttpError.badRequest();
      }
      const packageRoot = path.resolve(installedPackage.directory);
      const assetPath = path.resolve(packageRoot, relativeAssetPath);
      if (!assetPath.startsWith(packageRoot + path.sep)) throw HttpError.notFound();

      response.sendFile(assetPath, { dotfiles: "deny", maxAge: 0 }, (error) => {
        if (error && !response.headersSent) next(HttpError.notFound());
      });
    });
  };
}
