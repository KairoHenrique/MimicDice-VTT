export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "HttpError";
  }

  static badRequest(publicMessage = "Dados inválidos"): HttpError {
    return new HttpError(400, publicMessage);
  }

  static unauthorized(publicMessage = "Sessão inválida"): HttpError {
    return new HttpError(401, publicMessage);
  }

  static forbidden(publicMessage = "Permissão negada"): HttpError {
    return new HttpError(403, publicMessage);
  }

  static notFound(publicMessage = "Não encontrado"): HttpError {
    return new HttpError(404, publicMessage);
  }

  static conflict(publicMessage: string): HttpError {
    return new HttpError(409, publicMessage);
  }
}
