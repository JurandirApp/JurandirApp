import { createHash } from "crypto";

/**
 * Cloudinary — upload assinado direto do navegador. O API secret nunca sai do
 * servidor: o cliente pede a assinatura (server action), recebe só a assinatura
 * pronta + timestamp e faz o POST do arquivo direto pra Cloudinary. Assim o
 * arquivo não passa pelo nosso servidor (sem o limite de 1MB de Server Actions).
 */

const cloudName = () => process.env.CLOUDINARY_CLOUD_NAME ?? "";
const apiKey = () => process.env.CLOUDINARY_API_KEY ?? "";
const apiSecret = () => process.env.CLOUDINARY_API_SECRET ?? "";

/** True quando as três chaves do Cloudinary estão no ambiente. */
export function cloudinaryConfigured(): boolean {
  return Boolean(cloudName() && apiKey() && apiSecret());
}

export type SignedUpload = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
};

/**
 * Assina os parâmetros de upload. Cloudinary espera os params (menos file,
 * cloud_name, api_key e a própria signature) em ordem alfabética, unidos por
 * "&", com o api_secret concatenado no fim, tudo passado por SHA-1.
 * Aqui assinamos `folder` e `timestamp`.
 * https://cloudinary.com/documentation/authentication_signatures
 */
export function signUpload(folder: string, timestamp: number): SignedUpload {
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = createHash("sha1")
    .update(toSign + apiSecret())
    .digest("hex");
  return { cloudName: cloudName(), apiKey: apiKey(), timestamp, folder, signature };
}
