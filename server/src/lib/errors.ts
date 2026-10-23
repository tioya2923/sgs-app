export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = "erro",
  ) {
    super(message);
  }
}

export const naoEncontrado = (o = "Registo não encontrado") => new AppError(404, o, "nao_encontrado");
export const proibido = (o = "Sem permissão para esta operação") => new AppError(403, o, "proibido");
export const conflito = (o: string) => new AppError(409, o, "conflito");
export const invalido = (o: string) => new AppError(400, o, "invalido");
