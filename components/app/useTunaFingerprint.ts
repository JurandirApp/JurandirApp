"use client";

import { useEffect, useState } from "react";
import { startTunaFingerprint } from "@/lib/app/tuna-fingerprint";

/** Device Fingerprint da Tuna (CyberSource). Quando `active` vira true (checkout
 *  aberto num bar com cartão/carteira na Tuna), busca a config e injeta o
 *  tags.js — o mais cedo possível, pois o script precisa de 5–10 s antes da
 *  cobrança. Devolve o id da sessão (undefined = desligado/falhou: pagamento
 *  segue normal sem ele). O id vale pra carga da página inteira. */
export function useTunaFingerprint(active: boolean): string | undefined {
  const [id, setId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    startTunaFingerprint()
      .then((v) => {
        if (alive && v) setId(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [active]);
  return id;
}
