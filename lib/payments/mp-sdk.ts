// Loader do SDK do Mercado Pago (injeta o <script> uma única vez) + tipos mínimos.
// Usado pelo Payment Brick (checkout transparente) no app do cliente.

type BrickController = { unmount: () => void };
type BricksBuilder = {
  create: (type: string, containerId: string, settings: unknown) => Promise<BrickController>;
};
type MpInstance = { bricks: () => BricksBuilder };
export type MpConstructor = new (
  publicKey: string,
  options?: { locale?: string },
) => MpInstance;

declare global {
  interface Window {
    MercadoPago?: MpConstructor;
  }
}

let sdkPromise: Promise<MpConstructor> | null = null;

/** Carrega o SDK do MP e resolve com o construtor `MercadoPago`. Idempotente. */
export function loadMpSdk(): Promise<MpConstructor> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://sdk.mercadopago.com/js/v2";
    s.async = true;
    s.onload = () =>
      window.MercadoPago
        ? resolve(window.MercadoPago)
        : reject(new Error("MercadoPago SDK indisponível após load"));
    s.onerror = () => reject(new Error("falha ao carregar o SDK do MercadoPago"));
    document.head.appendChild(s);
  });
  return sdkPromise;
}
