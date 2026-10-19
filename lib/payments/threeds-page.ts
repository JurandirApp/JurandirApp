const SDK_URL = "https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js";

/**
 * Página hospedada do 3DS do PagBank (aberta numa WebView do app Flutter).
 * Contrato: posta {"type":"ready"} ao carregar o SDK; o app chama
 * window.jurandir3ds.start({session, env, data}); resultado volta por
 * window.ThreeDS.postMessage(JSON) como {type:"result"|"challenge"|"error"}.
 * Nunca loga params/data (têm o número do cartão).
 */
export function threeDsPageHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Confirmando com o seu banco</title>
<style>
html,body{margin:0;padding:0;background:#EDD8A3;color:#141821;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{display:flex;flex-direction:column;align-items:center;padding:96px 24px 0;text-align:center}
.spin{width:40px;height:40px;border:4px solid rgba(20,24,33,.2);border-top-color:#141821;border-radius:50%;animation:s 0.9s linear infinite}
p{margin:20px 0 0;font-size:16px}
@keyframes s{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="wrap"><div class="spin"></div><p>Confirmando com o seu banco…</p></div>
<script>
(function () {
  function post(msg) {
    var s = JSON.stringify(msg);
    if (window.ThreeDS && typeof window.ThreeDS.postMessage === "function") {
      window.ThreeDS.postMessage(s);
    } else {
      console.log("[3ds]", s);
    }
  }
  function fail(code, message) {
    var msg = String(message || "").replace(/\\d{8,}/g, "***").slice(0, 200);
    post({ type: "error", code: String(code || "SDK_ERROR"), message: msg });
  }
  function failFrom(err, fallback) {
    var m = err && err.detail && err.detail.errorMessages && err.detail.errorMessages[0];
    fail(m && m.code, (m && (m.description || m.message)) || fallback);
  }
  var running = false;
  window.jurandir3ds = {
    start: function (params) {
      if (running) return;
      running = true;
      try {
        if (!window.PagSeguro) { running = false; fail("SDK_LOAD_FAILED", "SDK do PagBank indisponível"); return; }
        window.PagSeguro.setUp({ session: params.session, env: params.env });
        window.PagSeguro.authenticate3DS({
          data: params.data,
          beforeChallenge: function (ctx) { post({ type: "challenge" }); ctx.open(); }
        }).then(function (r) {
          running = false;
          post({ type: "result", status: (r && r.status) || null, id: (r && r.id) || null });
        }).catch(function (err) {
          running = false;
          failFrom(err, "Falha na autenticação 3DS");
        });
      } catch (e) {
        running = false;
        failFrom(e, "Falha ao iniciar o 3DS");
      }
    }
  };
  var sc = document.createElement("script");
  sc.src = "${SDK_URL}";
  sc.onload = function () {
    if (window.PagSeguro) post({ type: "ready" });
    else fail("SDK_LOAD_FAILED", "SDK do PagBank indisponível");
  };
  sc.onerror = function () { fail("SDK_LOAD_FAILED", "Não foi possível carregar o SDK do PagBank"); };
  document.head.appendChild(sc);
})();
</script>
</body>
</html>`;
}
