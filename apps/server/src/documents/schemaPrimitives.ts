import { z } from "zod";

export const documentIdSchema = z.string().regex(/^[A-Za-z0-9]{16}$/);

const unsafeUrlPattern = /^\s*(javascript|vbscript|data|file):/i;

export const filePathSchema = z
  .string()
  .max(2048)
  .refine((value) => !unsafeUrlPattern.test(value), "Caminho de arquivo não permitido");

export const nameSchema = z.string().trim().min(1).max(256);

export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const objectRecordSchema = z.record(z.string().max(256), z.unknown());

export const ownershipSchema = z.record(z.string().regex(/^(default|[A-Za-z0-9]{16})$/), z.number().int().min(-1).max(3));
